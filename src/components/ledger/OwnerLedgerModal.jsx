import React, { useState, useEffect, useCallback } from 'react';
import { Modal, FormGroup } from '../UI';
import { latestDateFrom, formatDisplayDateTime, DateRangeSelect, isWithinDateRange, parseDateValue } from '../../utils/dateFilters';
import { getBusinessBillAmount } from '../../utils/partyBillPrivacy';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import apiService from '../../services/api';
import PaymentSlipCell from '../receipt/PaymentSlipCell';
import { formatLakhCrore } from '../../utils/numberToWords';
import { useApp } from '../../context/AppContext';
import OwnerBillModal from './OwnerBillModal';
import OwnerBillsListModal from './OwnerBillsListModal';
import { clearOwnerBillsSessionCache } from '../../utils/ownerBillCache';

const localTodayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function TallyModal({ ownerId, ownerName, onClose, onAdded }) {
  const [date, setDate] = useState(() => localTodayISO());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return;
    setLoading(true);
    try {
      await apiService.createPayment({
        type: 'Tally',
        party: 'Owner',
        date: date,
        note: `Matched up to: ${note}${ownerName ? ` (${ownerName})` : ''}`,
        amount: 0,
        businessOwnerId: ownerId,
      }, ownerId);
      onAdded();
    } catch (err) {
      alert('Error adding tally: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Mark Khata Tally" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormGroup label="Date of Tally *">
          <div style={{ position: 'relative' }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="form-input"
              style={{ paddingRight: 72, width: '100%' }}
              required
            />
            <button
              type="button"
              onClick={() => {
                setDate(localTodayISO());
              }}
              style={{
                position: 'absolute',
                right: 34,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                color: 'var(--primary, #1e40af)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 4px',
                lineHeight: 1.2,
              }}
            >
              Today
            </button>
          </div>
        </FormGroup>
        <FormGroup label="Note / Reference (Optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Bill #42"
            className="form-input"
          />
        </FormGroup>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>Cancel</button>
          <button 
            type="submit" 
            disabled={loading} 
            style={{ 
              padding: '8px 16px', 
              background: 'var(--primary, #1e40af)', 
              color: 'white', 
              border: 'none', 
              borderRadius: 6, 
              cursor: 'pointer', 
              fontWeight: 600 
            }}
          >
            {loading ? 'Saving...' : 'Save Tally Mark'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function OwnerLedgerModal({ ownerId, ownerName, payments, lots, onClose, onRefresh }) {
  const { markLotsBilledLocally, revertLotsBilledLocally } = useApp();
  const [showTallyModal, setShowTallyModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showBillsList, setShowBillsList] = useState(false);
  const [selectedBillToView, setSelectedBillToView] = useState(null);
  const [billsCount, setBillsCount] = useState(0);
  const [bills, setBills] = useState([]);
  const [billsDefaults, setBillsDefaults] = useState(null);

  const [dateRange, setDateRange] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });

  const fetchBills = useCallback(async () => {
    try {
      const res = await apiService.getOwnerBills(ownerId);
      setBills(res?.bills || []);
      setBillsDefaults(res?.nextDefaults || null);
      setBillsCount(res?.bills?.length || 0);
    } catch (err) {
      // Ignore fetch errors silently
    }
  }, [ownerId]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);
  
  // Build raw rows
  const raw = [];
  const normalizedOwnerId = normalizedBusinessOwnerId(ownerId);

  const parseBaqayaFromTally = (p) => {
    if (!p) return null;
    if (p.amount != null && Number.isFinite(Number(p.amount))) {
      return Number(p.amount);
    }
    const note = String(p.note || '');
    const m = note.match(/Baqaya:\s*Rs\s*(-?[0-9,]+)/i);
    if (m) {
      const parsed = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const isAutoOwnerLotSettlement = (p) => {
    if (!p || p.type !== 'Paid') return false;
    if (p.ownerBillId) return true;
    if (p.billedInBillNo && p.billedInBillNo !== 'none') return true;
    const note = String(p.note || '').trim();
    if (note.includes('billed to owner')) return true;
    return /^(Billable lot settled|Defective lot settled|Lot completed|Rework lot settled|Rework lot completed)/i.test(
      note
    );
  };

  // Map finalized bills by ID so lots billed inside an OwnerBill sort cleanly right BEFORE that bill's Tally marker
  const billsById = new Map();
  (bills || []).forEach((b) => {
    const bid = String(b.id || b._id || '').trim();
    if (bid) billsById.set(bid, b);
  });

  // Extract lot keys (lotNo::reworkFlag) that have been billed so legacy rows still resolve without colliding with unbilled rework lots
  const billedLotKeys = new Set();
  const lotKeyFor = (lotNo, isRework) =>
    `${String(lotNo || '').trim().toLowerCase()}::${isRework ? '1' : '0'}`;

  lots.forEach((l) => {
    const lotBizId = normalizedBusinessOwnerId(l.businessOwnerId) || normalizedBusinessOwnerId(l.ownerWorkspaceId);
    if (lotBizId === normalizedOwnerId && (l.ownerBillId || l.billedInBillNo || String(l.status || '').toLowerCase() === 'completed')) {
      const lotNum = String(l.lotNo || l.lotNumber || '').trim();
      if (lotNum) billedLotKeys.add(lotKeyFor(lotNum, Boolean(l.isRework)));
    }
  });

  payments.forEach((p) => {
    const pParty = String(p.party || '').toLowerCase().trim();
    const oName = String(ownerName || '').toLowerCase().trim();
    const isOwnerParty = pParty === 'owner' || pParty === '' || (oName && pParty === oName);

    const pWid = normalizedBusinessOwnerId(p.businessOwnerId) || normalizedBusinessOwnerId(p.ownerWorkspaceId) || normalizedBusinessOwnerId(p.ownerWorkspace);
    const matchesWorkspace = pWid === normalizedOwnerId;

    if (matchesWorkspace && isOwnerParty && isAutoOwnerLotSettlement(p) && p.linkedLot) {
      const cleanNo = String(p.linkedLot).replace(/\s*\(rework\)\s*/i, '').trim();
      const payRework = /rework/i.test(p.linkedLot || '') || /rework/i.test(p.note || '');
      if (cleanNo) billedLotKeys.add(lotKeyFor(cleanNo, payRework));
    }
  });

  // Track ownerBillId -> Tally sort timestamp so lots inside a bill never sort AFTER that bill's Tally
  const tallyTimestampByBillId = new Map();

  // Filter payments for this owner
  // Only payments where type === 'Received' or 'Paid' or 'Tally' and party === 'Owner' (or blank, or matching owner name)
  const ownerPayments = payments.filter((p) => {
    const pParty = String(p.party || '').toLowerCase().trim();
    const oName = String(ownerName || '').toLowerCase().trim();
    
    const isOwnerParty = 
      pParty === 'owner' || 
      pParty === '' || 
      (oName && pParty === oName);

    const pWid = normalizedBusinessOwnerId(p.businessOwnerId) || normalizedBusinessOwnerId(p.ownerWorkspaceId) || normalizedBusinessOwnerId(p.ownerWorkspace);
    const matchesWorkspace = pWid === normalizedOwnerId;
    
    // Ignore auto-generated payments for settled lots because we already iterate over lots separately.
    const isAutoBill = isAutoOwnerLotSettlement(p);
    
    // Tally markers don't have amounts but we want to show them
    if (p.type === 'Tally' && (p.businessOwnerId === ownerId || matchesWorkspace)) {
      return true;
    }
    
    return isOwnerParty && matchesWorkspace && !isAutoBill;
  });

  ownerPayments.forEach((p) => {
    let when = parseDateValue(p.date) || parseDateValue(p.createdAt);
    if (when && String(p.date || '').length === 10) {
      const created = parseDateValue(p.createdAt);
      if (created) {
        when.setHours(created.getHours(), created.getMinutes(), created.getSeconds(), created.getMilliseconds());
      } else if (p.type === 'Tally') {
        when.setHours(23, 59, 59, 0);
      }
    }
    const sortMs = when ? when.getTime() : 0;
    if (p.type === 'Tally' && p.ownerBillId) {
      tallyTimestampByBillId.set(String(p.ownerBillId), sortMs);
    }
    const amt = Number(p.amount || 0);
    const isReceived = p.type === 'Received'; // Received from owner
    const isTally = p.type === 'Tally';
    const tallyBaqaya = isTally ? parseBaqayaFromTally(p) : null;

    raw.push({
      rowKey: `paid-${p.id || p._id}`,
      kind: 'paid',
      id: p.id || p._id,
      sortMs,
      whenDate: when,
      note: (p.note || '').trim(),
      linkedLot: (p.linkedLot || '').trim(),
      paymentType: p.type || 'Received',
      tallyBaqaya,
      received: isReceived ? amt : 0, // Money from owner
      billed: (isReceived || isTally) ? 0 : amt, // Paid to owner (acts like bill, increases what they owe us)
      payment: p,
    });
  });

  // Filter lots for this owner (already billed / settled for timeline — never pull unbilled 'received back' lots)
  const ownerLots = lots.filter((l) => {
    const lotBizId = normalizedBusinessOwnerId(l.businessOwnerId) || normalizedBusinessOwnerId(l.ownerWorkspaceId);
    const matchesWorkspace = lotBizId === normalizedOwnerId;
    if (!matchesWorkspace) return false;
    const statusLower = String(l.status || '').toLowerCase().trim();
    const isBilledInBill = Boolean(l.ownerBillId || l.billedInBillNo);
    if (isBilledInBill || statusLower === 'completed') return true;
    if (statusLower === 'received back') return false;
    const lotNum = String(l.lotNo || l.lotNumber || '').trim();
    return Boolean(lotNum && billedLotKeys.has(lotKeyFor(lotNum, Boolean(l.isRework))));
  });

  // Billable lots for this owner (status === 'received back' and ready to be billed)
  const billableLotsForOwner = lots.filter((l) => {
    const lotBizId = normalizedBusinessOwnerId(l.businessOwnerId) || normalizedBusinessOwnerId(l.ownerWorkspaceId);
    const matchesWorkspace = lotBizId === normalizedOwnerId;
    return matchesWorkspace && String(l.status || '').toLowerCase() === 'received back' && !l.ownerBillId && !l.billedInBillNo;
  });

  ownerLots.forEach((l) => {
    const bill = getBusinessBillAmount(l) || Number(l.billAmount || 0);
    const linkedBill = l.ownerBillId ? billsById.get(String(l.ownerBillId)) : null;
    let when = null;
    if (linkedBill?.date) {
      when = parseDateValue(linkedBill.date);
    }
    if (!when) {
      when = latestDateFrom(l, [
        'completionApprovedAt',
        'receivedBackDate',
        'createdAt',
        'dispatchDate',
        'allotDate',
        'receivedDate',
        'updatedAt',
      ]);
    }
    let sortMs = when ? when.getTime() : 0;
    if (l.ownerBillId && tallyTimestampByBillId.has(String(l.ownerBillId))) {
      const tallyMs = tallyTimestampByBillId.get(String(l.ownerBillId));
      // Guarantee billed lots inside a bill always sort strictly BEFORE that bill's Tally marker
      if (sortMs >= tallyMs) {
        sortMs = tallyMs - 1000;
        when = new Date(sortMs);
      }
    }

    raw.push({
      rowKey: `lot-${l.id || l._id}`,
      kind: 'lot',
      id: l.id || l._id,
      sortMs,
      whenDate: when,
      lotNo: l.lotNo || l.lotNumber,
      designNo: l.designNo,
      status: l.status,
      received: 0, // Lot is just work billed
      billed: bill, // Work billed increases what they owe us
      isCombinedDupatta: Boolean(l.suitComponent === 'dupatta' && bill === 0),
      lot: l,
    });
  });

  // Sort by date oldest first to calculate running balance (Tally always runs after same-timestamp rows)
  raw.sort((a, b) => {
    const d = (a.sortMs || 0) - (b.sortMs || 0);
    if (d !== 0) return d;
    if (a.paymentType === 'Tally' && b.paymentType !== 'Tally') return 1;
    if (b.paymentType === 'Tally' && a.paymentType !== 'Tally') return -1;
    return String(a.rowKey).localeCompare(String(b.rowKey));
  });

  let owedRunning = 0; // Positive means Owner owes us
  const withBalance = [];
  for (const row of raw) {
    if (row.paymentType === 'Tally' && row.tallyBaqaya != null) {
      owedRunning = row.tallyBaqaya;
    } else {
      owedRunning += row.billed - row.received;
    }
    withBalance.push({ ...row, balanceAfter: owedRunning });
  }

  // Display newest first
  let displayRows = [...withBalance].reverse();

  let openingBalance = 0;
  let hasOpeningBalance = false;
  let periodBilled = 0;
  let periodReceived = 0;

  if (dateRange !== 'all') {
    const firstInRangeIndex = withBalance.findIndex((row) =>
      isWithinDateRange(row.whenDate, dateRange, customDateRange)
    );
    if (firstInRangeIndex > 0) {
      openingBalance = withBalance[firstInRangeIndex - 1].balanceAfter;
      hasOpeningBalance = true;
    } else if (firstInRangeIndex === -1 && withBalance.length > 0) {
      openingBalance = withBalance[withBalance.length - 1].balanceAfter;
      hasOpeningBalance = true;
    }
    displayRows = displayRows.filter((row) => isWithinDateRange(row.whenDate, dateRange, customDateRange));
    periodBilled = displayRows.reduce((s, r) => s + Number(r.billed || 0), 0);
    periodReceived = displayRows.reduce((s, r) => s + Number(r.received || 0), 0);
  }

  const latestBillBaqaya = billsDefaults?.lastSabqaBaqaya != null && bills.length > 0
    ? Number(billsDefaults.lastSabqaBaqaya)
    : null;

  const calculatedNet = withBalance.length ? withBalance[withBalance.length - 1].balanceAfter : 0;
  const hasAnyTally = withBalance.some((r) => r.paymentType === 'Tally' && r.tallyBaqaya != null);
  const netBalance = latestBillBaqaya != null && !hasAnyTally
    ? latestBillBaqaya
    : calculatedNet;

  const currentNetBalance =
    dateRange !== 'all' && displayRows.length > 0
      ? displayRows[0].balanceAfter
      : dateRange !== 'all' && hasOpeningBalance
      ? openingBalance
      : netBalance;

  const formatMoney = (val) => {
    return `Rs ${Number(Math.abs(val)).toLocaleString()}`;
  };

  return (
    <Modal wide title={`${ownerName || 'Business Owner'} — Ledger`} onClose={onClose}>
      <div className="party-ledger-modal-body">
        <div style={{ padding: '0 0 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Filter Ledger:</div>
            <DateRangeSelect
              value={dateRange}
              onChange={setDateRange}
              customStart={customDateRange.start}
              customEnd={customDateRange.end}
              onCustomChange={setCustomDateRange}
            />
          </div>
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              border: '1px solid var(--danger-bg, #fecaca)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
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
                  color: currentNetBalance >= 0 ? 'var(--danger, #b91c1c)' : 'var(--success, #047857)',
                }}
              >
                {currentNetBalance < 0 ? '-' : ''}{formatMoney(currentNetBalance)}
              </span>
              {formatLakhCrore(currentNetBalance) && (
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
                  {formatLakhCrore(currentNetBalance)}
                </span>
              )}
            </div>
            {dateRange !== 'all' && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Sabqa Baqaya:</span>
                  <span style={{ color: 'var(--warning, #f59e0b)', fontWeight: 700 }}>
                    {openingBalance < 0 ? '-' : ''}{formatMoney(openingBalance)}
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>+ Naya Kaam:</span>
                  <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700 }}>
                    +{formatMoney(periodBilled)}
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>− Wasooli (Online):</span>
                  <span style={{ color: 'var(--success, #10b981)', fontWeight: 700 }}>
                    −{formatMoney(periodReceived)}
                  </span>
                </div>
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {netBalance > 0
                ? 'Owner owes you (work billed + refunds − payments received).'
                : netBalance < 0
                ? 'Owner paid more than billed — advance.'
                : 'Settled up in this period.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedBillToView(null);
                setShowBillModal(true);
              }}
              style={{
                padding: '9px 18px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 50,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>📄</span>
              Create Bill / Parchi
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowBillsList(true)}
              style={{
                borderRadius: 50,
                padding: '8px 14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <span>📋</span>
              Bill History {billsCount > 0 ? `(${billsCount})` : ''}
            </button>

            <button
              type="button"
              onClick={() => setShowTallyModal(true)}
              style={{
                padding: '9px 14px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 50,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 12.5,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Mark Tally
            </button>
          </div>
          </div>

          {/* Desktop Table Header */}
          <div className="party-ledger-desktop-header">
            <div>Date</div>
            <div style={{ color: 'var(--danger, #b91c1c)', textAlign: 'center' }}>
              Work Billed
              <div style={{ fontWeight: 500, opacity: 0.85 }}>(to owner)</div>
            </div>
            <div style={{ color: 'var(--success, #047857)', textAlign: 'center' }}>
              In
              <div style={{ fontWeight: 500, opacity: 0.85 }}>(from owner)</div>
            </div>
            <div style={{ textAlign: 'center' }}>Slip</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                Is muddat mein koi transaction nahi hui.
              </div>
            ) : null}
            {displayRows.map((t) => {
              const when =
                t.whenDate && !Number.isNaN(new Date(t.whenDate).getTime())
                  ? new Date(t.whenDate)
                  : null;
              const subtitle =
                t.kind === 'paid'
                  ? [
                      t.paymentType === 'Received' ? 'Received from owner' : t.note || 'Payment',
                      t.linkedLot ? `Lot: ${t.linkedLot}` : '',
                      t.paymentType === 'Received' && t.note ? t.note : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || `${t.paymentType}`
                  : (
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>Lot {t.lotNo || '—'} / {t.designNo || '—'}</strong>
                      {t.status ? ` · ${t.status}` : ''}
                      {t.isCombinedDupatta && (
                        <div style={{ fontSize: 11, color: 'var(--warning, #d97706)', marginTop: 2, fontWeight: 600 }}>
                          This lot&apos;s bill is combined with the main lot
                        </div>
                      )}
                    </span>
                  );
              
              const billed = t.billed > 0 ? t.billed : null;
              const received = t.received > 0 ? t.received : null;

              let formattedDate = '—';
              if (when) {
                formattedDate = formatDisplayDateTime(when).replace(/ pm/i, '\u00A0PM').replace(/ am/i, '\u00A0AM');
              }

              if (t.kind === 'paid' && t.paymentType === 'Tally') {
                return (
                  <div
                    key={t.rowKey}
                    style={{
                      background: 'var(--success-bg, #dcfce7)',
                      border: '1px solid var(--success, #047857)',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 18 }}>✅</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--success, #047857)' }}>
                          KHATA TALLIED (ACCOUNT MATCHED)
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--success, #047857)', opacity: 0.8 }}>
                          {t.note}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          background: '#047857',
                          color: '#ffffff',
                          padding: '3px 10px',
                          borderRadius: 6,
                          letterSpacing: '0.02em',
                        }}
                      >
                        Bal. {t.balanceAfter < 0 ? '-' : ''}{formatMoney(t.balanceAfter)}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success, #047857)' }}>
                        {formattedDate}
                      </div>
                    </div>
                  </div>
                );
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
                        Bal. {t.balanceAfter < 0 ? '-' : ''}
                        {formatMoney(t.balanceAfter)}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        alignSelf: 'center',
                        fontVariantNumeric: 'tabular-nums',
                        color: billed ? 'var(--danger, #b91c1c)' : 'var(--text-muted)',
                      }}
                    >
                      {billed ? formatMoney(billed) : '—'}
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontWeight: 800,
                        alignSelf: 'center',
                        fontVariantNumeric: 'tabular-nums',
                        color: received ? 'var(--success, #047857)' : 'var(--text-muted)',
                      }}
                    >
                      {received ? formatMoney(received) : '—'}
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
                        <PaymentSlipCell lot={t.lot} />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </div>
                  </div>

                  {/* Mobile Layout (Full-width card, auto-adjusting, no horizontal scroll) */}
                  <div className="party-ledger-row-mobile">
                    <div className="party-ledger-mob-top">
                      <span className="party-ledger-mob-date">{formattedDate}</span>
                      <div className="party-ledger-mob-amount-wrap">
                        {billed ? (
                          <span className="party-ledger-mob-amount paid" title="Work Billed (to owner)">
                            −{formatMoney(billed)}
                          </span>
                        ) : received ? (
                          <span className="party-ledger-mob-amount in" title="Payment Received (from owner)">
                            +{formatMoney(received)}
                          </span>
                        ) : (
                          <span className="party-ledger-mob-amount neutral">—</span>
                        )}
                      </div>
                    </div>

                    <div className="party-ledger-mob-subtitle">{subtitle}</div>

                    <div className="party-ledger-mob-bottom">
                      <span className="party-ledger-bal-pill">
                        Bal. {t.balanceAfter < 0 ? '-' : ''}
                        {formatMoney(t.balanceAfter)}
                      </span>
                      {(t.payment || t.lot) && (
                        <div className="party-ledger-mob-slip">
                          {t.payment ? (
                            <PaymentSlipCell payment={t.payment} isParty={false} />
                          ) : (
                            <PaymentSlipCell lot={t.lot} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {dateRange !== 'all' && hasOpeningBalance && (
              <div
                style={{
                  background: 'var(--primary-bg, #eff6ff)',
                  border: '1px dashed var(--primary, #93c5fd)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 700,
                  fontSize: 12.5,
                  color: 'var(--primary, #1e40af)',
                }}
              >
                <span>📅 Is Tareekh Se Pehle Ka Sabqa Baqaya (Opening Balance)</span>
                <span>{openingBalance < 0 ? '-' : ''}{formatMoney(openingBalance)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {showTallyModal && (
        <TallyModal
          ownerId={ownerId}
          ownerName={ownerName}
          onClose={() => setShowTallyModal(false)}
          onAdded={() => {
            setShowTallyModal(false);
            if (onRefresh) onRefresh();
          }}
        />
      )}
      {showBillModal && (
        <OwnerBillModal
          ownerId={ownerId}
          ownerName={ownerName}
          candidateLots={
            selectedBillToView
              ? [
                  ...(selectedBillToView.lots || []).map((bLot) => {
                    const found = lots.find(
                      (l) => String(l.id || l._id) === String(bLot.lotId || bLot._id || bLot.id)
                    );
                    return (
                      found || {
                        _id: bLot.lotId,
                        id: bLot.lotId,
                        lotNo: bLot.lotNo,
                        lotNumber: bLot.lotNo,
                        designNo: bLot.designNo,
                        suitComponent: bLot.suitComponent || 'main',
                        suitQuantity: bLot.quantity,
                        rate: bLot.rate,
                        billAmount: bLot.amount,
                        status: 'completed',
                        ownerBillId: selectedBillToView.id || selectedBillToView._id,
                        billedInBillNo: selectedBillToView.billNo,
                      }
                    );
                  }),
                  ...billableLotsForOwner,
                ]
              : billableLotsForOwner
          }
          candidatePayments={ownerPayments}
          existingBill={selectedBillToView}
          initialPreviousBalance={billsDefaults?.lastSabqaBaqaya != null ? Number(billsDefaults.lastSabqaBaqaya) : netBalance}
          onClose={() => {
            setShowBillModal(false);
            setSelectedBillToView(null);
          }}
          onSaved={(savedBill) => {
            const billedLots = savedBill?.lots || billableLotsForOwner;
            if (selectedBillToView) {
              revertLotsBilledLocally?.(
                selectedBillToView.id || selectedBillToView._id,
                selectedBillToView.billNo,
                selectedBillToView.bookNo,
                ownerId
              );
            }
            clearOwnerBillsSessionCache(ownerId);
            markLotsBilledLocally?.(billedLots, savedBill);
            onRefresh?.();
            fetchBills();
          }}
        />
      )}
      {showBillsList && (
        <OwnerBillsListModal
          ownerId={ownerId}
          ownerName={ownerName}
          onClose={() => setShowBillsList(false)}
          onSelectBill={(b) => {
            setSelectedBillToView(b);
            setShowBillModal(true);
          }}
          onCreateNew={() => {
            setSelectedBillToView(null);
            setShowBillModal(true);
          }}
          onBillDeleted={(b) => {
            clearOwnerBillsSessionCache(ownerId);
            revertLotsBilledLocally?.(b?.id || b?._id, b?.billNo, b?.bookNo, ownerId);
            onRefresh?.();
            fetchBills();
          }}
        />
      )}
    </Modal>
  );
}
