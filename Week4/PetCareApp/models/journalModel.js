const connection = require('../config/db');

// entry_date is returned as a 'YYYY-MM-DD' string (DATE_FORMAT), not a JS Date.
// A JS Date + toISOString() shifts the day backwards in UTC+8 (Singapore).
const JOURNAL_COLUMNS = `
  journal.id, journal.pet_id, journal.activity, journal.notes,
  DATE_FORMAT(journal.entry_date, '%Y-%m-%d') AS entry_date, journal.created_at`;

function getJournalsForOwnerAndPet(ownerId, petId, callback) {
  const sql = `
      SELECT ${JOURNAL_COLUMNS}, pets.name, pets.species, pets.breed, pets.age, pets.image
      FROM journal
      JOIN pets ON journal.pet_id = pets.id
      WHERE pets.owner_id = ? AND pets.id = ?
      ORDER BY journal.entry_date DESC, journal.id DESC
    `;
  connection.query(sql, [ownerId, petId], callback);
}

function getJournalsForOwner(ownerId, callback) {
  const sql = `
    SELECT ${JOURNAL_COLUMNS}
    FROM journal
    JOIN pets ON journal.pet_id = pets.id
    WHERE pets.owner_id = ?
    ORDER BY journal.entry_date DESC, journal.id DESC
  `;
  connection.query(sql, [ownerId], callback);
}

// Inserts only if the pet belongs to the owner. affectedRows === 0 -> not owned.
function createJournal(ownerId, petId, activity, notes, entryDate, callback) {
  const sql = `
    INSERT INTO journal (pet_id, activity, notes, entry_date)
    SELECT id, ?, ?, ?
    FROM pets
    WHERE id = ? AND owner_id = ?`;
  connection.query(sql, [activity, notes, entryDate, petId, ownerId], callback);
}

// Returns the journal only if its pet belongs to the owner.
function getJournalById(journalId, ownerId, callback) {
  const sql = `
    SELECT ${JOURNAL_COLUMNS}
    FROM journal
    JOIN pets ON journal.pet_id = pets.id
    WHERE journal.id = ? AND pets.owner_id = ?`;
  connection.query(sql, [journalId, ownerId], callback);
}

// Updates only if the journal's CURRENT pet and the NEW pet both belong to the owner.
// affectedRows === 0 -> journal not found / not owned / new pet not owned.
function updateJournal(ownerId, journalId, entryDate, activity, notes, petId, callback) {
  const sql = `
    UPDATE journal
    JOIN pets AS cur ON cur.id = journal.pet_id AND cur.owner_id = ?
    JOIN pets AS nw  ON nw.id = ? AND nw.owner_id = ?
    SET journal.entry_date = ?, journal.activity = ?, journal.notes = ?, journal.pet_id = nw.id
    WHERE journal.id = ?`;
  connection.query(sql, [ownerId, petId, ownerId, entryDate, activity, notes, journalId], callback);
}

function getJournalPetId(journalId, ownerId, callback) {
  const sql = `
    SELECT journal.pet_id
    FROM journal
    JOIN pets ON journal.pet_id = pets.id
    WHERE journal.id = ? AND pets.owner_id = ?`;
  connection.query(sql, [journalId, ownerId], callback);
}

// Deletes only if the journal's pet belongs to the owner.
function deleteJournal(journalId, ownerId, callback) {
  const sql = `
    DELETE journal
    FROM journal
    JOIN pets ON journal.pet_id = pets.id
    WHERE journal.id = ? AND pets.owner_id = ?`;
  connection.query(sql, [journalId, ownerId], callback);
}

function searchJournals(ownerId, searchQuery, selectedPetId, callback) {
  let sql = `
      SELECT ${JOURNAL_COLUMNS}, pets.name, pets.species, pets.breed, pets.age, pets.image
      FROM journal
      JOIN pets ON journal.pet_id = pets.id
      WHERE pets.owner_id = ? AND (journal.activity LIKE ? OR journal.notes LIKE ?)`;

  const params = [ownerId, searchQuery, searchQuery];

  if (selectedPetId) {
    sql += ' AND pets.id = ?';
    params.push(selectedPetId);
  }

  sql += ' ORDER BY journal.entry_date DESC, journal.id DESC';

  connection.query(sql, params, callback);
}

module.exports = {
  getJournalsForOwnerAndPet,
  getJournalsForOwner,
  createJournal,
  getJournalById,
  updateJournal,
  getJournalPetId,
  deleteJournal,
  searchJournals
};
