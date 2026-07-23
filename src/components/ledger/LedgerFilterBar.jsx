import React from 'react';
import { SearchBar } from '../UI';
import { DateRangeSelect } from '../../utils/dateFilters';

export default function LedgerFilterBar({
  search,
  setSearch,
  workspaceFilter,
  setWorkspaceFilter,
  partyFilter,
  setPartyFilter,
  statusFilter,
  setStatusFilter,
  dateRange,
  setDateRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  parties,
  businessOwners,
  isAdmin,
  isParty,
}) {
  return (
    <div className="ledger-filter-bar" style={{ marginBottom: 20 }}>
      <div
        className="filter-controls-row"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search lot, design, party..." />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <>
              <select
                className="select-input"
                value={workspaceFilter}
                onChange={(e) => setWorkspaceFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="All">All Workspaces</option>
                {businessOwners.map((owner) => (
                  <option key={owner.id || owner._id} value={owner.id || owner._id}>
                    {owner.name || owner.businessName || 'Workspace'}
                  </option>
                ))}
              </select>

              <select
                className="select-input"
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="All">All Parties</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <DateRangeSelect
            value={dateRange}
            onChange={setDateRange}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />
        </div>
      </div>
    </div>
  );
}
