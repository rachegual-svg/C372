// Shared input validation helpers (moved from serviceController).

// Today's LOCAL date as YYYY-MM-DD (not UTC)
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Positive whole number written only with digits (rejects "abc", "0", "-1", "1.5")
function toPositiveId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Real calendar date in YYYY-MM-DD (rejects 2026-02-30)
function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// A real date that is today or later (same-format YYYY-MM-DD strings compare as text)
function isFutureOrToday(value) {
  return isRealDate(value) && value >= getToday();
}

module.exports = { getToday, toPositiveId, isRealDate, isFutureOrToday };
