const db = require('../config/db');

// Statuses that hold a time slot. Cancelled (and completed) bookings free it up.
const ACTIVE_STATUSES = ['pending', 'confirmed'];

// ---------- Transaction helper ----------
// Same pattern as the original createPendingBooking:
// getConnection -> beginTransaction -> work -> commit, or rollbackAndFinish on any problem,
// and the connection is ALWAYS released exactly once.
//
// work(conn, rollbackAndFinish, commitAndFinish)
//   rollbackAndFinish(err, result) -> undo everything, then callback(err, result)
//   commitAndFinish(result)        -> commit, then callback(null, result)
function withTransaction(work, callback) {
  db.getConnection((connErr, conn) => {
    if (connErr) return callback(connErr);

    let finished = false;
    function finish(err, result) {
      if (finished) return;
      finished = true;
      conn.release();
      callback(err, result);
    }

    function rollbackAndFinish(err, result) {
      conn.rollback((rbErr) => {
        if (rbErr) {
          console.error('Rollback failed:', rbErr);
          // A failed cleanup is a database error, never "unavailable" or success
          return finish(err || rbErr);
        }
        finish(err || null, result);
      });
    }

    function commitAndFinish(result) {
      conn.commit((commitErr) => {
        if (commitErr) return rollbackAndFinish(commitErr);
        finish(null, result);
      });
    }

    conn.beginTransaction((txErr) => {
      if (txErr) return finish(txErr);
      work(conn, rollbackAndFinish, commitAndFinish);
    });
  });
}

// ---------- Shared locking steps (booking AND reschedule use these, in this order) ----------
//
// Lock order is always: 1) pet row  2) service row  3) matching booking rows.
// Using the same order everywhere means booking and rescheduling wait for each
// other instead of deadlocking.
//
// Locking the pet and service rows first is what makes the double-booking check
// safe: two requests for the same service or the same pet queue up here, so the
// second one only runs its slot check after the first has committed.
// (SELECT ... FOR UPDATE on rows that don't exist yet can't stop two inserts on
// its own.) MySQL also cannot put a unique index on only the active
// (pending/confirmed) rows, which is why this check lives in the transaction.
//
// done(err, reason) -> reason is null when everything is OK,
//                      otherwise 'unavailable' | 'species' | 'slot_taken'
function lockAndCheckSlot(conn, opts, done) {
  const { ownerId, petId, serviceId, bookingDate, timeSlot, excludeBookingId } = opts;

  // 1) Lock the pet row (must belong to this owner)
  const petSql = 'SELECT id FROM pets WHERE id = ? AND owner_id = ? FOR UPDATE';
  conn.query(petSql, [petId, ownerId], (petErr, petRows) => {
    if (petErr) return done(petErr);
    if (petRows.length !== 1) return done(null, 'unavailable');

    // 2) Lock the service row (must be active) and check it suits the pet's species.
    // Species are compared case-insensitively by the column collation; TRIM handles
    // stray spaces typed at signup.
    const serviceSql = `
      SELECT s.id,
             (s.species = 'All' OR FIND_IN_SET(TRIM(p.species), s.species) > 0) AS species_ok
      FROM services AS s
      JOIN pets AS p ON p.id = ?
      WHERE s.id = ? AND s.is_active = 1
      FOR UPDATE`;
    conn.query(serviceSql, [petId, serviceId], (svcErr, svcRows) => {
      if (svcErr) return done(svcErr);
      if (svcRows.length !== 1) return done(null, 'unavailable');
      if (!svcRows[0].species_ok) return done(null, 'species');

      // 3) Lock and look for an active booking that already holds this slot:
      //    (a) same service + date + slot, or (b) same pet + date + slot.
      //    excludeBookingId lets a reschedule ignore the booking being changed.
      const slotSql = `
        SELECT id
        FROM service_bookings
        WHERE booking_date = ?
          AND time_slot = ?
          AND booking_status IN (?)
          AND (service_id = ? OR pet_id = ?)
          AND id <> ?
        FOR UPDATE`;
      const params = [bookingDate, timeSlot, ACTIVE_STATUSES, serviceId, petId, excludeBookingId || 0];
      conn.query(slotSql, params, (slotErr, slotRows) => {
        if (slotErr) return done(slotErr);
        if (slotRows.length > 0) return done(null, 'slot_taken');
        done(null, null);
      });
    });
  });
}

// ---------- Create ----------

// Creates one pending booking and one pending payment in a single transaction.
// callback(null, { ok: true, bookingId, paymentId })      -> both rows committed
// callback(null, { ok: false, reason })                   -> 'unavailable' | 'species' | 'slot_taken'
// callback(err)                                           -> database failure
function createPendingBooking(ownerId, petId, serviceId, bookingDate, timeSlot, callback) {
  withTransaction((conn, rollbackAndFinish, commitAndFinish) => {
    const opts = { ownerId, petId, serviceId, bookingDate, timeSlot, excludeBookingId: 0 };

    lockAndCheckSlot(conn, opts, (lockErr, reason) => {
      if (lockErr) return rollbackAndFinish(lockErr);
      if (reason) return rollbackAndFinish(null, { ok: false, reason });

      // Insert only if the pet belongs to the owner, the service is active AND the
      // service suits the pet's species (checked again here so a forged form can't
      // get around it). The price comes from the services table, never from the browser.
      const bookingSql = `
        INSERT INTO service_bookings (pet_id, service_id, booking_status, booked_price, booking_date, time_slot)
        SELECT p.id, s.id, 'pending', s.price, ?, ?
        FROM pets AS p
        JOIN services AS s
          ON s.id = ? AND s.is_active = 1
         AND (s.species = 'All' OR FIND_IN_SET(TRIM(p.species), s.species) > 0)
        WHERE p.id = ? AND p.owner_id = ?`;

      conn.query(bookingSql, [bookingDate, timeSlot, serviceId, petId, ownerId], (bookErr, bookResult) => {
        if (bookErr) return rollbackAndFinish(bookErr);

        if (bookResult.affectedRows !== 1) {
          return rollbackAndFinish(null, { ok: false, reason: 'unavailable' });
        }

        const bookingId = bookResult.insertId;

        // Payment amount copied from the stored booked_price
        const paymentSql = `
          INSERT INTO payments (booking_id, amount, payment_status)
          SELECT id, booked_price, 'pending' FROM service_bookings WHERE id = ?`;

        conn.query(paymentSql, [bookingId], (payErr, payResult) => {
          if (payErr) return rollbackAndFinish(payErr);
          if (payResult.affectedRows !== 1) {
            return rollbackAndFinish(new Error('Payment record was not created'));
          }

          commitAndFinish({ ok: true, bookingId, paymentId: payResult.insertId });
        });
      });
    });
  }, callback);
}

// ---------- Read ----------

// Booking history for pets owned by this user, newest first
function getBookingsByOwner(ownerId, callback) {
  const sql = `
    SELECT b.id AS booking_id,
           DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
           b.time_slot,
           p.name AS pet_name,
           s.name AS service_name,
           s.icon AS service_icon,
           b.booked_price,
           b.booking_status,
           pay.payment_status,
           pay.payment_reference,
           b.created_at
    FROM service_bookings AS b
    JOIN pets AS p ON p.id = b.pet_id
    JOIN services AS s ON s.id = b.service_id
    LEFT JOIN payments AS pay ON pay.booking_id = b.id
    WHERE p.owner_id = ?
    ORDER BY b.created_at DESC, b.id DESC`;
  db.query(sql, [ownerId], callback);
}

// One PENDING booking that belongs to this owner (for the reschedule form).
// Empty result -> not found, not owned, or no longer pending.
function getPendingBookingForOwner(ownerId, bookingId, callback) {
  const sql = `
    SELECT b.id AS booking_id,
           b.pet_id,
           b.service_id,
           DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
           b.time_slot,
           b.booked_price,
           p.name AS pet_name,
           s.name AS service_name,
           s.icon AS service_icon
    FROM service_bookings AS b
    JOIN pets AS p ON p.id = b.pet_id
    JOIN services AS s ON s.id = b.service_id
    WHERE b.id = ? AND p.owner_id = ? AND b.booking_status = 'pending'`;
  db.query(sql, [bookingId, ownerId], callback);
}

// Taken slot times for a service + pet on a date (for the availability JSON).
// Returns ONLY slot strings. The pet must already be verified as owned by the caller.
// excludeBookingId is only honoured for a booking of that same (owned) pet, so it
// can't be used to probe other users' bookings.
function getTakenSlots(serviceId, petId, bookingDate, excludeBookingId, callback) {
  const sql = `
    SELECT DISTINCT time_slot
    FROM service_bookings
    WHERE booking_date = ?
      AND booking_status IN (?)
      AND (service_id = ? OR pet_id = ?)
      AND NOT (id = ? AND pet_id = ?)`;
  const params = [bookingDate, ACTIVE_STATUSES, serviceId, petId, excludeBookingId || 0, petId];
  db.query(sql, params, (err, rows) => {
    if (err) return callback(err);
    callback(null, rows.map(r => r.time_slot));
  });
}

// ---------- Cancel (owner) ----------

// Cancels the owner's own PENDING booking and its payment in one transaction.
// callback(null, true)  -> cancelled
// callback(null, false) -> not found / not owned / no longer pending
function cancelPendingBooking(ownerId, bookingId, callback) {
  withTransaction((conn, rollbackAndFinish, commitAndFinish) => {
    const bookingSql = `
      UPDATE service_bookings AS b
      JOIN pets AS p ON p.id = b.pet_id
      SET b.booking_status = 'cancelled'
      WHERE b.id = ? AND p.owner_id = ? AND b.booking_status = 'pending'`;

    conn.query(bookingSql, [bookingId, ownerId], (bookErr, bookResult) => {
      if (bookErr) return rollbackAndFinish(bookErr);
      if (bookResult.affectedRows !== 1) return rollbackAndFinish(null, false);

      const paymentSql = "UPDATE payments SET payment_status = 'cancelled' WHERE booking_id = ?";
      conn.query(paymentSql, [bookingId], (payErr) => {
        if (payErr) return rollbackAndFinish(payErr);
        commitAndFinish(true);
      });
    });
  }, callback);
}

// ---------- Reschedule (owner) ----------

// Moves the owner's own PENDING booking to a new date/slot. booked_price is untouched.
// callback(null, { ok: true })
// callback(null, { ok: false, reason })  -> 'not_found' | 'slot_taken'
function reschedulePendingBooking(ownerId, bookingId, newDate, newSlot, callback) {
  withTransaction((conn, rollbackAndFinish, commitAndFinish) => {
    // Find which pet/service this booking uses (no lock yet: the locks below are
    // taken in the standard pet -> service -> slot order, and the final UPDATE
    // re-checks owner + pending status).
    const findSql = `
      SELECT b.pet_id, b.service_id
      FROM service_bookings AS b
      JOIN pets AS p ON p.id = b.pet_id
      WHERE b.id = ? AND p.owner_id = ? AND b.booking_status = 'pending'`;

    conn.query(findSql, [bookingId, ownerId], (findErr, rows) => {
      if (findErr) return rollbackAndFinish(findErr);
      if (rows.length !== 1) return rollbackAndFinish(null, { ok: false, reason: 'not_found' });

      const opts = {
        ownerId,
        petId: rows[0].pet_id,
        serviceId: rows[0].service_id,
        bookingDate: newDate,
        timeSlot: newSlot,
        excludeBookingId: bookingId
      };

      lockAndCheckSlot(conn, opts, (lockErr, reason) => {
        if (lockErr) return rollbackAndFinish(lockErr);
        if (reason === 'slot_taken') return rollbackAndFinish(null, { ok: false, reason });
        // Pet/service checks only fail if something changed underneath us
        if (reason) return rollbackAndFinish(null, { ok: false, reason: 'not_found' });

        const updateSql = `
          UPDATE service_bookings AS b
          JOIN pets AS p ON p.id = b.pet_id AND p.owner_id = ?
          SET b.booking_date = ?, b.time_slot = ?
          WHERE b.id = ? AND b.booking_status = 'pending'`;

        conn.query(updateSql, [ownerId, newDate, newSlot, bookingId], (upErr, upResult) => {
          if (upErr) return rollbackAndFinish(upErr);
          if (upResult.affectedRows !== 1) {
            return rollbackAndFinish(null, { ok: false, reason: 'not_found' });
          }
          commitAndFinish({ ok: true });
        });
      });
    });
  }, callback);
}

// ---------- Admin ----------

// All bookings for the admin table, optionally filtered by booking status.
// status must already be validated against the allowed list by the controller.
function getAllBookings(status, callback) {
  let sql = `
    SELECT b.id AS booking_id,
           u.name AS owner_name,
           u.username AS owner_username,
           p.name AS pet_name,
           p.species AS pet_species,
           s.name AS service_name,
           s.icon AS service_icon,
           DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
           b.time_slot,
           b.booked_price,
           b.booking_status,
           pay.payment_status
    FROM service_bookings AS b
    JOIN pets AS p ON p.id = b.pet_id
    JOIN users AS u ON u.id = p.owner_id
    JOIN services AS s ON s.id = b.service_id
    LEFT JOIN payments AS pay ON pay.booking_id = b.id`;
  const params = [];

  if (status) {
    sql += ' WHERE b.booking_status = ?';
    params.push(status);
  }

  sql += ' ORDER BY b.booking_date DESC, b.time_slot DESC, b.id DESC';
  db.query(sql, params, callback);
}

// Admin status change in one transaction.
// allowedFrom: statuses the booking may currently have for this change.
// The current status is checked in the UPDATE's WHERE clause, so two admins
// changing the same booking at once can't both succeed.
//   -> cancelled : payment also set to 'cancelled'
//   -> completed : an auto journal entry is inserted; if that fails, everything rolls back.
//                  The payment is NOT changed (mock project: it stays 'pending').
// callback(null, true)  -> changed
// callback(null, false) -> booking missing or not in an allowed status
function updateBookingStatus(bookingId, newStatus, allowedFrom, callback) {
  withTransaction((conn, rollbackAndFinish, commitAndFinish) => {
    const statusSql = `
      UPDATE service_bookings
      SET booking_status = ?
      WHERE id = ? AND booking_status IN (?)`;

    conn.query(statusSql, [newStatus, bookingId, allowedFrom], (upErr, upResult) => {
      if (upErr) return rollbackAndFinish(upErr);
      if (upResult.affectedRows !== 1) return rollbackAndFinish(null, false);

      if (newStatus === 'cancelled') {
        const paymentSql = "UPDATE payments SET payment_status = 'cancelled' WHERE booking_id = ?";
        return conn.query(paymentSql, [bookingId], (payErr) => {
          if (payErr) return rollbackAndFinish(payErr);
          commitAndFinish(true);
        });
      }

      if (newStatus === 'completed') {
        const journalSql = `
          INSERT INTO journal (pet_id, activity, notes, entry_date)
          SELECT b.pet_id,
                 LEFT(s.name, 120),
                 CONCAT('Auto-logged from completed booking #', b.id, ' (', b.time_slot, ').'),
                 b.booking_date
          FROM service_bookings AS b
          JOIN services AS s ON s.id = b.service_id
          WHERE b.id = ?`;
        return conn.query(journalSql, [bookingId], (jErr, jResult) => {
          if (jErr) return rollbackAndFinish(jErr);
          if (jResult.affectedRows !== 1) {
            return rollbackAndFinish(new Error('Auto journal entry was not created'));
          }
          commitAndFinish(true);
        });
      }

      commitAndFinish(true);
    });
  }, callback);
}

module.exports = {
  ACTIVE_STATUSES,
  createPendingBooking,
  getBookingsByOwner,
  getPendingBookingForOwner,
  getTakenSlots,
  cancelPendingBooking,
  reschedulePendingBooking,
  getAllBookings,
  updateBookingStatus
};
