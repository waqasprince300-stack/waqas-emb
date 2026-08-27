import React from 'react';
import LotStatusSelect from '../LotStatusSelect';
import PartyPickerSelect from '../PartyPickerSelect';
import { ActionBtn, EmptyState } from '../UI';
import { formatDisplayDate } from '../../utils/dateFilters';
import { workspaceDisplayTitleForLot } from '../../utils/businessWorkspace';
import { STATUS_OPTIONS } from '../../utils/ghausiaHelpers';

export default function LotMobileViews({
  filtered,
  paginatedLots,
  viewMode,
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
  if (viewMode === 'tile') {
    return (
      <div className="tiles-grid mobile-only-tiles">
        {filtered.length === 0 ? (
          <EmptyState message="No lots found" />
        ) : (
          paginatedLots.map((l) => (
            <div key={`gh-tile-${l.id}`} className={`lot-tile-card ${l.suitComponent === 'dupatta' ? 'lot-row-dupatta' : l.suitComponent === 'main' && l.suitType === '3-piece' ? 'lot-row-main' : ''}`}>
              <div className="lot-tile-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span className="lot-tile-number">Lot {l.lotNumber ? `#${l.lotNumber}` : <span style={{ fontStyle: 'italic', fontWeight: 500, color: 'var(--text-muted, #94a3b8)' }}>(No Lot)</span>}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {l.suitComponent === 'dupatta' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #fdf4ff)', color: 'var(--primary, #a21caf)', border: '1px solid var(--border, #f5d0fe)', borderRadius: 4, cursor: 'pointer' }}>Dupatta</button>}
                    {l.suitComponent === 'main' && l.suitType === '3-piece' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #eff6ff)', color: 'var(--primary, #1d4ed8)', border: '1px solid var(--border, #bfdbfe)', borderRadius: 4, cursor: 'pointer' }}>Main Lot</button>}
                    {l.linkedLotId && (
                      <button type="button" onClick={() => openLinkedLot(l.linkedLotId)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #f8fafc)', color: 'var(--text-secondary, #334155)', border: '1px solid var(--border, #cbd5e1)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                      </button>
                    )}
                  </div>
                  </div>
                  {l.designNo ? <div className="lot-tile-design">Design #{l.designNo}</div> : null}
                </div>
                <div style={{ flexBasis: '100%', marginTop: 4 }}>
                  {lotTableTab === 'completed' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="badge-completed" style={{ display: 'block', textAlign: 'center', fontSize: 13, padding: '4px 0', borderRadius: 20 }}>Done</span>
                      <div style={{ fontSize: 11, color: 'var(--success, #166534)', textAlign: 'center', fontWeight: 600 }}>
                        Completed Date: {formatDisplayDate(l.completionApprovedAt || l.allotDate)}
                      </div>
                    </div>
                  ) : (
                    <LotStatusSelect
                      value={l.status}
                      options={STATUS_OPTIONS}
                      disabled={completionPersistingLotId === l.id || inlineSummaryBusy}
                      onChange={(next) => setLotStatus(l, next)}
                      wrapStyle={{ display: 'block', width: '100%' }}
                      style={{ width: '100%', minWidth: 0, maxWidth: 'none', fontSize: 13, fontWeight: 700, padding: '4px 24px 4px 12px', height: 32, backgroundPosition: 'right 10px center', borderRadius: 20 }}
                    />
                  )}
                </div>
              </div>

              <div className="lot-tile-body">
                <div className="lot-tile-chips">
                  <span className="fabric-chip">{l.itemType || l.fabric || 'Lawn'}</span>
                  <span className="info-chip">{l.colors || 0} col</span>
                  <span className="info-chip">{l.pieces || 0} pcs</span>
                </div>

                <div style={{ marginTop: 4 }}>
                  <PartyPickerSelect
                    value={l.partyId || ''}
                    onChange={(val) => handlePartyChange(l.id, val)}
                    parties={parties}
                  />
                </div>
              </div>

              <div className="lot-tile-footer">
                <span className="lot-tile-price">
                  {renderOwnerBillableAmount(l)}
                </span>
                <div className="lot-tile-actions">
                  <button
                    type="button"
                    className="btn-tile-action"
                    onClick={() => openEdit(l)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-tile-action delete"
                    onClick={() => setDeleteTarget(l)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  // List / card view
  return (
    <div className="mobile-only-ghausia-cards">
      {filtered.length === 0 ? (
        <EmptyState message="No lots found" />
      ) : (
        paginatedLots.map((l) => (
          <div key={`gh-mob-${l.id}`} className="ghausia-mobile-card">
            <div className="gh-mob-header">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span className="gh-mob-lot-no">Lot {l.lotNumber ? `#${l.lotNumber}` : <span style={{ fontStyle: 'italic', fontWeight: 500, color: 'var(--text-muted, #94a3b8)' }}>(No Lot)</span>}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {l.suitComponent === 'dupatta' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #fdf4ff)', color: 'var(--primary, #a21caf)', border: '1px solid var(--border, #f5d0fe)', borderRadius: 4, cursor: 'pointer' }}>Dupatta</button>}
                    {l.suitComponent === 'main' && l.suitType === '3-piece' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #eff6ff)', color: 'var(--primary, #1d4ed8)', border: '1px solid var(--border, #bfdbfe)', borderRadius: 4, cursor: 'pointer' }}>Main Lot</button>}
                    {l.isRework && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #fffbeb)', color: 'var(--primary, #b45309)', border: '1px solid var(--border, #fde68a)', borderRadius: 4 }}>Rework</span>}
                    {l.linkedLotId && (
                      <button type="button" onClick={() => openLinkedLot(l.linkedLotId)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'var(--primary-bg, #f8fafc)', color: 'var(--text-secondary, #334155)', border: '1px solid var(--border, #cbd5e1)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                      </button>
                    )}
                  </div>
                </div>
                {l.designNo ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary, #475569)' }}>Design #{l.designNo}</span> : null}
              </div>
              <div>
                {lotTableTab === 'completed' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="badge-completed">Completed</span>
                    <div style={{ fontSize: 11, color: 'var(--success, #166534)', fontWeight: 600 }}>
                      Completed Date: {formatDisplayDate(l.completionApprovedAt || l.allotDate)}
                    </div>
                  </div>
                ) : (
                  <LotStatusSelect
                    value={l.status}
                    options={STATUS_OPTIONS}
                    disabled={completionPersistingLotId === l.id || inlineSummaryBusy}
                    onChange={(next) => setLotStatus(l, next)}
                    style={{ fontSize: 13, fontWeight: 700, borderRadius: 20 }}
                  />
                )}
              </div>
            </div>

            <div className="gh-mob-body">
              <div className="gh-mob-chips">
                <span className="fabric-chip">{l.itemType || l.fabric || 'Lawn'}</span>
                <span className="info-chip">Col: {l.colors || 0}</span>
                <span className="info-chip">Pcs: {l.pieces || 0}</span>
              </div>

              <div style={{ marginTop: 4 }}>
                <PartyPickerSelect
                  value={l.partyId || ''}
                  onChange={(val) => handlePartyChange(l.id, val)}
                  parties={parties}
                />
              </div>

              <div className="gh-mob-info">
                <div>Workspace: {workspaceDisplayTitleForLot(l, businessOwners)}</div>
                <div>Allot Date: {formatDisplayDate(l.allotDate)}</div>
                {l.description && <div>Note: {l.description}</div>}
              </div>

              <div className="gh-mob-bill-row">
                <span style={{ fontSize: 13, color: 'var(--text-muted, #64748b)' }}>Bill Amount:</span>
                <strong style={{ fontSize: 15, color: 'var(--primary, #1e40af)' }}>
                  {renderOwnerBillableAmount(l)}
                </strong>
              </div>
            </div>

            <div className="gh-mob-footer">
              <ActionBtn variant="edit" onClick={() => openEdit(l)} />
              <ActionBtn variant="delete" onClick={() => setDeleteTarget(l)} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
