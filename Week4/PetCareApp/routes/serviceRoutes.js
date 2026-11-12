const express = require('express');
const serviceController = require('../controllers/serviceController');
const { isLoggedIn } = require('../middleware/auth');

const router = express.Router();

// Lesson 08/09: service booking (login required)
router.get('/services', isLoggedIn, serviceController.listServices);
router.get('/services/availability', isLoggedIn, serviceController.getAvailability);
router.post('/services/book', isLoggedIn, serviceController.createBooking);
router.get('/bookings', isLoggedIn, serviceController.listBookings);

// Part 7/8: owner can cancel or reschedule their own pending bookings
router.post('/bookings/:id/cancel', isLoggedIn, serviceController.cancelBooking);
router.get('/bookings/:id/reschedule', isLoggedIn, serviceController.showReschedule);
router.post('/bookings/:id/reschedule', isLoggedIn, serviceController.rescheduleBooking);

module.exports = router;
