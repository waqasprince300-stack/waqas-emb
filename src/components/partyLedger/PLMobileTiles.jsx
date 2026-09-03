import React from 'react';
import { EmptyState } from '../UI';
import LazyReceiptThumb from '../receipt/LazyReceiptThumb';
import { getPartyLedgerBillDisplay } from '../../utils/partyBillPrivacy';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import { formatDisplayDate } from '../../utils/dateFilters';
import {
  partyFacingLedgerDisplayLabel,
} from '../../utils/partyFacingLabels';

/** Party UI label for ledger display statuses. */
function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

/** Admin/workspace lot still awaiting dispatch. */
function adminLotNotDispatched(lot) {
  return (
    String(lot?.status || '')
      .toLowerCase()
      .trim() === 'pending'
  );
}

/**
 * PLMobileTiles — Renders the tile-view for mobile Party Ledger.
 * Pure render component — all data and callbacks come from props.
 */
export default function PLMobileTiles({
  filtered,
  paginatedLots,
  ledgerPartyEdits,
  isParty,
  isAdmin,
  showPartyNameCol,
  // Helper callbacks from parent
  getDisplayStatus,
  getPartyNameLocal,
  getDisplayCompleteDate,
  getPartyAllotDate,
  showWorkspaceColForLot,
  workspaceNameForLot,
  // Action callbacks from parent
  openEdit,
  handleRowStatusChange,
  handleDirectBillUpload,
  setReceiptPreview,
  setRevisionRequest,
  setRevisionReview,
  renderLotPicturesButton,
  // Utils
  getPartyLedgerBillNumeric,
}) {
  return (
    <div className="tiles-grid mobile-only-tiles">
      {filtered.length === 0 ? (
        <EmptyState message={isParty ? 'No lots found' : 'No assigned lots found'} />
      ) : (
        paginatedLots.map((l) => {
          const pe = ledgerPartyEdits[l.id] || {};
          const displayStatus = getDisplayStatus(l);
          const partyBillOnly = getPartyLedgerBillDisplay(pe);
          const displayComplete = getDisplayCompleteDate(l, pe);

          return (
            <div key={`pl-tile-${l.id}`} className="lot-tile-card">
              <div className="lot-tile-header">
                <div>
                  <div className="lot-tile-number">Lot #{l.lotNo || l.lotNumber}</div>
                  {l.designNo ? <div className="lot-tile-design">Design #{l.designNo}</div> : null}
                </div>
                <div>
                  {displayStatus === 'Completed' ? (
                    <span className="badge-completed">Completed</span>
                  ) : displayStatus === 'Pending review' ? (
                    <span className="badge-review">{partyFacingStatusLabel('Pending review', isParty)}</span>
                  ) : (
                    <span className="badge-status">{partyFacingStatusLabel(displayStatus, isParty)}</span>
                  )}
                </div>
              </div>

              <div className="lot-tile-body">
                <div className="lot-tile-chips hide-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, overflow: 'hidden', paddingBottom: 4 }}>
                  <span className="fabric-chip">{l.fabric || l.itemType || 'Lawn'}</span>
                  <span className="info-chip">Col: {l.colors || 0}</span>
                  <span className="info-chip">Pcs: {l.pieces || 0}</span>
                </div>

                <div className="lot-tile-info" style={{ flex: 1, marginTop: 4, marginBottom: 8 }}>
                  {showPartyNameCol && <div>Party: <strong>{getPartyNameLocal(l.partyId, l.partyName)}</strong></div>}
                  {showWorkspaceColForLot(l) && <div>Workspace: <strong>{workspaceNameForLot(l)}</strong></div>}
                  <div>Allot Date: {getPartyAllotDate(l) ? formatDisplayDate(getPartyAllotDate(l)) : '\u2014'}</div>
                  <div>Complete Date: {displayComplete ? formatDisplayDate(displayComplete) : '\u2014'}</div>
                  {l.description && <div>Note: {l.description}</div>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
                    <LazyReceiptThumb
                      lotId={l.id}
                      receipt={pe.receipt}
                      hasReceipt={pe.hasReceipt}
                      businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                      lotLabel={l.lotNo || l.lotNumber}
                      onOpen={setReceiptPreview}
                      emptyLabel={isParty && displayStatus !== 'Pending' ? 'Add bill' : 'No bill'}
                      onUpload={isParty && displayStatus !== 'Pending' ? (f) => handleDirectBillUpload(l, f) : undefined}
                    />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {displayStatus !== 'Pending' && renderLotPicturesButton(l, pe)}
                      {displayStatus !== 'Completed' && !(displayStatus === 'Pending' && isParty) && (
                        <button
                          type="button"
                          className="btn-tile-action"
                          style={{ height: 'auto', minHeight: 24, padding: '2px 12px' }}
                          onClick={() => openEdit(l, displayStatus)}
                        >
                          Edit
                        </button>
                      )}
                      {displayStatus === 'Completed' && isParty && (
                        (() => {
                          const req = pe.billRevisionRequest;
                          const st = String(req?.status || '').toLowerCase();
                          if (st === 'pending') {
                            return (
                              <span style={{ fontSize: 12, color: 'var(--warning, #92400e)', fontWeight: 600 }}>
                                Change requested
                              </span>
                            );
                          }
                          return (
                            <button
                              onClick={() =>
                                setRevisionRequest({ lot: l, newAmount: String(getPartyLedgerBillNumeric(pe) ?? ''), reason: '' })
                              }
                              style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: 'var(--primary-bg, #FFF7ED)', color: 'var(--warning, #c2410c)', border: '1px solid var(--warning-bg, #fed7aa)', fontFamily: 'Inter, sans-serif' }}
                            >
                              {st === 'rejected' ? 'Request again' : 'Request bill change'}
                            </button>
                          );
                        })()
                      )}
                      {isAdmin && pe.billRevisionRequest && String(pe.billRevisionRequest.status || '').toLowerCase() === 'pending' && (
                        <button
                          onClick={() => setRevisionReview({ lot: l, updateOwnerBill: true, useCustomOwner: false, customOwnerAmount: '', rejectionNote: '' })}
                          style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', background: 'var(--warning, #f59e0b)', color: 'var(--card-bg, #ffffff)', border: 'none', fontFamily: 'Inter, sans-serif' }}
                        >
                          Review request
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lot-tile-bill">
                  <span style={{ fontSize: 13, color: 'var(--text-muted, #64748b)' }}>{isParty ? 'Your ledger:' : 'Bill Amount:'}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <strong style={{ fontSize: 16, color: 'var(--primary, #1e40af)' }}>
                      {partyBillOnly == null ? '\u2014' : `₨${partyBillOnly.toLocaleString()}`}
                    </strong>
                    {pe.billRevisionRequest && String(pe.billRevisionRequest.status || '').toLowerCase() === 'pending' && (
                      <div style={{ fontSize: 11, color: 'var(--warning, #b45309)', marginTop: 2 }}>
                        Change requested: ₨{pe.billRevisionRequest.fromAmount} → ₨{pe.billRevisionRequest.toAmount}
                      </div>
                    )}
                    {pe.billRevisionRequest && String(pe.billRevisionRequest.status || '').toLowerCase() === 'rejected' && (
                      <div style={{ fontSize: 11, color: 'var(--danger, #b91c1c)', marginTop: 2 }}>
                        Change request rejected
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lot-tile-footer" style={{ justifyContent: 'flex-end' }}>
                {displayStatus !== 'Completed' && displayStatus !== 'Pending review' && !(displayStatus === 'Pending' && isParty) && (
                  <select
                    className="form-select"
                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, width: '100%', maxWidth: '100%', textAlign: 'center' }}
                    value={displayStatus === 'Rejected' ? 'Rejected' : displayStatus}
                    onChange={(e) => handleRowStatusChange(l, e.target.value)}
                  >
                    {displayStatus === 'Rejected' && (
                      <option value="Rejected" disabled style={{ fontWeight: 600, color: 'var(--danger, #b91c1c)' }}>
                        {partyFacingStatusLabel('Rejected', isParty)}
                      </option>
                    )}
                    {!(isParty && displayStatus === 'In Progress') && (
                      <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
                    )}
                    {isParty && adminLotNotDispatched(l) && displayStatus === 'In Progress' ? (
                      <option value="In Progress">{partyFacingStatusLabel('In Progress', isParty)}</option>
                    ) : null}
                    {!(isParty && adminLotNotDispatched(l)) ? (
                      <option value="In Progress">{partyFacingStatusLabel('In Progress', isParty)}</option>
                    ) : null}
                    <option value="Completed">{isParty ? 'Submit for review' : 'Completed'}</option>
                  </select>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
