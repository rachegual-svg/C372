const petModel = require('../models/petModel');
const serviceModel = require('../models/serviceModel');
const serviceBookingModel = require('../models/serviceBookingModel');

const MSG_SUCCESS = 'Booking created. Payment is pending; no payment has been processed.';
const MSG_INVALID = 'Choose a pet, service, and valid booking date.';
const MSG_UNAVAILABLE = 'That pet or service is unavailable for booking.';
const MSG_SAVE_FAILED = 'Unable to create the booking. Please try again.';

// ---------- Helpers ----------

// Today's LOCAL date as YYYY-MM-DD (not UTC)
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Positive whole number written only with digits (rejects "abc", "0", "-1", "1.5")
function toPositiveId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Real calendar date in YYYY-MM-DD (rejects 2026-02-30)
function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// ---------- Lesson 08: service booking ----------

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
      const owned = pets.some(pet => String(pet.id) === requested);

      res.render('services', {
        pets,
        services,
        selectedPetId: owned ? requested : '',
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

  // Same-format YYYY-MM-DD strings compare correctly as text
  if (!petId || !serviceId || !isRealDate(bookingDate) || bookingDate < getToday()) {
    req.flash('error', MSG_INVALID);
    return res.redirect('/services');
  }

  serviceBookingModel.createPendingBooking(ownerId, petId, serviceId, bookingDate, (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', MSG_SAVE_FAILED);
      return res.redirect('/services?petId=' + petId);
    }

    if (!result) {
      req.flash('error', MSG_UNAVAILABLE);
      return res.redirect('/services');
    }

    req.flash('success', MSG_SUCCESS);
    return res.redirect('/bookings');
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

module.exports = { listServices, createBooking, listBookings };
