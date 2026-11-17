import React, { useState, useEffect } from 'react';
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

function TallyModal({ ownerId, ownerName, onClose, onAdded }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return;
    setLoading(true);
    try {
      await apiService.createPayment({
        type: 'Tally',
        party: ownerName,
        date: date,
        note: `Matched up to: ${note}`,
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
                setDate(new Date().toISOString().slice(0, 10));
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

  const [dateRange, setDateRange] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });

  useEffect(() => {
    let isMounted = true;
    async function fetchBillsCount() {
      try {
        const res = await apiService.getOwnerBills(ownerId);
        if (isMounted) setBillsCount(res?.bills?.length || 0);
      } catch (err) {
        // Ignore fetch errors silently
      }
    }
    fetchBillsCount();
    return () => {
      isMounted = false;
    };
  }, [ownerId]);
  
  // Build raw rows
  const raw = [];
  const normalizedOwnerId = normalizedBusinessOwnerId(ownerId);

  // Extract all lot numbers that have been billed (i.e. have an AutoBill payment)
  const billedLotNumbers = new Set();
  payments.forEach((p) => {
    const pParty = String(p.party || '').toLowerCase().trim();
    const oName = String(ownerName || '').toLowerCase().trim();
    const isOwnerParty = pParty === 'owner' || pParty === '' || (oName && pParty === oName);

    const pWid = normalizedBusinessOwnerId(p.businessOwnerId) || normalizedBusinessOwnerId(p.ownerWorkspaceId) || normalizedBusinessOwnerId(p.ownerWorkspace);
    const matchesWorkspace = pWid === normalizedOwnerId;

    const isAutoBill = p.type === 'Paid' && String(p.note || '').trim().startsWith('Billable lot settled');

    if (matchesWorkspace && isOwnerParty && isAutoBill && p.linkedLot) {
      billedLotNumbers.add(String(p.linkedLot).trim());
    }
  });

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
    const isAutoBill = p.type === 'Paid' && String(p.note || '').trim().startsWith('Billable lot settled');
    
    // Tally markers don't have amounts but we want to show them
    if (p.type === 'Tally' && (p.businessOwnerId === ownerId || matchesWorkspace)) {
      return true;
    }
    
    return isOwnerParty && matchesWorkspace && !isAutoBill;
  });

  ownerPayments.forEach((p) => {
    let when = parseDateValue(p.date) || parseDateValue(p.createdAt);
    if (when && String(p.date || '').length === 10) {
      // Inject the actual creation time so it doesn't show 12:00 AM and sorts properly
      const created = parseDateValue(p.createdAt);
      if (created) {
        when.setHours(created.getHours(), created.getMinutes(), created.getSeconds());
      }
    }
    const sortMs = when ? when.getTime() : 0;
    const amt = Number(p.amount || 0);
    const isReceived = p.type === 'Received'; // Received from owner

    raw.push({
      rowKey: `paid-${p.id || p._id}`,
      kind: 'paid',
      id: p.id || p._id,
      sortMs,
      whenDate: when,
      note: (p.note || '').trim(),
      linkedLot: (p.linkedLot || '').trim(),
      paymentType: p.type || 'Received',
      received: isReceived ? amt : 0, // Money from owner
      billed: (isReceived || p.type === 'Tally') ? 0 : amt, // Paid to owner (acts like bill, increases what they owe us)
      payment: p,
    });
  });

  // Filter lots for this owner (already billed / settled for timeline)
  const ownerLots = lots.filter((l) => {
    const lotBizId = normalizedBusinessOwnerId(l.businessOwnerId) || normalizedBusinessOwnerId(l.ownerWorkspaceId);
    const matchesWorkspace = lotBizId === normalizedOwnerId;
    
    // As per user request: "jo lot unhy bill ho chuki hain just wo yahan show krni"
    // So we ONLY show lots that have a corresponding AutoBill payment.
    const lotNum = String(l.lotNo || l.lotNumber || '').trim();
    return matchesWorkspace && billedLotNumbers.has(lotNum);
  });

  // Billable lots for this owner (status === 'received back' and ready to be billed)
  const billableLotsForOwner = lots.filter((l) => {
    const lotBizId = normalizedBusinessOwnerId(l.businessOwnerId) || normalizedBusinessOwnerId(l.ownerWorkspaceId);
    const matchesWorkspace = lotBizId === normalizedOwnerId;
    return matchesWorkspace && String(l.status || '').toLowerCase() === 'received back';
  });

  ownerLots.forEach((l) => {
    const bill = getBusinessBillAmount(l) || Number(l.billAmount || 0);
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

  // Sort by date oldest first to calculate running balance
  raw.sort((a, b) => {
    const d = (a.sortMs || 0) - (b.sortMs || 0);
    if (d !== 0) return d;
    return String(a.rowKey).localeCompare(String(b.rowKey));
  });

  let owedRunning = 0; // Positive means Owner owes us
  const withBalance = [];
  for (const row of raw) {
    owedRunning += row.billed - row.received;
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

  const netBalance = withBalance.length ? withBalance[withBalance.length - 1].balanceAfter : 0;
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success, #047857)' }}>
                      {formattedDate}
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
          candidateLots={billableLotsForOwner}
          candidatePayments={ownerPayments}
          existingBill={selectedBillToView}
          onClose={() => {
            setShowBillModal(false);
            setSelectedBillToView(null);
          }}
          onSaved={(savedBill) => {
            markLotsBilledLocally?.(billableLotsForOwner, savedBill);
            onRefresh?.();
            apiService.getOwnerBills(ownerId).then((r) => setBillsCount(r?.bills?.length || 0)).catch(() => {});
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
            revertLotsBilledLocally?.(b?.id || b?._id, b?.billNo);
            onRefresh?.();
            apiService.getOwnerBills(ownerId).then((r) => setBillsCount(r?.bills?.length || 0)).catch(() => {});
          }}
        />
      )}
    </Modal>
  );
}
