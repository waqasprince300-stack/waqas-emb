import React from 'react';
import { Modal } from '../UI';
import { latestDateFrom, formatDisplayDateTime } from '../../utils/dateFilters';
import { getBusinessBillAmount } from '../../utils/partyBillPrivacy';

export default function OwnerLedgerModal({ ownerId, ownerName, payments, lots, onClose }) {
  // Build raw rows
  const raw = [];

  // Filter payments for this owner
  // Only payments where type === 'Received' or 'Paid' and party === 'Owner'
  const ownerPayments = payments.filter((p) => {
    const isOwnerParty = String(p.party || '').toLowerCase().trim() === 'owner';
    const pWid = p.businessOwnerId?._id || p.businessOwnerId || p.ownerWorkspaceId || p.ownerWorkspace?._id || '';
    const matchesWorkspace = String(pWid) === String(ownerId);
    
    // Ignore auto-generated payments for settled lots because we already iterate over lots separately.
    const isAutoBill = p.type === 'Paid' && String(p.note || '').trim().startsWith('Billable lot settled');
    
    return isOwnerParty && matchesWorkspace && !isAutoBill;
  });

  ownerPayments.forEach((p) => {
    const when = latestDateFrom(p, ['updatedAt', 'date']);
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
      billed: isReceived ? 0 : amt, // Paid to owner (acts like bill, increases what they owe us)
    });
  });

  // Filter lots for this owner
  const ownerLots = lots.filter((l) => {
    const matchesWorkspace =
      String(l.businessOwnerId || l.ownerWorkspaceId || '') === String(ownerId);
    const statusLower = String(l.status || '').toLowerCase().trim();
    const isBillable = ['completed', 'settled', 'dispatched'].includes(statusLower);
    return matchesWorkspace && isBillable;
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
  const displayRows = [...withBalance].reverse();
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(145px, 1.2fr) minmax(88px, 1fr) minmax(88px, 1fr)',
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
                  : `Lot ${t.lotNo || '—'} / ${t.designNo || '—'} · ${t.status || ''}`;
              
              const billed = t.billed > 0 ? t.billed : null;
              const received = t.received > 0 ? t.received : null;

              let formattedDate = '—';
              if (when) {
                formattedDate = formatDisplayDateTime(when).replace(/ pm/i, ' PM').replace(/ am/i, ' AM');
              }

              return (
                <div
                  key={t.rowKey}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(145px, 1.2fr) minmax(88px, 1fr) minmax(88px, 1fr)',
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formattedDate}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
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
    </Modal>
  );
}
