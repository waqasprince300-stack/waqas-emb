/** Shared helpers to read, write, and invalidate sessionStorage OwnerBill caches cleanly. */

export const ownerBillsCacheKey = (ownerId) => `waqas_owner_bills_${ownerId}`;
export const ownerDefaultsCacheKey = (ownerId) => `waqas_owner_defaults_${ownerId}`;

export function clearOwnerBillsSessionCache(ownerId = '') {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (ownerId) {
      window.sessionStorage.removeItem(ownerBillsCacheKey(ownerId));
      window.sessionStorage.removeItem(ownerDefaultsCacheKey(ownerId));
      return;
    }
    const keysToDelete = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && (k.startsWith('waqas_owner_bills_') || k.startsWith('waqas_owner_defaults_'))) {
        keysToDelete.push(k);
      }
    }
    keysToDelete.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* ignore sessionStorage access errors */
  }
}
