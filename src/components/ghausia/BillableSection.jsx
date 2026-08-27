import React from 'react';
import Loader from '../Loader';

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
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Billable to Owner — <span style={{ color: 'var(--primary)' }}>{billable.length} lots</span> · Total: ₨
              {billableTotal.toLocaleString()}
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
                    <span className="billable-row-title" style={{ flex: '1 1 auto', color: 'var(--text-primary)' }}>
                      <strong>{l.lotNumber || l.lotNo} / {l.designNo}</strong> —{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>{l.partyName || '—'}</span>
                    </span>
                  <div className="billable-row-right" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {(() => {
                      const settled = getOwnerSettledAmount(l);
                      return partyEdits[l.id]?.amountChangeNote ? (
                        <div style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
                          <strong>{renderOwnerUnpaidBalance(l)}</strong>
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
                          <strong style={{ color: 'var(--text-primary)' }}>
                            {renderOwnerUnpaidBalance(l)}
                          </strong>
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
