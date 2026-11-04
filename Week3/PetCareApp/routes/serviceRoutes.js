const express = require('express');
const serviceController = require('../controllers/serviceController');

const router = express.Router();

// Anyone can browse services; paying requires login (see paymentRoutes)
router.get('/services', serviceController.listServices);

module.exports = router;
