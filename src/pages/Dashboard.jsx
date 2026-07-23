import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/UI';
import LoaderDashboard from '../components/LoaderDashboard';
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
  formatDisplayDate,
} from '../utils/dateFilters';
import { workspaceDisplayTitleForLot } from '../utils/businessWorkspace';
import {
  adminPaymentPartyLabel,
  adminPaymentTypeLabel,
  isOwnerBillSettlement,
} from '../utils/paymentDisplay';
import { partyFacingLotStatusLabel, lotStatusBadgeKey } from '../utils/partyFacingLabels';

function lotBelongsToPartyUser(lot, partyId, partyName) {
  const pid = String(partyId || '').trim();
  const pname = String(partyName || '').trim();
  if (!pid && !pname) return false;
  if (pid && String(lot.partyId || '').trim() === pid) return true;
  if (pname && String(lot.partyName || '').trim() === pname) return true;
  return false;
}

function paymentBelongsToPartyUser(payment, partyId, partyName) {
  const pid = String(partyId || '').trim();
  const pname = String(partyName || '').trim();
  if (payment.partyId != null && String(payment.partyId).trim() !== '') {
    return String(payment.partyId) === pid;
  }
  return String(payment.party || '').trim() === pname;
}

export default function Dashboard() {
  const {
    reportingLots,
    reportingPayments,
    parties,
    initialDataLoading,
    partyCrossLots,
    partyCrossPayments,
    payments,
    businessOwners,
  } = useApp();
  const { isParty, isAdmin, user } = useAuth();
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customRange = useMemo(
    () => ({ start: customStart, end: customEnd }),
    [customStart, customEnd]
  );
  const partyUserId = String(user?.partyId || '');
  const partyNameTrim = String(user?.partyName || '').trim();

  const lotsPool = useMemo(() => {
    if (!isParty) return reportingLots;
    return partyCrossLots.length ? partyCrossLots : reportingLots;
  }, [isParty, partyCrossLots, reportingLots]);

  const paymentsPool = useMemo(() => {
    if (!isParty) return reportingPayments;
    return partyCrossPayments.length ? partyCrossPayments : payments;
  }, [isParty, partyCrossPayments, reportingPayments, payments]);

  const scopedLots = useMemo(() => {
    const lots =
      isParty && (partyUserId || partyNameTrim)
        ? lotsPool.filter((lot) => lotBelongsToPartyUser(lot, partyUserId, partyNameTrim))
        : lotsPool;
    return lots.filter((lot) =>
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
    );
  }, [lotsPool, isParty, partyUserId, partyNameTrim, dateRange, customRange]);

  const scopedPayments = useMemo(() => {
    const list =
      isParty && (partyUserId || partyNameTrim)
        ? paymentsPool.filter((p) => paymentBelongsToPartyUser(p, partyUserId, partyNameTrim))
        : paymentsPool;
    return list.filter((payment) =>
      isWithinDateRange(payment.updatedAt || payment.date, dateRange, customRange)
    );
  }, [paymentsPool, isParty, partyUserId, partyNameTrim, dateRange, customRange]);

  /** Minimal party dashboard stats (counts + paid total); null for admin views */
  const partyMiniStatsCards = useMemo(() => {
    if (!isParty) return null;
    const by = (s) => scopedLots.filter((l) => l.status === s).length;
    const paidTotal = scopedPayments
      .filter((p) => p.type === 'Paid')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const partyApprovedDone = by('received back') + by('completed');
    const partyNeedsAttention = by('pending approval') + by('rejected');
    const partyInProgressRough =
      by('pending') +
      by('dispatched') +
      scopedLots.filter((l) =>
        String(l.status || '')
          .toLowerCase()
          .trim()
          .includes('in progress')
      ).length;
    return [
      {
        label: 'My lots',
        value: scopedLots.length,
        color: '#1e40af',
        sub: 'In selected period',
      },
      {
        label: 'Active work',
        value: partyInProgressRough,
        color: '#0284c7',
        sub: 'Not received yet + with you + in progress',
      },
      {
        label: 'Needs your action',
        value: partyNeedsAttention,
        color: '#ca8a04',
        sub: 'Submitted for review + needs rework',
      },
      {
        label: 'Finished & delivered',
        value: partyApprovedDone,
        color: '#15803d',
        sub: 'Delivered to business + completed',
      },
      {
        label: 'Paid to you',
        display: `₨${paidTotal.toLocaleString()}`,
        color: '#166534',
        sub: 'Payments from the business',
      },
    ];
  }, [isParty, scopedLots, scopedPayments]);

  const paidToNonOwnerParties = useMemo(() => {
    return scopedPayments
      .filter((p) => p.type === 'Paid' && String(p.party || '').toLowerCase() !== 'owner')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [scopedPayments]);

  const recentPayments = useMemo(
    () =>
      [...scopedPayments]
        .sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'payment'))
        .slice(0, 8),
    [scopedPayments]
  );

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

  if (!isParty && isAdmin && businessOwners.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Dashboard</div>
            <div className="page-subtitle">
              Add a business workspace first — new accounts start with an empty list.
            </div>
          </div>
        </div>
        <div className="stat-card" style={{ maxWidth: 520 }}>
          <div className="stat-label">No workspaces yet</div>
          <p style={{ margin: '12px 0', color: 'var(--text-secondary, #64748b)' }}>
            Open <strong>Work Spaces</strong> and use <strong>+ New workspace</strong> to create
            your Ghausia collection (or any name you use for production).
          </p>
          <Link
            className="btn btn-primary"
            to="/ghausia"
            style={{ display: 'inline-flex', textDecoration: 'none' }}
          >
            Go to Work Spaces
          </Link>
        </div>
      </div>
    );
  }

  // Lots use lowercase status: 'pending', 'dispatched', 'received back', 'completed'
  const byStatus = (s) => scopedLots.filter((l) => l.status === s).length;

  const billable = scopedLots.filter((l) => l.status === 'received back');
  const billableTotal = billable.reduce((s, l) => s + Number(l.billAmount || 0), 0);
  const completedTotal = scopedLots
    .filter((l) => l.status === 'completed')
    .reduce((s, l) => s + Number(l.billAmount || 0), 0);
  const totalLotValue = scopedLots.reduce((s, l) => s + Number(l.billAmount || 0), 0);

  const ownerIn = scopedPayments
    .filter((p) => p.type === 'Received')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  /** Cash movements shown on dashboard: owner receipts vs payouts to parties (excludes "owner" payees). */
  const netOwnerVsParties = ownerIn - paidToNonOwnerParties;

  const recentLots = [...scopedLots]
    .sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'lot'))
    .slice(0, 12);

  const paymentTypeClass = (p) => {
    if (p.type === 'Received') return 'dash-pay-type--in';
    if (isOwnerBillSettlement(p)) return 'dash-pay-type--bill';
    return 'dash-pay-type--out';
  };

  const partyStats = parties
    .map((p) => {
      const lots = scopedLots.filter((l) => String(l.partyId ?? '') === String(p.id ?? ''));
      return {
        name: p.name,
        total: lots.length,
        value: lots.reduce((s, l) => s + Number(l.billAmount || 0), 0),
        completed: lots.filter((l) => l.status === 'completed').length,
        pending: lots.filter((l) => l.status === 'pending').length,
      };
    })
    .filter((p) => p.total > 0);

  const pipelineStatCards = [
    { label: 'Total Lots', value: scopedLots.length, color: '#1e40af', sub: 'All assigned lots' },
    { label: 'Pending', value: byStatus('pending'), color: '#d97706', sub: 'Awaiting dispatch' },
    {
      label: 'Dispatched',
      value: byStatus('dispatched'),
      color: '#0284c7',
      sub: 'Currently with party',
    },
    {
      label: 'Awaiting approval',
      value: byStatus('pending approval'),
      color: '#ca8a04',
      sub: 'Party submitted completion',
    },
    { label: 'Rejected', value: byStatus('rejected'), color: '#b91c1c', sub: 'Needs rework' },
    {
      label: 'Received Back',
      value: byStatus('received back'),
      color: '#0d9488',
      sub: 'Ready to bill owner',
    },
    { label: 'Completed', value: byStatus('completed'), color: '#15803d', sub: 'Fully done' },
  ];

  const activePartyStat = {
    label: 'Active Parties',
    value: partyStats.length,
    color: '#7c3aed',
    sub: 'With assigned lots',
  };

  const formatRupee = (n) => `₨${Number(n || 0).toLocaleString()}`;
  const formatSignedRupee = (n) => {
    const v = Number(n || 0);
    if (v === 0) return '₨0';
    const abs = `₨${Math.abs(v).toLocaleString()}`;
    return v < 0 ? `−${abs}` : abs;
  };

  const finCards = [
    { label: 'Total Lot Value', value: totalLotValue, color: '#1e40af' },
    {
      label: 'Billable to Owner',
      value: billableTotal,
      color: '#0369a1',
      note: `${billable.length} lot${billable.length === 1 ? '' : 's'} — ready to invoice`,
    },
    { label: 'Completed Revenue', value: completedTotal, color: '#15803d' },
    { label: 'Received from Owner', value: ownerIn, color: '#0284c7' },
    { label: 'Paid to Parties', value: paidToNonOwnerParties, color: '#7c3aed' },
    {
      label: 'Net (owner vs parties)',
      value: netOwnerVsParties,
      color: netOwnerVsParties >= 0 ? '#15803d' : '#dc2626',
      note:
        netOwnerVsParties >= 0
          ? 'Received more than paid to parties'
          : 'Paid parties more than received from owner',
      signed: true,
      highlight: true,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{isParty ? 'Home' : 'Dashboard'}</div>
          <div className="page-subtitle">
            {isParty
              ? `Welcome back${partyNameTrim ? `, ${partyNameTrim}` : ''}. Summary of your lots.`
              : 'Overview of all production and financial activity'}
          </div>
        </div>
        <DateRangeSelect
          value={dateRange}
          onChange={setDateRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={({ start, end }) => {
            setCustomStart(start);
            setCustomEnd(end);
          }}
        />
      </div>

      {partyMiniStatsCards?.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14,
            marginBottom: 28,
          }}
        >
          {partyMiniStatsCards.map((c) => (
            <div key={c.label} className="stat-card">
              <div className="stat-label">{c.label}</div>
              <div className="stat-value" style={{ color: c.color }}>
                {'display' in c ? c.display : c.value}
              </div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      ) : null}

      {!isParty && (
        <>
          <section style={{ marginBottom: 28 }}>
            <div className="section-title">Production pipeline</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
                gap: 12,
                padding: 16,
                background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '1px solid var(--border)',
                borderRadius: 14,
              }}
            >
              {pipelineStatCards.map((c) => (
                <div
                  key={c.label}
                  className="stat-card"
                  style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
                >
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-value" style={{ color: c.color, fontSize: 24 }}>
                    {c.value}
                  </div>
                  <div className="stat-sub">{c.sub}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <div className="section-title">Parties & finances</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
                gap: 12,
              }}
            >
              <div className="stat-card" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
                <div className="stat-label">{activePartyStat.label}</div>
                <div className="stat-value" style={{ color: activePartyStat.color, fontSize: 24 }}>
                  {activePartyStat.value}
                </div>
                <div className="stat-sub">{activePartyStat.sub}</div>
              </div>
              {finCards.map((c) => (
                <div
                  key={c.label}
                  className="stat-card"
                  style={{
                    boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    ...(c.highlight
                      ? {
                          borderColor: netOwnerVsParties >= 0 ? '#86efac' : '#fecaca',
                          background:
                            netOwnerVsParties >= 0
                              ? 'linear-gradient(145deg, #fff 0%, #f0fdf4 100%)'
                              : 'linear-gradient(145deg, #fff 0%, #fef2f2 100%)',
                        }
                      : {}),
                  }}
                >
                  <div className="stat-label">{c.label}</div>
                  <div className="stat-value" style={{ color: c.color, fontSize: 24 }}>
                    {c.signed ? formatSignedRupee(c.value) : formatRupee(c.value)}
                  </div>
                  {c.note && <div className="stat-sub">{c.note}</div>}
                </div>
              ))}
            </div>
          </section>

          <div className="dash-admin-split">
            {/* Status Breakdown */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Lot Status Breakdown</span>
              </div>
              <div className="card-body">
                {[
                  { label: 'Pending', count: byStatus('pending'), color: '#d97706' },
                  { label: 'Dispatched', count: byStatus('dispatched'), color: '#0284c7' },
                  { label: 'Received Back', count: byStatus('received back'), color: '#0d9488' },
                  { label: 'Completed', count: byStatus('completed'), color: '#15803d' },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}
                  >
                    <div
                      style={{
                        width: 110,
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        flexShrink: 0,
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: '#F3F4F6',
                        borderRadius: 6,
                        height: 14,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${scopedLots.length ? (s.count / scopedLots.length) * 100 : 0}%`,
                          background: s.color,
                          height: '100%',
                          borderRadius: 6,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: 28,
                        fontSize: 13,
                        fontWeight: 700,
                        color: s.color,
                        textAlign: 'right',
                      }}
                    >
                      {s.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Billable Lots */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Billable to Owner</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>
                  ₨{billableTotal.toLocaleString()}
                </span>
              </div>
              <div className="card-body" style={{ padding: billable.length ? 0 : 22 }}>
                {billable.length === 0 ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      padding: '24px 0',
                    }}
                  >
                    No lots received back yet
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Lot / Design</th>
                        <th>Party</th>
                        <th>Business</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...billable]
                        .sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'lot'))
                        .map((l) => (
                          <tr key={l.id}>
                            <td>
                              <span style={{ fontWeight: 600 }}>{l.lotNo || l.lotNumber}</span> /{' '}
                              {l.designNo}
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>{l.partyName}</td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                              {workspaceDisplayTitleForLot(l, businessOwners)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#0369a1' }}>
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
        </>
      )}

      <div style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Lots</span>
          </div>
          <div className="card-body dash-recent" style={{ padding: 0 }}>
            {recentLots.length === 0 ? (
              <p className="dash-recent-empty">No lots in this period</p>
            ) : (
              <>
                {/* Mobile: stacked list */}
                <ul className="dash-recent-list dash-recent-mobile">
                  {recentLots.map((l) => {
                    const lotNo = l.lotNo || l.lotNumber || '—';
                    const design = l.designNo || '—';
                    const business = workspaceDisplayTitleForLot(l, businessOwners, {
                      shortIdFallback: isParty,
                    });
                    return (
                      <li key={l.id} className="dash-recent-item">
                        <div className="dash-recent-item-main">
                          <div className="dash-recent-item-title">
                            <span className="dash-recent-lot">{lotNo}</span>
                            <span className="dash-recent-sep">·</span>
                            <span className="dash-recent-design">{design}</span>
                          </div>
                          <div className="dash-recent-item-meta">
                            {!isParty && l.partyName ? (
                              <span className="dash-recent-party">{l.partyName}</span>
                            ) : null}
                            {business ? <span className="dash-recent-biz">{business}</span> : null}
                          </div>
                        </div>
                        <div className="dash-recent-item-status">
                          <StatusBadge
                            status={lotStatusBadgeKey(l.status)}
                            label={isParty ? partyFacingLotStatusLabel(l.status) : undefined}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Desktop: table */}
                <div className="dash-recent-desktop table-scroll">
                  <table className="dash-recent-table">
                    <thead>
                      <tr>
                        <th>Lot</th>
                        <th>Design</th>
                        {!isParty && <th>Party</th>}
                        <th>Business</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLots.map((l) => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600 }}>{l.lotNo || l.lotNumber}</td>
                          <td>{l.designNo}</td>
                          {!isParty && (
                            <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                              {l.partyName}
                            </td>
                          )}
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                            {workspaceDisplayTitleForLot(l, businessOwners, {
                              shortIdFallback: isParty,
                            })}
                          </td>
                          <td>
                            <StatusBadge
                              status={lotStatusBadgeKey(l.status)}
                              label={isParty ? partyFacingLotStatusLabel(l.status) : undefined}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!isParty && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Payments</span>
          </div>
          <div className="card-body dash-recent" style={{ padding: 0 }}>
            {scopedPayments.length === 0 ? (
              <p className="dash-recent-empty">No payments recorded</p>
            ) : (
              <>
                <ul className="dash-recent-list dash-recent-mobile">
                  {recentPayments.map((p) => (
                    <li key={p.id} className="dash-recent-item">
                      <div className="dash-recent-item-main">
                        <div className="dash-recent-item-title dash-recent-pay-title">
                          <span className="dash-recent-date">{formatDisplayDate(p.date)}</span>
                          <span className={`dash-pay-type ${paymentTypeClass(p)}`}>
                            {adminPaymentTypeLabel(p)}
                          </span>
                        </div>
                        <div className="dash-recent-item-meta">
                          <span className="dash-recent-party">
                            {adminPaymentPartyLabel(p, businessOwners)}
                          </span>
                          {p.note ? <span className="dash-recent-note">{p.note}</span> : null}
                        </div>
                      </div>
                      <div
                        className={`dash-recent-amount ${
                          p.type === 'Received'
                            ? 'dash-recent-amount--in'
                            : 'dash-recent-amount--out'
                        }`}
                      >
                        ₨{Number(p.amount || 0).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="dash-recent-desktop table-scroll">
                  <table className="dash-recent-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Party / From</th>
                        <th>Note</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDisplayDate(p.date)}</td>
                          <td>
                            <span className={`dash-pay-type ${paymentTypeClass(p)}`}>
                              {adminPaymentTypeLabel(p)}
                            </span>
                          </td>
                          <td>{adminPaymentPartyLabel(p, businessOwners)}</td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                            {p.note || '—'}
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: p.type === 'Received' ? '#15803d' : '#dc2626',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            ₨{Number(p.amount || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
