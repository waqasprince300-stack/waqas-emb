/** Helper functions extracted from PartyLedger.jsx for reuse and file size reduction. */

// From the party's perspective: dispatched = In Progress, received back = Completed
// If party name is unknown, status should be Pending
export const toLedgerStatus = (status, partyName) => {
  if (!partyName || !String(partyName).trim()) return 'Pending';
  if (!status) return 'Pending';
  const s = String(status).trim().toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'completed' || s === 'received back') return 'Completed';
  return 'In Progress';
};

export const toTitleCase = (s) =>
  String(s || '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Party UI label for ledger display statuses. */
export function partyFacingStatusLabel(displayStatus, isParty) {
  // Inline import to avoid circular deps — partyFacingLedgerDisplayLabel is small
  const { partyFacingLedgerDisplayLabel } = require('../utils/partyFacingLabels');
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

export function pendingRevisionIsReal(pe) {
  const pr = pe?.pendingRevision;
  if (!pr) return false;
  return Number(pr.fromAmount) !== Number(pr.toAmount);
}

/** Max lot pictures = number of colors on the lot (minimum 1). */
export function lotPicturesMax(lot) {
  const n = Number(lot?.colors);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function readReceiptAsStoredValue(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }
    resolve(file.name);
  });
}

/** Target max decoded size for bill photos (JPEG); keeps JSON payload under typical proxy limits. */
export const LEDGER_BILL_IMG_MAX_BYTES = 240 * 1024;

export function approxBytesFromDataUrl(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i === -1) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length * 3) / 4 - pad;
}

export function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = dataUrl;
  });
}

export async function compressPartyLedgerBillImage(dataUrl, maxBytes = LEDGER_BILL_IMG_MAX_BYTES) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return dataUrl;

  let img;
  try {
    img = await dataUrlToImage(dataUrl);
  } catch {
    throw new Error('Could not read this image (try JPG/PNG or a smaller file).');
  }

  const mime = 'image/jpeg';
  let maxEdge = Math.min(1600, Math.max(img.width, img.height));
  let quality = 0.86;

  const encode = (edge, q) => {
    const long = Math.max(img.width, img.height);
    const scale = Math.min(1, edge / long);
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'var(--card-bg, #ffffff)';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL(mime, q);
  };

  let out = encode(maxEdge, quality);
  for (let i = 0; i < 22 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
    if (quality > 0.28) {
      quality -= 0.06;
      out = encode(maxEdge, quality);
    } else {
      maxEdge = Math.round(maxEdge * 0.82);
      if (maxEdge < 200) break;
      quality = 0.82;
      out = encode(maxEdge, quality);
    }
  }
  if (approxBytesFromDataUrl(out) > maxBytes) {
    maxEdge = 180;
    quality = 0.72;
    out = encode(maxEdge, quality);
    for (let i = 0; i < 8 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
      quality = Math.max(0.22, quality - 0.08);
      out = encode(maxEdge, quality);
    }
  }
  return out;
}

export async function finalizeLedgerReceiptStoredValue(stored) {
  if (!stored) return '';
  if (/^data:image\//i.test(String(stored))) return compressPartyLedgerBillImage(stored);
  return stored;
}

/** Admin/workspace lot still awaiting dispatch — party must not self-set "In Progress". */
export function adminLotNotDispatched(lot) {
  return (
    String(lot?.status || '')
      .toLowerCase()
      .trim() === 'pending'
  );
}
