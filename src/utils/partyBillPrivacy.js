/**
 * Business / owner-facing amount on the lot (sensitive — do not show to party login).
 */
export function getBusinessBillAmount(lot) {
  return Number(lot?.billAmount || 0);
}

/**
 * Admin reconciliation: use party ledger amount whenever it is explicitly set (including 0);
 * otherwise fall back to the business bill on the lot. (Middleman always sees agreed party figures once saved.)
 */
export function getAdminLedgerOrBusinessBill(lot, partyEdit) {
  const pe = partyEdit || {};
  if (pe.partyBillAmount != null && pe.partyBillAmount !== '') {
    const n = Number(pe.partyBillAmount);
    if (Number.isFinite(n)) return n;
  }
  return getBusinessBillAmount(lot);
}

/**
 * Party-facing ledger amount only. `null` = not entered yet — never fall back to business bill.
 */
export function getPartyLedgerBillDisplay(partyEdit) {
  const pe = partyEdit || {};
  if (pe.partyBillAmount == null || pe.partyBillAmount === '') return null;
  const n = Number(pe.partyBillAmount);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Sum-friendly: unset party ledger counts as 0. */
export function getPartyLedgerBillNumeric(partyEdit) {
  const v = getPartyLedgerBillDisplay(partyEdit);
  return v == null ? 0 : v;
}
