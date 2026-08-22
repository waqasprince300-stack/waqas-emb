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
