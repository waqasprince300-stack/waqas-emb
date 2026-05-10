const STORAGE_KEY = 'ghausia_personal_khata_v1';

export function nowIso() {
  return new Date().toISOString();
}

export function loadKhataState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { contacts: [], entries: [] };
    }
    const data = JSON.parse(raw);
    return {
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
      entries: Array.isArray(data.entries) ? data.entries : [],
    };
  } catch {
    return { contacts: [], entries: [] };
  }
}

export function saveKhataState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ contacts: state.contacts, entries: state.entries }),
  );
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function contactBalance(contactId, entries) {
  const list = entries.filter((e) => e.contactId === contactId);
  let given = 0;
  let received = 0;
  for (const e of list) {
    const n = Number(e.amount) || 0;
    if (e.type === 'given') given += n;
    else received += n;
  }
  return { given, received, net: given - received };
}

export function entriesChronological(entries, contactId) {
  return entries
    .filter((e) => e.contactId === contactId)
    .sort((a, b) => {
      const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
}

/** Oldest first for running balance from start */
export function entriesForRunningBalance(entries, contactId) {
  return entries
    .filter((e) => e.contactId === contactId)
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });
}

export function runningBalances(entries, contactId) {
  const sorted = entriesForRunningBalance(entries, contactId);
  const map = new Map();
  let bal = 0;
  for (const e of sorted) {
    const n = Number(e.amount) || 0;
    if (e.type === 'given') bal += n;
    else bal -= n;
    map.set(e.id, bal);
  }
  return map;
}
