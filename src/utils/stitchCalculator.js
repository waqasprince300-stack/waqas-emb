/** Built-in stitch areas for embroidery rate calculator. */
export const STITCH_PARTS = [
  { id: 'bazu', label: 'Bazu (sleeve)' },
  { id: 'front', label: 'Front' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'back', label: 'Back' },
  { id: 'dupatta', label: 'Dupatta' },
  { id: 'toser', label: 'Toser' },
  { id: 'pati', label: 'Pati' },
  { id: 'collar', label: 'Collar' },
  { id: 'damman', label: 'Damman' },
  { id: 'gala', label: 'Gala (neck)' },
  { id: 'pocket', label: 'Pocket' },
  { id: 'lace', label: 'Lace' },
  { id: 'border', label: 'Border' },
  { id: 'shalwar', label: 'Shalwar' },
  { id: 'trouser', label: 'Trouser' },
  { id: 'custom', label: 'Other…' },
];

/** Default quick-add chip ids (built-in). */
export const DEFAULT_QUICK_PART_IDS = [
  'bazu', 'front', 'left', 'right', 'back', 'dupatta', 'toser', 'pati',
  'collar', 'damman', 'gala', 'pocket', 'lace', 'border', 'shalwar', 'trouser',
];

export const REPEAT_OPTIONS = [
  1 / 6, 1 / 3, 0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 7.5, 8, 9, 10,
];

export function buildStitchPartsList(customParts = []) {
  const builtins = STITCH_PARTS.filter((p) => p.id !== 'custom');
  const builtinIds = new Set(builtins.map((p) => p.id));
  const custom = (Array.isArray(customParts) ? customParts : []).filter(
    (p) => p?.id && p?.label && !builtinIds.has(p.id),
  );
  const other = STITCH_PARTS.find((p) => p.id === 'custom');
  return [...builtins, ...custom, ...(other ? [other] : [])];
}

export function findStitchPart(partId, customParts = []) {
  const id = String(partId || '').trim();
  if (!id) return null;
  return buildStitchPartsList(customParts).find((p) => p.id === id) || null;
}

export function emptyStitchRow(partId = '', customParts = []) {
  const preset = findStitchPart(partId, customParts);
  return {
    part: partId || '',
    label: preset && partId !== 'custom' ? preset.label : '',
    baseStitches: '',
    repeat: 1,
  };
}

export function normalizeStitchRow(row, customParts = []) {
  const part = String(row?.part || '').trim();
  const label = String(row?.label || row?.partLabel || '').trim();
  if (!part && !label) {
    return emptyStitchRow('', customParts);
  }
  if (part && part !== 'custom') {
    const preset = findStitchPart(part, customParts);
    return {
      part,
      label: label || preset?.label || part,
      baseStitches: row?.baseStitches ?? '',
      repeat: Number(row?.repeat) || 1,
    };
  }
  return {
    part: part || 'custom',
    label,
    baseStitches: row?.baseStitches ?? '',
    repeat: Number(row?.repeat) || 1,
  };
}

export function rowStitchTotal(row) {
  const base = Number(row.baseStitches);
  if (!base || Number.isNaN(base)) return 0;
  return base * (Number(row.repeat) || 1);
}

export function grandStitchTotal(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + rowStitchTotal(row), 0);
}

export function formatCalcNum(num) {
  return Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function rowDisplayLabel(row, customParts = []) {
  const n = normalizeStitchRow(row, customParts);
  if (n.label) return n.label;
  if (n.part && n.part !== 'custom') {
    return findStitchPart(n.part, customParts)?.label || n.part;
  }
  return '—';
}

export function quickPartChipLabel(part) {
  if (!part?.label) return '';
  const short = part.label.split('(')[0].trim();
  return short.split(' ')[0] || part.label;
}
