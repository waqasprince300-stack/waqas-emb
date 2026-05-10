export const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getDateRangeStart = (range) => {
  const start = startOfToday();
  if (range === 'weekly') {
    start.setDate(start.getDate() - 6);
    return start;
  }
  if (range === 'monthly') {
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  if (range === 'annually') {
    start.setFullYear(start.getFullYear() - 1);
    return start;
  }
  return null;
};

export const parseDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const isWithinDateRange = (value, range) => {
  if (range === 'all') return true;
  const date = parseDateValue(value);
  const start = getDateRangeStart(range);
  if (!date || !start) return false;
  return date >= start;
};

export const latestDateFrom = (item, keys) => {
  let latest = null;
  keys.forEach((key) => {
    const date = parseDateValue(item?.[key]);
    if (date && (!latest || date > latest)) {
      latest = date;
    }
  });
  return latest;
};

/** Millis for sorting tables: updatedAt → createdAt → kind-specific fallbacks. */
export function rowRecencyMs(row, kind) {
  const u = parseDateValue(row?.updatedAt)?.getTime();
  if (u != null && !Number.isNaN(u)) return u;
  const c = parseDateValue(row?.createdAt)?.getTime();
  if (c != null && !Number.isNaN(c)) return c;
  if (kind === 'lot') {
    const t = latestDateFrom(row, [
      'receivedBackDate',
      'dispatchDate',
      'allotDate',
      'receivedDate',
    ]);
    return t ? t.getTime() : 0;
  }
  if (kind === 'payment') {
    const d = parseDateValue(row?.date)?.getTime();
    return d != null && !Number.isNaN(d) ? d : 0;
  }
  return 0;
}

function fallbackIdCompare(a, b) {
  const idB = String(b.id ?? b._id ?? '');
  const idA = String(a.id ?? a._id ?? '');
  if (
    idB.length === 24 &&
    idA.length === 24 &&
    /^[a-f0-9]{24}$/i.test(idB) &&
    /^[a-f0-9]{24}$/i.test(idA)
  ) {
    const nb = parseInt(idB.slice(0, 8), 16);
    const na = parseInt(idA.slice(0, 8), 16);
    if (nb !== na) return nb - na;
  }
  return idB.localeCompare(idA);
}

/** Newest first (tables). kind: 'lot' | 'payment' | 'user'. */
export function compareRowsByUpdatedNewestFirst(a, b, kind) {
  const d = rowRecencyMs(b, kind) - rowRecencyMs(a, kind);
  if (d !== 0) return d;
  return fallbackIdCompare(a, b);
}

export function DateRangeSelect({ value, onChange, style }) {
  return (
    <select
      className="form-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: 150, ...style }}
    >
      {DATE_RANGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
