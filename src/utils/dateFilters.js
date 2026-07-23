import React from 'react';

export const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
  { value: 'custom', label: 'Custom' },
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
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // Date-only YYYY-MM-DD → local calendar day (avoid UTC shift).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) {
    const date = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Display dates as day/month/year (DD/MM/YYYY). */
export const formatDisplayDate = (value, fallback = '—') => {
  const date = parseDateValue(value);
  if (!date) return fallback;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
};

/** Display date + time as DD/MM/YYYY, h:mm AM/PM. */
export const formatDisplayDateTime = (value, fallback = '—') => {
  const date = parseDateValue(value);
  if (!date) return fallback;
  const time = date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${formatDisplayDate(date, '')}, ${time}`;
};

/** Inclusive day bounds for custom YYYY-MM-DD strings. */
export const getCustomRangeBounds = (customStart, customEnd) => {
  const startRaw = String(customStart || '').trim();
  const endRaw = String(customEnd || '').trim();
  let start = null;
  let end = null;
  if (startRaw) {
    start = parseDateValue(startRaw);
    if (start) start.setHours(0, 0, 0, 0);
  }
  if (endRaw) {
    end = parseDateValue(endRaw);
    if (end) end.setHours(23, 59, 59, 999);
  }
  return { start, end };
};

/**
 * @param {*} value - date-like value on a row
 * @param {string} range - all | weekly | monthly | annually | custom
 * @param {{ start?: string, end?: string }} [custom] - YYYY-MM-DD when range === 'custom'
 */
export const isWithinDateRange = (value, range, custom = {}) => {
  if (!range || range === 'all') return true;

  if (range === 'custom') {
    const date = parseDateValue(value);
    if (!date) return false;
    const { start, end } = getCustomRangeBounds(custom.start, custom.end);
    // Neither bound set yet — don't hide everything while the user picks dates.
    if (!start && !end) return true;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }

  const date = parseDateValue(value);
  const start = getDateRangeStart(range);
  if (!date || !start) return false;
  return date >= start;
};

export const dateRangeLabel = (range, custom = {}) => {
  if (range === 'custom') {
    const s = String(custom.start || '').trim();
    const e = String(custom.end || '').trim();
    const sLabel = s ? formatDisplayDate(s, s) : '';
    const eLabel = e ? formatDisplayDate(e, e) : '';
    if (sLabel && eLabel) return `${sLabel} → ${eLabel}`;
    if (sLabel) return `From ${sLabel}`;
    if (eLabel) return `Until ${eLabel}`;
    return 'Custom range';
  }
  return DATE_RANGE_OPTIONS.find((o) => o.value === range)?.label || 'All Time';
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

/**
 * Preset range select + optional manual start/end when "Custom range" is chosen.
 * customStart / customEnd / onCustomChange are only needed for custom filtering.
 */
export function DateRangeSelect({
  value,
  onChange,
  customStart = '',
  customEnd = '',
  onCustomChange,
  style,
  className = '',
}) {
  const inToolbar = String(className).includes('pl-toolbar-filter');
  const isCustom = value === 'custom';

  return (
    <div className={`date-range-select${isCustom ? ' date-range-select--custom' : ''}`}>
      <select
        className={['form-select', 'date-range-select__preset', className]
          .filter(Boolean)
          .join(' ')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={inToolbar ? style : { width: 150, ...style }}
        aria-label="Date range"
      >
        {DATE_RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {isCustom && (
        <div className="date-range-custom" role="group" aria-label="Custom date range">
          <label className="date-range-custom__field">
            <span className="date-range-custom__label">From</span>
            <input
              type="date"
              className="date-range-custom__input"
              value={customStart || ''}
              max={customEnd || undefined}
              onChange={(e) => onCustomChange?.({ start: e.target.value, end: customEnd || '' })}
              aria-label="Start date"
            />
          </label>
          <span className="date-range-custom__divider" aria-hidden="true" />
          <label className="date-range-custom__field">
            <span className="date-range-custom__label">To</span>
            <input
              type="date"
              className="date-range-custom__input"
              value={customEnd || ''}
              min={customStart || undefined}
              onChange={(e) => onCustomChange?.({ start: customStart || '', end: e.target.value })}
              aria-label="End date"
            />
          </label>
        </div>
      )}
    </div>
  );
}
