# Task: Security fixes and booking upgrades for PetCareApp

You are working on my PetCareApp: Node.js, Express 5, EJS, MySQL (`mysql2`, callback style), `express-session` and `connect-flash`. It is a **mock school project**. Bookings stop at "pending". **Do not add real payment processing, payment SDKs or card forms.**

Before changing anything, read the whole project: `app.js`, `routes/`, `controllers/`, `models/`, `middleware/auth.js`, `views/`, `db.sql` and `db-lesson08-extension.sql`. Follow the existing code style: MVC layout, callback-based models, `?` placeholders in every SQL query, flash messages with redirects, and EJS that escapes output with `<%= %>`. Use `serviceBookingModel.createPendingBooking` as the example to copy. It checks ownership inside the SQL, takes the price from the database, and uses a transaction.

Work through the parts below **in order**. After each part, give me a short summary of the files you changed and how to test that part by hand. Then continue to the next part.

---

## Part 0: Database migration

- Create **one** new file, `db-lesson09-extension.sql`. It must add every schema change needed below **without dropping or resetting any tables or data**. Use `ALTER TABLE`, and `UPDATE` for existing rows.
- **Do not edit or rerun `db.sql` or `db-lesson08-extension.sql`.**
- Put a comment at the top saying it must be run once in MySQL Workbench, after the lesson 08 extension.
- End the file with `SELECT` checks, like the lesson 08 file does.

---

## Part 1: Signup must not let users choose their role

- In `controllers/authController.js`, `signup` currently reads `role` from `req.body`. Ignore any submitted role and always create users as `'user'`.
- Remove the Role `<select>` from `views/signUp.ejs`.
- **Check the view name:** the controller calls `res.render('signup')` but the file is `signUp.ejs`. That breaks on case-sensitive systems (Linux and Mac). Make the render call match the real file name.
- Admins can still only be created directly in the database, which is fine.

## Part 2: Journal ownership checks

Right now create, edit, update and delete only use the journal ID or pet ID. Logged-in users can change other users' journals by editing the URL or the form. Fix every journal action so it only works on journals for pets owned by `req.session.user.id`:

- **Create** (`createJournal`): insert only if `pet_id` belongs to the logged-in user. Use `INSERT ... SELECT ... FROM pets WHERE id = ? AND owner_id = ?` and check `affectedRows`.
- **Edit form** (`getJournalById`): join `pets` and add `AND pets.owner_id = ?`.
- **Update**: the journal must belong to the user, **and** the new `pet_id` must belong to the user too. Do it in one query with a join, or check both first.
- **Delete** (`getJournalPetId` and `deleteJournal`): restrict with the owner check, for example `DELETE journal FROM journal JOIN pets ON ... WHERE journal.id = ? AND pets.owner_id = ?`.
- `listJournals` and `searchJournals` should also check that the requested `petId` belongs to the user.
- If a check fails, flash `'Journal not found.'` and redirect to `/journals`. Don't show a raw `res.send` message, and don't reveal that the record exists.
- Change the model function signatures to take `ownerId`, and update every place that calls them, including `adminController`.

## Part 3: Deletes must use POST

- Change `/journals/delete/:id` and `/admin/users/delete/:id` from `router.get` to `router.post`. Keep the URLs the same.
- In `views/journals.ejs` (around line 107) and `views/adminUsers.ejs` (around line 33), replace the `<a href>` delete links with small inline `<form method="POST">` forms. Each needs a Delete button and an `onsubmit="return confirm('...')"` confirmation, keeping the current confirmation wording.
- Admins must not be able to delete their own account. Flash an error if they try.
- Use the same POST-with-confirmation pattern for every new destructive action below, including Cancel booking.

## Part 4: Friendlier `isAdmin`

- In `middleware/auth.js`, `isAdmin` currently calls `res.send('Access Denied!')`. Change it:
  - Not logged in → flash `'Please log in as an admin to view that page.'` and redirect to `/login`.
  - Logged in but not an admin → flash `'You do not have permission to view that page.'` and redirect to `/journals`.
- Make sure `/journals` displays flash messages. Add `messages` and `errors` to its render calls and show them in `journals.ejs` the same way `bookings.ejs` does.

---

## Part 5: Service details (description, duration, icon, species)

- Add these columns to `services` in the migration:
  - `description VARCHAR(255) NULL`
  - `duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30`
  - `icon VARCHAR(10) NULL` (an emoji is fine, e.g. 🛁 ✂️ 🩺 💉 🦷 🏠)
  - `species VARCHAR(100) NOT NULL DEFAULT 'All'`, a comma-separated list such as `'Dog,Cat'`, or `'All'`
- Add `UPDATE` statements filling in sensible values for the 8 existing services. For example, Nail Trimming = `'Dog,Cat,Rabbit'` (not Hamster), Full Grooming = `'Dog,Cat'`, Health Check-up = `'All'`.
- On `views/services.ejs`, show each service as a card with its icon, name, price (SGD), duration and description.
- **Species filter:** when a pet is chosen, only show services that suit that pet's species. Do this on the server and also in the browser (small vanilla JS that hides cards that don't match the selected pet's species, no libraries). Match species case-insensitively.
- **Server check:** `createBooking` must refuse a service that doesn't suit the pet's species. Do this inside the booking SQL, e.g. `AND (s.species = 'All' OR FIND_IN_SET(p.species, s.species))`, so a forged form can't get around it. Show the error `'That service is not available for this pet.'`

## Part 6: Time slots and stopping double bookings

- Add `time_slot VARCHAR(20) NOT NULL` to `service_bookings`. For existing rows, set it to `'09:00'` in the migration before adding the NOT NULL rule, or give it a default.
- Fixed slots, stored in **one** constant shared by the server and the view (e.g. `config/timeSlots.js`): `09:00, 10:00, 11:00, 13:00, 14:00, 15:00, 16:00`. Label them on the page as Morning (09:00–11:00) and Afternoon (13:00–16:00).
- The booking form gets a slot picker. The server must reject any slot not on the list.
- **Double-booking rules.** A slot is taken when an active booking (status `pending` or `confirmed`, not `cancelled`) exists for:
  - (a) the **same service, date and slot** (each service has one slot of capacity), or
  - (b) the **same pet, date and slot** (one pet can't be in two places).
- Enforce this **inside the booking transaction**, so two people submitting at once can't both succeed. Lock the matching rows with `SELECT ... FOR UPDATE` before inserting. Mention in your summary that MySQL can't put a unique index only on active rows, which is why the transaction does the check.
- Error message: `'That time slot is already taken. Please choose another.'`
- **Nice to have:** add a JSON endpoint `GET /services/availability?serviceId=&date=&petId=` (login required) that returns taken slots. Use it in the browser to disable taken slots after a service and date are chosen. The server check above is still required.
- Show the time slot in booking history.

## Part 7: Cancel a pending booking

- Add the route `POST /bookings/:id/cancel` (login required).
- It only works if the booking belongs to one of the logged-in user's pets **and** `booking_status = 'pending'`.
- In **one transaction**, set `service_bookings.booking_status = 'cancelled'` and the matching `payments.payment_status = 'cancelled'`. Check `affectedRows`. If no row changed, flash `'This booking can no longer be cancelled.'`
- Success message: `'Booking cancelled. No payment was taken.'`
- In `bookings.ejs`, show a Cancel button (POST form with confirmation) only on pending bookings.
- Cancelled bookings free up their slot (this follows from Part 6's active-only rule).

## Part 8: Reschedule a pending booking

- Add `GET /bookings/:id/reschedule` to show a form with the current date and slot filled in, and `POST /bookings/:id/reschedule` to save it. Both need login.
- It only works for the owner's own **pending** bookings, and the new date can't be in the past. Reuse the existing date validation helpers, moving them into a shared helper file if needed.
- Run the same time-slot and double-booking checks as Part 6 inside a transaction, **ignoring the booking being changed**, so keeping the same slot on a new date works.
- The price stays the same as `booked_price`. Rescheduling doesn't change it.
- Success message: `'Booking rescheduled to <date> at <slot>.'`
- Add a Reschedule button next to Cancel on pending bookings.

## Part 9: Admin booking status and auto journal entry

There is currently no way to mark a booking as completed, so add a small admin page:

- `GET /admin/bookings` (`isAdmin`): a table of all bookings showing owner, pet, service, date, slot, price, booking status and payment status. Add a simple status filter (`?status=`). Add a link to it in the navbar for admins.
- `POST /admin/bookings/:id/status` (`isAdmin`), with these allowed changes only:
  - `pending → confirmed`
  - `pending → cancelled` and `confirmed → cancelled` (also set the payment to `cancelled`)
  - `confirmed → completed`
  - Reject anything else with a flash error. Check the current status in the `UPDATE`'s `WHERE` clause so it's safe if two changes happen at once.
- **Auto journal entry:** when a booking becomes `completed`, insert a journal row **in the same transaction**:
  - `pet_id` = the booking's pet
  - `activity` = the service name, e.g. `'Full Grooming'` (up to 120 characters)
  - `notes` = `'Auto-logged from completed booking #<id> (<time_slot>).'`
  - `entry_date` = the booking date
  - If the journal insert fails, roll back the status change too.
- Do not change the payment status when a booking completes. It's a mock, and the payment stays `pending`. Say so on the admin page with a small note: "Payments are not processed in this demo."

## Part 10: Booking history polish

- In `bookings.ejs`, show coloured status badges: pending = yellow, confirmed = blue, completed = green, cancelled = grey. Use the existing CSS or Bootstrap classes.
- Show the date and time slot together, and show the service icon.
- When there are no bookings, show "No bookings yet" with a link to `/services`.

---

## Rules for all parts

- Every query uses `?` placeholders. Never build SQL from user input.
- Every route that reads or changes a booking or journal checks ownership **inside the SQL** (`p.owner_id = ?`), not only in JavaScript.
- Validate every ID with the existing `toPositiveId` helper, or a shared copy of it.
- Use transactions for anything that writes to more than one table. Copy the `getConnection` / `beginTransaction` / `rollbackAndFinish` / `release` pattern from `serviceBookingModel.js`, and always release the connection.
- No new npm packages unless truly necessary. If you add one, tell me why.
- Don't remove existing features. Keep the old payment files alone for now (I'll clean them up separately), but don't connect or extend them.
- When everything is done, give me:
  1. The list of all changed and new files.
  2. The exact steps to run the migration.
  3. A manual test checklist covering each part, including the "attack" tests: editing another user's journal ID in the URL, signing up with `role=admin` via devtools, booking a hamster nail trim, double-booking the same slot from two browser tabs, and cancelling someone else's booking.