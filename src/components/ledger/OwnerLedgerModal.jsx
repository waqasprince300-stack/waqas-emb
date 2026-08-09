import React, { useState } from 'react';
import { Modal, FormGroup } from '../UI';
import { latestDateFrom, formatDisplayDateTime, DateRangeSelect, isWithinDateRange } from '../../utils/dateFilters';
import { getBusinessBillAmount } from '../../utils/partyBillPrivacy';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import apiService from '../../services/api';

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
  const [showTallyModal, setShowTallyModal] = useState(false);
  const [dateRange, setDateRange] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  
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
    const when = p.type === 'Tally' 
      ? latestDateFrom(p, ['date']) || latestDateFrom(p, ['createdAt'])
      : latestDateFrom(p, ['updatedAt', 'date']);
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
    });
  });

  // Filter lots for this owner
  const ownerLots = lots.filter((l) => {
    const lotBizId = normalizedBusinessOwnerId(l.businessOwnerId) || normalizedBusinessOwnerId(l.ownerWorkspaceId);
    const matchesWorkspace = lotBizId === normalizedOwnerId;
    
    // As per user request: "jo lot unhy bill ho chuki hain just wo yahan show krni"
    // So we ONLY show lots that have a corresponding AutoBill payment.
    const lotNum = String(l.lotNo || l.lotNumber || '').trim();
    return matchesWorkspace && billedLotNumbers.has(lotNum);
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

  if (dateRange !== 'all') {
    displayRows = displayRows.filter(row => isWithinDateRange(row.whenDate, dateRange, customDateRange));
  }
  const netBalance = withBalance.length ? withBalance[withBalance.length - 1].balanceAfter : 0;

  const formatMoney = (val) => {
    return `₨${Number(Math.abs(val)).toLocaleString()}`;
  };

  if (!displayRows.length) {
    return (
      <Modal wide title={`${ownerName || 'Business Owner'} — Ledger`} onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          No transactions in this period
        </div>
      </Modal>
    );
  }

  return (
    <Modal wide title={`${ownerName || 'Business Owner'} — Ledger`} onClose={onClose}>
      <div style={{ maxHeight: 'min(70vh, 560px)', overflowY: 'auto' }}>
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
                fontSize: 26,
                fontWeight: 800,
                color: netBalance >= 0 ? 'var(--danger, #b91c1c)' : 'var(--success, #047857)',
                marginTop: 4,
              }}
            >
              {netBalance < 0 ? '-' : ''}{formatMoney(netBalance)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {netBalance > 0
                ? 'Owner owes you (work billed + refunds − payments received).'
                : netBalance < 0
                ? 'Owner paid more than billed — advance.'
                : 'Settled up in this period.'}
            </div>
          </div>
          <div>
            <button 
                onClick={() => setShowTallyModal(true)}
                style={{
                  padding: '10px 20px', 
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                  color: '#ffffff', 
                  border: 'none', 
                  borderRadius: 50, 
                  cursor: 'pointer', 
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)'; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)'; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Mark Khata Tally
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 1.2fr) minmax(75px, 1fr) minmax(75px, 1fr)',
              gap: 8,
              padding: '8px 10px',
              background: 'var(--primary-bg, #f8fafc)',
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
            <div style={{ color: 'var(--danger, #b91c1c)', textAlign: 'center' }}>
              Work Billed
              <div style={{ fontWeight: 500, opacity: 0.85 }}>(to owner)</div>
            </div>
            <div style={{ color: 'var(--success, #047857)', textAlign: 'center' }}>
              In
              <div style={{ fontWeight: 500, opacity: 0.85 }}>(from owner)</div>
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
                <div
                  key={t.rowKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 1.2fr) minmax(75px, 1fr) minmax(75px, 1fr)',
                    gap: 8,
                    padding: '12px 10px',
                    background: 'var(--card-bg, #fff)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    alignItems: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formattedDate}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {subtitle}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid var(--danger-bg, #fecaca)',
                          background: 'var(--card-bg)',
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Bal. {t.balanceAfter < 0 ? '-' : ''}
                        {formatMoney(t.balanceAfter)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      color: billed ? 'var(--danger, #b91c1c)' : 'var(--text-muted)',
                    }}
                  >
                    {billed ? formatMoney(billed) : '—'}
                  </div>

                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      color: received ? 'var(--success, #047857)' : 'var(--text-muted)',
                    }}
                  >
                    {received ? formatMoney(received) : '—'}
                  </div>
                </div>
              );
            })}
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
    </Modal>
  );
}
