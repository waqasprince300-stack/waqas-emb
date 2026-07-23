import React from 'react';

export default function LedgerSummaryCards({
  totalBillAmount,
  totalPaymentsReceived,
  netBalance,
  pendingRevisionCount,
  onOpenPendingRevisions,
  isParty,
}) {
  return (
    <div className="pk-summary-grid" style={{ marginBottom: 24 }}>
      <div className="pk-summary-card">
        <span className="pk-card-label">Total Bills</span>
        <span className="pk-card-value text-indigo">
          ₨ {Number(totalBillAmount || 0).toLocaleString()}
        </span>
      </div>

      <div className="pk-summary-card">
        <span className="pk-card-label">
          {isParty ? 'Total Payments Sent' : 'Total Payments Received'}
        </span>
        <span className="pk-card-value text-emerald">
          ₨ {Number(totalPaymentsReceived || 0).toLocaleString()}
        </span>
      </div>

      <div className="pk-summary-card">
        <span className="pk-card-label">Remaining Balance</span>
        <span
          className={`pk-card-value ${
            netBalance > 0 ? 'text-amber' : netBalance < 0 ? 'text-emerald' : ''
          }`}
        >
          ₨ {Number(netBalance || 0).toLocaleString()}
        </span>
      </div>

      {pendingRevisionCount > 0 && (
        <div
          className="pk-summary-card pending-revision-card"
          style={{ cursor: 'pointer', borderColor: '#f59e0b', backgroundColor: '#fffbe finished' }}
          onClick={onOpenPendingRevisions}
        >
          <span className="pk-card-label" style={{ color: '#d97706', fontWeight: 600 }}>
            Pending Revisions
          </span>
          <span className="pk-card-value" style={{ color: '#b45309' }}>
            {pendingRevisionCount} {pendingRevisionCount === 1 ? 'Request' : 'Requests'}
          </span>
        </div>
      )}
    </div>
  );
}
