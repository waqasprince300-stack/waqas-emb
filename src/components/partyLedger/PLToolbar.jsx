import React from 'react';
import { SearchBar } from '../UI';
import {
  DateRangeSelect,
} from '../../utils/dateFilters';
import {
  partyFacingLedgerDisplayLabel,
} from '../../utils/partyFacingLabels';

import { partyFacingStatusLabel } from '../../utils/ledgerStatusHelpers';

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
  searchField,
  setSearchField,
  resultCount,
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
          marginBottom: 16,
        }}
      >
        <div className="segmented-tabs">
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
                className={`segmented-tab ${active ? 'active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className="glass-badge"
                    style={{
                      padding: '2px 6px',
                      fontSize: 11,
                      background: active ? 'var(--primary-bg, #eff6ff)' : 'rgba(0,0,0,0.06)',
                      color: active ? 'var(--primary, #1e40af)' : 'inherit',
                      border: 'none',
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View Switcher: Table View vs Tile View (Mobile Only) */}
        <div className="segmented-tabs mobile-view-switcher">
          <button
            type="button"
            className={`segmented-tab ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            List
          </button>
          <button
            type="button"
            className={`segmented-tab ${viewMode === 'tile' ? 'active' : ''}`}
            onClick={() => setViewMode('tile')}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            Tiles
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`toolbar pl-toolbar${isParty ? ' pl-toolbar--party-user' : ''}`}>
        <SearchBar 
          value={search} 
          onChange={setSearch} 
          placeholder="Search..." 
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          resultCount={resultCount}
          searchOptions={[
            { label: 'All', value: 'all' },
            { label: 'Lot', value: 'lotNo' },
            { label: 'Design', value: 'designNo' },
            { label: 'Fabric', value: 'fabric' },
            { label: 'Desc', value: 'description' },
          ]}
        />
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
