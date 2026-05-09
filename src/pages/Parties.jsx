import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Modal, FormGroup, SearchBar, EmptyState, ConfirmDialog } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import { DateRangeSelect, isWithinDateRange, latestDateFrom } from '../utils/dateFilters';

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
    <>
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
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" disabled={saving} onClick={async () => { if (validate()) await onSave(form); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <><Loader /> Saving…</> : 'Save Party'}
        </button>
      </div>
    </>
  );
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
  );
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
  const [transactionParty, setTransactionParty] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const rangedLots = useMemo(
    () => reportingLots.filter((lot) => isWithinDateRange(
      latestDateFrom(lot, ['updatedAt', 'createdAt', 'receivedBackDate', 'dispatchDate', 'allotDate', 'receivedDate']),
      dateRange,
    )),
    [reportingLots, dateRange],
  );

  const rangedPayments = useMemo(
    () => reportingPayments.filter((payment) => isWithinDateRange(payment.updatedAt || payment.date, dateRange)),
    [reportingPayments, dateRange],
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

  /** Align with Party Ledger: "received back" counts as completed for party stats. */
  const lotStatusKey = (l) => {
    const pe = reportingPartyEdits[l.id] || {};
    const raw = String(pe.overrideStatus || l.status || '').toLowerCase();
    if (raw === 'received back') return 'completed';
    return raw;
  };

  const lotBillAmount = (l) => {
    const pe = reportingPartyEdits[l.id] || {};
    return Number(pe.partyBillAmount !== undefined ? pe.partyBillAmount : (l.billAmount || 0));
  };

  const getLotStats = (partyId) => {
    const pid = String(partyId ?? '');
    const lots = rangedLots.filter(l => String(l.partyId ?? '') === pid);
    const partyName = getPartyName(partyId);
    let activeAmount = 0;
    let completedAmount = 0;
    for (const l of lots) {
      const amt = lotBillAmount(l);
      if (lotStatusKey(l) === 'completed') completedAmount += amt;
      else activeAmount += amt;
    }
    const totalPayable = lots.reduce((s, l) => s + lotBillAmount(l), 0);
    const totalPaid = rangedPayments.filter(p => {
      if (p.type !== 'Paid') return false;
      if (p.partyId != null && String(p.partyId).trim() !== '') {
        return String(p.partyId) === pid;
      }
      const payParty = String(p.party || '').trim();
      return payParty === String(partyName).trim();
    }).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remaining = totalPayable - totalPaid;
    return {
      total: lots.length,
      active: lots.filter(l => lotStatusKey(l) !== 'completed').length,
      completed: lots.filter(l => lotStatusKey(l) === 'completed').length,
      activeAmount,
      completedAmount,
      totalValue: totalPayable,
      paid: totalPaid,
      remaining,
    };
  };

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

  const formatMoney = (n) => `₨${Number(n).toLocaleString()}`;

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
      <div className="toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search party name, phone, address..." />
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
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
                    <div style={{ background:`${stats.remaining >= 0 ? '#FEF2F2': 'rgb(189, 248, 212)' }`, border: '1px solidrgb(202, 254, 223)', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
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
        <Modal title={`Transaction History — ${transactionParty.name}`} onClose={() => setTransactionParty(null)}>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {(() => {
              const partyPayments = rangedPayments.filter(p => String(p.party || '').trim() === String(transactionParty.name || '').trim());
              const partyLots = rangedLots.filter(l => String(l.partyId ?? '') === String(transactionParty.id ?? transactionParty._id ?? ''));
              const transactions = [
                ...partyPayments.map(p => ({ ...p, rowKind: 'payment' })),
                ...partyLots.map(l => {
                  const pe = reportingPartyEdits[l.id] || {};
                  return {
                    id: l.id,
                    date: l.allotDate,
                    rowKind: 'lot',
                    lotNo: l.lotNo,
                    designNo: l.designNo,
                    amount: pe.partyBillAmount !== undefined ? pe.partyBillAmount : l.billAmount,
                    status: pe.overrideStatus || l.status,
                  };
                }),
              ].sort((a, b) => new Date(b.date) - new Date(a.date));

              if (transactions.length === 0) {
                return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No transactions found</div>;
              }

              return (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Details</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={`${t.rowKind}-${t.id}`} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>{t.date}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            background: t.rowKind === 'payment' ? '#F0FDF4' : '#EFF6FF',
                            color: t.rowKind === 'payment' ? '#166534' : '#1e40af',
                            border: `1px solid ${t.rowKind === 'payment' ? '#BBF7D0' : '#BFDBFE'}`,
                            borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                          }}>
                            {t.rowKind === 'payment' ? 'Payment' : 'Lot'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>
                          {t.rowKind === 'payment' ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>{t.note || 'Payment'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.type || 'Paid'} • {t.linkedLot || 'No lot'}</div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontWeight: 500 }}>{t.lotNo} / {t.designNo}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status: {t.status}</div>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.rowKind === 'payment' ? '#dc2626' : '#1e40af' }}>
                          {t.rowKind === 'payment' ? '-' : ''}₨{Number(t.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
