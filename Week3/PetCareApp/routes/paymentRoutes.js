const express = require('express');
const paymentController = require('../controllers/paymentController');
const { isLoggedIn } = require('../middleware/auth');

const router = express.Router();

// EJS pages (login required)
router.get('/payments/prepare/:serviceId', isLoggedIn, paymentController.showPreparePayment);
router.post('/payments/mock/:serviceId', isLoggedIn, paymentController.submitMockPayment);

// JSON API (kept for now, matches specs/prepare-payment.md)
router.get('/api/payments/prepare/:serviceId', paymentController.preparePayment);
router.post('/api/payments/mock/:serviceId', paymentController.createMockPayment);

module.exports = router;
