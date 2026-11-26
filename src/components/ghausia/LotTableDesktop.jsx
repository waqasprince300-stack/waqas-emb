import React from 'react';
import { HighlightText, ActionBtn } from '../UI';
import LotStatusSelect from '../LotStatusSelect';
import LotEmptyState from './LotEmptyState';
import { VoiceNotePlayerPill } from '../voice/VoiceNoteControl';
import { formatDisplayDate } from '../../utils/dateFilters';
import { workspaceDisplayTitleForLot } from '../../utils/businessWorkspace';
import { STATUS_OPTIONS } from '../../utils/ghausiaHelpers';

export default function LotTableDesktop({
  filtered,
  paginatedLots,
  search,
  searchField = 'all',
  componentFilter = 'All',
  partyFilter = 'All',
  statusFilter = 'All',
  dateRange = 'all',
  highlightedBillableLotId = null,
  highlightedLot = null,
  totalUnfilteredLots = 0,
  matchesWithoutHighlight = 0,
  otherTabMatchCount = 0,
  onClearSearch,
  onClearHighlightedLot,
  onClearComponentFilter,
  onClearPartyFilter,
  onClearStatusFilter,
  onClearDateRange,
  onResetAllFilters,
  onSwitchTab,
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
  partyEdits = {},
}) {
  return (
    <div className="table-wrapper desktop-only-table">
      <div className="table-scroll">
        <table className="ledger-table fixed-grid-table ghausia-lots-table">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '6.5%' }} />
            <col style={{ width: '11.5%' }} />
            <col style={{ width: '6.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '7.5%' }} />
            <col style={{ width: '7.5%' }} />
            <col style={{ width: '9.5%' }} />
            <col style={{ width: '11.5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7.5%' }} />
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
                  <LotEmptyState
                    search={search}
                    searchField={searchField}
                    partyFilter={partyFilter}
                    parties={parties}
                    componentFilter={componentFilter}
                    statusFilter={statusFilter}
                    dateRange={dateRange}
                    highlightedBillableLotId={highlightedBillableLotId}
                    highlightedLot={highlightedLot}
                    lotTableTab={lotTableTab}
                    totalUnfilteredLots={totalUnfilteredLots}
                    matchesWithoutHighlight={matchesWithoutHighlight}
                    otherTabMatchCount={otherTabMatchCount}
                    onClearSearch={onClearSearch}
                    onClearHighlightedLot={onClearHighlightedLot}
                    onClearComponentFilter={onClearComponentFilter}
                    onClearPartyFilter={onClearPartyFilter}
                    onClearStatusFilter={onClearStatusFilter}
                    onClearDateRange={onClearDateRange}
                    onResetAllFilters={onResetAllFilters}
                    onSwitchTab={onSwitchTab}
                  />
                </td>
              </tr>
            ) : (
              paginatedLots.map((l) => (
                <tr key={l.id} className={`stagger-item ${l.suitComponent === 'dupatta' ? 'lot-row-dupatta' : l.suitComponent === 'main' && l.suitType === '3-piece' ? 'lot-row-main' : ''}`}>
                  <td style={{ fontWeight: 700, color: 'var(--primary, #1e40af)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {l.lotNumber ? <HighlightText text={l.lotNumber} query={search} /> : <span style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', fontWeight: 500 }}>(No Lot)</span>}
                      {l.suitComponent === 'dupatta' && (
                        <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: 'var(--primary-bg, #fdf4ff)', color: 'var(--primary, #a21caf)', border: '1px solid var(--border, #f5d0fe)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>Dupatta</button>
                      )}
                      {l.suitComponent === 'main' && l.suitType === '3-piece' && (
                        <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: 'var(--primary-bg, #eff6ff)', color: 'var(--primary, #1d4ed8)', border: '1px solid var(--border, #bfdbfe)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>Main Lot</button>
                      )}
                      {l.isRework && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: 'var(--primary-bg, #fffbeb)', color: 'var(--primary, #b45309)', border: '1px solid var(--border, #fde68a)', borderRadius: 4, whiteSpace: 'nowrap' }}>Rework</span>
                      )}
                      {l.linkedLotId && (
                        <div title="Jump to linked lot">
                          <button
                            type="button"
                            onClick={() => openLinkedLot(l.linkedLotId)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', background: 'var(--primary-bg, #f8fafc)', color: 'var(--text-secondary, #334155)', border: '1px solid var(--border, #cbd5e1)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}><HighlightText text={l.designNo} query={search} /></td>
                  <td className="desc-col">
                    {(() => {
                      const pe = partyEdits[l.id] || {};
                      const hasPv = Boolean(pe.hasPartyVoiceNote || pe.partyVoiceNote);
                      const hasAv = Boolean(pe.hasAdminVoiceNote || pe.adminVoiceNote);
                      const adminNoteText = String(pe.adminNotes || '').trim();
                      const partyNoteText = String(pe.notes || '').trim();
                      return (
                        <>
                          <div className="table-cell-clamp-2" title={l.description || adminNoteText || ''}>
                            <HighlightText text={l.description} query={search} />
                          </div>
                          {adminNoteText && (
                            <div
                              className="table-cell-clamp-2"
                              title={adminNoteText}
                              style={{ fontSize: 11, color: 'var(--primary, #1d4ed8)', marginTop: 3, fontWeight: 500 }}
                            >
                              Admin: {adminNoteText}
                            </div>
                          )}
                          {partyNoteText && (
                            <div
                              className="table-cell-clamp-2"
                              title={partyNoteText}
                              style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}
                            >
                              Party: {partyNoteText}
                            </div>
                          )}
                          {(hasPv || hasAv) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {hasAv && (
                                <VoiceNotePlayerPill
                                  compact
                                  lotId={l.id}
                                  src={pe.adminVoiceNote || ''}
                                  hasVoiceNote={hasAv}
                                  duration={pe.adminVoiceNoteDuration || 0}
                                  label="Admin"
                                  roleTone="admin"
                                  businessOwnerId={l.businessOwnerId}
                                />
                              )}
                              {hasPv && (
                                <VoiceNotePlayerPill
                                  compact
                                  lotId={l.id}
                                  src={pe.partyVoiceNote || ''}
                                  hasVoiceNote={hasPv}
                                  duration={pe.partyVoiceNoteDuration || 0}
                                  label="Party"
                                  roleTone="party"
                                  businessOwnerId={l.businessOwnerId}
                                />
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td>
                    <span
                      style={{
                        background: 'var(--primary-bg, #F0F9FF)',
                        color: 'var(--primary, #0369a1)',
                        border: '1px solid var(--border, #BAE6FD)',
                        borderRadius: 6,
                        padding: '2px 7px',
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        display: 'inline-block',
                      }}
                    >
                      {l.itemType || l.fabric}
                    </span>
                  </td>
                  <td>{l.colors}</td>
                  <td>{l.pieces}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDisplayDate(l.allotDate)}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {(() => {
                      const bizTitle = workspaceDisplayTitleForLot(l, businessOwners);
                      return (
                        <span className="table-cell-ellipsis" title={typeof bizTitle === 'string' ? bizTitle : ''}>
                          {bizTitle}
                        </span>
                      );
                    })()}
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
                      {l.partyId && !parties.some(p => String(p.id) === String(l.partyId)) && (
                        <option value={l.partyId}>{l.partyName || 'Unknown (Deleted)'}</option>
                      )}
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
                            color: 'var(--success, #15803d)',
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
                        {l.billedInBillNo ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#2563eb',
                              background: 'rgba(37, 99, 235, 0.1)',
                              border: '1px solid rgba(37, 99, 235, 0.25)',
                              padding: '2px 7px',
                              borderRadius: 4,
                              alignSelf: 'flex-start',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            🧾 Bill #{l.billedInBillNo} {l.billedInBookNo ? `(Book ${l.billedInBookNo})` : ''}
                          </span>
                        ) : null}
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
                          wrapStyle={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
                          style={{ width: '100%', minWidth: 0, fontSize: 12.5 }}
                        />
                        {l.dispatchDate && l.status !== 'pending' && (
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              color: 'var(--danger, #dc2626)',
                              marginTop: 2,
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Dispatch: {formatDisplayDate(l.dispatchDate)}
                          </div>
                        )}
                        {l.receivedBackDate && ['received back', 'pending approval'].includes(l.status) && (
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              color: 'var(--success, #15803d)',
                              marginTop: 1,
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Received: {formatDisplayDate(l.receivedBackDate)}
                          </div>
                        )}
                        {l.rejectedDate && l.status === 'rejected' && (
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              color: 'var(--danger, #b91c1c)',
                              marginTop: 1,
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Rejected: {formatDisplayDate(l.rejectedDate)}
                          </div>
                        )}
                        {l.pendingReviewSubmittedAt && l.status === 'pending approval' && (
                          <div
                            style={{
                              fontSize: 11,
                              lineHeight: 1.25,
                              color: 'var(--warning, #ca8a04)',
                              marginTop: 1,
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Pending: {formatDisplayDate(l.pendingReviewSubmittedAt)}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary, #1e40af)', whiteSpace: 'nowrap' }}>
                    {renderOwnerBillableAmount(l)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
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
