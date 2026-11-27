/**
 * Normalize a lot reference key for case-insensitive comparison.
 * Used for matching payments to lots by lot number.
 */
export function normalizeLotKey(linkedLot) {
  return String(linkedLot || '')
    .trim()
    .toLowerCase();
}

/** Display-friendly lot reference from a lot object. */
export function lotDisplayRef(l) {
  return String(l?.lotNumber ?? l?.lotNo ?? '').trim();
}

/** Lot key extracted from a lot object (for matching against payments). */
export function lotKeyFromLot(l) {
  return String(l?.lotNumber ?? l?.lotNo ?? '').trim();
}

/** Payment-link string including `(Rework)` suffix when `l.isRework` is set. */
export function lotLinkValueFromLot(l) {
  const base = lotKeyFromLot(l);
  if (!base) return '';
  if (l?.isRework && !/\(rework\)\s*$/i.test(base)) {
    return `${base} (Rework)`;
  }
  return base;
}

/** Check whether a payment's linkedLot + workspace matches a target lot cleanly. */
export function paymentMatchesLot(payment, lot) {
  if (!payment?.linkedLot || !lot) return false;
  const lotNo = normalizeLotKey(lotKeyFromLot(lot));
  if (!lotNo) return false;
  const rawLinked = String(payment.linkedLot || '').trim();
  const payNo = normalizeLotKey(rawLinked.replace(/\s*\(rework\)\s*/i, ''));
  if (payNo !== lotNo) return false;
  const payIsRework =
    /\(rework\)/i.test(rawLinked) || /rework/i.test(String(payment.note || ''));
  if (payIsRework !== Boolean(lot.isRework)) return false;
  const lotBiz = String(lot.businessOwnerId?._id ?? lot.businessOwnerId ?? '').trim();
  const payBiz = String(payment.businessOwnerId?._id ?? payment.businessOwnerId ?? '').trim();
  if (lotBiz && payBiz && lotBiz !== payBiz) return false;
  return true;
}

/** Build a workspace+rework-aware lookup key for linked lot duplicate guards in Payments. */
export function scopedLinkedLotKey(linkedLot, businessOwnerId = '') {
  const k = normalizeLotKey(linkedLot);
  if (!k) return '';
  const biz = String(businessOwnerId || '').trim();
  return biz ? `${biz}::${k}` : k;
}
