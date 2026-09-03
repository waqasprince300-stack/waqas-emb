import React from 'react';
import { EmptyState } from '../UI';
import LazyReceiptThumb from '../receipt/LazyReceiptThumb';
import { receiptPreviewKind } from '../receipt/ReceiptThumb';
import { getPartyLedgerBillDisplay } from '../../utils/partyBillPrivacy';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import { formatDisplayDate } from '../../utils/dateFilters';
import {
  partyFacingLedgerDisplayLabel,
} from '../../utils/partyFacingLabels';
// removed unused import

/** Party UI label for ledger display statuses. */
function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

/** Admin/workspace lot still awaiting dispatch — party must not self-set "In Progress". */
function adminLotNotDispatched(lot) {
  return (
    String(lot?.status || '')
      .toLowerCase()
      .trim() === 'pending'
  );
}

/**
 * PLDesktopTable — Renders the desktop lot table for Party Ledger.
 * Pure render component — all data and callbacks come from props.
 */
export default function PLDesktopTable({
  filtered,
  paginatedLots,
  ledgerTableColSpan,
  ledgerPartyEdits,
  isParty,
  isAdmin,
  showPartyNameCol,
  showWorkspaceCol,
  highlightLotId,
  billPicSavingLotId,
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
  savePartyLotReceiptFromFile,
  removePartyLotReceipt,
  setReceiptPreview,
  setRevisionRequest,
  setRevisionReview,
  renderLotPicturesButton,
  // Utils
  getPartyLedgerBillNumeric,
  pendingRevisionIsReal,
}) {
  return (
    <div className="table-wrapper desktop-only-table">
      <div className="table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Lot No</th>
              <th>Design No</th>
              <th>Description</th>
              <th>Fabric</th>
              <th>Colors</th>
              <th>Pieces</th>
              <th>Allot Date</th>
              <th>Complete Date</th>
              {showPartyNameCol ? <th>Party Name</th> : null}
              {showWorkspaceCol && (
                <th style={{ minWidth: 120 }} title="Business workspace">
                  {isParty ? 'Business' : 'Workspace'}
                </th>
              )}
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>
                {isParty ? 'Your ledger (₨)' : 'Bill Amount'}
              </th>
              <th>Receipt</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={ledgerTableColSpan}>
                  <EmptyState message={isParty ? 'No lots found' : 'No assigned lots found'} />
                </td>
              </tr>
            ) : (
              paginatedLots.map((l) => {
                const pe = ledgerPartyEdits[l.id] || {};
                const displayStatus = getDisplayStatus(l);
                const partyBillOnly = getPartyLedgerBillDisplay(pe);
                const displayComplete = getDisplayCompleteDate(l, pe);
                return (
                  <tr
                    key={l.id}
                    id={`pl-lot-row-${l.id}`}
                    style={
                      String(highlightLotId) === String(l.id)
                        ? { background: 'var(--warning-bg, #fef3c7)', outline: '2px solid var(--warning, #f59e0b)' }
                        : undefined
                    }
                  >
                    <td style={{ fontWeight: 700, color: 'var(--primary, #1e40af)', whiteSpace: 'nowrap' }}>
                      {l.lotNo || l.lotNumber}
                    </td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{l.designNo}</td>
                    <td className="desc-col">{l.description}</td>
                    <td>
                      <span
                        style={{
                          background: 'var(--primary-bg, #f0f9ff)',
                          color: 'var(--primary-light, #0369a1)',
                          border: '1px solid var(--border, #bae6fd)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 12,
                        }}
                      >
                        {l.fabric || l.itemType}
                      </span>
                    </td>
                    <td>{l.colors}</td>
                    <td>{l.pieces}</td>
                    <td>
                      {getPartyAllotDate(l) ? (
                        formatDisplayDate(getPartyAllotDate(l))
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {displayComplete ? (
                        formatDisplayDate(displayComplete)
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                      )}
                    </td>
                    {showPartyNameCol ? (
                      <td>{getPartyNameLocal(l.partyId, l.partyName)}</td>
                    ) : null}
                    {showWorkspaceCol && (
                      <td
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {showWorkspaceColForLot(l) ? workspaceNameForLot(l) : '\u2014'}
                      </td>
                    )}
                    <td>
                      {displayStatus === 'Completed' ? (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'green',
                            marginTop: 3,
                            fontWeight: '500',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--success-bg, #dcfce7)',
                            border: '1px solid var(--success-bg, #dcfce7)',
                          }}
                        >
                          Completed
                        </span>
                      ) : displayStatus === 'Pending review' ? (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--warning, #92400e)',
                            marginTop: 3,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--warning-bg, #fef3c7)',
                            border: '1px solid var(--warning-bg, #fcd34d)',
                          }}
                        >
                          {partyFacingStatusLabel('Pending review', isParty)}
                        </span>
                      ) : displayStatus === 'Pending' && isParty ? (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--warning, #b45309)',
                            marginTop: 3,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--warning-bg, #fef3c7)',
                            border: '1px solid var(--warning-bg, #fcd34d)',
                          }}
                        >
                          {partyFacingStatusLabel('Pending', isParty)}
                        </span>
                      ) : (
                        <select
                          className="form-select"
                          style={{
                            width: 150,
                            minWidth: 150,
                            fontSize: 12,
                            padding: '5px 8px',
                          }}
                          value={displayStatus === 'Rejected' ? 'Rejected' : displayStatus}
                          onChange={(e) => handleRowStatusChange(l, e.target.value)}
                        >
                          {displayStatus === 'Rejected' && (
                            <option
                              value="Rejected"
                              disabled
                              style={{ fontWeight: 600, color: 'var(--danger, #b91c1c)' }}
                            >
                              {partyFacingStatusLabel('Rejected', isParty)}
                            </option>
                          )}
                          {!(isParty && displayStatus === 'In Progress') ? (
                            <option value="Pending">
                              {partyFacingStatusLabel('Pending', isParty)}
                            </option>
                          ) : null}
                          {isParty &&
                            adminLotNotDispatched(l) &&
                            displayStatus === 'In Progress' ? (
                            <option value="In Progress">
                              {partyFacingStatusLabel('In Progress', isParty)}
                            </option>
                          ) : null}
                          {!(isParty && adminLotNotDispatched(l)) ? (
                            <option value="In Progress">
                              {partyFacingStatusLabel('In Progress', isParty)}
                            </option>
                          ) : null}
                          <option value="Completed">
                            {isParty ? 'Submit for review' : 'Completed'}
                          </option>
                        </select>
                      )}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: 'var(--primary, #1e40af)',
                      }}
                    >
                      {partyBillOnly == null ? (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>&mdash;</span>
                      ) : (
                        `₨${partyBillOnly.toLocaleString()}`
                      )}
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          minWidth: 132,
                          maxWidth: 200,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          <LazyReceiptThumb
                            lotId={l.id}
                            receipt={pe.receipt}
                            hasReceipt={pe.hasReceipt}
                            businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                            lotLabel={l.lotNo || l.lotNumber}
                            onOpen={setReceiptPreview}
                            emptyLabel="No bill"
                          />
                          {pe.receipt && receiptPreviewKind(pe.receipt) === 'filename' && (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                maxWidth: 120,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={pe.receipt}
                            >
                              {pe.receipt}
                            </span>
                          )}
                          {isAdmin || (isParty && displayStatus !== 'Completed' && displayStatus !== 'Pending') ? (
                            <>
                              <input
                                id={`pl-bill-${l.id}`}
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                style={{ display: 'none' }}
                                disabled={billPicSavingLotId === l.id}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) void savePartyLotReceiptFromFile(l, f);
                                }}
                              />
                              <label
                                htmlFor={`pl-bill-${l.id}`}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: billPicSavingLotId === l.id ? 'wait' : 'pointer',
                                  color: 'var(--primary-light, #0369a1)',
                                  textDecoration: 'underline',
                                  textUnderlineOffset: 2,
                                }}
                              >
                                {billPicSavingLotId === l.id
                                  ? 'Saving\u2026'
                                  : pe.receipt
                                    ? 'Change'
                                    : 'Add bill'}
                              </label>
                              {pe.receipt ? (
                                <button
                                  type="button"
                                  onClick={() => removePartyLotReceipt(l)}
                                  disabled={billPicSavingLotId === l.id}
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--danger, #b91c1c)',
                                    cursor: billPicSavingLotId === l.id ? 'wait' : 'pointer',
                                    padding: '2px 4px',
                                  }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        {renderLotPicturesButton(l, pe, { alignSelf: 'flex-start' })}
                      </div>
                    </td>
                    <td>
                      {pe.notes}
                      {displayStatus === 'Rejected' && l.rejectionNote ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--danger, #b91c1c)',
                            marginTop: 6,
                            fontWeight: 600,
                            lineHeight: 1.4,
                          }}
                        >
                          {isParty ? 'Business: ' : 'Admin: '}
                          {l.rejectionNote}
                        </div>
                      ) : null}
                      {pe.amountChangeNote && (
                        <div style={{ fontSize: 11, color: 'var(--warning, #92400e)', marginTop: 4 }}>
                          Amount changed: ₨
                          {Number(pe.amountChangeNote.previousAmount || 0).toLocaleString()} to ₨
                          {Number(pe.amountChangeNote.updatedAmount || 0).toLocaleString()}
                        </div>
                      )}
                      {isAdmin && pendingRevisionIsReal(pe) && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--primary-light, #0369a1)',
                            marginTop: 4,
                            fontWeight: 600,
                          }}
                        >
                          Party revised bill: ₨
                          {Number(pe.pendingRevision.fromAmount || 0).toLocaleString()} → ₨
                          {Number(pe.pendingRevision.toAmount || 0).toLocaleString()} (settle on
                          approval)
                        </div>
                      )}
                      {pe.billRevisionRequest &&
                        String(pe.billRevisionRequest.status || '').toLowerCase() ===
                        'pending' && (
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--warning, #92400e)',
                              marginTop: 4,
                              fontWeight: 600,
                            }}
                          >
                            Bill change request: ₨
                            {Number(pe.billRevisionRequest.fromAmount || 0).toLocaleString()} → ₨
                            {Number(pe.billRevisionRequest.toAmount || 0).toLocaleString()}
                            {pe.billRevisionRequest.reason
                              ? ` \u2014 ${pe.billRevisionRequest.reason}`
                              : ''}
                          </div>
                        )}
                      {pe.billRevisionRequest &&
                        String(pe.billRevisionRequest.status || '').toLowerCase() ===
                        'rejected' && (
                          <div style={{ fontSize: 11, color: 'var(--danger, #b91c1c)', marginTop: 4 }}>
                            Bill change request rejected
                            {pe.billRevisionRequest.rejectionNote
                              ? `: ${pe.billRevisionRequest.rejectionNote}`
                              : ''}
                          </div>
                        )}
                    </td>
                    <td>
                      {displayStatus === 'Completed' && isParty ? (
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
                                setRevisionRequest({
                                  lot: l,
                                  newAmount: String(getPartyLedgerBillNumeric(pe) ?? ''),
                                  reason: '',
                                })
                              }
                              style={{
                                padding: '4px 12px',
                                fontSize: 12,
                                fontWeight: 600,
                                borderRadius: 6,
                                cursor: 'pointer',
                                background: 'var(--primary-bg, #FFF7ED)',
                                color: 'var(--warning, #c2410c)',
                                border: '1px solid var(--warning-bg, #fed7aa)',
                                fontFamily: 'Inter, sans-serif',
                              }}
                            >
                              {st === 'rejected' ? 'Request again' : 'Request bill change'}
                            </button>
                          );
                        })()
                      ) : displayStatus === 'Pending' && isParty ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>&mdash;</span>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          {isAdmin &&
                            pe.billRevisionRequest &&
                            String(pe.billRevisionRequest.status || '').toLowerCase() ===
                            'pending' && (
                              <button
                                onClick={() =>
                                  setRevisionReview({
                                    lot: l,
                                    updateOwnerBill: true,
                                    useCustomOwner: false,
                                    customOwnerAmount: '',
                                    rejectionNote: '',
                                  })
                                }
                                style={{
                                  padding: '4px 12px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  background: 'var(--warning, #f59e0b)',
                                  color: 'var(--card-bg, #ffffff)',
                                  border: 'none',
                                  fontFamily: 'Inter, sans-serif',
                                }}
                              >
                                Review request
                              </button>
                            )}
                          <button
                            onClick={() => openEdit(l)}
                            style={{
                              padding: '4px 12px',
                              fontSize: 12,
                              fontWeight: 500,
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: 'var(--primary-bg, #eff6ff)',
                              color: 'var(--primary, #1e40af)',
                              border: '1px solid var(--border, #bfdbfe)',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
