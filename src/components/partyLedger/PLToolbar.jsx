import React from 'react';
import { SearchBar } from '../UI';
import {
  DateRangeSelect,
} from '../../utils/dateFilters';
import {
  partyFacingLedgerDisplayLabel,
} from '../../utils/partyFacingLabels';

/** Party UI label for ledger display statuses. */
function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

/**
 * PLToolbar — Renders tabs (Other/Completed), view mode toggle,
 * search bar, workspace/party/date/status filters, and the active filter banner.
 * Pure render component — all state setters come from props.
 */
export default function PLToolbar({
  ledgerLotsTab,
  setLedgerLotsTab,
  otherLotsTabCount,
  completedLotsTabCount,
  viewMode,
  setViewMode,
  search,
  setSearch,
  workspaceFilter,
  setWorkspaceFilter,
  businessOwners,
  partyFilter,
  setPartyFilter,
  parties,
  dateRange,
  setDateRange,
  customStart,
  customEnd,
  setCustomStart,
  setCustomEnd,
  statusFilter,
  setStatusFilter,
  isAdmin,
  isParty,
}) {
  return (
    <>
      <div
        role="tablist"
        aria-label="Other lots or completed lots"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          marginBottom: 16,
          padding: 4,
          background: 'var(--primary-bg, #f8fafc)',
          borderRadius: 10,
          border: '1px solid var(--border, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            {
              id: 'other',
              label: 'Other lots',
              count: otherLotsTabCount,
            },
            {
              id: 'completed',
              label: 'Completed lots',
              count: completedLotsTabCount,
            },
          ].map((t) => {
            const active = ledgerLotsTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLedgerLotsTab(t.id)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: active ? '1px solid var(--success, #15803d)' : '1px solid transparent',
                  background: active ? 'var(--card-bg, #fff)' : 'transparent',
                  color: active ? 'var(--success, #15803d)' : 'var(--text-secondary, #64748b)',
                  fontWeight: active ? 700 : 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {t.label}
                {t.count != null && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      opacity: 0.9,
                    }}
                  >
                    ({t.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View Switcher: Table View vs Tile View (Mobile Only) */}
        <div className="mobile-view-switcher" style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('table')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            List
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'tile' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('tile')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            Tiles
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`toolbar pl-toolbar${isParty ? ' pl-toolbar--party-user' : ''}`}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search lot no. or design..." />
        {isAdmin && (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--workspace"
            value={workspaceFilter}
            onChange={(e) => setWorkspaceFilter(e.target.value)}
            aria-label="Filter by workspace"
            title="Business / workspace filter"
          >
            <option value="All">All workspaces</option>
            {businessOwners.map((o) => (
              <option key={o.id || o._id} value={String(o.id || o._id)}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {!isParty && (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--party"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
          >
            <option value="All">All parties</option>
            {parties.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <DateRangeSelect
          value={dateRange}
          onChange={setDateRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={({ start, end }) => {
            setCustomStart(start);
            setCustomEnd(end);
          }}
          className="pl-toolbar-filter--date"
          containerClassName="pl-toolbar-filter"
        />
        {ledgerLotsTab === 'other' && (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
            <option value="In Progress">{partyFacingStatusLabel('In Progress', isParty)}</option>
            <option value="Pending review">
              {partyFacingStatusLabel('Pending review', isParty)}
            </option>
            <option value="Rejected">{partyFacingStatusLabel('Rejected', isParty)}</option>
          </select>
        )}
      </div>

      {ledgerLotsTab === 'other' && statusFilter !== 'All' && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--primary-bg, #eff6ff)',
            border: '1px solid var(--border, #bfdbfe)',
            fontSize: 13,
            color: 'var(--primary, #1e40af)',
            lineHeight: 1.4,
          }}
        >
          Table filtered by status: <strong>{partyFacingStatusLabel(statusFilter, isParty)}</strong>
          . Summary cards above stay overall (Status does not change them).
        </div>
      )}
    </>
  );
}
