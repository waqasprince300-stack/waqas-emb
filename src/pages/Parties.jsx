import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, FormGroup, SearchBar, EmptyState, ConfirmDialog } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  dateRangeLabel,
  formatDisplayDateTime,
} from '../utils/dateFilters';

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
      width: 44, height: 24, background: checked ? '#34C759' : '#e2e8f0', borderRadius: 999,
      position: 'relative', transition: 'background 0.3s', flexShrink: 0, cursor: 'pointer'
    }}
  >
    <div style={{
      width: 20, height: 20, background: '#fff', borderRadius: '50%',
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
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <FormGroup label="Party Name *">
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Al-Hamra Textiles"
          />
          {errors.name && <span style={{ color: '#dc2626', fontSize: 11 }}>{errors.name}</span>}
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
        <div style={{ marginTop: 24, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 16px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.showWorkspace ? 16 : 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Global Workspace Visibility</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Show workspace name to this party by default</div>
            </div>
            <IOSSwitch checked={form.showWorkspace} onChange={(c) => set('showWorkspace', c)} />
          </div>
          {form.showWorkspace && (
            <FormGroup label="Custom Global Alias (Optional)" style={{ marginBottom: 8 }}>
              <input
                className="form-input"
                style={{ background: '#f8fafc' }}
                value={form.workspaceAlias}
                onChange={(e) => set('workspaceAlias', e.target.value)}
                placeholder="e.g. Ghausia Main Unit"
              />
              <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 6 }}>
                Replaces the internal workspace name globally for this party user.
              </span>
            </FormGroup>
          )}
        </div>

        {businessOwners && businessOwners.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12, paddingLeft: 4 }}>
              Per-Workspace Overrides
            </div>
            {form.workspaceOverrides?.map((ov, idx) => {
              const bo = businessOwners.find((b) => String(b.id || b._id) === String(ov.businessOwnerId));
              const boName = bo ? bo.name : `Workspace ${ov.businessOwnerId.slice(-6)}`;
              return (
                <div key={ov.businessOwnerId} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ov.showWorkspace ? 16 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>🏢</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{boName}</span>
                    </div>
                    <IOSSwitch checked={ov.showWorkspace} onChange={(c) => updateOverride(idx, 'showWorkspace', c)} />
                  </div>
                  {ov.showWorkspace && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 6 }}>Custom Alias</label>
                      <input
                        className="form-input"
                        style={{ fontSize: 13, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}
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
  const pname = String(getPartyName(pid) || party.name || '').trim();
  if (p.type !== 'Paid') return false;
  if (p.partyId != null && String(p.partyId).trim() !== '') {
    return String(p.partyId) === pid;
  }
  return String(p.party || '').trim() === pname;
}

function PartyStatTile({ label, count, amountStr, accent, bgTint, hideAmount }) {
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
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hideAmount ? '****' : amountStr}</div>
    </div>
  );
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
  } = useApp();
  const PAGE_SIZE = 8;
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [partySaving, setPartySaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customRange = useMemo(
    () => ({ start: customStart, end: customEnd }),
    [customStart, customEnd]
  );
  const [transactionParty, setTransactionParty] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hideAmounts, setHideAmounts] = useState(false);

  const rangedLots = useMemo(
    () =>
      reportingLots.filter((lot) =>
        isWithinDateRange(
          latestDateFrom(lot, [
            'updatedAt',
            'createdAt',
            'receivedBackDate',
            'dispatchDate',
            'allotDate',
            'receivedDate',
          ]),
          dateRange,
          customRange
        )
      ),
    [reportingLots, dateRange, customRange]
  );

  const rangedPayments = useMemo(
    () =>
      reportingPayments.filter((payment) =>
        isWithinDateRange(payment.updatedAt || payment.date, dateRange, customRange)
      ),
    [reportingPayments, dateRange, customRange]
  );

  const filtered = parties.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedParties = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, dateRange]);

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
      return Number(pe.partyBillAmount !== undefined ? pe.partyBillAmount : l.billAmount || 0);
    },
    [reportingPartyEdits]
  );

  const EMPTY_LOT_STATS = {
    total: 0,
    active: 0,
    completed: 0,
    activeAmount: 0,
    completedAmount: 0,
    totalValue: 0,
    paid: 0,
    receivedFromParty: 0,
    remaining: 0,
  };

  /** Pre-compute stats for every party in one pass instead of scanning all lots per card. */
  const statsByPartyId = useMemo(() => {
    const lotsByParty = new Map();
    for (const l of rangedLots) {
      const pid = String(l.partyId ?? '');
      if (!lotsByParty.has(pid)) lotsByParty.set(pid, []);
      lotsByParty.get(pid).push(l);
    }

    const addAmt = (byId, byName, p, amt) => {
      if (p.partyId != null && String(p.partyId).trim() !== '') {
        const k = String(p.partyId);
        byId.set(k, (byId.get(k) || 0) + amt);
      } else {
        const k = String(p.party || '').trim();
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
      const pid = String(party.id ?? '');
      const lots = lotsByParty.get(pid) || [];
      const partyName = String(party.name || 'Unknown').trim();
      let activeAmount = 0;
      let completedAmount = 0;
      let totalPayable = 0;
      let active = 0;
      let completed = 0;
      for (const l of lots) {
        const amt = lotBillAmount(l);
        totalPayable += amt;
        if (lotStatusKey(l) === 'completed') {
          completedAmount += amt;
          completed += 1;
        } else {
          activeAmount += amt;
          active += 1;
        }
      }
      const totalPaid = (paidByPartyId.get(pid) || 0) + (paidByPartyName.get(partyName) || 0);
      const receivedFromParty =
        (receivedByPartyId.get(pid) || 0) + (receivedByPartyName.get(partyName) || 0);
      // Align with Party Ledger: remaining = completed bill − paid + received from party
      result.set(pid, {
        total: lots.length,
        active,
        completed,
        activeAmount,
        completedAmount,
        totalValue: completedAmount,
        paid: totalPaid,
        receivedFromParty,
        remaining: completedAmount - totalPaid + receivedFromParty,
      });
    }
    return result;
  }, [parties, rangedLots, rangedPayments, lotBillAmount, lotStatusKey]);

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
    ['#EFF6FF', '#1e40af'],
    ['#F0FDF4', '#15803d'],
    ['#FFF7ED', '#c2410c'],
    ['#F5F3FF', '#6d28d9'],
    ['#FEF2F2', '#991B1B'],
    ['#F0F9FF', '#075985'],
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

      {/* Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, paddingRight: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Market Overview</div>
        <button 
          onClick={() => setHideAmounts(h => !h)} 
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 22,
        }}
      >
        {[
          { label: 'Total Parties', value: parties.length, color: '#1e40af' },
          {
            label: 'Active Parties',
            value: parties.filter((p) =>
              rangedLots.some(
                (l) =>
                  String(l.partyId ?? '') === String(p.id ?? '') && lotStatusKey(l) !== 'completed'
              )
            ).length,
            color: '#d97706',
          },
          {
            label: 'Total Lots Assigned',
            value: rangedLots.filter((l) => String(l.partyId || '').trim()).length,
            color: '#7c3aed',
          },
          {
            label: 'Total Payable',
            value: hideAmounts ? '****' : formatMoney(Array.from(statsByPartyId.values()).reduce((s, st) => s + (st.remaining > 0 ? st.remaining : 0), 0)),
            color: '#dc2626',
          },
          {
            label: 'Total Advance',
            value: hideAmounts ? '****' : formatMoney(Array.from(statsByPartyId.values()).reduce((s, st) => s + (st.remaining < 0 ? Math.abs(st.remaining) : 0), 0)),
            color: '#10b981',
          },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="toolbar pl-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search party name, phone, address..."
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
        />
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <EmptyState message="No parties found" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
          }}
        >
          {paginatedParties.map((party, idx) => {
            const stats = getLotStats(party.id);
            const [bg, text] = avatarColors[(pageStart + idx) % avatarColors.length];
            return (
              <div
                key={party.id}
                style={{
                  background: '#fff',
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
                            fontWeight: 700,
                            fontSize: 16,
                            color: 'var(--text-primary)',
                            lineHeight: 1.25,
                          }}
                        >
                          {party.name}
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#1e40af',
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
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
                          {party.phone}
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
                          <span style={{ lineHeight: 1.4 }}>{party.address}</span>
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
                      amountStr={stats.active > 0 ? formatMoney(stats.activeAmount) : '—'}
                      accent="#f59e0b"
                      bgTint="#fffbeb"
                      hideAmount={hideAmounts}
                    />
                    <PartyStatTile
                      label="Completed"
                      count={stats.completed}
                      amountStr={stats.completed > 0 ? formatMoney(stats.completedAmount) : '—'}
                      accent="#10b981"
                      bgTint="#ecfdf5"
                      hideAmount={hideAmounts}
                    />
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      gap: 8,
                    }}
                  >
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 8px', overflow: 'hidden' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Total bill
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stats.total > 0 ? (hideAmounts ? '****' : formatMoney(stats.totalValue)) : '—'}
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 8px', overflow: 'hidden' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Paid
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hideAmounts ? '****' : formatMoney(stats.paid)}
                      </div>
                    </div>
                    <div style={{ background: stats.remaining > 0 ? '#fef2f2' : '#f8fafc', borderRadius: 8, padding: '10px 8px', overflow: 'hidden' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        {stats.remaining >= 0 ? 'Remaining' : 'Advance'}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: stats.remaining > 0 ? '#ef4444' : '#10b981', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hideAmounts ? '****' : formatMoney(Math.abs(stats.remaining))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    marginTop: 'auto',
                    borderTop: '1px solid #f1f5f9',
                    background: '#f8fafc'
                  }}
                >
                  <button
                    onClick={() => setTransactionParty(party)}
                    style={{ color: '#0ea5e9', fontWeight: 600, fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    View Ledger &rarr;
                  </button>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <button onClick={() => { setEditing(party); setModal('form'); }} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>Edit</button>
                    <button onClick={() => setDeleteTarget(party)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
            >
              Prev
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

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
          <div style={{ maxHeight: 'min(70vh, 560px)', overflowY: 'auto' }}>
            {(() => {
              const pid = String(transactionParty.id ?? transactionParty._id ?? '');
              const partyPayments = rangedPayments.filter((p) =>
                paymentMatchesParty(p, transactionParty, getPartyName)
              );
              const partyLots = rangedLots.filter((l) => String(l.partyId ?? '') === pid);

              const raw = [];

              partyPayments.forEach((p) => {
                const when = latestDateFrom(p, ['updatedAt', 'date']);
                const sortMs = when ? when.getTime() : 0;
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
                });
              });

              partyLots.forEach((l) => {
                const pe = reportingPartyEdits[l.id] || {};
                const bill = Number(
                  pe.partyBillAmount !== undefined ? pe.partyBillAmount : l.billAmount || 0
                );
                const when = latestDateFrom(l, [
                  'updatedAt',
                  'createdAt',
                  'receivedBackDate',
                  'dispatchDate',
                  'allotDate',
                  'receivedDate',
                ]);
                const sortMs = when ? when.getTime() : 0;
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
                  liye: (pe.overrideStatus || l.status || '').toLowerCase() === 'completed' ? bill : 0,
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
                      background: '#FFFFFF',
                      border: '1px solid #FECACA',
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
                        fontSize: 26,
                        fontWeight: 800,
                        color: netBalance >= 0 ? '#b91c1c' : '#047857',
                        marginTop: 4,
                      }}
                    >
                      {formatMoney(netBalance)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {netBalance > 0
                        ? 'You owe this party (bill − paid + received from party).'
                        : netBalance < 0
                          ? 'Paid more than billed — advance with this party.'
                          : 'Settled up in this period.'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(145px, 1.2fr) minmax(88px, 1fr) minmax(88px, 1fr)',
                      gap: 8,
                      padding: '8px 10px',
                      background: '#F8FAFC',
                      borderRadius: 8,
                      marginBottom: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      borderBottom: '1px solid var(--border)',
                      alignItems: 'end',
                    }}
                  >
                    <div>Date</div>
                    <div style={{ color: '#b91c1c', textAlign: 'center' }}>
                      Paid out
                      <div style={{ fontWeight: 500, opacity: 0.85 }}>(to party)</div>
                    </div>
                    <div style={{ color: '#047857', textAlign: 'center' }}>
                      In
                      <div style={{ fontWeight: 500, opacity: 0.85 }}>(bill / from party)</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        formattedDate = formatDisplayDateTime(when).replace(/ pm/i, ' PM').replace(/ am/i, ' AM');
                      }

                      return (
                        <div
                          key={t.rowKey}
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              'minmax(145px, 1.2fr) minmax(88px, 1fr) minmax(88px, 1fr)',
                            gap: 8,
                            alignItems: 'stretch',
                            padding: '10px 10px',
                            borderBottom: '1px solid #F3F4F6',
                            fontSize: 13,
                          }}
                        >
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
                            <div
                              style={{
                                display: 'inline-block',
                                marginTop: 8,
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: '#FCE7F3',
                                color: '#be185d',
                                border: '1px solid #FBCFE8',
                              }}
                            >
                              Bal. {formatMoney(t.balanceAfter)}
                            </div>
                          </div>
                          <div
                            style={{
                              textAlign: 'center',
                              fontWeight: 800,
                              alignSelf: 'center',
                              fontVariantNumeric: 'tabular-nums',
                              color: diye ? '#b91c1c' : 'var(--text-muted)',
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
                              color: liye ? '#047857' : 'var(--text-muted)',
                            }}
                          >
                            {liye ? formatMoney(liye) : '—'}
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

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete party "${deleteTarget.name}"? This will not remove assigned lots.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirming={deleteLoading}
        />
      )}
    </div>
  );
}
