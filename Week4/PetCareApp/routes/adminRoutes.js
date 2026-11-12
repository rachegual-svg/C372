const express = require('express');
const { isAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.get('/admin/dashboard', isAdmin, adminController.dashboard);
router.get('/admin/users', isAdmin, adminController.listUsers);
router.get('/admin/users/:id', isAdmin, adminController.userDetails);
router.post('/admin/users/delete/:id', isAdmin, adminController.deleteUser);

// Part 9: admin booking status management
router.get('/admin/bookings', isAdmin, adminController.listBookings);
router.post('/admin/bookings/:id/status', isAdmin, adminController.updateBookingStatus);

module.exports = router;
