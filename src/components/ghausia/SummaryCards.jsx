import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import Loader from '../Loader';
import { useApp } from '../../context/AppContext';
import { Modal } from '../UI';

export default function SummaryCards({
  showSummaryCards,
  visibleLots,
  billable,
  billableTotal,
  ownerReceivedNet,
  ownerReceivedIsPending,
  statsRefreshing,
}) {
  const { viewAllWorkspaces, activeBusinessOwnerId, businessOwners } = useApp();
  const ownerLabel = viewAllWorkspaces
    ? "All Owners"
    : businessOwners?.find(o => String(o.id || o._id) === String(activeBusinessOwnerId))?.name || "Owner";

  const [showChartModal, setShowChartModal] = useState(false);

  // Financial Chart Data
  let chartData = [];
  if (billableTotal > ownerReceivedNet) {
    chartData = [
      { name: 'Received', value: Math.max(0, ownerReceivedNet), color: 'var(--success, #15803d)' },
      { name: 'Remaining Receivable', value: billableTotal - ownerReceivedNet, color: 'var(--danger, #dc2626)' }
    ];
  } else {
    chartData = [
      { name: 'Work Done (Billable)', value: billableTotal, color: 'var(--primary, #1e40af)' },
      { name: 'Advance Received', value: ownerReceivedNet - billableTotal, color: 'var(--warning, #d97706)' }
    ];
  }

  // Filter out 0 values for cleaner pie chart
  chartData = chartData.filter(d => d.value > 0);

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div
            style={{
              flex: '1 1 500px',
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
              label: `Received from ${ownerLabel}`,
              value: `₨${Math.abs(ownerReceivedNet).toLocaleString()}`,
              color: 'var(--success, #15803d)',
            },
            {
              label: `${billableTotal - ownerReceivedNet >= 0 ? `Receivable from ${ownerLabel}` : `Balance of ${ownerLabel}`}`,
              value: `₨${Math.abs(billableTotal - ownerReceivedNet).toLocaleString()}`,
              color: billableTotal - ownerReceivedNet >= 0 ? 'var(--success, #15803d)' : 'var(--danger, #dc2626)',
            },
          ].map((c) => (
            <div key={c.label} className="stat-card">
              <div className="stat-label" style={{ textTransform: 'uppercase' }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
