const mockServices = require('../data/mockServices');

function listServices(req, res) {
  res.render('services', {
    services: mockServices,
    session: req.session,
    errors: req.flash('error')
  });
}

module.exports = { listServices };
