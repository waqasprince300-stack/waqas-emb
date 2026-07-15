/** Party-facing wording for lot statuses (admin DB values stay unchanged). */

const toTitleCase = (s) =>
  String(s || '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/**
 * Raw lot.status → label shown to a party user.
 * Admin UI keeps "Received Back", "Dispatched", etc.
 */
export function partyFacingLotStatusLabel(rawStatus) {
  const s = String(rawStatus || '')
    .trim()
    .toLowerCase();
  switch (s) {
    case 'pending':
      return 'Not received yet';
    case 'dispatched':
      return 'With you';
    case 'in progress':
      return 'In progress';
    case 'pending approval':
      return 'Submitted for review';
    case 'rejected':
      return 'Needs rework';
    case 'received back':
      return 'Delivered';
    case 'completed':
      return 'Completed';
    default:
      return toTitleCase(rawStatus) || '—';
  }
}

/**
 * Title-case admin status string used for StatusBadge color classes
 * (e.g. "received back" → "Received Back").
 */
export function lotStatusBadgeKey(rawStatus) {
  return toTitleCase(rawStatus);
}

/** Party ledger display statuses → friendlier party copy where needed. */
export function partyFacingLedgerDisplayLabel(displayStatus) {
  const s = String(displayStatus || '').trim();
  if (s === 'Pending') return 'Not received yet';
  if (s === 'Pending review') return 'Submitted for review';
  if (s === 'Rejected') return 'Needs rework';
  if (s === 'In Progress') return 'In progress';
  if (s === 'Completed') return 'Completed';
  return s;
}
