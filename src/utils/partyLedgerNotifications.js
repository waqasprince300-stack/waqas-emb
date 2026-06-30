/** Resolve party-edit row for a lot (map is keyed by lot id from API). */
export function partyEditForLot(partyEdits, lot) {
  if (!partyEdits || !lot) return null;
  const id = String(lot.id ?? lot._id ?? '').trim();
  if (!id) return null;
  return partyEdits[id] ?? null;
}

export function hasPendingBillRevisionRequest(partyEdit) {
  const req = partyEdit?.billRevisionRequest;
  if (!req) return false;
  return String(req.status || '').toLowerCase() === 'pending';
}

export function lotIsPartyAssigned(lot) {
  return Boolean(
    String(lot?.partyId || '').trim() || String(lot?.partyName || '').trim(),
  );
}

/** Pending bill-change requests tied to visible party-assigned lots (not orphan party-edit rows). */
export function countPendingBillRevisionRequests(lots, partyEdits) {
  const lotList = Array.isArray(lots) ? lots : [];
  const edits = partyEdits || {};
  return lotList.filter(
    (lot) =>
      lotIsPartyAssigned(lot) &&
      hasPendingBillRevisionRequest(partyEditForLot(edits, lot)),
  ).length;
}
