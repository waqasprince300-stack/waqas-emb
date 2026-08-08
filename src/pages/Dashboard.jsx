import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

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
import { getAdminLedgerOrBusinessBill } from '../utils/partyBillPrivacy';

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
    reportingPartyEdits,
  } = useApp();
  const { isParty, isAdmin, user } = useAuth();
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [hideAmounts, setHideAmounts] = useState(false);
  const [alertDaysThreshold, setAlertDaysThreshold] = useState(7);
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
        color: 'var(--primary, #1e40af)',
        sub: 'In selected period',
      },
      {
        label: 'Active work',
        value: partyInProgressRough,
        color: 'var(--primary-light, #0284c7)',
        sub: 'Not received yet + with you + in progress',
      },
      {
        label: 'Needs your action',
        value: partyNeedsAttention,
        color: 'var(--warning, #ca8a04)',
        sub: 'Submitted for review + needs rework',
      },
      {
        label: 'Finished & delivered',
        value: partyApprovedDone,
        color: 'var(--success, #15803d)',
        sub: 'Delivered to business + completed',
      },
      {
        label: 'Paid to you',
        display: hideAmounts ? '****' : `₨${paidTotal.toLocaleString()}`,
        color: 'var(--success, #166534)',
        sub: 'Payments from the business',
      },
    ];
  }, [isParty, scopedLots, scopedPayments, hideAmounts]);

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

  // Alerts logic
  const alerts = useMemo(() => {
    if (isParty) return [];
    const now = new Date();
    const alertList = [];

    // Dispatched too long
    const dispatchedLots = scopedLots.filter(l => l.status === 'dispatched');
    let stuckLots = [];
    let stuckLotsIds = [];
    dispatchedLots.forEach(l => {
      const dispatchDateStr = l.dispatchDate || latestDateFrom(l, ['updatedAt', 'createdAt']);
      if (dispatchDateStr) {
        const diffTime = Math.max(0, now - new Date(dispatchDateStr));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > alertDaysThreshold) {
          stuckLots.push(l.lotNo || l.lotNumber);
          stuckLotsIds.push(l.id);
        }
      }
    });
    if (stuckLots.length > 0) {
      alertList.push({
        type: 'warning',
        title: stuckLots.length + ' lots stuck in dispatch',
        desc: 'Lots: ' + stuckLots.slice(0, 5).join(', ') + (stuckLots.length > 5 ? '...' : '') + '. Click to view.',
        link: `/ghausia?status=dispatched&stuckLotIds=${stuckLotsIds.join(',')}`
      });
    }

    // Pending approval too long
    const pendingApprovalLots = scopedLots.filter(l => l.status === 'pending approval');
    if (pendingApprovalLots.length > 0) {
      const pendingLotsNo = pendingApprovalLots.map(l => l.lotNo || l.lotNumber);
      alertList.push({
        type: 'danger',
        title: pendingApprovalLots.length + ' lots awaiting your approval',
        desc: 'Lots: ' + pendingLotsNo.slice(0, 5).join(', ') + (pendingLotsNo.length > 5 ? '...' : '') + '. Click to review.',
        link: pendingApprovalLots.length === 1 ? `/review-lots?lotId=${pendingApprovalLots[0].id}` : '/review-lots'
      });
    }
    return alertList;
  }, [scopedLots, isParty, alertDaysThreshold]);

  // Revenue Trends (Line Chart Data)
  const revenueTrendData = useMemo(() => {
    if (isParty) return [];
    const monthsMap = {};
    const completedLots = scopedLots.filter(l => l.status === 'completed' || l.status === 'received back');

    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1); // Set to 1st to prevent month overflow (e.g. Oct 31 -> Sep 31 -> Oct 1)
      d.setMonth(d.getMonth() - i);
      const mLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthsMap[mLabel] = { name: mLabel, revenue: 0, sortKey: d.getTime() };
    }

    completedLots.forEach(l => {
      const dStr = latestDateFrom(l, ['completionApprovedAt', 'receivedBackDate', 'createdAt']);
      if (!dStr) return;
      const d = new Date(dStr);
      const mLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (monthsMap[mLabel]) {
        monthsMap[mLabel].revenue += Number(l.billAmount || 0);
      }
    });

    return Object.values(monthsMap).sort((a, b) => a.sortKey - b.sortKey);
  }, [scopedLots, isParty]);

  // Month-over-month calculation for the "Completed Revenue" card
  const momGrowth = useMemo(() => {
    if (revenueTrendData.length < 2) return null;
    const currentM = revenueTrendData[revenueTrendData.length - 1].revenue;
    const prevM = revenueTrendData[revenueTrendData.length - 2].revenue;
    if (prevM === 0) return currentM > 0 ? 100 : 0;
    return ((currentM - prevM) / prevM) * 100;
  }, [revenueTrendData]);



  // Optimized single-pass calculation for lots statuses and values
  const lotStats = useMemo(() => {
    return scopedLots.reduce((acc, l) => {
      acc.byStatus[l.status] = (acc.byStatus[l.status] || 0) + 1;
      const bill = Number(l.billAmount || 0);
      acc.totalLotValue += bill;
      if (l.status === 'received back') {
        acc.billable.push(l);
        acc.billableTotal += bill;
      }
      if (l.status === 'completed') {
        acc.completedTotal += bill;
      }
      return acc;
    }, {
      byStatus: {},
      billable: [],
      billableTotal: 0,
      completedTotal: 0,
      totalLotValue: 0
    });
  }, [scopedLots]);


  const partyStats = useMemo(() => parties
    .map((p) => {
      const lots = scopedLots.filter((l) => String(l.partyId ?? '') === String(p.id ?? ''));
      return {
        id: p.id,
        name: p.name,
        total: lots.length,
        value: lots.reduce((s, l) => s + Number(getAdminLedgerOrBusinessBill(l, reportingPartyEdits[l.id] || {}) || 0), 0),
        completed: lots.filter((l) => l.status === 'completed').length,
        pending: lots.filter((l) => l.status === 'pending').length,
      };
    })
    .filter((p) => p.total > 0), [parties, scopedLots, reportingPartyEdits]);

  const topParties = useMemo(() => [...partyStats].sort((a, b) => b.value - a.value).slice(0, 3), [partyStats]);

  const fabricStats = useMemo(() => {
    const fabricMap = {};
    scopedLots.forEach(l => {
      const fabric = String(l.itemType || l.fabric || l.customFabric || 'Unknown').trim() || 'Unknown';
      if (!fabricMap[fabric]) fabricMap[fabric] = { name: fabric, count: 0, revenue: 0 };
      fabricMap[fabric].count += 1;
      fabricMap[fabric].revenue += Number(l.billAmount || 0);
    });
    const sorted = Object.values(fabricMap).sort((a, b) => b.count - a.count);
    // Show top 4, group remaining into "Others" so pie chart total always matches Total Lots
    if (sorted.length <= 5) return sorted;
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4);
    const others = rest.reduce(
      (acc, f) => { acc.count += f.count; acc.revenue += f.revenue; return acc; },
      { name: 'Others', count: 0, revenue: 0 }
    );
    return [...top, others];
  }, [scopedLots]);

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
            your business collection (or any name you use for production).
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
  const byStatus = (s) => lotStats.byStatus[s] || 0;
  const pendingCount = byStatus('pending');
  const dispatchedCount = byStatus('dispatched');
  const pendingApprovalCount = byStatus('pending approval');
  const receivedBackCount = byStatus('received back');
  const completedCount = byStatus('completed');
  const rejectedCount = byStatus('rejected');

  // TAT Calculation
  const completedLotsWithDates = scopedLots.filter(l =>
    String(l.status || '').toLowerCase() === 'completed' && (l.completionApprovedAt || l.updatedAt) && (l.allotDate || l.createdAt)
  );
  let avgTatDisplay = 'N/A';
  if (completedLotsWithDates.length > 0) {
    const totalDays = completedLotsWithDates.reduce((sum, l) => {
      const end = new Date(l.completionApprovedAt || l.updatedAt);
      const start = new Date(l.allotDate || l.createdAt);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return sum + diffDays;
    }, 0);
    const avgDays = (totalDays / completedLotsWithDates.length).toFixed(1);
    avgTatDisplay = `${avgDays} Days`;
  }

  // WIP Value Calculation
  const wipLots = scopedLots.filter(l => ['dispatched', 'pending approval', 'received back'].includes(String(l.status || '').toLowerCase()));
  const wipValue = wipLots.reduce((sum, l) => {
    const edit = reportingPartyEdits[l.id] || {};
    const bill = getAdminLedgerOrBusinessBill(l, edit) || l.billAmount || 0;
    return sum + Number(bill);
  }, 0);

  const { billable, billableTotal, completedTotal, totalLotValue } = lotStats;

  const ownerIn = scopedPayments
    .filter((p) => p.type === 'Received' && String(p.party || '').toLowerCase() === 'owner')
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


  // Donut chart colors
  const COLORS = ['var(--primary-light, #3b82f6)', 'var(--success, #10b981)', 'var(--warning, #f59e0b)', 'var(--danger, #ef4444)', 'var(--purple, #8b5cf6)', 'var(--text-muted, #64748b)'];

  const activePartyStat = {
    label: 'Active Parties',
    value: partyStats.length,
    color: 'var(--purple, #7c3aed)',
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
    { label: 'Total Lot Value', value: totalLotValue, color: 'var(--primary, #1e40af)' },
    {
      label: 'Billable to Owner',
      value: billableTotal,
      color: 'var(--primary-light, #0369a1)',
      note: `${billable.length} lot${billable.length === 1 ? '' : 's'} — ready to invoice`,
    },
    { label: 'Completed Revenue', value: completedTotal, color: 'var(--success, #15803d)' },
    { label: 'Received from Owner', value: ownerIn, color: 'var(--primary-light, #0284c7)' },
    { label: 'Paid to Parties', value: paidToNonOwnerParties, color: 'var(--purple, #7c3aed)' },
    {
      label: 'Net (owner vs parties)',
      value: netOwnerVsParties,
      color: netOwnerVsParties >= 0 ? 'var(--success, #15803d)' : 'var(--danger, #dc2626)',
      tooltip:
        netOwnerVsParties >= 0
          ? 'Received more than paid to parties'
          : 'Paid parties more than received from owner',
      signed: true,
      highlight: true,
    },
  ];

  return (
    <div>
      <div className="dash-modern-header">
        <div>
          <div className="dash-modern-header-title">{isParty ? 'Home' : 'Dashboard'}</div>
          <div className="dash-modern-header-subtitle">
            {isParty
              ? `Welcome back${partyNameTrim ? `, ${partyNameTrim}` : ''}. Summary of your lots.`
              : 'Overview of all production and financial activity'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!isParty && (
            <div className="dash-quick-actions" style={{ marginRight: 'auto' }}>
              <Link to="/ghausia?action=new" className="dash-btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Add Lot
              </Link>
              <Link to="/payments?action=new" className="dash-btn-secondary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                Add Payment
              </Link>
            </div>
          )}
          <button
            onClick={() => setHideAmounts(h => !h)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {hideAmounts
                ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>
                : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>
              }
            </svg>
            {hideAmounts ? 'Show Amounts' : 'Hide Amounts'}
          </button>
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
            <div key={c.label} className="stat-card-modern" style={{ '--card-accent': c.color }}>
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
            <div className="section-title" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary, #64748b)', marginBottom: 12 }}>Production Pipeline</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--purple, #8b5cf6)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Total Lots</div>
                <div className="stat-value" style={{ color: 'var(--purple, #8b5cf6)' }}>{scopedLots.length}</div>
                <div className="stat-sub">All assigned lots</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--warning, #f59e0b)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Pending</div>
                <div className="stat-value" style={{ color: 'var(--warning, #f59e0b)' }}>{pendingCount}</div>
                <div className="stat-sub">Awaiting dispatch</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--primary-light, #0ea5e9)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Dispatched</div>
                <div className="stat-value" style={{ color: 'var(--primary-light, #0ea5e9)' }}>{dispatchedCount}</div>
                <div className="stat-sub">Currently with party</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--warning, #eab308)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Awaiting Approval</div>
                <div className="stat-value" style={{ color: 'var(--warning, #eab308)' }}>{pendingApprovalCount}</div>
                <div className="stat-sub">Party submitted completion</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--danger, #ef4444)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Rejected</div>
                <div className="stat-value" style={{ color: 'var(--danger, #ef4444)' }}>{rejectedCount}</div>
                <div className="stat-sub">Needs rework</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--success, #14b8a6)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Received Back</div>
                <div className="stat-value" style={{ color: 'var(--success, #14b8a6)' }}>{receivedBackCount}</div>
                <div className="stat-sub">Ready to bill owner</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--success, #22c55e)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Completed</div>
                <div className="stat-value" style={{ color: 'var(--success, #22c55e)' }}>{completedCount}</div>
                <div className="stat-sub">Fully done</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--danger, #ec4899)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>Average TAT</div>
                <div className="stat-value" style={{ color: 'var(--danger, #ec4899)' }}>{avgTatDisplay}</div>
                <div className="stat-sub">Pending to Complete</div>
              </div>
              <div className="stat-card-modern" style={{ '--card-accent': 'var(--primary-light, #0ea5e9)' }}>
                <div className="stat-label" style={{ textTransform: 'uppercase' }}>WIP Value</div>
                <div
                  className="stat-value"
                  style={{
                    color: 'var(--primary-light, #0ea5e9)',
                    fontSize: hideAmounts ? 24 : (wipValue >= 1000000 ? 18 : 24),
                    wordBreak: 'break-word'
                  }}
                >
                  {hideAmounts ? '***' : formatRupee(wipValue)}
                </div>
                <div className="stat-sub">Value of active work</div>
              </div>
            </div>
          </section>

          <section className="dash-desktop-only" style={{ marginBottom: 28 }}>
            <div className="section-title">Parties & Finances</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: 16,
              }}
            >
              <div className="stat-card-modern" style={{ '--card-accent': activePartyStat.color }}>
                <div className="stat-label">{activePartyStat.label}</div>
                <div className="stat-value" style={{ color: activePartyStat.color, fontSize: 28 }}>
                  {activePartyStat.value}
                </div>
                <div className="stat-sub">{activePartyStat.sub}</div>
              </div>
              {finCards.map((c) => (
                <div
                  key={c.label}
                  className="stat-card-modern"
                  style={{
                    '--card-accent': c.color,
                    ...(c.highlight
                      ? {
                        borderColor: netOwnerVsParties >= 0 ? 'var(--success-bg, #86efac)' : 'var(--danger-bg, #fecaca)',
                        background: netOwnerVsParties >= 0
                            ? 'var(--card-bg, linear-gradient(145deg, var(--card-bg, #ffffff) 0%, var(--success-bg, #f0fdf4) 100%))'
                            : 'var(--card-bg, linear-gradient(145deg, var(--card-bg, #ffffff) 0%, var(--danger-bg, #fef2f2) 100%))',
                      }
                      : {}),
                  }}
                >
                  <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.label}
                      {c.tooltip && (
                        <span
                          title={c.tooltip}
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, borderRadius: '50%', background: 'var(--border, #e2e8f0)', color: 'var(--text-muted, #64748b)',
                            fontSize: 10, fontWeight: 'bold', cursor: 'help'
                          }}
                        >
                          i
                        </span>
                      )}
                    </span>
                    {c.label === 'Completed Revenue' && momGrowth !== null && !hideAmounts && (
                      <span className={'dash-trend ' + (momGrowth >= 0 ? 'up' : 'down')}>
                        {momGrowth >= 0 ? '⬆️' : '⬇️'} {Math.abs(momGrowth).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="stat-value" style={{ color: c.color, fontSize: 24, whiteSpace: 'nowrap' }}>
                    {hideAmounts ? '****' : (c.signed ? formatSignedRupee(c.value) : formatRupee(c.value))}
                  </div>
                  {c.note && <div className="stat-sub">{c.note}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="dash-desktop-only" style={{ marginBottom: 28 }}>
            <div className="dash-grid-2">
              {/* Top Performing Parties */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Top Performing Parties</span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {topParties.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ margin: 0, minWidth: 400 }}>
                        <tbody>
                          {topParties.map((p, idx) => (
                            <tr key={p.id}>
                              <td style={{ width: 40, textAlign: 'center' }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: idx === 0 ? 'var(--warning-bg, #fef08a)' : idx === 1 ? 'var(--border, #e2e8f0)' : 'var(--warning-bg, #fed7aa)', color: idx === 0 ? '#a16207' : idx === 1 ? 'var(--text-secondary, #475569)' : 'var(--warning, #9a3412)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, margin: '0 auto' }}>
                                  {idx + 1}
                                </div>
                              </td>
                              <td style={{ fontWeight: 600 }}>{p.name}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.completed}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Completed</div>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success, #15803d)' }}>
                                {hideAmounts ? '****' : `₨${p.value.toLocaleString()}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13 }}>No active parties found.</div>
                  )}
                </div>
              </div>


              {/* Fabric Breakdown */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Fabric Insights</span>
                </div>
                <div className="card-body" style={{ padding: '24px' }}>
                  {fabricStats.length > 0 ? (
                    <>
                      <div style={{ height: 180 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={fabricStats}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="count"
                              stroke="none"
                            >
                              {fabricStats.map((entry, index) => (
                                <Cell key={'cell-' + index} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              formatter={(value, name, props) => [value + ' Lots (' + (hideAmounts ? '****' : '₨' + props.payload.revenue.toLocaleString()) + ')', name]}
                              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', justifyContent: 'center', marginTop: 16 }}>
                        {fabricStats.map((f, idx) => (
                          <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: COLORS[idx % COLORS.length] }}></span>
                            {f.name} ({f.count})
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13 }}>No fabric data available.</div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {!isParty && (
            <div className="dash-grid-2 dash-desktop-only" style={{ marginBottom: 28 }}>
              {/* Revenue Trends Chart */}
              <div className="card" style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid rgba(226,232,240,0.8)', borderRadius: 16 }}>
                <div className="card-header" style={{ borderBottom: '1px solid var(--primary-bg, #f1f5f9)', padding: '20px 24px' }}>
                  <span className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>Revenue Trends (6 Months)</span>
                </div>
                <div className="card-body" style={{ padding: '24px', height: 350 }}>
                  {revenueTrendData.some(d => d.revenue > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke='var(--border, #e2e8f0)' />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted, #64748b)', fontSize: 12 }} dy={10} />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: 'var(--text-muted, #64748b)', fontSize: 12 }}
                          tickFormatter={(value) => hideAmounts ? '***' : ((value / 1000).toFixed(0) + 'k')}
                        />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          formatter={(value) => [hideAmounts ? '****' : ('₨ ' + value.toLocaleString()), 'Revenue']}
                          labelStyle={{ color: 'var(--text-primary, #0f172a)', fontWeight: 600, marginBottom: 4 }}
                        />
                        <Line type="monotone" dataKey="revenue" stroke='var(--primary-light, #3b82f6)' strokeWidth={4} dot={{ r: 4, fill: 'var(--primary-light, #3b82f6)', strokeWidth: 2, stroke: 'var(--card-bg, #fff)' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted, #64748b)' }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke='var(--border, #cbd5e1)' strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="9" y1="21" x2="9" y2="9"></line>
                      </svg>
                      <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>No revenue data yet</p>
                      <p style={{ margin: '4px 0 0', fontSize: 13 }}>Complete lots to see your trends over time.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Alerts & Notifications */}
              <div className="card" style={{ boxShadow: 'var(--shadow)', border: '1px solid var(--border)', borderRadius: 16 }}>
                <div className="card-header" style={{ borderBottom: '1px solid var(--primary-bg, #f1f5f9)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="card-title" style={{ fontSize: 16, fontWeight: 700 }}>Needs Attention</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted, #64748b)' }}>
                    Threshold:
                    <input
                      type="number"
                      value={alertDaysThreshold}
                      onChange={(e) => setAlertDaysThreshold(Number(e.target.value) || 7)}
                      style={{ width: 40, padding: '2px 4px', border: '1px solid var(--border, #cbd5e1)', borderRadius: 4, textAlign: 'center', background: 'var(--primary-bg)', color: 'var(--text-primary)' }}
                      min="1"
                    /> days
                  </div>
                </div>
                <div className="card-body" style={{ padding: '24px' }}>
                  {alerts.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted, #64748b)', padding: '40px 0' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #94a3b8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      <p>All caught up! No active alerts.</p>
                    </div>
                  ) : (
                    <div className="dash-alert-container">
                      {alerts.map((alert, idx) => (
                        <Link
                          key={idx}
                          to={alert.link || '#'}
                          className={'dash-alert-item ' + (alert.type === 'danger' ? 'alert-danger' : '')}
                          style={{ textDecoration: 'none', display: 'flex' }}
                        >
                          <div className="dash-alert-icon">
                            {alert.type === 'danger' ? (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke='var(--danger, #ef4444)' strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #f97316)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            )}
                          </div>
                          <div className="dash-alert-content">
                            <div className="dash-alert-title">{alert.title}</div>
                            <div className="dash-alert-desc">{alert.desc}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="dash-admin-split">
            {/* Status Breakdown */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Lot Status Breakdown</span>
              </div>
              <div className="card-body">
                {[
                  { label: 'Pending', count: byStatus('pending'), color: 'var(--warning, #d97706)' },
                  { label: 'Dispatched', count: byStatus('dispatched'), color: 'var(--primary-light, #0284c7)' },
                  { label: 'Pending Approval', count: byStatus('pending approval'), color: 'var(--warning, #eab308)' },
                  { label: 'Rejected', count: byStatus('rejected'), color: 'var(--danger, #ef4444)' },
                  { label: 'Received Back', count: byStatus('received back'), color: 'var(--success, #0d9488)' },
                  { label: 'Completed', count: byStatus('completed'), color: 'var(--success, #15803d)' },
                ].filter((s) => s.count > 0).map((s) => (
                  <div
                    key={s.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}
                  >
                    <div
                      style={{
                        width: 120,
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
                        background: 'var(--primary-bg, #f3f4f6)',
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

            {/* Billable Lots (Desktop Only) */}
            <div className="card dash-desktop-only">
              <div className="card-header">
                <span className="card-title">Billable to Owner</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light, #0369a1)' }}>
                  {hideAmounts ? '****' : `₨${billableTotal.toLocaleString()}`}
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
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary-light, #0369a1)' }}>
                              {hideAmounts ? '****' : `₨${Number(l.billAmount).toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Top Performing Parties (Mobile Only - Replaces Billable Lots) */}
            <div className="card dash-mobile-only">
              <div className="card-header">
                <span className="card-title">Top Performing Parties</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {topParties.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ margin: 0, minWidth: 400 }}>
                      <tbody>
                        {topParties.map((p, idx) => (
                          <tr key={p.id}>
                            <td style={{ width: 40, textAlign: 'center' }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: idx === 0 ? 'var(--warning-bg, #fef08a)' : idx === 1 ? 'var(--border, #e2e8f0)' : 'var(--warning-bg, #fed7aa)', color: idx === 0 ? '#a16207' : idx === 1 ? 'var(--text-secondary, #475569)' : 'var(--warning, #9a3412)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, margin: '0 auto' }}>
                                {idx + 1}
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{p.name}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.completed}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Completed</div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success, #15803d)' }}>
                              {hideAmounts ? '****' : `₨${p.value.toLocaleString()}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted, #64748b)', fontSize: 13 }}>No active parties found.</div>
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
                  {recentPayments.map((p) => {
                    const linkedStr = String(p.linkedLot || '').trim();
                    return (
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
                            {linkedStr ? <span className="dash-recent-note" style={{ marginLeft: 6 }}>[Lot {linkedStr}]</span> : null}
                            {p.note ? <span className="dash-recent-note" style={{ marginLeft: 6 }}>{p.note}</span> : null}
                          </div>
                        </div>
                        <div
                          className={`dash-recent-amount ${p.type === 'Received'
                              ? 'dash-recent-amount--in'
                              : 'dash-recent-amount--out'
                            }`}
                        >
                          {hideAmounts ? '****' : `₨${Number(p.amount || 0).toLocaleString()}`}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="dash-recent-desktop table-scroll">
                  <table className="dash-recent-table">
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
                      {recentPayments.map((p) => {
                        const linkedStr = String(p.linkedLot || '').trim();
                        return (
                          <tr key={p.id}>
                            <td>{formatDisplayDate(p.date)}</td>
                            <td>
                              <span className={`dash-pay-type ${paymentTypeClass(p)}`}>
                                {adminPaymentTypeLabel(p)}
                              </span>
                            </td>
                            <td>{adminPaymentPartyLabel(p, businessOwners)}</td>
                            <td style={{ fontSize: 13, color: 'var(--text-secondary, #475569)', fontWeight: 600 }}>
                              {linkedStr || '—'}
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                              {p.note || '—'}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: p.type === 'Received' ? 'var(--success, #15803d)' : 'var(--danger, #dc2626)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {hideAmounts ? '****' : `₨${Number(p.amount || 0).toLocaleString()}`}
                            </td>
                          </tr>
                        );
                      })}
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
