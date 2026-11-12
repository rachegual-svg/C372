// Disables time slots that are already taken, using GET /services/availability.
// Convenience only: the server re-checks every booking inside a transaction.
var SlotAvailability = (function () {
  var requestCounter = 0;

  function setAllEnabled(form) {
    form.querySelectorAll('input[name="timeSlot"]').forEach(function (radio) {
      radio.disabled = false;
      var label = form.querySelector('label[for="' + radio.id + '"]');
      if (label) label.textContent = label.getAttribute('data-slot-label');
    });
  }

  // opts: { form, serviceId, petId, date, excludeBookingId?, statusEl? }
  function refresh(opts) {
    var form = opts.form;
    var statusEl = opts.statusEl;
    setAllEnabled(form);
    if (statusEl) statusEl.textContent = '';

    if (!opts.serviceId || !opts.petId || !opts.date) return;

    var params = new URLSearchParams({
      serviceId: opts.serviceId,
      petId: opts.petId,
      date: opts.date
    });
    if (opts.excludeBookingId) params.set('excludeBookingId', opts.excludeBookingId);

    // Ignore responses from older requests if the user changes choices quickly
    var thisRequest = ++requestCounter;

    fetch('/services/availability?' + params.toString(), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (thisRequest !== requestCounter || !data || !Array.isArray(data.takenSlots)) return;

        var taken = data.takenSlots;
        form.querySelectorAll('input[name="timeSlot"]').forEach(function (radio) {
          if (taken.indexOf(radio.value) === -1) return;
          radio.disabled = true;
          if (radio.checked) radio.checked = false;
          var label = form.querySelector('label[for="' + radio.id + '"]');
          if (label) label.textContent = radio.value + ' (taken)';
        });

        if (statusEl && taken.length) {
          statusEl.textContent = 'Taken slots are greyed out for this date.';
        }
      })
      .catch(function () {
        // Network error: leave all slots enabled; the server still checks
      });
  }

  return { refresh: refresh };
})();
