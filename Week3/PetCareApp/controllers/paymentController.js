const { findServiceById } = require('../data/mockServices');
const MockProvider = require('../services/mockPaymentProvider');

const CURRENCY = 'sgd';
const ALLOWED_TEST_STATUSES = ['APPROVED', 'PENDING', 'DECLINED'];
const bookingStatusByPayment = {
  APPROVED: 'CONFIRMED',
  PENDING: 'AWAITING_PAYMENT',
  DECLINED: 'PAYMENT_FAILED'
};

// Shared logic: build the payment summary for a service (server-side price only)
function buildPaymentSummary(service) {
  return {
    serviceId: service.id,
    serviceName: service.name,
    amount: service.price,
    currency: CURRENCY,
    status: 'READY_FOR_PAYMENT'
  };
}

// Shared logic: call the mock provider and map the result to a booking status
async function processMockPayment(service, requestedStatus) {
  const testStatus = ALLOWED_TEST_STATUSES.includes(requestedStatus) ? requestedStatus : 'PENDING';

  const providerResult = await MockProvider.createPayment({
    amount: service.price,
    currency: CURRENCY,
    merchantReference: 'SERVICE-' + service.id,
    description: service.name,
    testStatus
  });

  return {
    serviceId: service.id,
    providerPaymentId: providerResult.providerPaymentId,
    merchantReference: providerResult.merchantReference,
    paymentStatus: providerResult.status,
    bookingStatus: bookingStatusByPayment[providerResult.status]
  };
}

// ---------- EJS pages (login required) ----------

function showPreparePayment(req, res) {
  const service = findServiceById(req.params.serviceId);

  if (!service) {
    req.flash('error', 'Service not found');
    return res.redirect('/services');
  }

  res.render('preparePayment', {
    service,
    summary: buildPaymentSummary(service),
    testStatuses: ALLOWED_TEST_STATUSES,
    session: req.session
  });
}

async function submitMockPayment(req, res) {
  const service = findServiceById(req.params.serviceId);

  if (!service) {
    req.flash('error', 'Service not found');
    return res.redirect('/services');
  }

  try {
    const result = await processMockPayment(service, req.body.testStatus);
    res.render('paymentResult', { service, result, session: req.session });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Payment could not be processed. Please try again.');
    res.redirect('/services');
  }
}

// ---------- JSON API (kept for spec acceptance tests) ----------

function preparePayment(req, res) {
  const service = findServiceById(req.params.serviceId);

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  return res.status(200).json(buildPaymentSummary(service));
}

async function createMockPayment(req, res) {
  const service = findServiceById(req.params.serviceId);

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const result = await processMockPayment(service, req.body?.testStatus);
  return res.json(result);
}

module.exports = {
  showPreparePayment,
  submitMockPayment,
  preparePayment,
  createMockPayment
};
