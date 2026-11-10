const db = require('../config/db');

// Creates one pending booking and one pending payment in a single transaction.
// callback(null, { bookingId, paymentId }) -> both rows committed
// callback(null, null)                     -> pet not owned / service not active
// callback(err)                            -> database failure
function createPendingBooking(ownerId, petId, serviceId, bookingDate, callback) {
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

    conn.beginTransaction((txErr) => {
      if (txErr) return finish(txErr);

      // Insert only if the pet belongs to the owner AND the service is active.
      // The price comes from the services table, never from the browser.
      const bookingSql = `
        INSERT INTO service_bookings (pet_id, service_id, booking_status, booked_price, booking_date)
        SELECT p.id, s.id, 'pending', s.price, ?
        FROM pets AS p
        JOIN services AS s ON s.id = ? AND s.is_active = 1
        WHERE p.id = ? AND p.owner_id = ?`;

      conn.query(bookingSql, [bookingDate, serviceId, petId, ownerId], (bookErr, bookResult) => {
        if (bookErr) return rollbackAndFinish(bookErr);

        if (bookResult.affectedRows !== 1) {
          // Pet or service unavailable: nothing to keep
          return rollbackAndFinish(null, null);
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

          conn.commit((commitErr) => {
            if (commitErr) return rollbackAndFinish(commitErr);
            finish(null, { bookingId, paymentId: payResult.insertId });
          });
        });
      });
    });
  });
}

// Booking history for pets owned by this user, newest first
function getBookingsByOwner(ownerId, callback) {
  const sql = `
    SELECT b.id AS booking_id,
           DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
           p.name AS pet_name,
           s.name AS service_name,
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

module.exports = { createPendingBooking, getBookingsByOwner };
