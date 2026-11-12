-- C372 Lesson 09: extend the existing Lesson 08 database.
-- Prerequisite: db-lesson08-extension.sql has ALREADY been run (services,
-- service_bookings and payments exist).
-- Run this script ONCE in MySQL Workbench against your own development database,
-- AFTER the Lesson 08 extension.
-- It keeps all existing users, pets, journals, services, bookings and payments.
-- It does not drop or reset any table.
-- Do not run db.sql or db-lesson08-extension.sql again.
--
-- If an ALTER fails with "Duplicate column name" or "Duplicate key name", this
-- script has probably already been run. STOP and inspect the tables, don't rerun.
-- Each ALTER TABLE commits on its own, so a failed run may be partly applied.

USE petcare;

-- Workbench "safe updates" mode blocks UPDATEs that filter on non-key columns
-- (error 1175). Turn it off for this script and back on at the end.
SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------------------
-- Part 5: service details
-- species is a comma-separated list with NO spaces (e.g. 'Dog,Cat'), or 'All'.
-- ---------------------------------------------------------------------------
ALTER TABLE services
  ADD COLUMN description VARCHAR(255) NULL AFTER name,
  ADD COLUMN duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER price,
  ADD COLUMN icon VARCHAR(10) NULL AFTER duration_minutes,
  ADD COLUMN species VARCHAR(100) NOT NULL DEFAULT 'All' AFTER icon;

UPDATE services SET icon = '🛁', duration_minutes = 30, species = 'Dog,Cat,Rabbit',
  description = 'Gentle shampoo, rinse and blow-dry to leave your pet clean and fresh.'
  WHERE name = 'Basic Bath';

UPDATE services SET icon = '✂️', duration_minutes = 90, species = 'Dog,Cat',
  description = 'Bath, haircut, brushing, ear cleaning and a tidy finish.'
  WHERE name = 'Full Grooming';

UPDATE services SET icon = '💅', duration_minutes = 20, species = 'Dog,Cat,Rabbit',
  description = 'Careful nail clipping and filing to keep paws comfortable.'
  WHERE name = 'Nail Trimming';

UPDATE services SET icon = '🩺', duration_minutes = 30, species = 'All',
  description = 'A general wellness check of weight, heart, eyes, ears and coat.'
  WHERE name = 'Health Check-up';

UPDATE services SET icon = '💉', duration_minutes = 15, species = 'Dog,Cat,Rabbit',
  description = 'Routine vaccinations given by our vet team.'
  WHERE name = 'Vaccination';

UPDATE services SET icon = '🦷', duration_minutes = 60, species = 'Dog,Cat',
  description = 'Scaling and polishing to keep teeth and gums healthy.'
  WHERE name = 'Dental Cleaning';

UPDATE services SET icon = '🏠', duration_minutes = 480, species = 'Dog,Cat',
  description = 'A full day of supervised play, rest and meals in a safe space.'
  WHERE name = 'Pet Daycare (Full Day)';

UPDATE services SET icon = '🏠', duration_minutes = 60, species = 'All',
  description = 'A sitter visits your home to feed, check on and keep your pet company.'
  WHERE name = 'Pet Sitting (Per Visit)';

-- ---------------------------------------------------------------------------
-- Part 6: booking time slots
-- Add as NULL, fill existing rows with '09:00', then make it NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE service_bookings
  ADD COLUMN time_slot VARCHAR(20) NULL AFTER booking_date;

UPDATE service_bookings SET time_slot = '09:00' WHERE time_slot IS NULL;

ALTER TABLE service_bookings
  MODIFY COLUMN time_slot VARCHAR(20) NOT NULL;

-- Indexes for the double-booking checks (same service/date/slot and same
-- pet/date/slot). These are NOT unique: MySQL cannot put a unique index on
-- only the active (pending/confirmed) rows, so the app checks inside a
-- transaction instead.
ALTER TABLE service_bookings
  ADD INDEX idx_service_bookings_service_slot (service_id, booking_date, time_slot),
  ADD INDEX idx_service_bookings_pet_slot (pet_id, booking_date, time_slot);

SET SQL_SAFE_UPDATES = 1;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- Eight services, each with an icon, duration, species list and description.
SELECT id, icon, name, price, duration_minutes, species, description, is_active
FROM services ORDER BY id;

-- Every booking now has a time slot (existing rows show 09:00).
SELECT time_slot, COUNT(*) AS booking_count
FROM service_bookings GROUP BY time_slot ORDER BY time_slot;

-- Older bookings that now share a service/date/slot because they all became
-- 09:00. This is old data only: it does not block new bookings. Empty is fine.
SELECT service_id, DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date, time_slot,
       COUNT(*) AS active_bookings
FROM service_bookings
WHERE booking_status IN ('pending', 'confirmed')
GROUP BY service_id, booking_date, time_slot
HAVING COUNT(*) > 1;

-- The new indexes exist.
SHOW INDEX FROM service_bookings WHERE Key_name LIKE 'idx_service_bookings_%_slot';
