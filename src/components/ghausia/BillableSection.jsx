import React from 'react';
import Loader from '../Loader';
import { formatDisplayDate } from '../../utils/dateFilters';
import { getBusinessBillAmount } from '../../utils/partyBillPrivacy';
import { formatLakhCrore } from '../../utils/numberToWords';

export default function BillableSection({
  billable,
  billableTotal,
  billableCollapsed,
  setBillableCollapsed,
  billableSearch,
  setBillableSearch,
  billableFiltered,
  billablePageItems,
  billableSafePage,
  billablePageCount,
  setBillablePage,
  BILLABLE_PAGE_SIZE,
  highlightedBillableLotId,
  setHighlightedBillableLotId,
  setLotTableTab,
  setStatusFilter,
  setPartyFilter,
  setDateRange,
  completionPersistingLotId,
  handleCompleteFromBillable,
  getOwnerSettledAmount,
  renderOwnerUnpaidBalance,
  partyEdits,
}) {
  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div
        className="card-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <span className="card-title">
          Billable lots to Owner
          {billable.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#92600A' }}>
              ({billable.length})
            </span>
          )}
        </span>
        {billable.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setBillableCollapsed((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {billableCollapsed ? 'Show' : 'Hide'}
          </button>
        )}
      </div>
      {billable.length > 0 && !billableCollapsed && (
        <div
          style={{
            margin: '0',
            background: 'var(--card-bg)',
            border: '1px solid var(--primary)',
            borderRadius: 10,
            padding: 14,
            boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>
                Billable to Owner — <span style={{ color: 'var(--primary)' }}>{billable.length} lots</span> · Total: ₨{billableTotal.toLocaleString()}
              </span>
              {formatLakhCrore(billableTotal) && (
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
                  {formatLakhCrore(billableTotal)}
                </span>
              )}
            </div>
            <input
              type="text"
              value={billableSearch}
              onChange={(e) => setBillableSearch(e.target.value)}
              placeholder="Search lot, design, party…"
              style={{
                fontSize: 12.5,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--body-bg)',
                color: 'var(--text-primary)',
                minWidth: 200,
                flex: '0 1 240px',
              }}
            />
          </div>

          {billableFiltered.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>
              No billable lots match &quot;{billableSearch}&quot;.
            </div>
          ) : (
            <>
              <div style={{ marginTop: 8 }}>
                {billablePageItems.map((l) => {
                  const isHighlighted = highlightedBillableLotId === l.id;
                  const totalPieces = Number(l.pieces != null && l.pieces !== '' ? l.pieces : (l.quantity || 0));
                  const billAmt = getBusinessBillAmount(l) || Number(l.billAmount || 0);
                  let perPieceRate = 0;
                  if (l.rate && Number(l.rate) > 0) {
                    perPieceRate = Number(l.rate);
                  } else if (totalPieces > 0 && billAmt > 0) {
                    perPieceRate = billAmt / totalPieces;
                  }
                  const approveDate = l.completionApprovedAt || l.receivedBackDate || l.updatedAt;
                  const settled = getOwnerSettledAmount ? getOwnerSettledAmount(l) : 0;
                  const unpaidBal = Math.max(0, billAmt - settled);

                  return (
                    <div
                      key={l.id}
                      onClick={() => {
                        const nextId = isHighlighted ? null : l.id;
                        setHighlightedBillableLotId(nextId);
                        if (nextId) {
                          setLotTableTab('others');
                          setStatusFilter('All');
                          setPartyFilter('All');
                          setDateRange('all');
                        }
                      }}
                      className="billable-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'nowrap',
                        fontSize: 12,
                        padding: '10px 8px',
                        cursor: 'pointer',
                        background: isHighlighted ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'transparent',
                        borderBottom: isHighlighted ? '1px solid var(--primary)' : '1px solid var(--border)',
                        transition: 'background 0.2s',
                      }}
                    >
                    <div className="billable-row-title" style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {l.lotNumber || l.lotNo} / {l.designNo}
                        </strong>
                        <span style={{ color: 'var(--text-muted, #71717a)' }}>—</span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {l.partyName || '—'}
                        </span>
                      </div>

                      {/* Info Badges: Total Pieces, Rate / Pc, Approve Date */}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {/* Total Pieces */}
                        <span
                          title="Total Pieces"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                            color: 'var(--primary-light, #f5b989)',
                            border: '1px solid var(--border)',
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ opacity: 0.75 }}>Pcs:</span>
                          <strong>{totalPieces > 0 ? totalPieces.toLocaleString() : '0'}</strong>
                        </span>

                        {/* Per Piece Rate */}
                        <span
                          title="Per Piece Rate"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                            color: 'var(--success, #81c995)',
                            border: '1px solid var(--border)',
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ opacity: 0.75 }}>Rate:</span>
                          <strong>
                            {perPieceRate > 0
                              ? `₨${perPieceRate % 1 === 0 ? Math.round(perPieceRate).toLocaleString() : (Math.round(perPieceRate * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/pc`
                              : '—'}
                          </strong>
                        </span>

                        {/* Approve Date */}
                        {approveDate && (
                          <span
                            title="Approved Date"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                              color: 'var(--text-secondary, #c2b6b1)',
                              border: '1px solid var(--border)',
                              letterSpacing: '0.01em',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ opacity: 0.75 }}>Approved:</span>
                            <span>{formatDisplayDate(approveDate)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  <div className="billable-row-right" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {(() => {
                      return partyEdits[l.id]?.amountChangeNote ? (
                        <div style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
                            <strong style={{ fontSize: 13 }}>{renderOwnerUnpaidBalance(l)}</strong>
                            {formatLakhCrore(unpaidBal) && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 5,
                                  background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                                  color: 'var(--text-secondary, #c2b6b1)',
                                  border: '1px solid var(--border)',
                                  letterSpacing: '0.01em',
                                }}
                              >
                                {formatLakhCrore(unpaidBal)}
                              </span>
                            )}
                          </div>
                          {settled > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--success, #16a34a)', marginTop: 2 }}>
                              Owner already billed: ₨{settled.toLocaleString()}
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--warning)', marginTop: 2 }}>
                            Party ledger: Previous ₨
                            {Number(
                              partyEdits[l.id].amountChangeNote.previousAmount || 0
                            ).toLocaleString()}{' '}
                            → Updated ₨
                            {Number(
                              partyEdits[l.id].amountChangeNote.updatedAmount || 0
                            ).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end' }}>
                            <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                              {renderOwnerUnpaidBalance(l)}
                            </strong>
                            {formatLakhCrore(unpaidBal) && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: 5,
                                  background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                                  color: 'var(--text-secondary, #c2b6b1)',
                                  border: '1px solid var(--border)',
                                  letterSpacing: '0.01em',
                                }}
                              >
                                {formatLakhCrore(unpaidBal)}
                              </span>
                            )}
                          </div>
                          {settled > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--success, #16a34a)', marginTop: 2 }}>
                              Owner already billed: ₨{settled.toLocaleString()}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={completionPersistingLotId === l.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCompleteFromBillable(l);
                      }}
                      style={{ whiteSpace: 'nowrap', background: 'var(--primary)', color: 'var(--primary-text, #fff)', border: 'none', fontWeight: 600, padding: '4px 10px', fontSize: 11.5 }}
                    >
                      {completionPersistingLotId === l.id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Loader /> ...
                        </span>
                      ) : (
                        'Complete'
                      )}
                    </button>
                  </div>
                </div>
                  );
                })}
              </div>

                {billablePageCount > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginTop: 12,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Showing {(billableSafePage - 1) * BILLABLE_PAGE_SIZE + 1}–
                      {Math.min(billableSafePage * BILLABLE_PAGE_SIZE, billableFiltered.length)} of{' '}
                      {billableFiltered.length}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={billableSafePage <= 1}
                        onClick={() => setBillablePage((p) => Math.max(1, p - 1))}
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          opacity: billableSafePage <= 1 ? 0.5 : 1,
                        }}
                      >
                        ‹ Prev
                      </button>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {billableSafePage} / {billablePageCount}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={billableSafePage >= billablePageCount}
                        onClick={() => setBillablePage((p) => Math.min(billablePageCount, p + 1))}
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          opacity: billableSafePage >= billablePageCount ? 0.5 : 1,
                        }}
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
