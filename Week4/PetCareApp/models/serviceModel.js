const db = require('../config/db');

// Active services from the database, ordered by name.
// species is a comma-separated list (e.g. 'Dog,Cat') or 'All'.
function getActiveServices(callback) {
  const sql = `
    SELECT id, name, description, price, duration_minutes, icon, species
    FROM services
    WHERE is_active = 1
    ORDER BY name`;
  db.query(sql, callback);
}

// True if a service's species list suits a pet's species (case-insensitive).
// Used for the server-side filter on the services page; the booking SQL
// does its own check with FIND_IN_SET.
function suitsSpecies(serviceSpecies, petSpecies) {
  const list = String(serviceSpecies || 'All').split(',').map(s => s.trim().toLowerCase());
  if (list.includes('all')) return true;
  return list.includes(String(petSpecies || '').trim().toLowerCase());
}

module.exports = { getActiveServices, suitsSpecies };
