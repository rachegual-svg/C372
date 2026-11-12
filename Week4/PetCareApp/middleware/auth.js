function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in as an admin to view that page.');
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'admin') {
    req.flash('error', 'You do not have permission to view that page.');
    return res.redirect('/journals');
  }

  return next();
}

module.exports = { isLoggedIn, isAdmin };
