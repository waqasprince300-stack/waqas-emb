import React from 'react';
import Loader from '../Loader';
import { useApp } from '../../context/AppContext';
import { formatLakhCrore } from '../../utils/numberToWords';

export default function SummaryCards({
  showSummaryCards,
  visibleLots,
  billable,
  billableTotal,
  ownerReceivedNet,
  ownerIn,
  ownerPaidToOwner,
  billableSettledTotal,
  statsRefreshing,
}) {
  const { viewAllWorkspaces, activeBusinessOwnerId, businessOwners } = useApp();
  const ownerLabel = viewAllWorkspaces
    ? "All Owners"
    : businessOwners?.find(o => String(o.id || o._id) === String(activeBusinessOwnerId))?.name || "Owner";

  // Total cash received from this owner
  const totalReceivedCash = ownerIn != null ? ownerIn : 0;

  // Total completed work billed for this owner
  const completedWorkBilled = (billableSettledTotal != null ? billableSettledTotal : 0) + (ownerPaidToOwner != null ? ownerPaidToOwner : 0);

  // Net balance between owner work billed and received cash
  // Positive: Owner owes us (Receivable)
  // Negative: Owner has advance surplus (Advance)
  const netBalance = billableTotal - ownerReceivedNet;
  const netReceivable = netBalance > 0 ? netBalance : 0;
  const advanceAvailable = netBalance < 0 ? Math.abs(netBalance) : 0;

  // Financial Collection / Recovery Rate KPI
  const recoveryPercent = completedWorkBilled > 0
    ? Math.min(100, Math.round((totalReceivedCash / completedWorkBilled) * 1000) / 10)
    : 0;
  const pendingPercent = Math.max(0, Math.round((100 - recoveryPercent) * 10) / 10);

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
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
            }}
          >
            {[
              {
                label: 'Total Lots',
                value: visibleLots.length,
                color: 'var(--primary, #f5b989)',
                note: 'In current filter',
              },
              {
                label: 'Total Work Billed',
                value: `₨${completedWorkBilled.toLocaleString()}`,
                lakhCrore: formatLakhCrore(completedWorkBilled),
                color: 'var(--primary-light, #ffccaa)',
                note: 'Completed lots bill',
              },
              {
                label: `Received from ${ownerLabel}`,
                value: `₨${totalReceivedCash.toLocaleString()}`,
                lakhCrore: formatLakhCrore(totalReceivedCash),
                color: 'var(--success, #81c995)',
                note: 'Total cash received',
                badge: recoveryPercent > 0 ? `${recoveryPercent}% Collected` : null,
                badgeBg: 'var(--success-bg, rgba(51, 75, 56, 0.6))',
                badgeColor: 'var(--success, #81c995)',
                badgeBorder: 'rgba(129, 201, 149, 0.35)',
              },
              {
                label: netReceivable > 0 ? `Receivable from ${ownerLabel}` : `Advance from ${ownerLabel}`,
                value: netReceivable > 0 ? `₨${netReceivable.toLocaleString()}` : `₨${advanceAvailable.toLocaleString()}`,
                lakhCrore: formatLakhCrore(netReceivable > 0 ? netReceivable : advanceAvailable),
                color: netReceivable > 0 ? 'var(--danger, #f28b82)' : 'var(--warning, #fde293)',
                note: netReceivable > 0
                  ? 'Baqi udhaar (Work − Received)'
                  : 'Advance surplus',
                badge: netReceivable > 0 && pendingPercent > 0 ? `${pendingPercent}% Pending` : null,
                badgeBg: 'var(--danger-bg, rgba(90, 48, 48, 0.6))',
                badgeColor: 'var(--danger, #f28b82)',
                badgeBorder: 'rgba(242, 139, 130, 0.35)',
              },
              {
                label: 'Billable Lots',
                value: billable.length > 0 ? `${billable.length} (₨${billableTotal.toLocaleString()})` : '0',
                lakhCrore: formatLakhCrore(billableTotal),
                color: billable.length > 0 ? 'var(--warning, #fde293)' : 'var(--text-secondary, #c2b6b1)',
                note: billable.length > 0 ? 'Awaiting completion/bill' : 'No lots awaiting bill',
              },
            ].map((c) => (
              <div
                key={c.label}
                className="stat-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '16px 18px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius, 12px)',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div
                      className="stat-label"
                      style={{
                        textTransform: 'uppercase',
                        fontSize: 11.5,
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        color: 'var(--text-secondary, #c2b6b1)',
                        margin: 0,
                      }}
                    >
                      {c.label}
                    </div>
                    {c.badge && (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 999,
                          background: c.badgeBg,
                          color: c.badgeColor,
                          border: `1px solid ${c.badgeBorder}`,
                          letterSpacing: '0.01em',
                        }}
                      >
                        {c.badge}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 7,
                      flexWrap: 'wrap',
                      marginTop: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: c.color,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.15,
                      }}
                    >
                      {c.value}
                    </span>
                    {c.lakhCrore && (
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
                        {c.lakhCrore}
                      </span>
                    )}
                  </div>
                </div>
                {c.note && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary, #c2b6b1)',
                      marginTop: 8,
                      lineHeight: 1.35,
                    }}
                  >
                    {c.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Cash Recovery Visual Progress Bar (Theme-aligned Executive KPI) */}
          {completedWorkBilled > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: '12px 18px',
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius, 12px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: 'var(--shadow)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 13,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text-primary, #e6dfdb)' }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: 'var(--success, #81c995)',
                      display: 'inline-block',
                      boxShadow: '0 0 8px rgba(129, 201, 149, 0.7)',
                    }}
                  />
                  <span>Cash Recovery Rate:</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: 'var(--success, #81c995)',
                      background: 'var(--success-bg, rgba(51, 75, 56, 0.6))',
                      border: '1px solid rgba(129, 201, 149, 0.35)',
                      padding: '2px 9px',
                      borderRadius: 999,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {recoveryPercent}% Recovered
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #c2b6b1)' }}>
                  {recoveryPercent >= 100 ? (
                    <span style={{ color: 'var(--success, #81c995)', fontWeight: 700 }}>✓ 100% Fully Settled</span>
                  ) : (
                    <span>
                      Baqi sirf <strong style={{ color: 'var(--danger, #f28b82)', fontWeight: 700 }}>{pendingPercent}%</strong> collect karna rehta hai
                    </span>
                  )}
                </div>
              </div>

              {/* Recovery Progress Bar */}
              <div
                style={{
                  height: 7,
                  background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                  borderRadius: 999,
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, recoveryPercent))}%`,
                    background: 'linear-gradient(90deg, var(--success, #81c995) 0%, #34d399 100%)',
                    borderRadius: 999,
                    transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


