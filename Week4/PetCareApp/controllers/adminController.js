const userModel = require('../models/userModel');
const petModel = require('../models/petModel');
const journalModel = require('../models/journalModel');
const serviceBookingModel = require('../models/serviceBookingModel');
const { toPositiveId } = require('../helpers/validation');

const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

// Allowed admin status changes: new status -> statuses it may come from
const ALLOWED_TRANSITIONS = {
  confirmed: ['pending'],
  cancelled: ['pending', 'confirmed'],
  completed: ['confirmed']
};

function dashboard(req, res) {
  res.render('adminDashboard', { session: req.session });
}

function listUsers(req, res) {
  userModel.getAllUsers((err, results) => {
    if (err) return res.send('Error loading users');

    res.render('adminUsers', {
      users: results,
      messages: req.flash('success'),
      errors: req.flash('error'),
      session: req.session
    });
  });
}

function userDetails(req, res) {
  const userId = toPositiveId(req.params.id);
  if (!userId) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }

  userModel.getUserById(userId, (err, userResults) => {
    if (err || userResults.length === 0) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    petModel.getPetsByOwner(userId, (err2, petResults) => {
      if (err2) return res.send('Error retrieving pet info');

      journalModel.getJournalsForOwner(userId, (err3, journalResults) => {
        if (err3) return res.send('Error retrieving journal entries');

        res.render('adminUserDetails', {
          user: userResults[0],
          pets: petResults,
          journals: journalResults,
          session: req.session
        });
      });
    });
  });
}

// POST /admin/users/delete/:id
function deleteUser(req, res) {
  const userId = toPositiveId(req.params.id);

  if (!userId) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }

  if (userId === req.session.user.id) {
    req.flash('error', 'You cannot delete your own admin account.');
    return res.redirect('/admin/users');
  }

  userModel.deleteUser(userId, (err, result) => {
    if (err) {
      console.error('Error deleting user:', err);
      req.flash('error', 'Unable to delete the user. Please try again.');
      return res.redirect('/admin/users');
    }

    if (result.affectedRows !== 1) {
      req.flash('error', 'User not found.');
    } else {
      req.flash('success', 'User deleted.');
    }
    res.redirect('/admin/users');
  });
}

// GET /admin/bookings?status=
function listBookings(req, res) {
  // Only accept a status from the fixed list; anything else means "all"
  const status = BOOKING_STATUSES.includes(req.query.status) ? req.query.status : '';

  serviceBookingModel.getAllBookings(status || null, (err, bookings) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Unable to load bookings.');
      return res.redirect('/admin/dashboard');
    }

    res.render('adminBookings', {
      bookings,
      statuses: BOOKING_STATUSES,
      selectedStatus: status,
      transitions: ALLOWED_TRANSITIONS,
      messages: req.flash('success'),
      errors: req.flash('error'),
      session: req.session
    });
  });
}

// POST /admin/bookings/:id/status
function updateBookingStatus(req, res) {
  const bookingId = toPositiveId(req.params.id);
  const newStatus = req.body.status;
  // Return to the same filtered list
  const back = BOOKING_STATUSES.includes(req.body.returnStatus)
    ? `/admin/bookings?status=${req.body.returnStatus}`
    : '/admin/bookings';

  const allowedFrom = Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, newStatus)
    ? ALLOWED_TRANSITIONS[newStatus]
    : null;

  if (!bookingId || !allowedFrom) {
    req.flash('error', 'That status change is not allowed.');
    return res.redirect(back);
  }

  serviceBookingModel.updateBookingStatus(bookingId, newStatus, allowedFrom, (err, changed) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Unable to update the booking. No changes were saved.');
      return res.redirect(back);
    }

    if (!changed) {
      req.flash('error', `Booking #${bookingId} can't be changed to "${newStatus}" from its current status.`);
      return res.redirect(back);
    }

    let message = `Booking #${bookingId} marked as ${newStatus}.`;
    if (newStatus === 'completed') message += ' A journal entry was added for the pet.';
    if (newStatus === 'cancelled') message += ' Its payment record was cancelled.';
    req.flash('success', message);
    res.redirect(back);
  });
}

module.exports = {
  dashboard,
  listUsers,
  userDetails,
  deleteUser,
  listBookings,
  updateBookingStatus
};
