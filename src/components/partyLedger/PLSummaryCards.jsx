import React from 'react';
import { formatLakhCrore } from '../../utils/numberToWords';

/**
 * PLSummaryCards — Renders the summary stat cards grid for Party Ledger.
 * Pure render component — all data comes from props.
 */
export default function PLSummaryCards({ totals, partyBalanceInfo, isParty }) {
  return (
    <div className="pl-grid">
      {[
        {
          key: 'assigned',
          label: isParty ? 'My lots' : 'Assigned Lots',
          value: totals.lots,
          color: 'var(--primary, #1e40af)',
          sub: 'Overall (not limited by Status filter)',
        },
        {
          key: 'bill',
          label: isParty ? 'Your ledger total' : 'Total Bill Value',
          value: `₨${(totals.billTotal ?? 0).toLocaleString()}`,
          numValue: totals.billTotal,
          color: 'var(--purple, #7c3aed)',
          sub: 'All lots in this view',
        },
        {
          key: 'completed',
          label: (
            <>
              Completed{' '}
              <strong style={{ fontSize: 14, color: 'var(--success, #15803d)' }}>({totals.completed ?? 0})</strong>
            </>
          ),
          value: `₨${(totals.completedAmount ?? 0).toLocaleString()}`,
          numValue: totals.completedAmount,
          color: 'var(--success, #15803d)',
        },
        {
          key: 'pending',
          label: (
            <>
              {isParty ? 'Not received yet' : 'Pending'}{' '}
              <strong style={{ fontSize: 14, color: 'var(--warning, #d97706)' }}>({totals.pending ?? 0})</strong>
            </>
          ),
          value: isParty ? 'Business has not sent this to you yet' : 'Awaiting dispatch',
          color: 'var(--warning, #d97706)',
        },
        {
          key: 'inprogress',
          label: (
            <>
              {isParty ? 'With you / in progress' : 'In Progress'}{' '}
              <strong style={{ fontSize: 14, color: 'var(--warning, #d97706)' }}>({totals.inProgress ?? 0})</strong>
            </>
          ),
          value: `₨${(totals.inProgressAmount ?? 0).toLocaleString()}`,
          numValue: totals.inProgressAmount,
          color: 'var(--warning, #d97706)',
        },
        {
          key: 'other-status',
          label: (
            <>
              {isParty ? 'Review / rework' : 'Pending review + Rejected'}{' '}
              <strong style={{ fontSize: 14, color: '#a16207' }}>({totals.otherCount ?? 0})</strong>
            </>
          ),
          value: totals.otherCount > 0 ? `₨${(totals.otherAmount ?? 0).toLocaleString()}` : 'None',
          numValue: totals.otherCount > 0 ? totals.otherAmount : null,
          color: '#a16207',
          sub:
            totals.otherCount > 0
              ? `${totals.pendingReview ?? 0} in review · ${totals.rejected ?? 0} rejected`
              : undefined,
        },
        {
          key: 'completed-lots-balance',
          label: `Completed lots ${(partyBalanceInfo?.completedNet ?? 0) >= 0
              ? `balance (${isParty ? 'owed to you' : 'still payable'})`
              : '(advance)'
            }`,
          value: `₨${(partyBalanceInfo?.completedNet ?? 0).toLocaleString()}`,
          numValue: partyBalanceInfo?.completedNet,
          color: `${(partyBalanceInfo?.completedNet ?? 0) >= 0 ? 'var(--success, #0f766e)' : 'var(--danger, #dc2626)'}`,
          sub: isParty 
            ? 'Your ledger (received - completed bill)' 
            : '(Calculated after deducting total advances from total payable)',
        },
        {
          key: 'overall-balance',
          label: `Overall balance ${(partyBalanceInfo?.balance ?? 0) >= 0
              ? `(${isParty ? 'owed to you' : 'still payable'})`
              : '(advance)'
            }`,
          value: `₨${(partyBalanceInfo?.balance ?? 0).toLocaleString()}`,
          numValue: partyBalanceInfo?.balance,
          color: `${(partyBalanceInfo?.balance ?? 0) >= 0 ? 'var(--success, #0f766e)' : 'var(--danger, #dc2626)'}`,
          sub: 'Overall ledger (Status filter does not change these totals).',
        },
      ].map((c) => (
        <div key={c.key} className="stat-card">
          <div className="stat-label">{c.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
            {c.numValue != null && formatLakhCrore(c.numValue) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1.5px 6px',
                  borderRadius: 6,
                  background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                  color: 'var(--text-secondary, #c2b6b1)',
                  border: '1px solid var(--border)',
                  letterSpacing: '0.01em',
                }}
              >
                {formatLakhCrore(c.numValue)}
              </span>
            )}
          </div>
          {c.sub && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 6,
                lineHeight: 1.35,
              }}
            >
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
