import {
  businessOwnerRegistryMap,
  normalizedBusinessOwnerId,
  ownerDisplayNameFromRow,
} from './businessWorkspace';

/** Admin bookkeeping: Paid → Owner = bill settlement against a workspace. */
export function isOwnerBillSettlement(payment) {
  return (
    String(payment?.type || '').trim() === 'Paid' &&
    String(payment?.party || '').toLowerCase().trim() === 'owner'
  );
}

export function isOwnerParty(payment) {
  return String(payment?.party || '').toLowerCase().trim() === 'owner';
}

/**
 * Admin-facing type label.
 * Owner bill settlements show as "Bill" (not "Paid").
 */
export function adminPaymentTypeLabel(payment) {
  if (isOwnerBillSettlement(payment)) return 'Bill';
  return String(payment?.type || '').trim() || '—';
}

/**
 * Party / From column: for Owner rows, show the billed workspace name.
 */
export function adminPaymentPartyLabel(payment, businessOwners) {
  if (!isOwnerParty(payment)) {
    return String(payment?.party || '').trim() || '—';
  }
  const bid = normalizedBusinessOwnerId(
    payment?.businessOwnerId?._id ?? payment?.businessOwnerId,
  );
  if (bid) {
    const nm = businessOwnerRegistryMap(businessOwners).get(bid);
    if (nm) return nm;
  }
  // Populated object on the payment itself
  if (
    payment?.businessOwnerId != null &&
    typeof payment.businessOwnerId === 'object'
  ) {
    const embedded = ownerDisplayNameFromRow(payment.businessOwnerId);
    if (embedded) return embedded;
  }
  return 'Owner';
}
