import React from 'react';
import LotStatusSelect from '../LotStatusSelect';
import PartyPickerSelect from '../PartyPickerSelect';
import { ActionBtn, EmptyState } from '../UI';
import { formatDisplayDate } from '../../utils/dateFilters';
import { workspaceDisplayTitleForLot } from '../../utils/businessWorkspace';
import { STATUS_OPTIONS } from '../../utils/ghausiaHelpers';

export default function LotTableDesktop({
  filtered,
  paginatedLots,
  lotTableTab,
  parties,
  businessOwners,
  completionPersistingLotId,
  inlineSummaryBusy,
  setLotStatus,
  handlePartyChange,
  openEdit,
  openLinkedLot,
  setDeleteTarget,
  renderOwnerBillableAmount,
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
              <th>Business</th>
              <th>Party Name</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Bill Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState message="No lots found" />
                </td>
              </tr>
            ) : (
              paginatedLots.map((l) => (
                <tr key={l.id} className={l.suitComponent === 'dupatta' ? 'lot-row-dupatta' : l.suitComponent === 'main' && l.suitType === '3-piece' ? 'lot-row-main' : ''}>
                  <td style={{ fontWeight: 700, color: 'var(--primary, #1e40af)', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {l.lotNumber || <span style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', fontWeight: 500 }}>(No Lot)</span>}
                      {l.suitComponent === 'dupatta' && (
                        <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #fdf4ff)', color: 'var(--primary, #a21caf)', border: '1px solid var(--border, #f5d0fe)', borderRadius: 4, cursor: 'pointer' }}>Dupatta</button>
                      )}
                      {l.suitComponent === 'main' && l.suitType === '3-piece' && (
                        <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #eff6ff)', color: 'var(--primary, #1d4ed8)', border: '1px solid var(--border, #bfdbfe)', borderRadius: 4, cursor: 'pointer' }}>Main Lot</button>
                      )}
                      {l.isRework && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #fffbeb)', color: 'var(--primary, #b45309)', border: '1px solid var(--border, #fde68a)', borderRadius: 4 }}>Rework</span>
                      )}
                      {l.linkedLotId && (
                        <div title="Jump to linked lot">
                          <button
                            type="button"
                            onClick={() => openLinkedLot(l.linkedLotId)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #f8fafc)', color: 'var(--text-secondary, #334155)', border: '1px solid var(--border, #cbd5e1)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{l.designNo}</td>
                  <td className="desc-col">{l.description}</td>
                  <td>
                    <span
                      style={{
                        background: 'var(--primary-bg, #F0F9FF)',
                        color: 'var(--primary, #0369a1)',
                        border: '1px solid var(--border, #BAE6FD)',
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 12,
                      }}
                    >
                      {l.itemType || l.fabric}
                    </span>
                  </td>
                  <td>{l.colors}</td>
                  <td>{l.pieces}</td>
                  <td>{formatDisplayDate(l.allotDate)}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 160 }}>
                    {workspaceDisplayTitleForLot(l, businessOwners)}
                  </td>
                  <td>
                    <select
                      className="form-select"
                      style={{
                        width: '100%',
                        fontSize: 13,
                        paddingTop: 4,
                        paddingBottom: 4,
                        borderRadius: 4,
                      }}
                      value={l.partyId || ''}
                      onChange={(e) => handlePartyChange(l.id, e.target.value)}
                    >
                      <option value="">— Select Party —</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {lotTableTab === 'completed' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span
                          style={{
                            fontSize: 12,
                            color: 'green',
                            fontWeight: '500',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--success-bg, #dcfce7)',
                            border: '1px solid var(--success-bg, #dcfce7)',
                            alignSelf: 'flex-start'
                          }}
                        >
                          Completed
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--success, #166534)', fontWeight: 600 }}>
                          Completed Date: {formatDisplayDate(l.completionApprovedAt || l.receivedBackDate || l.allotDate)}
                        </div>
                      </div>
                    ) : (
                      <>
                        <LotStatusSelect
                          value={l.status}
                          options={STATUS_OPTIONS}
                          disabled={completionPersistingLotId === l.id || inlineSummaryBusy}
                          onChange={(next) => setLotStatus(l, next)}
                        />
                        {l.dispatchDate && l.status !== 'pending' && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--danger, #dc2626)',
                              marginTop: 3,
                              fontWeight: '500',
                            }}
                          >
                            Dispatch: {formatDisplayDate(l.dispatchDate)}
                          </div>
                        )}
                        {l.receivedBackDate && ['received back', 'pending approval'].includes(l.status) && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'green',
                              marginTop: 1,
                              fontWeight: '500',
                            }}
                          >
                            Received: {formatDisplayDate(l.receivedBackDate)}
                          </div>
                        )}
                        {l.rejectedDate && l.status === 'rejected' && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--danger, #b91c1c)',
                              marginTop: 1,
                              fontWeight: '500',
                            }}
                          >
                            Rejected: {formatDisplayDate(l.rejectedDate)}
                          </div>
                        )}
                        {l.pendingReviewSubmittedAt && l.status === 'pending approval' && (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--warning, #ca8a04)',
                              marginTop: 1,
                              fontWeight: '500',
                            }}
                          >
                            Pending: {formatDisplayDate(l.pendingReviewSubmittedAt)}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary, #1e40af)' }}>
                    {renderOwnerBillableAmount(l)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionBtn variant="edit" onClick={() => openEdit(l)} />
                      <ActionBtn variant="delete" onClick={() => setDeleteTarget(l)} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
