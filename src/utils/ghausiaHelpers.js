import Swal from 'sweetalert2';
import { getRememberedItemTypes } from './lotFieldMemory';

export const BASE_FABRICS = [
  'Lawn',
  'Velvet',
  'Cambric',
  'Silk',
  'Viscose',
  'Shafoon',
  'Net',
  'Katrai',
  'Shisha Silk'
];
export const COLOR_OPTIONS = Array.from({ length: 13 }, (_, i) => i);
export const STATUS_OPTIONS = [
  'pending',
  'dispatched',
  'pending approval',
  'rejected',
  'received back',
  'completed',
];

export function lotSaveErrorToast(title) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'error',
    title,
    showConfirmButton: false,
    timer: 4500,
    timerProgressBar: true,
  });
}

export function normalizeLotNumberKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function messageFromLotSaveError(err) {
  const msg = String(err?.message || err || '');
  const httpMatch = msg.match(/^HTTP (\d+):\s*(.*)$/is);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    const body = (httpMatch[2] || '').trim();
    if (status === 409 && body) return body;
    if (body && (status === 400 || status === 403)) return body;
  }
  if (/already exists in this collection/i.test(msg)) return msg;
  if (/E11000|duplicate key|dup key/i.test(msg)) {
    if (/lotNumber/i.test(msg)) {
      return 'A lot with this lot number already exists in this business collection. Use a different number, or switch collection if you meant another workspace.';
    }
    return 'Duplicate record: this value is already in use.';
  }
  return 'Could not save the lot. Please try again.';
}

export function hasPositiveBillAmount(lot) {
  return Number(lot?.billAmount || 0) > 0;
}

export function checkIsCombinedDupatta(l) {
  if (!l || l.suitComponent !== 'dupatta') return false;
  if (l.ownerBillingChoice === 'combined') return true;
  if (l.ownerBillingChoice === 'separate') return false;
  return Number(l.billAmount || 0) === 0;
}

export const FABRIC_TYPO_MAP = {
  'velvat': 'Velvet',
  'velvit': 'Velvet',
  'shfoon': 'Shafoon',
  'shafoon': 'Shafoon',
  'chiffon': 'Shafoon',
  'shisha silk': 'Shisha Silk',
  'lawn': 'Lawn',
  'velvet': 'Velvet',
  'cambric': 'Cambric',
  'silk': 'Silk',
  'viscose': 'Viscose',
  'net': 'Net',
  'katrai': 'Katrai'
};

export function normalizeFabric(fabric) {
  const f = String(fabric || '').trim();
  const lower = f.toLowerCase();
  return FABRIC_TYPO_MAP[lower] || f;
}

export function resolveItemTypeFields(raw) {
  const t = String(raw?.itemType || raw?.fabric || '').trim();
  const mapped = normalizeFabric(t);
  
  // Also check if lowercased mapped exists in BASE_FABRICS to be safe
  const baseHit = BASE_FABRICS.find(f => f.toLowerCase() === mapped.toLowerCase());
  
  if (!mapped || baseHit) {
    return { itemType: baseHit || 'Lawn', customFabric: '' };
  }
  
  const remembered = getRememberedItemTypes();
  const hit = remembered.find((x) => x.toLowerCase() === mapped.toLowerCase());
  if (hit) return { itemType: hit, customFabric: '' };
  
  return { itemType: '__custom', customFabric: mapped };
}
