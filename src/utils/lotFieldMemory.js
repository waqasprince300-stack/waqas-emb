const STORAGE_KEY = 'waqas_emb_lot_field_memory_v1';
const MAX_PER_FIELD = 40;
const MAX_SUGGESTIONS = 8;

export const BASE_MACHINE_HEADS = [24, 28, 30];
export const FALLBACK_DEFAULT_HEAD = 28;

const EMPTY = () => ({
  global: {
    designs: [],
    descriptions: [],
    itemTypes: [],
    customFabrics: [],
    pieces: [],
    billAmounts: [],
    partyIds: [],
    colors: [],
    machineHeads: {
      custom: [],
      defaultHead: FALLBACK_DEFAULT_HEAD,
    },
  },
  byCollection: {},
});

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY(),
      ...parsed,
      global: { ...EMPTY().global, ...(parsed.global || {}) },
      byCollection: parsed.byCollection || {},
    };
  } catch {
    return EMPTY();
  }
}

function writeRaw(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function uniquePush(list, value, max = MAX_PER_FIELD) {
  const v = String(value ?? '').trim();
  if (!v) return list;
  const lower = v.toLowerCase();
  const next = [
    v,
    ...(Array.isArray(list) ? list : []).filter((x) => String(x).trim().toLowerCase() !== lower),
  ];
  return next.slice(0, max);
}

export function filterSuggestions(values, query, limit = MAX_SUGGESTIONS) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    if (q && !key.includes(q)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function lotNumbersFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((l) => String(l.lotNumber || l.lotNo || '').trim())
    .filter(Boolean);
}

function designsFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((l) => String(l.designNo || '').trim())
    .filter(Boolean);
}

function descriptionsFromRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((l) => String(l.description || '').trim())
    .filter(Boolean);
}

function scopedRows(rows, collectionId) {
  const cid = String(collectionId || '').trim();
  if (!cid) return Array.isArray(rows) ? rows : [];
  return (Array.isArray(rows) ? rows : []).filter((l) => String(l.businessOwnerId ?? '') === cid);
}

export function getLotNumberSuggestions(collectionId, query, existingLots) {
  const mem = readRaw();
  const cid = String(collectionId || '').trim();
  const fromMem = cid ? mem.byCollection[cid]?.lotNumbers || [] : [];
  const fromLots = lotNumbersFromRows(scopedRows(existingLots, cid));
  return filterSuggestions([...fromMem, ...fromLots], query);
}

export function getDesignSuggestions(query, existingLots) {
  const mem = readRaw();
  const fromLots = designsFromRows(existingLots);
  return filterSuggestions([...(mem.global.designs || []), ...fromLots], query);
}

/** All saved designs for native `<datalist>` (no custom dropdown). */
export function getDesignDatalistOptions(existingLots, limit = 40) {
  const mem = readRaw();
  const fromLots = designsFromRows(existingLots);
  const seen = new Set();
  const out = [];
  for (const raw of [...(mem.global.designs || []), ...fromLots]) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeHead(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function getMachineHeadConfig() {
  const mem = readRaw();
  const raw = mem.global.machineHeads || {};
  const defaultHead = normalizeHead(raw.defaultHead) || FALLBACK_DEFAULT_HEAD;
  const custom = (Array.isArray(raw.custom) ? raw.custom : [])
    .map(normalizeHead)
    .filter((n) => n != null && !BASE_MACHINE_HEADS.includes(n));
  const seen = new Set();
  const customUnique = custom.filter((n) => {
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  return { defaultHead, custom: customUnique };
}

export function getAllMachineHeads() {
  const { custom } = getMachineHeadConfig();
  const all = [...BASE_MACHINE_HEADS, ...custom];
  const seen = new Set();
  return all
    .filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .sort((a, b) => a - b);
}

export function addCustomMachineHead(value) {
  const n = normalizeHead(value);
  if (!n || BASE_MACHINE_HEADS.includes(n)) return getMachineHeadConfig();
  const mem = readRaw();
  if (!mem.global.machineHeads) {
    mem.global.machineHeads = { custom: [], defaultHead: FALLBACK_DEFAULT_HEAD };
  }
  const custom = mem.global.machineHeads.custom || [];
  if (!custom.includes(n)) {
    mem.global.machineHeads.custom = uniquePush(custom.map(String), String(n), 20).map((x) =>
      Number(x)
    );
  }
  writeRaw(mem);
  return getMachineHeadConfig();
}

export function setDefaultMachineHead(value) {
  const n = normalizeHead(value);
  if (!n) return getMachineHeadConfig();
  const mem = readRaw();
  if (!mem.global.machineHeads) {
    mem.global.machineHeads = { custom: [], defaultHead: n };
  } else {
    mem.global.machineHeads.defaultHead = n;
  }
  writeRaw(mem);
  return getMachineHeadConfig();
}

/** Custom item types previously saved — merged into the normal item-type list. */
export function getRememberedItemTypes() {
  const mem = readRaw();
  const base = new Set(['Lawn', 'Velvet', 'Cambric']);
  return (mem.global.itemTypes || []).filter((t) => {
    const v = String(t || '').trim();
    return v && !base.has(v);
  });
}

export function getDescriptionSuggestions(query, existingLots) {
  const mem = readRaw();
  const fromLots = descriptionsFromRows(existingLots);
  return filterSuggestions([...(mem.global.descriptions || []), ...fromLots], query);
}

export function getItemTypeSuggestions(query) {
  const mem = readRaw();
  return filterSuggestions(mem.global.itemTypes || [], query);
}

export function getCustomFabricSuggestions(query) {
  const mem = readRaw();
  return filterSuggestions(mem.global.customFabrics || [], query);
}

export function getPiecesSuggestions(query) {
  const mem = readRaw();
  return filterSuggestions(mem.global.pieces || [], query);
}

export function getBillAmountSuggestions(query) {
  const mem = readRaw();
  return filterSuggestions(mem.global.billAmounts || [], query);
}

export function getRecentPartyIds(limit = 6) {
  const mem = readRaw();
  return (mem.global.partyIds || []).slice(0, limit);
}

export function getColorSuggestions(query) {
  const mem = readRaw();
  return filterSuggestions((mem.global.colors || []).map(String), query);
}

/** Save field values after a successful lot save (single or bulk). */
export function rememberLotFormSave(form, { collectionId: _collectionId, bulkLotNumbers: _bulkLotNumbers } = {}) {
  const mem = readRaw();
  const _cid = String(_collectionId || form.saveBusinessOwnerId || '').trim();

  const finalType = form.itemType === '__custom' ? form.customFabric : form.fabric || form.itemType;
  if (finalType) mem.global.itemTypes = uniquePush(mem.global.itemTypes, finalType);
  if (form.customFabric)
    mem.global.customFabrics = uniquePush(mem.global.customFabrics, form.customFabric);

  if (form.pieces !== '' && form.pieces != null) {
    mem.global.pieces = uniquePush(mem.global.pieces, String(form.pieces));
  }
  if (form.billAmount !== '' && form.billAmount != null && Number(form.billAmount) > 0) {
    mem.global.billAmounts = uniquePush(mem.global.billAmounts, String(form.billAmount));
  }
  if (form.partyId) mem.global.partyIds = uniquePush(mem.global.partyIds, String(form.partyId));
  if (form.colors != null && form.colors !== '') {
    mem.global.colors = uniquePush(mem.global.colors, String(form.colors));
  }

  const head = normalizeHead(form.machineHead);
  if (head && !BASE_MACHINE_HEADS.includes(head)) {
    if (!mem.global.machineHeads) {
      mem.global.machineHeads = { custom: [], defaultHead: FALLBACK_DEFAULT_HEAD };
    }
    const custom = mem.global.machineHeads.custom || [];
    if (!custom.includes(head)) {
      mem.global.machineHeads.custom = [...custom, head].sort((a, b) => a - b);
    }
  }

  writeRaw(mem);
}
