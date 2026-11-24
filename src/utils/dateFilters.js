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

/**
 * Extract the business date for a lot (ignoring technical updatedAt).
 * For completed/received back: receivedBackDate -> completeDate -> dispatchDate -> allotDate -> receivedDate -> createdAt
 * For in-progress/dispatched/pending: dispatchDate -> allotDate -> receivedDate -> createdAt
 */
export function getLotBusinessDate(lot) {
  if (!lot) return null;
  const status = String(lot.status || '').toLowerCase().trim();
  const isCompleted = status === 'completed' || status === 'received back';

  if (isCompleted) {
    return (
      latestDateFrom(lot, [
        'receivedBackDate',
        'completeDate',
        'dispatchDate',
        'allotDate',
        'receivedDate',
        'createdAt',
      ]) ||
      parseDateValue(
        lot.receivedBackDate ||
        lot.completeDate ||
        lot.dispatchDate ||
        lot.allotDate ||
        lot.receivedDate ||
        lot.createdAt
      )
    );
  }

  return (
    latestDateFrom(lot, [
      'dispatchDate',
      'allotDate',
      'receivedDate',
      'createdAt',
    ]) ||
    parseDateValue(lot.dispatchDate || lot.allotDate || lot.receivedDate || lot.createdAt)
  );
}

/**
 * Natural comparison for lot numbers (e.g. 7286 > 7285, 7247-D > 7247, etc.)
 */
export function compareLotNumbers(a, b) {
  const numA = String(a?.lotNo || a?.lotNumber || '').trim();
  const numB = String(b?.lotNo || b?.lotNumber || '').trim();

  if (numA && numB) {
    const cmp = numB.localeCompare(numA, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  } else if (numB && !numA) {
    return 1;
  } else if (numA && !numB) {
    return -1;
  }
  return 0;
}

/**
 * Professional rule-based comparator for lots across the entire application:
 * 1. Business date (Calendar day descending: newest day first)
 * 2. If same day (or dates missing): Lot Number (Descending: 7286 before 7285)
 * 3. Fallback: exact timestamp / ID
 *
 * NOTE: This NEVER jumps a row on edits or status changes because technical updatedAt is ignored!
 */
export function compareLotsBusinessOrder(a, b) {
  const dateObjA = getLotBusinessDate(a);
  const dateObjB = getLotBusinessDate(b);

  const timeA = dateObjA ? dateObjA.getTime() : 0;
  const timeB = dateObjB ? dateObjB.getTime() : 0;

  if (timeA && timeB) {
    const dayA = dateObjA.toISOString().slice(0, 10);
    const dayB = dateObjB.toISOString().slice(0, 10);
    if (dayA !== dayB) {
      return dayB.localeCompare(dayA);
    }
  } else if (timeB && !timeA) {
    return 1;
  } else if (timeA && !timeB) {
    return -1;
  }

  // Same calendar day or missing dates: Lot Number takes precedence!
  const lotCmp = compareLotNumbers(a, b);
  if (lotCmp !== 0) return lotCmp;

  if (timeB !== timeA) return timeB - timeA;

  return fallbackIdCompare(a, b);
}

export function rowRecencyMs(row, kind) {
  if (kind === 'payment') {
    const dateObj = parseDateValue(row?.date);
    if (dateObj) return dateObj.getTime();
    return 0;
  }

  if (kind === 'lot') {
    const d = getLotBusinessDate(row);
    if (d) return d.getTime();
    return 0;
  }

  const u = parseDateValue(row?.updatedAt)?.getTime();
  if (u != null && !Number.isNaN(u)) return u;
  const c = parseDateValue(row?.createdAt)?.getTime();
  if (c != null && !Number.isNaN(c)) return c;
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
  if (kind === 'payment') {
    // Primary sort: Calendar day timestamp (descending: newest day first)
    const timeA = parseDateValue(a?.date)?.setHours(0, 0, 0, 0) || 0;
    const timeB = parseDateValue(b?.date)?.setHours(0, 0, 0, 0) || 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    // Secondary sort: Actual entry time (descending: newest created entry first)
    const createdA = parseDateValue(a?.createdAt)?.getTime() || 0;
    const createdB = parseDateValue(b?.createdAt)?.getTime() || 0;
    if (createdA !== createdB) {
      return createdB - createdA;
    }
    return fallbackIdCompare(a, b);
  }

  if (kind === 'lot') {
    return compareLotsBusinessOrder(a, b);
  }

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
  containerClassName = '',
}) {
  const inToolbar = String(className).includes('pl-toolbar-filter') || String(containerClassName).includes('pl-toolbar-filter');
  const isCustom = value === 'custom';

  return (
    <div className={`date-range-select${isCustom ? ' date-range-select--custom' : ''} ${containerClassName}`.trim()}>
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
