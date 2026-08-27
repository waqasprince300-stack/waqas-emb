import React from 'react';
import Loader from '../Loader';

export default function SummaryCards({
  showSummaryCards,
  visibleLots,
  billable,
  billableTotal,
  ownerReceivedNet,
  ownerReceivedIsPending,
  statsRefreshing,
}) {
  return (
    <div style={{ position: 'relative', marginBottom: 22 }}>
      {statsRefreshing && (
        <div
          aria-busy="true"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(2px)',
            borderRadius: 12,
            pointerEvents: 'none',
          }}
        >
          <Loader />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Updating…
          </span>
        </div>
      )}
      {showSummaryCards && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
        {[
          { label: 'Total Lots', value: visibleLots.length, color: 'var(--primary, #1e40af)' },
          { label: 'Billable Lots', value: billable.length, color: 'var(--danger, #dc2626)' },
          {
            label: 'Billable Amount',
            value: `₨${billableTotal.toLocaleString()}`,
            color: 'var(--danger, #dc2626)',
          },
          {
            label: 'Received from Owner',
            value: ownerReceivedIsPending
              ? 'Pending to owner'
              : `₨${ownerReceivedNet.toLocaleString()}`,
            color: ownerReceivedIsPending ? 'var(--warning, #d97706)' : 'var(--success, #15803d)',
          },
          {
            label: `${billableTotal - ownerReceivedNet >= 0 ? 'Receivable from Owner' : 'Advance from Owner'}`,
            value: `₨${(billableTotal - ownerReceivedNet).toLocaleString()}`,
            color: billableTotal - ownerReceivedNet >= 0 ? 'var(--success, #15803d)' : 'var(--danger, #dc2626)',
          },
        ].map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
