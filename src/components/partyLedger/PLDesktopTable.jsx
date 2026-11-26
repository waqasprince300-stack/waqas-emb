import React from 'react';
import { EmptyState } from '../UI';
import LazyReceiptThumb from '../receipt/LazyReceiptThumb';
import { receiptPreviewKind } from '../receipt/ReceiptThumb';
import { VoiceNotePlayerPill } from '../voice/VoiceNoteControl';
import { getPartyLedgerBillDisplay } from '../../utils/partyBillPrivacy';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import { formatDisplayDate } from '../../utils/dateFilters';
import {
  partyFacingLedgerDisplayLabel,
} from '../../utils/partyFacingLabels';
// removed unused import

import { partyFacingStatusLabel, adminLotNotDispatched } from '../../utils/ledgerStatusHelpers';

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
  const colWeights = [
    9.0, // Lot No
    5.8, // Design No
    8.6, // Description
    5.2, // Fabric
    5.6, // Colors
    5.2, // Pieces
    7.0, // Allot Date
    7.0, // Complete Date
    ...(showPartyNameCol ? [7.0] : []),
    ...(showWorkspaceCol ? [6.8] : []),
    7.6, // Status
    6.9, // Bill Amount
    8.7, // Receipt
    9.4, // Notes
    8.0, // Actions
  ];
  const totalColWeight = colWeights.reduce((sum, w) => sum + w, 0);

  return (
    <div className="table-wrapper desktop-only-table">
      <div className="table-scroll">
        <table className="ledger-table fixed-grid-table pl-lots-table">
          <colgroup>
            {colWeights.map((w, idx) => (
              <col key={idx} style={{ width: `${((w / totalColWeight) * 100).toFixed(2)}%` }} />
            ))}
          </colgroup>
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
                <th title="Business workspace">
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
                    data-pl-lot-id={l.id}
                    className="stagger-item"
                    style={
                      String(highlightLotId) === String(l.id)
                        ? { background: 'var(--warning-bg, #fef3c7)', boxShadow: 'inset 0 0 0 2px var(--warning, #f59e0b)' }
                        : undefined
                    }
                  >
                    <td style={{ fontWeight: 700, color: 'var(--primary, #1e40af)', whiteSpace: 'nowrap' }}>
                      {l.lotNo || l.lotNumber}
                    </td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{l.designNo}</td>
                    <td className="desc-col">
                      <div className="table-cell-clamp-2" title={l.description || ''}>
                        {l.description}
                      </div>
                    </td>
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
                    <td style={{ whiteSpace: 'nowrap' }}>{l.colors}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.pieces}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {getPartyAllotDate(l) ? (
                        formatDisplayDate(getPartyAllotDate(l))
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {displayComplete ? (
                        formatDisplayDate(displayComplete)
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                      )}
                    </td>
                    {showPartyNameCol ? (
                      <td>
                        <span className="table-cell-ellipsis" title={getPartyNameLocal(l.partyId, l.partyName)}>
                          {getPartyNameLocal(l.partyId, l.partyName)}
                        </span>
                      </td>
                    ) : null}
                    {showWorkspaceCol && (
                      <td
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span className="table-cell-ellipsis" title={showWorkspaceColForLot(l) ? workspaceNameForLot(l) : ''}>
                          {showWorkspaceColForLot(l) ? workspaceNameForLot(l) : '\u2014'}
                        </span>
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
                            width: '100%',
                            minWidth: 0,
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
                        whiteSpace: 'nowrap',
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
                          gap: 6,
                          width: '100%',
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
                                  ? 'Saving...'
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
                      {pe.notes ? (
                        <div className="table-cell-clamp-2" title={pe.notes}>
                          {pe.notes}
                        </div>
                      ) : null}
                      {pe.adminNotes ? (
                        <div
                          className="table-cell-clamp-2"
                          title={pe.adminNotes}
                          style={{
                            fontSize: 11.5,
                            color: 'var(--primary, #1e40af)',
                            marginTop: pe.notes ? 4 : 0,
                          }}
                        >
                          <strong>Admin:</strong> {pe.adminNotes}
                        </div>
                      ) : null}
                      {(pe.hasPartyVoiceNote || pe.partyVoiceNote || pe.hasAdminVoiceNote || pe.adminVoiceNote) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          <VoiceNotePlayerPill
                            compact
                            lotId={l.id}
                            src={pe.partyVoiceNote || ''}
                            hasVoiceNote={Boolean(pe.hasPartyVoiceNote || pe.partyVoiceNote)}
                            duration={pe.partyVoiceNoteDuration || 0}
                            label="Party"
                            roleTone="party"
                            businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                            isParty={isParty}
                            locked={
                              isParty &&
                              ['completed', 'received back'].includes(
                                String(l.status || '').toLowerCase().trim()
                              )
                            }
                          />
                          <VoiceNotePlayerPill
                            compact
                            lotId={l.id}
                            src={pe.adminVoiceNote || ''}
                            hasVoiceNote={Boolean(pe.hasAdminVoiceNote || pe.adminVoiceNote)}
                            duration={pe.adminVoiceNoteDuration || 0}
                            label="Admin"
                            roleTone="admin"
                            businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                            isParty={isParty}
                          />
                        </div>
                      )}
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
                                title="Review bill change request"
                                style={{
                                  padding: '4px 10px',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  background: 'var(--warning, #f59e0b)',
                                  color: '#111827',
                                  border: 'none',
                                  fontFamily: 'Inter, sans-serif',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Review
                              </button>
                            )}
                          <button
                            onClick={() => openEdit(l)}
                            style={{
                              padding: '4px 10px',
                              fontSize: 12,
                              fontWeight: 500,
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: 'var(--primary-bg, #eff6ff)',
                              color: 'var(--primary, #1e40af)',
                              border: '1px solid var(--border, #bfdbfe)',
                              fontFamily: 'Inter, sans-serif',
                              whiteSpace: 'nowrap',
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
