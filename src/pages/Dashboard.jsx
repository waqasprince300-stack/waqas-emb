import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/UI';
import LoaderDashboard from '../components/LoaderDashboard';
import { DateRangeSelect, isWithinDateRange, latestDateFrom } from '../utils/dateFilters';

const toTitleCase = (s) =>
  String(s || '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export default function Dashboard() {
  const { ghausiaLots, partyEdits, payments, getPartyName, parties, initialDataLoading } = useApp();
  const { isParty, user } = useAuth();
  const [dateRange, setDateRange] = useState('all');
  const partyUserId = String(user?.partyId || '');

  const scopedLots = useMemo(() => {
    const lots = isParty && partyUserId
      ? ghausiaLots.filter((lot) => String(lot.partyId || '') === partyUserId)
      : ghausiaLots;
    return lots.filter((lot) => isWithinDateRange(
      latestDateFrom(lot, ['updatedAt', 'createdAt', 'receivedBackDate', 'dispatchDate', 'allotDate', 'receivedDate']),
      dateRange,
    ));
  }, [ghausiaLots, isParty, partyUserId, dateRange]);

  const scopedPayments = useMemo(() => {
    const partyName = String(user?.partyName || '').trim();
    const list = isParty && partyName
      ? payments.filter((payment) => String(payment.party || '').trim() === partyName)
      : payments;
    return list.filter((payment) => isWithinDateRange(payment.updatedAt || payment.date, dateRange));
  }, [payments, isParty, user?.partyName, dateRange]);

  const paidToNonOwnerParties = useMemo(() => {
    return scopedPayments
      .filter(
        (p) =>
          p.type === 'Paid' && String(p.party || '').toLowerCase() !== 'owner',
      )
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [scopedPayments]);

  if (initialDataLoading) {
    return (
      <div style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <LoaderDashboard height={30} width={30}/>
      </div>
    );
  }

  // Lots use lowercase status: 'pending', 'dispatched', 'received back', 'completed'
  const byStatus = (s) => scopedLots.filter(l => l.status === s).length;

  const billable = scopedLots.filter(l => l.status === 'received back');
  const billableTotal = billable.reduce((s, l) => s + Number(l.billAmount || 0), 0);
  const completedTotal = scopedLots.filter(l => l.status === 'completed').reduce((s, l) => s + Number(l.billAmount || 0), 0);
  const totalLotValue = scopedLots.reduce((s, l) => s + Number(l.billAmount || 0), 0);

  const ownerIn = scopedPayments.filter(p => p.type === 'Received').reduce((s, p) => s + Number(p.amount || 0), 0);
  const partyOut = scopedPayments.filter(p => p.type === 'Paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = ownerIn - partyOut;

  /** Sort lots by recency (newest first) using modification date, then created date, then ID */
  function lotRecencyTimestamp(l) {
    const keys = [l.updatedAt, l.createdAt, l.receivedBackDate, l.dispatchDate, l.allotDate];
    let max = 0;
    for (const v of keys) {
      const t = v ? new Date(v).getTime() : NaN;
      if (!Number.isNaN(t) && t > max) max = t;
    }
    if (max === 0) {
      const id = String(l.id || '');
      if (id.length === 24 && /^[a-f0-9]{24}$/i.test(id)) {
        max = parseInt(id.slice(0, 8), 16) * 1000;
      }
    }
    return max;
  }

  function compareLotsNewestFirst(a, b) {
    const d = lotRecencyTimestamp(b) - lotRecencyTimestamp(a);
    if (d !== 0) return d;
    return String(b.id || '').localeCompare(String(a.id || ''));
  }

  const recentLots = [...scopedLots].sort(compareLotsNewestFirst).slice(0, 12);

  const partyStats = parties.map(p => {
    const lots = scopedLots.filter(l => String(l.partyId ?? '') === String(p.id ?? ''));
    return {
      name: p.name,
      total: lots.length,
      value: lots.reduce((s, l) => s + Number(l.billAmount || 0), 0),
      completed: lots.filter(l => l.status === 'completed').length,
      pending: lots.filter(l => l.status === 'pending').length,
    };
  }).filter(p => p.total > 0);

  const maxVal = Math.max(...partyStats.map(p => p.value), 1);

  const statCards = [
    { label: 'Total Lots',     value: scopedLots.length,       color: '#1e40af', sub: 'All assigned lots' },
    { label: 'Pending',        value: byStatus('pending'),       color: '#d97706', sub: 'Awaiting dispatch' },
    { label: 'Dispatched',     value: byStatus('dispatched'),    color: '#0284c7', sub: 'Currently with party' },
    { label: 'Received Back',  value: byStatus('received back'), color: '#dc2626', sub: 'Ready to bill owner' },
    { label: 'Completed',      value: byStatus('completed'),     color: '#15803d', sub: 'Fully done' },
    { label: 'Active Parties', value: partyStats.length,         color: '#7c3aed', sub: 'With assigned lots' },
  ];

  const profit = completedTotal - paidToNonOwnerParties;

  const finCards = [
    { label: 'Total Lot Value',       value: totalLotValue, color: '#1e40af' },
    { label: 'Billable to Owner',     value: billableTotal, color: '#dc2626', note: `${billable.length} lots` },
    { label: 'Completed Revenue',     value: completedTotal, color: '#15803d' },
    { label: 'Received from Owner',   value: ownerIn,       color: '#0284c7' },
    { label: 'Paid to Parties',       value: paidToNonOwnerParties,      color: '#7c3aed' },
    { label: 'Profit',                value: profit,        color: profit >= 0 ? '#15803d' : '#dc2626', note: profit >= 0 ? 'Gain' : 'Loss' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Overview of all production and financial activity</div>
        </div>
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
      </div>

      {/* Lot Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {statCards.map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div className="stat-value" style={{ color: c.color }}>{c.value}</div>
            <div className="stat-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Financial Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        {finCards.map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
            <div className="stat-label">{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color, marginBottom: 2 }}>
              ₨{Math.abs(c.value).toLocaleString()}
            </div>
            {c.note && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.note}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
        {/* Status Breakdown */}
        <div className="card">
          <div className="card-header"><span className="card-title">Lot Status Breakdown</span></div>
          <div className="card-body">
            {[
              { label: 'Pending',       count: byStatus('pending'),       color: '#d97706' },
              { label: 'Dispatched',    count: byStatus('dispatched'),    color: '#0284c7' },
              { label: 'Received Back', count: byStatus('received back'), color: '#dc2626' },
              { label: 'Completed',     count: byStatus('completed'),     color: '#15803d' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 110, fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>{s.label}</div>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                  <div style={{
                    width: `${scopedLots.length ? (s.count / scopedLots.length) * 100 : 0}%`,
                    background: s.color, height: '100%', borderRadius: 6,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ width: 28, fontSize: 13, fontWeight: 700, color: s.color, textAlign: 'right' }}>{s.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Billable Lots */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Billable to Owner</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>₨{billableTotal.toLocaleString()}</span>
          </div>
          <div className="card-body" style={{ padding: billable.length ? 0 : 22 }}>
            {billable.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                No lots received back yet
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Lot / Design</th>
                    <th>Party</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {billable.map(l => (
                    <tr key={l.id}>
                      <td><span style={{ fontWeight: 600 }}>{l.lotNo || l.lotNumber}</span> / {l.designNo}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{l.partyName}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                        ₨{Number(l.billAmount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18, marginBottom: 24 }}>
        {/* Party Performance */}
        {/* <div className="card">
          <div className="card-header"><span className="card-title">Party Performance</span></div>
          <div className="card-body">
            {partyStats.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data yet</p>
            ) : partyStats.map(p => (
              <div key={p.name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{p.total} lots · ₨{p.value.toLocaleString()}</span>
                </div>
                <div style={{ background: '#F3F4F6', borderRadius: 5, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(p.value / maxVal) * 100}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #1e40af)',
                    height: '100%', borderRadius: 5,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div> */}

        {/* Recent Lots */}
        <div className="card">
          <div className="card-header"><span className="card-title">Recent Lots</span></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Design</th>
                  <th>Party</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLots.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.lotNo || l.lotNumber}</td>
                    <td>{l.designNo}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{l.partyName}</td>
                    <td><StatusBadge status={toTitleCase(l.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="card">
        <div className="card-header"><span className="card-title">Recent Payments</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          {scopedPayments.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No payments recorded</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Party / From</th>
                  <th>Linked Lot</th>
                  <th>Note</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...scopedPayments].sort((a, b) => {
                  const da = new Date(a.date || 0).getTime();
                  const db = new Date(b.date || 0).getTime();
                  if (db !== da) return db - da;
                  return String(b.id || '').localeCompare(String(a.id || ''));
                }).slice(0, 8).map(p => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td>
                      <span style={{
                        background: p.type === 'Received' ? '#F0FDF4' : '#FEF2F2',
                        color: p.type === 'Received' ? '#166534' : '#991B1B',
                        border: `1px solid ${p.type === 'Received' ? '#BBF7D0' : '#FECACA'}`,
                        borderRadius: 20, padding: '2px 10px', fontSize: 11.5, fontWeight: 600,
                      }}>{p.type}</span>
                    </td>
                    <td>{p.party}</td>
                    <td>{p.linkedLot || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.note || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.type === 'Received' ? '#15803d' : '#dc2626' }}>
                      ₨{Number(p.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
