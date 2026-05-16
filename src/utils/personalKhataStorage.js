const STORAGE_KEY_V1 = 'ghausia_personal_khata_v1';
const STORAGE_KEY = 'ghausia_personal_khata_v2';

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function migrateV1ContactsEntries(defaultBizId, contacts = [], entries = []) {
  return {
    contacts: contacts.map((c) => ({
      ...c,
      businessId: c.businessId || defaultBizId,
    })),
    entries: entries.map((e) => ({
      ...e,
      businessId: e.businessId || defaultBizId,
    })),
  };
}

/** Load raw state shape { businesses, activeBusinessId, contacts, entries } */
export function loadKhataState() {
  try {
    const rawNew = localStorage.getItem(STORAGE_KEY);
    if (rawNew) {
      const data = JSON.parse(rawNew);
      const businesses = Array.isArray(data.businesses) && data.businesses.length
        ? data.businesses
        : [{ id: newId(), name: 'Default', createdAt: nowIso() }];
      let activeBusinessId =
        String(data.activeBusinessId || '').trim() || businesses[0].id;
      if (!businesses.some((b) => b.id === activeBusinessId)) {
        activeBusinessId = businesses[0].id;
      }
      return {
        businesses,
        activeBusinessId,
        contacts: Array.isArray(data.contacts) ? data.contacts : [],
        entries: Array.isArray(data.entries) ? data.entries : [],
      };
    }

    const rawOld = localStorage.getItem(STORAGE_KEY_V1);
    if (rawOld) {
      const legacy = JSON.parse(rawOld);
      const contactsLegacy = Array.isArray(legacy.contacts) ? legacy.contacts : [];
      const entriesLegacy = Array.isArray(legacy.entries) ? legacy.entries : [];
      const defaultBizId = newId();
      const businesses = [
        {
          id: defaultBizId,
          name: 'Main business',
          createdAt: nowIso(),
        },
      ];
      const { contacts, entries } = migrateV1ContactsEntries(
        defaultBizId,
        contactsLegacy,
        entriesLegacy,
      );
      const migrated = {
        businesses,
        activeBusinessId: defaultBizId,
        contacts,
        entries,
      };
      saveKhataState(migrated);
      try {
        localStorage.removeItem(STORAGE_KEY_V1);
      } catch {
        /* ignore */
      }
      return migrated;
    }
  } catch {
    /* fall through */
  }

  const firstId = newId();
  return {
    businesses: [
      {
        id: firstId,
        name: 'Main business',
        createdAt: nowIso(),
      },
    ],
    activeBusinessId: firstId,
    contacts: [],
    entries: [],
  };
}

export function saveKhataState(state) {
  const payload = {
    businesses: state.businesses,
    activeBusinessId: state.activeBusinessId,
    contacts: state.contacts,
    entries: state.entries,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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

/** Snapshot of one business for share links (read-only view). */
export function buildBusinessShareSnapshot(state, businessId) {
  const bid = String(businessId || '').trim();
  const biz = state.businesses.find((b) => b.id === bid);
  if (!biz) return null;
  const contacts = state.contacts.filter(
    (c) => String(c.businessId || bid) === bid,
  );
  const ids = new Set(contacts.map((c) => c.id));
  const entries = state.entries.filter((e) => ids.has(e.contactId));
  return {
    v: 2,
    readOnly: true,
    business: { id: biz.id, name: biz.name },
    contacts,
    entries,
  };
}
