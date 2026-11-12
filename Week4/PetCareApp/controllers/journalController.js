const petModel = require('../models/petModel');
const journalModel = require('../models/journalModel');
const { toPositiveId, isRealDate } = require('../helpers/validation');

const MSG_NOT_FOUND = 'Journal not found.';
const MSG_INVALID = 'Please choose a pet, a valid date and an activity (up to 120 characters).';
const MSG_LOAD_FAILED = 'Unable to load journals. Please try again.';

// Flash "Journal not found." and go back to the journal list.
// Used for every failed ownership check so we never reveal whether a record exists.
function notFound(req, res) {
  req.flash('error', MSG_NOT_FOUND);
  return res.redirect('/journals');
}

// Validates and normalises the journal form. Returns null if anything is invalid.
function readJournalForm(body) {
  const petId = toPositiveId(body.pet_id);
  const activity = typeof body.activity === 'string' ? body.activity.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const entryDate = body.entry_date;

  if (!petId || !activity || activity.length > 120 || !isRealDate(entryDate)) return null;
  return { petId, activity, notes, entryDate };
}

function renderJournals(req, res, data) {
  res.render('journals', {
    ...data,
    messages: req.flash('success'),
    errors: req.flash('error'),
    session: req.session
  });
}

function listJournals(req, res) {
  const userId = req.session.user.id;
  const requestedPetId = req.query.petId;

  petModel.getPetsByOwner(userId, (err, pets) => {
    if (err) {
      console.error(err);
      req.flash('error', MSG_LOAD_FAILED);
      return res.redirect('/');
    }

    let selectedPetId = null;

    if (requestedPetId) {
      // A petId was given: it must be one of this user's pets
      const petId = toPositiveId(String(requestedPetId));
      if (!petId || !pets.some(p => p.id === petId)) return notFound(req, res);
      selectedPetId = petId;
    } else if (pets.length > 0) {
      selectedPetId = pets[0].id;
    }

    if (!selectedPetId) {
      return renderJournals(req, res, { journals: [], pets, selectedPetId: '', pet: null });
    }

    // Ownership is also enforced inside the SQL (pets.owner_id = ?)
    journalModel.getJournalsForOwnerAndPet(userId, selectedPetId, (err2, journals) => {
      if (err2) {
        console.error(err2);
        req.flash('error', MSG_LOAD_FAILED);
        return res.redirect('/');
      }

      const petInfo = pets.find(p => p.id === selectedPetId);

      return renderJournals(req, res, {
        journals,
        pets,
        selectedPetId: String(selectedPetId),
        pet: petInfo
      });
    });
  });
}

function newJournalForm(req, res) {
  const userId = req.session.user.id;
  const selectedPetId = req.query.petId;

  petModel.getPetsByOwner(userId, (err, pets) => {
    if (err) {
      console.error(err);
      req.flash('error', MSG_LOAD_FAILED);
      return res.redirect('/journals');
    }

    res.render('newJournal', { pets, session: req.session, selectedPetId });
  });
}

function createJournal(req, res) {
  const ownerId = req.session.user.id;
  const form = readJournalForm(req.body);

  if (!form) {
    req.flash('error', MSG_INVALID);
    return res.redirect('/journals');
  }

  journalModel.createJournal(ownerId, form.petId, form.activity, form.notes, form.entryDate, (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Unable to save the journal entry. Please try again.');
      return res.redirect('/journals');
    }

    // 0 rows inserted -> the pet does not belong to this user
    if (result.affectedRows !== 1) return notFound(req, res);

    req.flash('success', 'Journal entry added.');
    res.redirect(`/journals?petId=${form.petId}`);
  });
}

function editJournalForm(req, res) {
  const ownerId = req.session.user.id;
  const journalId = toPositiveId(req.params.id);
  if (!journalId) return notFound(req, res);

  journalModel.getJournalById(journalId, ownerId, (err, journalResults) => {
    if (err) console.error(err);
    if (err || journalResults.length === 0) return notFound(req, res);

    petModel.getPetsByOwner(ownerId, (err2, pets) => {
      if (err2) {
        console.error(err2);
        req.flash('error', MSG_LOAD_FAILED);
        return res.redirect('/journals');
      }

      res.render('editJournal', { journal: journalResults[0], pets, session: req.session });
    });
  });
}

function updateJournal(req, res) {
  const ownerId = req.session.user.id;
  const journalId = toPositiveId(req.params.id);
  if (!journalId) return notFound(req, res);

  const form = readJournalForm(req.body);
  if (!form) {
    req.flash('error', MSG_INVALID);
    return res.redirect('/journals');
  }

  // One query: the journal's current pet AND the new pet must both be owned
  journalModel.updateJournal(ownerId, journalId, form.entryDate, form.activity, form.notes, form.petId, (err, result) => {
    if (err) {
      console.error(err);
      req.flash('error', 'Unable to update the journal entry. Please try again.');
      return res.redirect('/journals');
    }

    if (result.affectedRows !== 1) return notFound(req, res);

    req.flash('success', 'Journal entry updated.');
    res.redirect(`/journals?petId=${form.petId}`);
  });
}

function deleteJournal(req, res) {
  const ownerId = req.session.user.id;
  const journalId = toPositiveId(req.params.id);
  if (!journalId) return notFound(req, res);

  journalModel.getJournalPetId(journalId, ownerId, (err, result) => {
    if (err) console.error(err);
    if (err || result.length === 0) return notFound(req, res);

    const petId = result[0].pet_id;

    journalModel.deleteJournal(journalId, ownerId, (err2, delResult) => {
      if (err2) {
        console.error(err2);
        req.flash('error', 'Unable to delete the journal entry. Please try again.');
        return res.redirect(`/journals?petId=${petId}`);
      }

      if (delResult.affectedRows !== 1) return notFound(req, res);

      req.flash('success', 'Journal entry deleted.');
      res.redirect(`/journals?petId=${petId}`);
    });
  });
}

function searchJournals(req, res) {
  const userId = req.session.user.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const searchQuery = `%${q}%`;
  const requestedPetId = req.query.petId;

  petModel.getPetsByOwner(userId, (err, pets) => {
    if (err) {
      console.error(err);
      req.flash('error', MSG_LOAD_FAILED);
      return res.redirect('/journals');
    }

    // Optional pet filter: if given, it must be one of this user's pets
    let selectedPetId = null;
    if (requestedPetId) {
      selectedPetId = toPositiveId(String(requestedPetId));
      if (!selectedPetId || !pets.some(p => p.id === selectedPetId)) return notFound(req, res);
    }

    journalModel.searchJournals(userId, searchQuery, selectedPetId, (err2, journals) => {
      if (err2) {
        console.error(err2);
        req.flash('error', 'Unable to search journals. Please try again.');
        return res.redirect('/journals');
      }

      const pet = selectedPetId ? pets.find(p => p.id === selectedPetId) : null;

      renderJournals(req, res, {
        journals,
        pets,
        selectedPetId: selectedPetId ? String(selectedPetId) : '',
        pet
      });
    });
  });
}

module.exports = {
  listJournals,
  newJournalForm,
  createJournal,
  editJournalForm,
  updateJournal,
  deleteJournal,
  searchJournals
};
