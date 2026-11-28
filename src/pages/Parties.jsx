import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, FormGroup, SearchBar, EmptyState, ConfirmDialog, HighlightText, PaginationFooter } from '../components/UI';
import { apiService } from '../services/api';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import {
  DateRangeSelect,
  isWithinDateRange,
  formatDisplayDate,
  formatDisplayDateTime,
  dateRangeLabel,
  getPartyLedgerLotDate,
  getPartyLedgerEntryTimeMs,
  getPaymentEntryTimeMs,
  getEffectivePartyLotStatus,
} from '../utils/dateFilters';
import { getAdminLedgerOrBusinessBill, getPartyLedgerBillDisplay } from '../utils/partyBillPrivacy';
import useDebounce from '../hooks/useDebounce';
import PaymentSlipCell from '../components/receipt/PaymentSlipCell';
import { formatLakhCrore } from '../utils/numberToWords';

function toPartyFormFields(initial, businessOwners = []) {
  if (!initial) {
    const overrides = (businessOwners || []).map((b) => ({
      businessOwnerId: String(b.id || b._id),
      showWorkspace: true,
      alias: '',
    }));
    return { name: '', phone: '', address: '', showWorkspace: true, workspaceAlias: '', workspaceOverrides: overrides };
  }
  const existingMap = new Map();
  for (const o of initial.workspaceOverrides || []) {
    if (o.businessOwnerId) {
      existingMap.set(String(o.businessOwnerId), o);
    }
  }
  const overrides = (businessOwners || []).map((b) => {
    const bid = String(b.id || b._id);
    const prev = existingMap.get(bid);
    return {
      businessOwnerId: bid,
      showWorkspace: prev ? prev.showWorkspace !== false : true,
      alias: prev ? prev.alias ?? '' : '',
    };
  });

  return {
    name: initial.name ?? '',
    phone: initial.phone ?? '',
    address: initial.address ?? '',
    showWorkspace: initial.showWorkspace !== false,
    workspaceAlias: initial.workspaceAlias ?? '',
    workspaceOverrides: overrides,
  };
}

const IOSSwitch = ({ checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: 44, height: 24, background: checked ? '#34C759' : 'var(--border, #e2e8f0)', borderRadius: 999,
      position: 'relative', transition: 'background 0.3s', flexShrink: 0, cursor: 'pointer'
    }}
  >
    <div style={{
      width: 20, height: 20, background: 'var(--card-bg, #fff)', borderRadius: '50%',
      position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.3s',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
    }} />
  </div>
);

function PartyForm({ initial, onSave, onClose, saving }) {
  const { businessOwners } = useApp();
  const [form, setForm] = useState(() => toPartyFormFields(initial, businessOwners));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(toPartyFormFields(initial, businessOwners));
  }, [initial, businessOwners]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updateOverride = (index, field, value) => {
    setForm((f) => {
      const list = [...(f.workspaceOverrides || [])];
      list[index] = { ...list[index], [field]: value };
      return { ...f, workspaceOverrides: list };
    });
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Party name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!validate()) return;
        await onSave(form);
      }}
    >
      <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, border: '1px solid var(--border, #e2e8f0)', padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <FormGroup label="Party Name *">
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Al-Hamra Textiles"
          />
          {errors.name && <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11 }}>{errors.name}</span>}
        </FormGroup>
        <FormGroup label="Phone Number">
          <input
            className="form-input"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="e.g. 0300-1234567"
          />
        </FormGroup>
        <FormGroup label="Address" style={{ marginBottom: 0 }}>
          <textarea
            className="form-textarea"
            rows={2}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Full address..."
            style={{ resize: 'vertical' }}
          />
        </FormGroup>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ marginTop: 24, background: 'var(--card-bg, #fff)', borderRadius: 12, border: '1px solid var(--border, #e2e8f0)', padding: '16px 16px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.showWorkspace ? 16 : 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>Global Workspace Visibility</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>Show workspace name to this party by default</div>
            </div>
            <IOSSwitch checked={form.showWorkspace} onChange={(c) => set('showWorkspace', c)} />
          </div>
          {form.showWorkspace && (
            <FormGroup label="Custom Global Alias (Optional)" style={{ marginBottom: 8 }}>
              <input
                className="form-input"
                style={{ background: 'var(--primary-bg, #f8fafc)' }}
                value={form.workspaceAlias}
                onChange={(e) => set('workspaceAlias', e.target.value)}
                placeholder="e.g. Main Unit"
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', display: 'block', marginTop: 6 }}>
                Replaces the internal workspace name globally for this party user.
              </span>
            </FormGroup>
          )}
        </div>

        {businessOwners && businessOwners.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #94a3b8)', marginBottom: 12, paddingLeft: 4 }}>
              Per-Workspace Overrides
            </div>
            {form.workspaceOverrides?.map((ov, idx) => {
              const bo = businessOwners.find((b) => String(b.id || b._id) === String(ov.businessOwnerId));
              const boName = bo ? bo.name : `Workspace ${ov.businessOwnerId.slice(-6)}`;
              return (
                <div key={ov.businessOwnerId} style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ov.showWorkspace ? 12 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>🏢</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #1e293b)' }}>{boName}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                          {ov.showWorkspace
                            ? (ov.alias ? `Custom alias: "${ov.alias}"` : 'Custom alias enable hai')
                            : `Global alias ("${form.workspaceAlias || boName}") use karega`}
                        </div>
                      </div>
                    </div>
                    <IOSSwitch checked={ov.showWorkspace} onChange={(c) => updateOverride(idx, 'showWorkspace', c)} />
                  </div>
                  {ov.showWorkspace && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted, #64748b)', marginBottom: 6 }}>Custom Alias</label>
                      <input
                        className="form-input"
                        style={{ fontSize: 13, padding: '8px 12px', background: 'var(--primary-bg, #f8fafc)', border: '1px solid var(--border, #e2e8f0)' }}
                        value={ov.alias}
                        onChange={(e) => updateOverride(idx, 'alias', e.target.value)}
                        placeholder={`e.g. Branch A`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        className="modal-footer"
        style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 8 }}
      >
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {saving ? (
            <>
              <Loader /> Saving…
            </>
          ) : (
            'Save Party'
          )}
        </button>
      </div>
    </form>
  );
}

function formatMoney(n) {
  return `₨${Number(n).toLocaleString()}`;
}

/** Party payment filter: match getLotStats (partyId preferred, else exact name). */
function paymentMatchesParty(p, party, getPartyName) {
  const pid = String(party.id ?? party._id ?? '');
  const pname = String(getPartyName(pid) || party.name || '').trim().toLowerCase();
  if (p.partyId != null && String(p.partyId).trim() !== '') {
    return String(p.partyId) === pid;
  }
  return Boolean(pname) && String(p.party || '').trim().toLowerCase() === pname;
}

function compactAmountFontSize(str, base = 13) {
  if (!str) return base;
  if (str.length > 14) return Math.max(11, base - 2);
  if (str.length > 12) return Math.max(11.5, base - 1);
  return base;
}

function PartyStatTile({ label, count, amountStr, accent, bgTint, hideAmount }) {
  const displayAmount = hideAmount ? '****' : amountStr;
  return (
    <div
      style={{
        background: bgTint,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 86,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted, #64748b)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary, #1e293b)', lineHeight: 1 }}>{count}</div>
      <div
        title={hideAmount ? undefined : amountStr}
        style={{
          fontSize: compactAmountFontSize(displayAmount, 13),
          fontWeight: 600,
          color: accent,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.25,
          overflowWrap: 'anywhere',
        }}
      >
        {displayAmount}
      </div>
    </div>
  );
}

function PartyFinancialStats({ stats, hideAmounts }) {
  const totalBillStr = stats.total > 0 ? (hideAmounts ? '****' : formatMoney(stats.totalValue)) : '—';
  const paidStr = hideAmounts ? '****' : formatMoney(stats.paid);
  const remainingStr = hideAmounts ? '****' : formatMoney(Math.abs(stats.remaining));

  const summaryItems = [
    {
      label: 'Total bill',
      value: totalBillStr,
      color: 'var(--text-primary, #1e293b)',
    },
    {
      label: 'Paid',
      value: paidStr,
      color: 'var(--success, #10b981)',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
      }}
    >
      {summaryItems.map((item) => (
        <div
          key={item.label}
          style={{
            background: 'var(--primary-bg, #f8fafc)',
            borderRadius: 8,
            padding: '10px 12px',
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted, #64748b)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {item.label}
          </div>
          <div
            title={hideAmounts ? undefined : item.value}
            style={{
              fontSize: compactAmountFontSize(item.value, 13),
              fontWeight: 800,
              color: item.color,
              marginTop: 4,
              lineHeight: 1.25,
              fontVariantNumeric: 'tabular-nums',
              overflowWrap: 'anywhere',
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
      <div
        style={{
          gridColumn: '1 / -1',
          background: stats.remaining > 0 ? 'var(--danger-bg, #fef2f2)' : 'var(--primary-bg, #f8fafc)',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--text-muted, #64748b)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {stats.remaining >= 0 ? 'Remaining' : 'Advance'}
        </div>
        <div
          title={hideAmounts ? undefined : remainingStr}
          style={{
            fontSize: compactAmountFontSize(remainingStr, 14),
            fontWeight: 800,
            color: stats.remaining > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #10b981)',
            lineHeight: 1.25,
            fontVariantNumeric: 'tabular-nums',
            overflowWrap: 'anywhere',
          }}
        >
          {remainingStr}
        </div>
      </div>
    </div>
  );
}

function TrashView({ trashedParties, trashedOwners, loading, onRestoreParty, onPermanentDeleteParty, onRestoreOwner, onPermanentDeleteOwner }) {
  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><LoaderDashboard height={30} width={30} /></div>;
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Deleted Parties</h3>
        {trashedParties.length === 0 ? (
          <EmptyState message="No parties in the recycle bin" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {trashedParties.map((party) => (
              <div key={party._id} style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{party.name.replace(/ \(Deleted \d+\)$/, '')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Deleted: {formatDisplayDateTime(party.deletedAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => onRestoreParty(party._id)} style={{ color: 'var(--primary)', padding: '6px 12px' }}>Restore</button>
                  <button className="btn btn-ghost" onClick={() => onPermanentDeleteParty(party)} style={{ color: 'var(--danger)', padding: '6px 12px' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Deleted Workspaces (Business Owners)</h3>
        {trashedOwners.length === 0 ? (
          <EmptyState message="No workspaces in the recycle bin" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {trashedOwners.map((owner) => (
              <div key={owner._id} style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{owner.name.replace(/ \(Deleted \d+\)$/, '')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Deleted: {formatDisplayDateTime(owner.deletedAt)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => onRestoreOwner(owner._id)} style={{ color: 'var(--primary)', padding: '6px 12px' }}>Restore</button>
                  <button className="btn btn-ghost" onClick={() => onPermanentDeleteOwner(owner)} style={{ color: 'var(--danger)', padding: '6px 12px' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PARTY_CARD_MIN_WIDTH = 300;
const PARTY_GRID_GAP = 16;

function computePartiesGridPageSize(containerWidth) {
  if (!containerWidth || containerWidth <= 0) return 10;
  const cols = Math.max(
    1,
    Math.floor((containerWidth + PARTY_GRID_GAP) / (PARTY_CARD_MIN_WIDTH + PARTY_GRID_GAP))
  );
  if (cols <= 2) return 8;
  if (cols === 3) return 9;
  return cols * 2; // 4 cols -> 8, 5 cols -> 10, 6 cols -> 12 (complete rows without empty slots)
}

export default function Parties() {
  const {
    parties,
    addParty,
    updateParty,
    deleteParty,
    reportingLots,
    reportingPayments,
    reportingPartyEdits,
    getPartyName,
    initialDataLoading,
    refreshData,
  } = useApp();
  const [pageSize, setPageSize] = useState(() =>
    typeof window !== 'undefined'
      ? computePartiesGridPageSize(Math.max(300, window.innerWidth - 280))
      : 10
  );
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [partySaving, setPartySaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customRange = useMemo(
    () => ({ start: customStart, end: customEnd }),
    [customStart, customEnd]
  );
  const [transactionParty, setTransactionParty] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef(null);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'trash'
  const [trashedParties, setTrashedParties] = useState([]);
  const [trashedOwners, setTrashedOwners] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);

  useEffect(() => {
    const el = listTopRef.current;
    if (!el) return undefined;
    const sync = () => {
      const w = el.clientWidth;
      if (w > 0) {
        const next = computePartiesGridPageSize(w);
        setPageSize((prev) => (prev === next ? prev : next));
      }
    };
    sync();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(sync);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [activeTab, initialDataLoading]);

  useEffect(() => {
    if (activeTab === 'trash') {
      const loadTrash = async () => {
        setTrashLoading(true);
        try {
          const [tp, to] = await Promise.all([
            apiService.getTrashedParties(),
            apiService.getTrashedBusinessOwners(),
          ]);
          setTrashedParties(tp || []);
          setTrashedOwners(to || []);
        } catch (err) {
          console.error("Failed to load trash", err);
        } finally {
          setTrashLoading(false);
        }
      };
      loadTrash();
    }
  }, [activeTab]);

  const rangedLots = useMemo(
    () =>
      reportingLots.filter((lot) =>
        isWithinDateRange(
          getPartyLedgerLotDate(lot, reportingPartyEdits[lot.id]),
          dateRange,
          customRange
        )
      ),
    [reportingLots, reportingPartyEdits, dateRange, customRange]
  );

  const rangedPayments = useMemo(
    () =>
      reportingPayments.filter((payment) =>
        isWithinDateRange(payment.date || payment.createdAt, dateRange, customRange)
      ),
    [reportingPayments, dateRange, customRange]
  );

  const debouncedSearch = useDebounce(search, 300);

  const filtered = useMemo(() => parties.filter((p) => {
    const q = debouncedSearch.toLowerCase();
    if (!q) return true;

    const name = (p.name || '').toLowerCase();
    const phone = (p.phone || '').toLowerCase();
    const address = (p.address || '').toLowerCase();

    let matchQ = true;
    if (searchField === 'all') {
      matchQ = name.includes(q) || phone.includes(q) || address.includes(q);
    } else if (searchField === 'name') {
      matchQ = name.includes(q);
    } else if (searchField === 'phone') {
      matchQ = phone.includes(q);
    } else if (searchField === 'address') {
      matchQ = address.includes(q);
    }
    return matchQ;
  }), [parties, debouncedSearch, searchField]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const paginatedParties = filtered.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, searchField, dateRange]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  /** Align with Party Ledger: exclude pending_review from party "completed" bill stats. */
  const lotStatusKey = useCallback(
    (l) => {
      const ls = String(l.status || '')
        .toLowerCase()
        .trim();
      if (ls === 'pending approval') return 'pending_approval';
      if (ls === 'rejected') return 'rejected';
      // Authoritative completed/received back status always wins over any stale PartyEdit.overrideStatus.
      if (['completed', 'complete', 'received back', 'billable'].includes(ls)) return 'completed';
      const pe = reportingPartyEdits[l.id] || {};
      const raw = String(pe.overrideStatus || l.status || '').toLowerCase();
      if (raw === 'received back') return 'completed';
      return raw.replace(/\s+/g, '_').replace('/', '_');
    },
    [reportingPartyEdits]
  );

  const lotBillAmount = useCallback(
    (l) => {
      const pe = reportingPartyEdits[l.id] || {};
      return getAdminLedgerOrBusinessBill(l, pe);
    },
    [reportingPartyEdits]
  );

  // Active lots should reflect only explicit party-facing bills (never owner-bill fallback).
  const activePartyBill = useCallback(
    (l) => getPartyLedgerBillDisplay(reportingPartyEdits[l.id] || {}),
    [reportingPartyEdits]
  );

  const EMPTY_LOT_STATS = {
    total: 0,
    active: 0,
    completed: 0,
    activeAmount: 0,
    hasActivePartyBill: false,
    completedAmount: 0,
    totalValue: 0,
    paid: 0,
    receivedFromParty: 0,
    remaining: 0,
  };

  /** Pre-compute stats for every party in one pass instead of scanning all lots per card. */
  const statsByPartyId = useMemo(() => {
    const partyIdByLowerName = new Map();
    for (const party of parties) {
      const pid = String(party.id ?? party._id ?? '').trim();
      const lowerName = String(party.name || '').trim().toLowerCase();
      if (pid && lowerName && !partyIdByLowerName.has(lowerName)) {
        partyIdByLowerName.set(lowerName, pid);
      }
    }

    const lotsByParty = new Map();
    for (const l of rangedLots) {
      let pid = String(l.partyId ?? '').trim();
      if (!pid) {
        const lowerLotParty = String(l.partyName || '').trim().toLowerCase();
        pid = partyIdByLowerName.get(lowerLotParty) || '';
      }
      if (!lotsByParty.has(pid)) lotsByParty.set(pid, []);
      lotsByParty.get(pid).push(l);
    }

    const addAmt = (byId, byName, p, amt) => {
      if (p.partyId != null && String(p.partyId).trim() !== '') {
        const k = String(p.partyId);
        byId.set(k, (byId.get(k) || 0) + amt);
      } else {
        const k = String(p.party || '').trim().toLowerCase();
        byName.set(k, (byName.get(k) || 0) + amt);
      }
    };

    const paidByPartyId = new Map();
    const paidByPartyName = new Map();
    const receivedByPartyId = new Map();
    const receivedByPartyName = new Map();
    for (const p of rangedPayments) {
      const amt = Number(p.amount || 0);
      if (p.type === 'Paid') addAmt(paidByPartyId, paidByPartyName, p, amt);
      else if (p.type === 'Received') addAmt(receivedByPartyId, receivedByPartyName, p, amt);
    }

    const result = new Map();
    for (const party of parties) {
      const pid = String(party.id ?? party._id ?? '');
      const lots = lotsByParty.get(pid) || [];
      const partyNameLower = String(party.name || 'Unknown').trim().toLowerCase();
      let activeAmount = 0;
      let hasActivePartyBill = false;
      let completedAmount = 0;
      let active = 0;
      let completed = 0;
      for (const l of lots) {
        const sk = lotStatusKey(l);
        if (sk === 'completed') {
          completedAmount += lotBillAmount(l);
          completed += 1;
        } else if (sk !== 'rejected') {
          // Rejected lots are neither active nor completed - exclude from both counts
          const partyAmt = activePartyBill(l);
          if (partyAmt != null) {
            activeAmount += partyAmt;
            hasActivePartyBill = true;
          }
          active += 1;
        }
      }
      const totalPaid = (paidByPartyId.get(pid) || 0) + (paidByPartyName.get(partyNameLower) || 0);
      const receivedFromParty =
        (receivedByPartyId.get(pid) || 0) + (receivedByPartyName.get(partyNameLower) || 0);
      // Align with Party Ledger: remaining = completed bill − paid + received from party
      result.set(pid, {
        total: lots.length,
        active,
        completed,
        activeAmount,
        hasActivePartyBill,
        completedAmount,
        totalValue: completedAmount,
        paid: totalPaid,
        receivedFromParty,
        remaining: completedAmount - totalPaid + receivedFromParty,
      });
    }
    return result;
  }, [parties, rangedLots, rangedPayments, lotBillAmount, activePartyBill, lotStatusKey]);

  const getLotStats = (partyId) => statsByPartyId.get(String(partyId ?? '')) || EMPTY_LOT_STATS;

  const handleSave = async (formData) => {
    setPartySaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        phone: (formData.phone || '').trim(),
        address: (formData.address || '').trim(),
        showWorkspace: !!formData.showWorkspace,
        workspaceAlias: (formData.workspaceAlias || '').trim(),
        workspaceOverrides: (formData.workspaceOverrides || []).map((ov) => ({
          businessOwnerId: String(ov.businessOwnerId || ''),
          showWorkspace: !!ov.showWorkspace,
          alias: (ov.alias || '').trim(),
        })),
      };
      if (editing) {
        const pid = editing.id ?? editing._id;
        await updateParty(String(pid), payload);
      } else {
        await addParty(payload);
      }
      setModal(null);
      setEditing(null);
    } finally {
      setPartySaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const pid = deleteTarget.id ?? deleteTarget._id;
      await deleteParty(String(pid));
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (initialDataLoading) {
    return (
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <LoaderDashboard height={30} width={30} />
      </div>
    );
  }

  const initials = (name) =>
    name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

  const avatarColors = [
    ['var(--primary-bg, #eff6ff)', 'var(--primary, #1e40af)'],
    ['var(--success-bg, #f0fdf4)', 'var(--success, #15803d)'],
    ['var(--warning-bg, #fff7ed)', 'var(--warning, #c2410c)'],
    ['var(--purple-bg, #F5F3FF)', 'var(--purple, #6d28d9)'],
    ['var(--danger-bg, #fef2f2)', 'var(--danger, #991b1b)'],
    ['var(--primary-bg, #f0f9ff)', '#075985'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Parties</div>
          <div className="page-subtitle">
            Manage all production parties and their contact details
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setModal('form');
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Party
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button
          style={{
            background: 'none',
            border: 'none',
            padding: '0 0 12px',
            fontSize: 14,
            fontWeight: 700,
            color: activeTab === 'active' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'active' ? '2px solid var(--primary)' : '2px solid transparent',
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('active')}
        >
          Active Parties
        </button>
        <button
          style={{
            background: 'none',
            border: 'none',
            padding: '0 0 12px',
            fontSize: 14,
            fontWeight: 700,
            color: activeTab === 'trash' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'trash' ? '2px solid var(--primary)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={() => setActiveTab('trash')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Recycle Bin
        </button>
      </div>

      {activeTab === 'trash' ? (
        <TrashView
          trashedParties={trashedParties}
          trashedOwners={trashedOwners}
          loading={trashLoading}
          onRestoreParty={async (id) => {
            try {
              await apiService.restoreParty(id);
              setTrashedParties(prev => prev.filter(p => String(p._id) !== String(id)));
              refreshData();
              setActiveTab('active');
            } catch (err) {
              window.alert(err.message || 'Failed to restore party');
            }
          }}
          onPermanentDeleteParty={async (party) => {
            if (!window.confirm(`Permanently delete party "${party.name.replace(/ \(Deleted \d+\)$/, '')}"? This action cannot be undone.`)) return;
            try {
              await apiService.deletePermanentParty(party._id);
              setTrashedParties(prev => prev.filter(p => String(p._id) !== String(party._id)));
            } catch (err) {
              window.alert(err.message || 'Failed to delete party');
            }
          }}
          onRestoreOwner={async (id) => {
            try {
              await apiService.restoreBusinessOwner(id);
              setTrashedOwners(prev => prev.filter(o => String(o._id) !== String(id)));
              refreshData();
              setActiveTab('active');
            } catch (err) {
              window.alert(err.message || 'Failed to restore workspace');
            }
          }}
          onPermanentDeleteOwner={async (owner) => {
            if (!window.confirm(`Permanently delete workspace "${owner.name.replace(/ \(Deleted \d+\)$/, '')}" and ALL its data? This action cannot be undone.`)) return;
            try {
              await apiService.deletePermanentBusinessOwner(owner._id, { force: true });
              setTrashedOwners(prev => prev.filter(o => String(o._id) !== String(owner._id)));
            } catch (err) {
              window.alert(err.message || 'Failed to delete workspace');
            }
          }}
        />
      ) : (
        <>
      {/* Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, paddingRight: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Market Overview</div>
        <button
          onClick={() => setHideAmounts(h => !h)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, minWidth: 116, whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {hideAmounts 
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
            }
          </svg>
          {hideAmounts ? 'Show Amounts' : 'Hide Amounts'}
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: 12,
          marginBottom: 22,
        }}
      >
        {[
          { label: 'Total Parties', value: parties.length, color: 'var(--primary, #1e40af)' },
          {
            label: 'Active Parties',
            value: parties.filter((p) =>
              rangedLots.some(
                (l) =>
                  String(l.partyId ?? '') === String(p.id ?? '') &&
                  lotStatusKey(l) !== 'completed' &&
                  lotStatusKey(l) !== 'rejected'
              )
            ).length,
            color: 'var(--warning, #d97706)',
          },
          {
            label: 'Total Lots Assigned',
            value: rangedLots.filter((l) => String(l.partyId || '').trim()).length,
            color: 'var(--purple, #7c3aed)',
          },
          (() => {
            const totalPayableVal = Array.from(statsByPartyId.values()).reduce((s, st) => s + (st.remaining > 0 ? st.remaining : 0), 0);
            return {
              label: 'Total Payable',
              value: hideAmounts ? '****' : formatMoney(totalPayableVal),
              numVal: totalPayableVal,
              color: 'var(--danger, #dc2626)',
            };
          })(),
          (() => {
            const totalAdvanceVal = Array.from(statsByPartyId.values()).reduce((s, st) => s + (st.remaining < 0 ? Math.abs(st.remaining) : 0), 0);
            return {
              label: 'Total Advance',
              value: hideAmounts ? '****' : formatMoney(totalAdvanceVal),
              numVal: totalAdvanceVal,
              color: 'var(--success, #10b981)',
            };
          })(),
        ].map((c) => {
          const lakhCroreText = c.numVal != null ? formatLakhCrore(c.numVal) : null;
          return (
            <div key={c.label} className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="stat-label">{c.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <div style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', fontWeight: 700, color: c.color, lineHeight: 1.2 }}>{c.value}</div>
                <div style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                  {!hideAmounts && lakhCroreText ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1.5px 6px',
                        borderRadius: 6,
                        background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                        color: 'var(--text-secondary, #c2b6b1)',
                        border: '1px solid var(--border)',
                        letterSpacing: '0.01em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {lakhCroreText}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="toolbar pl-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search..."
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          resultCount={filtered.length}
          searchOptions={[
            { label: 'All', value: 'all' },
            { label: 'Name', value: 'name' },
            { label: 'Phone', value: 'phone' },
            { label: 'Address', value: 'address' },
          ]}
        />
        <DateRangeSelect
          value={dateRange}
          onChange={setDateRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={({ start, end }) => {
            setCustomStart(start);
            setCustomEnd(end);
          }}
          className="pl-toolbar-filter pl-toolbar-filter--date"
          containerClassName="pl-toolbar-filter pl-toolbar-filter--date"
        />
      </div>

      <div ref={listTopRef} />

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <EmptyState message="No parties found" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${PARTY_CARD_MIN_WIDTH}px), 1fr))`,
            gap: PARTY_GRID_GAP,
          }}
        >
          {paginatedParties.map((party, idx) => {
            const stats = getLotStats(party.id);
            const [bg, text] = avatarColors[(pageStart + idx) % avatarColors.length];
            return (
              <div
                key={party.id}
                className="stagger-item party-card-hover"
                style={{
                  background: 'var(--card-bg, #fff)',
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header */}
                <div style={{ padding: '18px 18px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        color: text,
                        flexShrink: 0,
                        border: `2px solid ${text}30`,
                      }}
                    >
                      {initials(party.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 19,
                            color: 'var(--text-primary)',
                            lineHeight: 1.25,
                            letterSpacing: '-0.01em',
                          }}
                        >
                          <HighlightText text={party.name} query={search} />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--primary, #1e40af)',
                            background: 'var(--primary-bg, #eff6ff)',
                            border: '1px solid var(--border, #bfdbfe)',
                            borderRadius: 999,
                            padding: '4px 10px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {stats.total} lot{stats.total === 1 ? '' : 's'}
                        </span>
                      </div>
                      {party.phone && (
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            marginTop: 6,
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          <HighlightText text={party.phone} query={search} />
                        </div>
                      )}
                      {party.address && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 5,
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{ marginTop: 1, flexShrink: 0 }}
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span style={{ lineHeight: 1.4 }}><HighlightText text={party.address} query={search} /></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats: 2×2 layout */}
                <div
                  style={{
                    padding: '0 14px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    flex: 1,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <PartyStatTile
                      label="Active"
                      count={stats.active}
                      amountStr={
                        stats.active > 0
                          ? stats.hasActivePartyBill
                            ? formatMoney(stats.activeAmount)
                            : 'Bill pending'
                          : '—'
                      }
                      accent='var(--warning, #f59e0b)'
                      bgTint='var(--warning-bg, #fffbeb)'
                      hideAmount={hideAmounts}
                    />
                    <PartyStatTile
                      label="Completed"
                      count={stats.completed}
                      amountStr={stats.completed > 0 ? formatMoney(stats.completedAmount) : '—'}
                      accent='var(--success, #10b981)'
                      bgTint='var(--success-bg, #ecfdf5)'
                      hideAmount={hideAmounts}
                    />
                  </div>
                  <PartyFinancialStats stats={stats} hideAmounts={hideAmounts} />
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    marginTop: 'auto',
                    borderTop: '1px solid var(--primary-bg, #f1f5f9)',
                    background: 'var(--primary-bg, #f8fafc)'
                  }}
                >
                  <button
                    onClick={() => setTransactionParty(party)}
                    style={{ color: 'var(--primary-light, #0ea5e9)', fontWeight: 600, fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    View Ledger &rarr;
                  </button>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <button onClick={() => { setEditing(party); setModal('form'); }} style={{ color: 'var(--text-muted, #64748b)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>Edit</button>
                    <button onClick={() => setDeleteTarget(party)} style={{ color: 'var(--danger, #ef4444)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PaginationFooter
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageStart={pageStart}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        scrollTargetRef={listTopRef}
      />

      {modal === 'form' && (
        <Modal
          title={editing ? 'Edit Party' : 'Add New Party'}
          onClose={() => {
            if (!partySaving) {
              setModal(null);
              setEditing(null);
            }
          }}
        >
          <PartyForm
            initial={editing}
            onSave={handleSave}
            onClose={() => {
              if (!partySaving) {
                setModal(null);
                setEditing(null);
              }
            }}
            saving={partySaving}
          />
        </Modal>
      )}

      {transactionParty && (
        <Modal
          wide
          title={`${transactionParty.name} — Ledger`}
          onClose={() => setTransactionParty(null)}
        >
          <div className="party-ledger-modal-body">
            {(() => {
              const pid = String(transactionParty.id ?? transactionParty._id ?? '');
              const partyPayments = rangedPayments.filter((p) =>
                paymentMatchesParty(p, transactionParty, getPartyName)
              );
              const partyLots = rangedLots.filter((l) => String(l.partyId ?? '') === pid);

              const raw = [];

              partyPayments.forEach((p) => {
                const sortMs = getPaymentEntryTimeMs(p);
                const when = sortMs ? new Date(sortMs) : null;
                const amt = Number(p.amount || 0);
                const isReceived = p.type === 'Received';
                raw.push({
                  rowKey: `paid-${p.id || p._id}`,
                  kind: 'paid',
                  id: p.id || p._id,
                  sortMs,
                  whenDate: when,
                  note: (p.note || '').trim(),
                  linkedLot: (p.linkedLot || '').trim(),
                  paymentType: p.type || 'Paid',
                  // Paid out reduces what you owe; Received from party increases it (ledger-aligned).
                  diye: isReceived ? 0 : amt,
                  liye: isReceived ? amt : 0,
                  payment: p,
                });
              });

              partyLots.forEach((l) => {
                const pe = reportingPartyEdits[l.id] || {};
                const bill = getAdminLedgerOrBusinessBill(l, pe);
                const sortMs = getPartyLedgerEntryTimeMs(l, pe);
                const when = sortMs ? new Date(sortMs) : null;
                const effStatus = getEffectivePartyLotStatus(l, pe);
                raw.push({
                  rowKey: `lot-${l.id}`,
                  kind: 'lot',
                  id: l.id,
                  sortMs,
                  whenDate: when,
                  lotNo: l.lotNo || l.lotNumber,
                  designNo: l.designNo,
                  status: pe.overrideStatus || l.status,
                  diye: 0,
                  liye: effStatus === 'completed' ? bill : 0,
                  lot: l,
                  partyEdit: pe,
                });
              });

              raw.sort((a, b) => {
                const d = (a.sortMs || 0) - (b.sortMs || 0);
                if (d !== 0) return d;
                return String(a.rowKey).localeCompare(String(b.rowKey));
              });

              /** Net amount still owed to this party after each row is applied (lots add, payments subtract). */
              let owedRunning = 0;
              const withBalance = [];
              for (const row of raw) {
                owedRunning += row.liye - row.diye;
                withBalance.push({ ...row, balanceAfter: owedRunning });
              }

              const displayRows = [...withBalance].reverse();
              const netBalance = withBalance.length
                ? withBalance[withBalance.length - 1].balanceAfter
                : 0;

              if (!displayRows.length) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No transactions in this period
                  </div>
                );
              }

              return (
                <div style={{ padding: '0 0 8px' }}>
                  <div
                    style={{
                      background: 'var(--card-bg, #FFFFFF)',
                      border: '1px solid var(--danger-bg, #fecaca)',
                      borderRadius: 12,
                      padding: '14px 16px',
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Net balance
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginTop: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 26,
                          fontWeight: 800,
                          color: netBalance >= 0 ? 'var(--danger, #b91c1c)' : 'var(--success, #047857)',
                        }}
                      >
                        {formatMoney(netBalance)}
                      </span>
                      {formatLakhCrore(netBalance) && (
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: '1.5px 6px',
                            borderRadius: 6,
                            background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                            color: 'var(--text-secondary, #c2b6b1)',
                            border: '1px solid var(--border)',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {formatLakhCrore(netBalance)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {netBalance > 0
                        ? 'You owe this party (bill − paid + received from party).'
                        : netBalance < 0
                          ? 'Paid more than billed — advance with this party.'
                          : 'Settled up in this period.'}
                    </div>
                  </div>

                  {/* Desktop Table Header */}
                  <div className="party-ledger-desktop-header">
                    <div>Date</div>
                    <div style={{ color: 'var(--danger, #b91c1c)', textAlign: 'center' }}>
                      Paid out
                      <div style={{ fontWeight: 500, opacity: 0.85 }}>(to party)</div>
                    </div>
                    <div style={{ color: 'var(--success, #047857)', textAlign: 'center' }}>
                      In
                      <div style={{ fontWeight: 500, opacity: 0.85 }}>(bill / from party)</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>Slip</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {displayRows.map((t) => {
                      const when =
                        t.whenDate && !Number.isNaN(new Date(t.whenDate).getTime())
                          ? new Date(t.whenDate)
                          : null;
                      const subtitle =
                        t.kind === 'paid'
                          ? [
                              t.paymentType === 'Received'
                                ? 'Received from party'
                                : t.note || 'Payment',
                              t.linkedLot ? `Lot: ${t.linkedLot}` : '',
                              t.paymentType === 'Received' && t.note ? t.note : '',
                            ]
                              .filter(Boolean)
                              .join(' · ') || `${t.paymentType}`
                          : `Lot ${t.lotNo || '—'} / ${t.designNo || '—'} · ${t.status || ''}`;
                      const diye = t.diye > 0 ? t.diye : null;
                      const liye = t.liye > 0 ? t.liye : null;
                      
                      let formattedDate = '—';
                      if (when) {
                        const hasExplicitTime =
                          when.getHours() !== 0 ||
                          when.getMinutes() !== 0 ||
                          when.getSeconds() !== 0;
                        formattedDate = hasExplicitTime
                          ? formatDisplayDateTime(when).replace(/ pm/i, ' PM').replace(/ am/i, ' AM')
                          : formatDisplayDate(when);
                      }

                      return (
                        <div key={t.rowKey} className="party-ledger-row-wrapper">
                          {/* Desktop Layout */}
                          <div className="party-ledger-row-desktop">
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                {formattedDate}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  marginTop: 4,
                                  lineHeight: 1.35,
                                }}
                              >
                                {subtitle}
                              </div>
                              <div className="party-ledger-bal-pill">
                                Bal. {formatMoney(t.balanceAfter)}
                              </div>
                            </div>
                            <div
                              style={{
                                textAlign: 'center',
                                fontWeight: 800,
                                alignSelf: 'center',
                                fontVariantNumeric: 'tabular-nums',
                                color: diye ? 'var(--danger, #b91c1c)' : 'var(--text-muted)',
                              }}
                            >
                              {diye ? formatMoney(diye) : '—'}
                            </div>
                            <div
                              style={{
                                textAlign: 'center',
                                fontWeight: 800,
                                alignSelf: 'center',
                                fontVariantNumeric: 'tabular-nums',
                                color: liye ? 'var(--success, #047857)' : 'var(--text-muted)',
                              }}
                            >
                              {liye ? formatMoney(liye) : '—'}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {t.payment ? (
                                <PaymentSlipCell payment={t.payment} isParty={false} />
                              ) : t.lot ? (
                                <PaymentSlipCell lot={t.lot} partyEdit={t.partyEdit} />
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </div>
                          </div>

                          {/* Mobile Layout (Full-width, auto-adjusting, no horizontal scroll) */}
                          <div className="party-ledger-row-mobile">
                            <div className="party-ledger-mob-top">
                              <span className="party-ledger-mob-date">{formattedDate}</span>
                              <div className="party-ledger-mob-amount-wrap">
                                {diye ? (
                                  <span className="party-ledger-mob-amount paid" title="Paid out to party">
                                    −{formatMoney(diye)}
                                  </span>
                                ) : liye ? (
                                  <span className="party-ledger-mob-amount in" title="Work billed / received">
                                    +{formatMoney(liye)}
                                  </span>
                                ) : (
                                  <span className="party-ledger-mob-amount neutral">—</span>
                                )}
                              </div>
                            </div>

                            <div className="party-ledger-mob-subtitle">{subtitle}</div>

                            <div className="party-ledger-mob-bottom">
                              <span className="party-ledger-bal-pill">
                                Bal. {formatMoney(t.balanceAfter)}
                              </span>
                              {(t.payment || t.lot) && (
                                <div className="party-ledger-mob-slip">
                                  {t.payment ? (
                                    <PaymentSlipCell payment={t.payment} isParty={false} />
                                  ) : (
                                    <PaymentSlipCell lot={t.lot} partyEdit={t.partyEdit} />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p
                    style={{
                      margin: '14px 0 0',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                    }}
                  >
                    Newest entries first; running balance is after each transaction in date order (
                    {dateRangeLabel(dateRange, customRange)} filter applies).
                  </p>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}
      </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Move party "${deleteTarget.name}" to the Recycle Bin?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirming={deleteLoading}
        />
      )}
    </div>
  );
}
