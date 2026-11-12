// Fixed booking time slots, shared by the server (validation) and the views (picker).
const SLOT_GROUPS = [
  { label: 'Morning (09:00–11:00)', slots: ['09:00', '10:00', '11:00'] },
  { label: 'Afternoon (13:00–16:00)', slots: ['13:00', '14:00', '15:00', '16:00'] }
];

const TIME_SLOTS = SLOT_GROUPS.flatMap(group => group.slots);

function isValidSlot(value) {
  return typeof value === 'string' && TIME_SLOTS.includes(value);
}

module.exports = { TIME_SLOTS, SLOT_GROUPS, isValidSlot };
