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

/** Convert Date or ISO/YYYY-MM-DD string to local calendar YYYY-MM-DD (never shifts back in UTC+5). */
export function toLocalYmd(value = new Date()) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const date = parseDateValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

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
 * Resolve the effective party-facing status key for a lot (accounting for PartyEdit overrideStatus).
 */
export function getEffectivePartyLotStatus(lot, partyEdit) {
  const ls = String(lot?.status || '').toLowerCase().trim();
  if (ls === 'pending approval') return 'pending approval';
  if (ls === 'rejected') return 'rejected';
  // Authoritative approved/completed status always wins over any stale PartyEdit.overrideStatus.
  if (['completed', 'complete', 'received back', 'billable'].includes(ls)) return 'completed';
  const ov = String(partyEdit?.overrideStatus || '').toLowerCase().trim();
  if (['completed', 'complete', 'received back', 'billable'].includes(ov)) return 'completed';
  if (ov === 'pending review' || ov === 'pending approval') return 'pending approval';
  if (ov === 'rejected') return 'rejected';
  if (ov === 'in progress' || ov === 'dispatched') return 'dispatched';
  if (ov === 'pending') return 'pending';
  if (['dispatched', 'in progress', 'processing'].includes(ls)) return 'dispatched';
  return 'pending';
}

/**
 * Workspace stage date:
 * - Before dispatch (pending): allotDate -> receivedDate -> createdAt
 * - Dispatched & later stages (anchored to dispatch, ignoring updatedAt/approval):
 *   dispatchedAt (when same day as dispatchDate) -> dispatchDate -> allotDate -> receivedDate -> createdAt
 */
export function getWorkspaceLotDate(lot) {
  if (!lot) return null;
  const status = String(lot.status || '').toLowerCase().trim();
  const isDispatchedOrBeyond = status !== 'pending' && Boolean(lot.dispatchedAt || lot.dispatchDate);

  if (isDispatchedOrBeyond) {
    if (lot.dispatchDate && lot.dispatchedAt) {
      const dDay = toLocalYmd(lot.dispatchDate);
      const tsDay = toLocalYmd(lot.dispatchedAt);
      if (dDay && dDay === tsDay) {
        return parseDateValue(lot.dispatchedAt);
      }
      return parseDateValue(lot.dispatchDate);
    }
    return parseDateValue(
      lot.dispatchedAt || lot.dispatchDate || lot.allotDate || lot.receivedDate || lot.createdAt
    );
  }

  return parseDateValue(lot.allotDate || lot.receivedDate || lot.createdAt);
}

function getWorkspaceSameDayMs(lot, dayStr) {
  if (!lot || !dayStr) return null;
  const status = String(lot.status || '').toLowerCase().trim();
  const isDispatchedOrBeyond = status !== 'pending' && Boolean(lot.dispatchedAt || lot.dispatchDate);

  if (isDispatchedOrBeyond) {
    if (lot.dispatchedAt && toLocalYmd(lot.dispatchedAt) === dayStr) {
      return parseDateValue(lot.dispatchedAt)?.getTime() || null;
    }
    if (lot.dispatchDate && /T\d{2}:\d{2}/.test(String(lot.dispatchDate)) && toLocalYmd(lot.dispatchDate) === dayStr) {
      return parseDateValue(lot.dispatchDate)?.getTime() || null;
    }
    return null;
  }

  if (lot.createdAt && toLocalYmd(lot.createdAt) === dayStr) {
    return parseDateValue(lot.createdAt)?.getTime() || null;
  }
  return null;
}

/**
 * Party Ledger / Parties page lot date (freezes on party submission/completion date):
 * - Pending review / Completed / Received back:
 *   pe.completeDate -> lot.receivedBackDate -> lot.pendingReviewSubmittedAt -> dispatchDate -> allotDate -> createdAt
 *   (NEVER uses completionApprovedAt or updatedAt so admin approval days later never shifts party ledger dates)
 * - Dispatched / Rejected: dispatchDate -> dispatchedAt -> allotDate -> receivedDate -> createdAt
 * - Pending: allotDate -> receivedDate -> createdAt
 */
export function getPartyLedgerLotDate(lot, partyEdit) {
  if (!lot) return null;
  const effStatus = getEffectivePartyLotStatus(lot, partyEdit);

  if (effStatus === 'completed' || effStatus === 'pending approval') {
    const raw =
      partyEdit?.completeDate ||
      lot.receivedBackDate ||
      lot.pendingReviewSubmittedAt ||
      lot.dispatchDate ||
      lot.dispatchedAt ||
      lot.allotDate ||
      lot.receivedDate ||
      lot.createdAt;
    return parseDateValue(raw);
  }

  if (effStatus === 'dispatched' || effStatus === 'rejected') {
    return parseDateValue(
      lot.dispatchDate ||
      lot.dispatchedAt ||
      lot.allotDate ||
      lot.receivedDate ||
      lot.createdAt
    );
  }

  return parseDateValue(lot.allotDate || lot.receivedDate || lot.createdAt);
}

/** Exact same-day timestamp (ms) for sorting / chronological tie-breaking in Party Ledger & View Ledger. */
export function getPartyLedgerEntryTimeMs(lot, partyEdit) {
  const baseDate = getPartyLedgerLotDate(lot, partyEdit);
  if (!baseDate) return 0;
  const dayStr = toLocalYmd(baseDate);
  const effStatus = getEffectivePartyLotStatus(lot, partyEdit);

  if (
    (effStatus === 'completed' || effStatus === 'pending approval') &&
    lot?.pendingReviewSubmittedAt &&
    toLocalYmd(lot.pendingReviewSubmittedAt) === dayStr
  ) {
    return parseDateValue(lot.pendingReviewSubmittedAt)?.getTime() || baseDate.getTime();
  }
  if (lot?.dispatchedAt && toLocalYmd(lot.dispatchedAt) === dayStr) {
    return parseDateValue(lot.dispatchedAt)?.getTime() || baseDate.getTime();
  }
  if (lot?.createdAt && toLocalYmd(lot.createdAt) === dayStr) {
    return parseDateValue(lot.createdAt)?.getTime() || baseDate.getTime();
  }
  return baseDate.getTime();
}

/** Payment timeline timestamp (ms): uses p.date calendar day + p.createdAt time when on the same day. */
export function getPaymentEntryTimeMs(payment) {
  const baseDate = parseDateValue(payment?.date || payment?.createdAt);
  if (!baseDate) return 0;
  const dayStr = toLocalYmd(baseDate);
  if (payment?.createdAt && toLocalYmd(payment.createdAt) === dayStr) {
    return parseDateValue(payment.createdAt)?.getTime() || baseDate.getTime();
  }
  return baseDate.getTime();
}

function getPartyLedgerSameDayMs(lot, partyEdit, dayStr) {
  if (!lot || !dayStr) return null;
  const effStatus = getEffectivePartyLotStatus(lot, partyEdit);
  if (effStatus === 'completed' || effStatus === 'pending approval') {
    if (lot.pendingReviewSubmittedAt && toLocalYmd(lot.pendingReviewSubmittedAt) === dayStr) {
      return parseDateValue(lot.pendingReviewSubmittedAt)?.getTime() || null;
    }
    return null;
  }
  if (effStatus === 'dispatched' || effStatus === 'rejected') {
    if (lot.dispatchedAt && toLocalYmd(lot.dispatchedAt) === dayStr) {
      return parseDateValue(lot.dispatchedAt)?.getTime() || null;
    }
    return null;
  }
  if (lot.createdAt && toLocalYmd(lot.createdAt) === dayStr) {
    return parseDateValue(lot.createdAt)?.getTime() || null;
  }
  return null;
}

function compareDayThenOptionalTimestamp(dayA, tsA, dayB, tsB, a, b) {
  if (dayA && dayB) {
    if (dayA !== dayB) return dayB.localeCompare(dayA);
  } else if (dayB && !dayA) {
    return 1;
  } else if (dayA && !dayB) {
    return -1;
  }

  if (tsA && tsB) {
    if (tsA !== tsB) return tsB - tsA;
  } else if (tsA && !tsB) {
    return -1;
  } else if (tsB && !tsA) {
    return 1;
  }

  const lotCmp = compareLotNumbers(a, b);
  if (lotCmp !== 0) return lotCmp;

  return fallbackIdCompare(a, b);
}

/**
 * Workspace comparator:
 * 1. Calendar day of Workspace stage date (pending -> allotDate/createdAt, dispatched -> dispatchedAt/dispatchDate)
 * 2. Exact dispatch/create timestamp on the same day so newly dispatched lots jump strictly to the top
 * 3. Lot number descending, then ID
 */
export function compareWorkspaceLots(a, b) {
  const dateA = getWorkspaceLotDate(a);
  const dateB = getWorkspaceLotDate(b);
  const dayA = dateA ? toLocalYmd(dateA) : '';
  const dayB = dateB ? toLocalYmd(dateB) : '';
  const tsA = getWorkspaceSameDayMs(a, dayA);
  const tsB = getWorkspaceSameDayMs(b, dayB);
  return compareDayThenOptionalTimestamp(dayA, tsA, dayB, tsB, a, b);
}

/**
 * Party Ledger comparator:
 * Freezes lot order on the party's submission/completion date (and submission time on the same day).
 * Admin approval later never moves the lot's date or row position.
 */
export function comparePartyLedgerLots(a, b, partyEditsMap = {}) {
  const peA = partyEditsMap?.[a?.id];
  const peB = partyEditsMap?.[b?.id];
  const dateA = getPartyLedgerLotDate(a, peA);
  const dateB = getPartyLedgerLotDate(b, peB);
  const dayA = dateA ? toLocalYmd(dateA) : '';
  const dayB = dateB ? toLocalYmd(dateB) : '';
  const tsA = getPartyLedgerSameDayMs(a, peA, dayA);
  const tsB = getPartyLedgerSameDayMs(b, peB, dayB);
  return compareDayThenOptionalTimestamp(dayA, tsA, dayB, tsB, a, b);
}

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
    const dayA = `${dateObjA.getFullYear()}-${pad2(dateObjA.getMonth() + 1)}-${pad2(dateObjA.getDate())}`;
    const dayB = `${dateObjB.getFullYear()}-${pad2(dateObjB.getMonth() + 1)}-${pad2(dateObjB.getDate())}`;
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
 * Sort billable ('received back') lots so the most recently approved / received-back
 * lot always appears strictly at the top (each new approval stacks above earlier ones).
 */
export function compareBillableLotsNewestFirst(a, b) {
  const getApprovedMs = (lot) => {
    if (!lot) return 0;
    const approved = parseDateValue(lot.completionApprovedAt)?.getTime();
    if (approved != null && !Number.isNaN(approved) && approved > 0) return approved;
    const recBack = parseDateValue(lot.receivedBackDate)?.getTime();
    if (recBack != null && !Number.isNaN(recBack) && recBack > 0) return recBack;
    const updated = parseDateValue(lot.updatedAt)?.getTime();
    if (updated != null && !Number.isNaN(updated) && updated > 0) return updated;
    return getLotBusinessDate(lot)?.getTime() || 0;
  };

  const timeA = getApprovedMs(a);
  const timeB = getApprovedMs(b);
  if (timeB !== timeA) return timeB - timeA;

  return compareLotsBusinessOrder(a, b);
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
