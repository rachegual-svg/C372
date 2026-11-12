const petModel = require('../models/petModel');
const serviceModel = require('../models/serviceModel');
const serviceBookingModel = require('../models/serviceBookingModel');
const { getToday, toPositiveId, isRealDate, isFutureOrToday } = require('../helpers/validation');
const { TIME_SLOTS, SLOT_GROUPS, isValidSlot } = require('../config/timeSlots');

const MSG_SUCCESS = 'Booking created. Payment is pending; no payment has been processed.';
const MSG_INVALID = 'Choose a pet, service, valid booking date and time slot.';
const MSG_UNAVAILABLE = 'That pet or service is unavailable for booking.';
const MSG_SPECIES = 'That service is not available for this pet.';
const MSG_SLOT_TAKEN = 'That time slot is already taken. Please choose another.';
const MSG_SAVE_FAILED = 'Unable to create the booking. Please try again.';
const MSG_CANCELLED = 'Booking cancelled. No payment was taken.';
const MSG_CANNOT_CANCEL = 'This booking can no longer be cancelled.';
const MSG_CANNOT_RESCHEDULE = 'This booking can no longer be rescheduled.';
const MSG_RESCHEDULE_INVALID = 'Choose a valid date (today or later) and time slot.';

// ---------- Lesson 08/09: service booking ----------

// GET /services
function listServices(req, res) {
  const ownerId = req.session.user.id;

  petModel.getPetsByOwner(ownerId, (petErr, pets) => {
    if (petErr) {
      console.error(petErr);
      return res.status(500).send('Unable to load pets.');
    }

    serviceModel.getActiveServices((svcErr, services) => {
      if (svcErr) {
        console.error(svcErr);
        return res.status(500).send('Unable to load services.');
      }

      // Preselect only if the petId belongs to this user
      const requested = String(req.query.petId || '');
      const selectedPet = pets.find(pet => String(pet.id) === requested) || null;

      // Server-side species filter: when a pet is chosen, mark which services suit it.
      // Non-matching cards are rendered hidden so the browser filter can show them
      // again if the user switches pet. The booking SQL enforces the rule for real.
      const servicesForView = services.map(s => ({
        ...s,
        suitsSelectedPet: selectedPet ? serviceModel.suitsSpecies(s.species, selectedPet.species) : true
      }));

      res.render('services', {
        pets,
        services: servicesForView,
        selectedPetId: selectedPet ? requested : '',
        slotGroups: SLOT_GROUPS,
        today: getToday(),
        messages: req.flash('success'),
        errors: req.flash('error'),
        session: req.session
      });
    });
  });
}

// POST /services/book
function createBooking(req, res) {
  const ownerId = req.session.user.id;
  const petId = toPositiveId(req.body.petId);
  const serviceId = toPositiveId(req.body.serviceId);
  const bookingDate = req.body.bookingDate;
  const timeSlot = req.body.timeSlot;

  // Same-format YYYY-MM-DD strings compare correctly as text
  if (!petId || !serviceId || !isFutureOrToday(bookingDate) || !isValidSlot(timeSlot)) {
    req.flash('error', MSG_INVALID);
    return res.redirect('/services');
  }

  serviceBookingModel.createPendingBooking(ownerId, petId, serviceId, bookingDate, timeSlot, (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', MSG_SAVE_FAILED);
      return res.redirect('/services');
    }

    if (!result.ok) {
      if (result.reason === 'species') {
        req.flash('error', MSG_SPECIES);
        return res.redirect('/services?petId=' + petId);
      }
      if (result.reason === 'slot_taken') {
        req.flash('error', MSG_SLOT_TAKEN);
        return res.redirect('/services?petId=' + petId);
      }
      // Pet not owned or service inactive: don't echo the petId back
      req.flash('error', MSG_UNAVAILABLE);
      return res.redirect('/services');
    }

    req.flash('success', MSG_SUCCESS);
    return res.redirect('/bookings');
  });
}

// GET /services/availability?serviceId=&date=&petId=[&excludeBookingId=]
// JSON: { takenSlots: ['10:00', ...] }. Only slot times are returned, never
// anything about who holds them. The petId must belong to the logged-in user.
function getAvailability(req, res) {
  const ownerId = req.session.user.id;
  const serviceId = toPositiveId(req.query.serviceId);
  const petId = toPositiveId(req.query.petId);
  const date = req.query.date;

  let excludeBookingId = 0;
  if (req.query.excludeBookingId !== undefined && req.query.excludeBookingId !== '') {
    excludeBookingId = toPositiveId(req.query.excludeBookingId);
    if (!excludeBookingId) return res.status(400).json({ error: 'Invalid request.' });
  }

  if (!serviceId || !petId || !isRealDate(date)) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  petModel.getPetForOwner(petId, ownerId, (petErr, pets) => {
    if (petErr) {
      console.error(petErr);
      return res.status(500).json({ error: 'Unable to check availability.' });
    }
    if (pets.length !== 1) return res.status(404).json({ error: 'Pet not found.' });

    serviceBookingModel.getTakenSlots(serviceId, petId, date, excludeBookingId, (err, takenSlots) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Unable to check availability.' });
      }
      // Only report slots that are on the official list
      res.json({ takenSlots: takenSlots.filter(slot => TIME_SLOTS.includes(slot)) });
    });
  });
}

// GET /bookings
function listBookings(req, res) {
  serviceBookingModel.getBookingsByOwner(req.session.user.id, (err, bookings) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Unable to load booking history.');
    }

    res.render('bookings', {
      bookings,
      messages: req.flash('success'),
      errors: req.flash('error'),
      session: req.session
    });
  });
}

// POST /bookings/:id/cancel
function cancelBooking(req, res) {
  const ownerId = req.session.user.id;
  const bookingId = toPositiveId(req.params.id);

  if (!bookingId) {
    req.flash('error', MSG_CANNOT_CANCEL);
    return res.redirect('/bookings');
  }

  serviceBookingModel.cancelPendingBooking(ownerId, bookingId, (err, cancelled) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Unable to cancel the booking. Please try again.');
      return res.redirect('/bookings');
    }

    req.flash(cancelled ? 'success' : 'error', cancelled ? MSG_CANCELLED : MSG_CANNOT_CANCEL);
    res.redirect('/bookings');
  });
}

// GET /bookings/:id/reschedule
function showReschedule(req, res) {
  const ownerId = req.session.user.id;
  const bookingId = toPositiveId(req.params.id);

  if (!bookingId) {
    req.flash('error', MSG_CANNOT_RESCHEDULE);
    return res.redirect('/bookings');
  }

  serviceBookingModel.getPendingBookingForOwner(ownerId, bookingId, (err, rows) => {
    if (err) console.error(err);
    if (err || rows.length !== 1) {
      req.flash('error', MSG_CANNOT_RESCHEDULE);
      return res.redirect('/bookings');
    }

    res.render('rescheduleBooking', {
      booking: rows[0],
      slotGroups: SLOT_GROUPS,
      today: getToday(),
      messages: req.flash('success'),
      errors: req.flash('error'),
      session: req.session
    });
  });
}

// POST /bookings/:id/reschedule
function rescheduleBooking(req, res) {
  const ownerId = req.session.user.id;
  const bookingId = toPositiveId(req.params.id);
  const newDate = req.body.bookingDate;
  const newSlot = req.body.timeSlot;

  if (!bookingId) {
    req.flash('error', MSG_CANNOT_RESCHEDULE);
    return res.redirect('/bookings');
  }

  if (!isFutureOrToday(newDate) || !isValidSlot(newSlot)) {
    req.flash('error', MSG_RESCHEDULE_INVALID);
    return res.redirect(`/bookings/${bookingId}/reschedule`);
  }

  serviceBookingModel.reschedulePendingBooking(ownerId, bookingId, newDate, newSlot, (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Unable to reschedule the booking. Please try again.');
      return res.redirect('/bookings');
    }

    if (!result.ok) {
      if (result.reason === 'slot_taken') {
        req.flash('error', MSG_SLOT_TAKEN);
        return res.redirect(`/bookings/${bookingId}/reschedule`);
      }
      req.flash('error', MSG_CANNOT_RESCHEDULE);
      return res.redirect('/bookings');
    }

    req.flash('success', `Booking rescheduled to ${newDate} at ${newSlot}.`);
    res.redirect('/bookings');
  });
}

module.exports = {
  listServices,
  createBooking,
  getAvailability,
  listBookings,
  cancelBooking,
  showReschedule,
  rescheduleBooking
};
