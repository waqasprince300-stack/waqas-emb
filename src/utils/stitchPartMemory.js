const STORAGE_KEY = 'waqas_emb_stitch_parts_v1';
const MAX_CUSTOM = 40;

function toSlug(label) {
  return (
    String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'part'
  );
}

export function customPartId(label) {
  return `u:${toSlug(label)}`;
}

export function loadCustomStitchParts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({
        id: String(p?.id || '').trim(),
        label: String(p?.label || '').trim(),
      }))
      .filter((p) => p.id && p.label);
  } catch {
    return [];
  }
}

/** Save a user-typed stitch area; returns updated list. */
export function saveCustomStitchPart(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return loadCustomStitchParts();

  const id = customPartId(trimmed);
  const existing = loadCustomStitchParts();
  const lower = trimmed.toLowerCase();
  const withoutDup = existing.filter((p) => p.label.toLowerCase() !== lower && p.id !== id);
  const next = [{ id, label: trimmed }, ...withoutDup].slice(0, MAX_CUSTOM);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function isUserPartId(partId) {
  return String(partId || '').startsWith('u:');
}
