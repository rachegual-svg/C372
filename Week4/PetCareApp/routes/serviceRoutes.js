const express = require('express');
const serviceController = require('../controllers/serviceController');
const { isLoggedIn } = require('../middleware/auth');

const router = express.Router();

// Lesson 08: service booking (login required)
router.get('/services', isLoggedIn, serviceController.listServices);
router.post('/services/book', isLoggedIn, serviceController.createBooking);
router.get('/bookings', isLoggedIn, serviceController.listBookings);

module.exports = router;
