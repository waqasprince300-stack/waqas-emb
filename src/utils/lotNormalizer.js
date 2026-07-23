import { normalizedBusinessOwnerId, workspaceLabelEmbeddedInLot } from './businessWorkspace';

export const normalizeDateString = (value) => {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date?.toISOString()?.slice(0, 10);
};

/** API may populate `businessOwnerId` as `{ _id, name }`; UI keeps a string id. */
export function businessOwnerIdToString(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object' && raw !== null) {
    const oid = raw._id ?? raw.id;
    if (oid != null) return String(oid);
  }
  return String(raw);
}

export const normalizeLotData = (lot) => {
  if (!lot) return lot;
  const id = lot.id || lot._id || '';
  const lotNumber = lot.lotNumber || lot.lotNo || '';
  const itemType = lot.itemType || lot.fabric || '';
  const fabric = lot.fabric || lot.itemType || '';
  const quantity = Number(lot.quantity ?? lot.pieces ?? 0);
  const pieces = Number(lot.pieces ?? lot.quantity ?? 0);
  const partyId = lot.partyId != null && lot.partyId !== '' ? String(lot.partyId) : '';
  const status =
    typeof lot.status === 'string'
      ? lot.status
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .toLowerCase()
      : 'pending';

  return {
    ...lot,
    id,
    lotNumber,
    lotNo: lotNumber,
    designNo: lot.designNo || '',
    description: lot.description || lot.notes || '',
    fabric,
    itemType,
    customFabric: lot.customFabric || '',
    colors: Number(lot.colors ?? 0),
    quantity,
    pieces,
    unit: lot.unit || 'pieces',
    rate: Number(lot.rate ?? 0),
    billAmount: Number(lot.billAmount ?? 0),
    totalAmount: Number(lot.totalAmount ?? lot.billAmount ?? 0),
    partyId,
    partyName: lot.partyName || '',
    businessOwnerId: businessOwnerIdToString(lot.businessOwnerId),
    allotDate: normalizeDateString(
      lot.allotDate || lot.receivedDate || lot.createdAt || lot.updatedAt
    ),
    dispatchDate: normalizeDateString(lot.dispatchDate),
    receivedBackDate: normalizeDateString(lot.receivedBackDate),
    receivedDate: normalizeDateString(lot.receivedDate),
    status: status || 'Pending',
    notes: lot.notes || '',
    rejectionNote: lot.rejectionNote ? String(lot.rejectionNote).trim() : '',
    embeddedWorkspaceName: workspaceLabelEmbeddedInLot(lot),
  };
};

/** Mongo/API may return only `_id`; UI uses `id` everywhere. */
export const normalizeParty = (p) => {
  if (!p) return p;
  const rawId = p.id ?? p._id;
  const id = rawId != null && rawId !== '' ? String(rawId) : '';
  return { ...p, id };
};

export const normalizeOwners = (owners) =>
  (Array.isArray(owners) ? owners : []).map((o) => {
    const id = normalizedBusinessOwnerId(o?.id ?? o?._id);
    return { ...o, id, _id: id };
  });

export const INITIAL_PARTY_EDITS = {};

export const partyEditsArrayToMap = (remotePartyEdits) => {
  if (!Array.isArray(remotePartyEdits)) return INITIAL_PARTY_EDITS;
  return remotePartyEdits.reduce((acc, item) => {
    const lotId = item.lotId != null ? String(item.lotId) : '';
    if (!lotId) return acc;
    acc[lotId] = {
      ...item,
      completeDate: item.completeDate ? normalizeDateString(item.completeDate) : '',
      allotDate: item.allotDate ? normalizeDateString(item.allotDate) : '',
    };
    return acc;
  }, {});
};

/** Merge bootstrap party edits without wiping already-hydrated receipt images / lot pictures. */
export const mergePartyEditsFromRemote = (remotePartyEdits, prev = {}) => {
  if (!Array.isArray(remotePartyEdits)) return prev;
  const incoming = partyEditsArrayToMap(remotePartyEdits);
  const next = { ...prev };
  Object.keys(incoming).forEach((lotId) => {
    const remote = incoming[lotId];
    const existing = prev[lotId];
    const remoteReceipt = remote.receipt;
    const keptReceipt =
      remoteReceipt != null && remoteReceipt !== '' ? remoteReceipt : (existing?.receipt ?? '');

    const remoteHasLotImagesArray = Array.isArray(remote.lotImages);
    const remoteLotImages = remoteHasLotImagesArray ? remote.lotImages : undefined;
    const remoteCount = Number(remote.lotImagesCount);
    const existingCount = Number(existing?.lotImagesCount);
    const hydratedCount = Array.isArray(existing?.lotImages) ? existing.lotImages.length : 0;

    const lotImagesCount = remoteHasLotImagesArray
      ? remoteLotImages.length
      : Number.isFinite(remoteCount)
        ? remoteCount
        : Number.isFinite(existingCount)
          ? existingCount
          : hydratedCount;

    const merged = {
      ...remote,
      receipt: keptReceipt,
      lotImagesCount,
      hasLotImages:
        remote.hasLotImages === true || lotImagesCount > 0 || existing?.hasLotImages === true,
      hasReceipt:
        remote.hasReceipt === true ||
        (typeof keptReceipt === 'string' && keptReceipt.trim() !== '') ||
        existing?.hasReceipt === true,
    };

    if (remoteLotImages !== undefined) {
      merged.lotImages = remoteLotImages;
    } else if (Array.isArray(existing?.lotImages) && existing.lotImages.length > 0) {
      merged.lotImages = existing.lotImages;
    }

    next[lotId] = merged;
  });
  return next;
};
