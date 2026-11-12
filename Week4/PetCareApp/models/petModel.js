const connection = require('../config/db');

function createPet(ownerId, petName, species, breed, age, image, callback) {
  const sql = 'INSERT INTO pets (owner_id, name, species, breed, age, image ) VALUES (?, ?, ?, ?, ?, ?)';
  connection.query(sql, [ownerId, petName, species, breed, age, image], callback);
}

function getPetsByOwner(ownerId, callback) {
  const sql = 'SELECT * FROM pets WHERE owner_id = ?';
  connection.query(sql, [ownerId], callback);
}

// One pet, only if it belongs to this owner (empty result otherwise)
function getPetForOwner(petId, ownerId, callback) {
  const sql = 'SELECT id, name, species FROM pets WHERE id = ? AND owner_id = ?';
  connection.query(sql, [petId, ownerId], callback);
}

module.exports = { createPet, getPetsByOwner, getPetForOwner };
