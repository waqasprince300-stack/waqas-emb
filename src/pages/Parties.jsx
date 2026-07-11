import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, FormGroup, SearchBar, EmptyState, ConfirmDialog } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import { DateRangeSelect, isWithinDateRange, latestDateFrom, dateRangeLabel } from '../utils/dateFilters';

function toPartyFormFields(initial) {
  if (!initial) return { name: '', phone: '', address: '' };
  return {
    name: initial.name ?? '',
    phone: initial.phone ?? '',
    address: initial.address ?? '',
  };
}

function PartyForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(() => toPartyFormFields(initial));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(toPartyFormFields(initial));
  }, [initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
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
      <FormGroup label="Party Name *">
        <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Al-Hamra Textiles" />
        {errors.name && <span style={{ color: '#dc2626', fontSize: 11 }}>{errors.name}</span>}
      </FormGroup>
      <FormGroup label="Phone Number">
        <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="e.g. 0300-1234567" />
      </FormGroup>
      <FormGroup label="Address">
        <textarea className="form-textarea" rows={3} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address..." style={{ resize: 'vertical' }} />
      </FormGroup>
      <div className="modal-footer" style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <><Loader /> Saving…</> : 'Save Party'}
        </button>
      </div>
    </form>
  );
}

function formatMoney(n) {
  return `₨${Number(n).toLocaleString()}`;
}

function dayOrdinal(day) {
  const v = day % 100;
  if (v >= 11 && v <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatTxnDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!d || Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dayOrdinal(d.getDate())} ${months[d.getMonth()]}, ${t}`;
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

function PartyStatTile({ label, count, amountStr, accent, borderTint, bgTint }) {
  return (
    <div
      style={{
        background: bgTint,
        border: `1px solid ${borderTint}`,
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 86,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{count}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent, opacity: 0.9 }}>{amountStr}</div>
    </div>
  )
}

export default function Parties() {
  const { parties, addParty, updateParty, deleteParty, reportingLots, reportingPayments, reportingPartyEdits, getPartyName, initialDataLoading } = useApp();
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
    [customStart, customEnd],
  );
  const [transactionParty, setTransactionParty] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const rangedLots = useMemo(
    () => reportingLots.filter((lot) => isWithinDateRange(
      latestDateFrom(lot, ['updatedAt', 'createdAt', 'receivedBackDate', 'dispatchDate', 'allotDate', 'receivedDate']),
      dateRange,
      customRange,
    )),
    [reportingLots, dateRange, customRange],
  );

  const rangedPayments = useMemo(
    () => reportingPayments.filter((payment) => isWithinDateRange(payment.updatedAt || payment.date, dateRange, customRange)),
    [reportingPayments, dateRange, customRange],
  );

  const filtered = parties.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q);
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
  const lotStatusKey = (l) => {
    const ls = String(l.status || '').toLowerCase().trim();
    if (ls === 'pending approval') return 'pending_approval';
    if (ls === 'rejected') return 'rejected';
    const pe = reportingPartyEdits[l.id] || {};
    const raw = String(pe.overrideStatus || l.status || '').toLowerCase();
    if (raw === 'received back') return 'completed';
    return raw.replace(/\s+/g, '_').replace('/', '_');
  };

  const lotBillAmount = (l) => {
    const pe = reportingPartyEdits[l.id] || {};
    return Number(pe.partyBillAmount !== undefined ? pe.partyBillAmount : (l.billAmount || 0));
  };

  const EMPTY_LOT_STATS = {
    total: 0, active: 0, completed: 0, activeAmount: 0,
    completedAmount: 0, totalValue: 0, paid: 0, remaining: 0,
  };

  /** Pre-compute stats for every party in one pass instead of scanning all lots per card. */
  const statsByPartyId = useMemo(() => {
    const lotsByParty = new Map();
    for (const l of rangedLots) {
      const pid = String(l.partyId ?? '');
      if (!lotsByParty.has(pid)) lotsByParty.set(pid, []);
      lotsByParty.get(pid).push(l);
    }

    const paidByPartyId = new Map();
    const paidByPartyName = new Map();
    for (const p of rangedPayments) {
      if (p.type !== 'Paid') continue;
      const amt = Number(p.amount || 0);
      if (p.partyId != null && String(p.partyId).trim() !== '') {
        const k = String(p.partyId);
        paidByPartyId.set(k, (paidByPartyId.get(k) || 0) + amt);
      } else {
        const k = String(p.party || '').trim();
        paidByPartyName.set(k, (paidByPartyName.get(k) || 0) + amt);
      }
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
      result.set(pid, {
        total: lots.length,
        active,
        completed,
        activeAmount,
        completedAmount,
        totalValue: totalPayable,
        paid: totalPaid,
        remaining: totalPayable - totalPaid,
      });
    }
    return result;
  }, [parties, rangedLots, rangedPayments, reportingPartyEdits]);

  const getLotStats = (partyId) => statsByPartyId.get(String(partyId ?? '')) || EMPTY_LOT_STATS;

  const handleSave = async (formData) => {
    setPartySaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        phone: (formData.phone || '').trim(),
        address: (formData.address || '').trim(),
      };
      if (editing) {
        const pid = editing.id ?? editing._id;
        await updateParty(String(pid), payload);
      } else {
        await addParty(payload);
      }
      setModal(null); setEditing(null);
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
      <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <LoaderDashboard  height={30} width={30}/>
      </div>
    );
  }

  const initials = (name) => name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const avatarColors = [
    ['#EFF6FF', '#1e40af'], ['#F0FDF4', '#15803d'], ['#FFF7ED', '#c2410c'],
    ['#F5F3FF', '#6d28d9'], ['#FEF2F2', '#991B1B'], ['#F0F9FF', '#075985'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Parties</div>
          <div className="page-subtitle">Manage all production parties and their contact details</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setModal('form'); }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Party
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 }}>
        {[
          { label: 'Total Parties', value: parties.length, color: '#1e40af' },
          {
            label: 'Active Parties',
            value: parties.filter(p =>
              rangedLots.some(l =>
                String(l.partyId ?? '') === String(p.id ?? '') && lotStatusKey(l) !== 'completed'
              )
            ).length,
            color: '#d97706',
          },
          { label: 'Total Lots Assigned', value: rangedLots.filter(l => String(l.partyId || '').trim()).length, color: '#7c3aed' },
          // { label: 'Total Bill Value', value: `₨${ghausiaLots.reduce((s, l) => s + Number(l.billAmount || 0), 0).toLocaleString()}`, color: '#0284c7' },
        ].map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="toolbar pl-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search party name, phone, address..." />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {paginatedParties.map((party, idx) => {
            const stats = getLotStats(party.id);
            const [bg, text] = avatarColors[(pageStart + idx) % avatarColors.length];
            return (
              <div key={party.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '18px 18px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%', background: bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700, color: text, flexShrink: 0,
                      border: `2px solid ${text}30`,
                    }}>
                      {initials(party.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', lineHeight: 1.25 }}>{party.name}</div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: '#1e40af', background: '#EFF6FF',
                          border: '1px solid #BFDBFE', borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
                        }}>
                          {stats.total} lot{stats.total === 1 ? '' : 's'}
                        </span>
                      </div>
                      {party.phone && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                          </svg>
                          {party.phone}
                        </div>
                      )}
                      {party.address && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          <span style={{ lineHeight: 1.4 }}>{party.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats: 2×2 layout */}
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <PartyStatTile
                      label="Active"
                      count={stats.active}
                      amountStr={stats.active > 0 ? formatMoney(stats.activeAmount) : '—'}
                      accent="#c2410c"
                      borderTint="#FDBA74"
                      bgTint="#FFFBEB"
                    />
                    <PartyStatTile
                      label="Completed"
                      count={stats.completed}
                      amountStr={stats.completed > 0 ? formatMoney(stats.completedAmount) : '—'}
                      accent="#166534"
                      borderTint="#86EFAC"
                      bgTint="#F0FDF4"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total bill</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#6d28d9', marginTop: 6, lineHeight: 1.2, wordBreak: 'break-word' }}>{stats.total > 0 ? formatMoney(stats.totalValue) : '—'}</div>
                    </div>
                    <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#047857', marginTop: 6, lineHeight: 1.2, wordBreak: 'break-word' }}>{formatMoney(stats.paid)}</div>
                    </div>
                    <div style={{ background: stats.remaining >= 0 ? '#FEF2F2' : '#d1fae5', border: stats.remaining >= 0 ? '1px solid #FECACA' : '1px solid #A7F3D0', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stats.remaining >= 0 ? 'Remaining' : 'Advance'}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: stats.remaining >= 0 ? '#b91c1c' : '#047857', marginTop: 6, lineHeight: 1.2, wordBreak: 'break-word' }}>{formatMoney(stats.remaining)}</div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, padding: '12px 14px 14px', marginTop: 'auto', borderTop: '1px solid #F3F4F6' }}>
                  <button
                    onClick={() => setTransactionParty(party)}
                    style={{ flex: 1, padding: '7px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', background: '#F0F9FF', color: '#0369a1', border: '1px solid #BAE6FD', fontFamily: 'Inter, sans-serif' }}
                  >
                    Transactions
                  </button>
                  <button
                    onClick={() => { setEditing(party); setModal('form'); }}
                    style={{ flex: 1, padding: '7px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', background: '#EFF6FF', color: '#1e40af', border: '1px solid #BFDBFE', fontFamily: 'Inter, sans-serif' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(party)}
                    style={{ flex: 1, padding: '7px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', background: '#FEF2F2', color: '#dc2626', border: '1px solid #FECACA', fontFamily: 'Inter, sans-serif' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}>
              Prev
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}>
              Next
            </button>
          </div>
        </div>
      )}

      {modal === 'form' && (
        <Modal title={editing ? 'Edit Party' : 'Add New Party'} onClose={() => { if (!partySaving) { setModal(null); setEditing(null); } }}>
          <PartyForm initial={editing} onSave={handleSave} onClose={() => { if (!partySaving) { setModal(null); setEditing(null); } }} saving={partySaving} />
        </Modal>
      )}

      {transactionParty && (
        <Modal wide title={`${transactionParty.name} — Ledger`} onClose={() => setTransactionParty(null)}>
          <div style={{ maxHeight: 'min(70vh, 560px)', overflowY: 'auto' }}>
            {(() => {
              const pid = String(transactionParty.id ?? transactionParty._id ?? '');
              const partyPayments = rangedPayments.filter((p) => paymentMatchesParty(p, transactionParty, getPartyName));
              const partyLots = rangedLots.filter(l => String(l.partyId ?? '') === pid);

              const raw = [];

              partyPayments.forEach((p) => {
                const when = latestDateFrom(p, ['updatedAt', 'date']);
                const sortMs = when ? when.getTime() : 0;
                raw.push({
                  rowKey: `paid-${p.id || p._id}`,
                  kind: 'paid',
                  id: p.id || p._id,
                  sortMs,
                  whenDate: when,
                  note: (p.note || '').trim(),
                  linkedLot: (p.linkedLot || '').trim(),
                  paymentType: p.type || 'Paid',
                  diye: Number(p.amount || 0),
                  liye: 0,
                });
              });

              partyLots.forEach((l) => {
                const pe = reportingPartyEdits[l.id] || {};
                const bill = Number(pe.partyBillAmount !== undefined ? pe.partyBillAmount : (l.billAmount || 0));
                const when = latestDateFrom(l, ['updatedAt', 'createdAt', 'receivedBackDate', 'dispatchDate', 'allotDate', 'receivedDate']);
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
                  liye: bill,
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
              const netBalance = withBalance.length ? withBalance[withBalance.length - 1].balanceAfter : 0;

              if (!displayRows.length) {
                return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No transactions in this period</div>;
              }

              return (
                <div style={{ padding: '0 0 8px' }}>
                  <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #FECACA',
                    borderRadius: 12,
                    padding: '14px 16px',
                    marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Net balance</div>
                    <div style={{
                      fontSize: 26,
                      fontWeight: 800,
                      color: netBalance >= 0 ? '#b91c1c' : '#047857',
                      marginTop: 4,
                    }}>
                      {formatMoney(netBalance)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {netBalance > 0
                        ? 'You owe this party (work billed − paid out).'
                        : netBalance < 0
                          ? 'Paid more than billed — advance with this party.'
                          : 'Settled up in this period.'}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 1fr) minmax(88px, 0.95fr) minmax(88px, 0.95fr)',
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
                  }}>
                    <div>Date</div>
                    <div style={{ color: '#b91c1c', textAlign: 'center' }}>
                      Paid out
                      <div style={{ fontWeight: 500, opacity: 0.85 }}>(Paid out)</div>
                    </div>
                    <div style={{ color: '#047857', textAlign: 'center' }}>
                      Received in
                      <div style={{ fontWeight: 500, opacity: 0.85 }}>(Work billed)</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {displayRows.map((t) => {
                      const when = t.whenDate && !Number.isNaN(new Date(t.whenDate).getTime())
                        ? new Date(t.whenDate)
                        : null;
                      const subtitle = t.kind === 'paid'
                        ? [t.note || 'Payment', t.linkedLot ? `Lot: ${t.linkedLot}` : ''].filter(Boolean).join(' · ') || `${t.paymentType}`
                        : `Lot ${t.lotNo || '—'} / ${t.designNo || '—'} · ${t.status || ''}`;
                      const diye = t.diye > 0 ? t.diye : null;
                      const liye = t.liye > 0 ? t.liye : null;

                      return (
                        <div
                          key={t.rowKey}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(120px, 1fr) minmax(88px, 0.95fr) minmax(88px, 0.95fr)',
                            gap: 8,
                            alignItems: 'stretch',
                            padding: '10px 10px',
                            borderBottom: '1px solid #F3F4F6',
                            fontSize: 13,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{when ? formatTxnDateTime(when) : '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35 }}>{subtitle}</div>
                            <div style={{
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
                          <div style={{ textAlign: 'center', fontWeight: 800, alignSelf: 'center', fontVariantNumeric: 'tabular-nums', color: diye ? '#b91c1c' : 'var(--text-muted)' }}>
                            {diye ? formatMoney(diye) : '—'}
                          </div>
                          <div style={{ textAlign: 'center', fontWeight: 800, alignSelf: 'center', fontVariantNumeric: 'tabular-nums', color: liye ? '#047857' : 'var(--text-muted)' }}>
                            {liye ? formatMoney(liye) : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Newest entries first; running balance is after each transaction in date order ({dateRangeLabel(dateRange, customRange)} filter applies).
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
