import React from 'react';

export default function LotEmptyState({
  search = '',
  searchField = 'all',
  partyFilter = 'All',
  parties = [],
  statusFilter = 'All',
  dateRange = 'all',
  highlightedBillableLotId = null,
  highlightedLot = null,
  lotTableTab = 'others',
  totalUnfilteredLots = 0,
  matchesWithoutHighlight = 0,
  otherTabMatchCount = 0,
  onClearSearch,
  onClearHighlightedLot,
  onClearPartyFilter,
  onClearStatusFilter,
  onClearDateRange,
  onResetAllFilters,
  onSwitchTab,
}) {
  const isSearchActive = Boolean(search && String(search).trim());
  const isHighlightedActive = Boolean(highlightedBillableLotId);
  const isPartyActive = partyFilter !== 'All';
  const isStatusActive = statusFilter !== 'All' && lotTableTab === 'others';
  const isDateActive = dateRange !== 'all';

  const hasAnyFilter =
    isSearchActive ||
    isHighlightedActive ||
    isPartyActive ||
    isStatusActive ||
    isDateActive;

  const currentTabLabel = lotTableTab === 'completed' ? 'Completed' : 'Others';
  const otherTabLabel = lotTableTab === 'completed' ? 'Others' : 'Completed';

  // Find party name if partyFilter is active
  const selectedParty = isPartyActive
    ? parties.find((p) => String(p.id) === String(partyFilter))
    : null;
  const partyDisplayName = selectedParty ? selectedParty.name : partyFilter;

  // Search field friendly label
  const searchFieldLabels = {
    all: 'All Fields',
    lotNo: 'Lot No',
    designNo: 'Design No',
    fabric: 'Fabric',
    description: 'Description',
    partyName: 'Party Name',
  };
  const activeSearchFieldLabel = searchFieldLabels[searchField] || searchField;

  return (
    <div
      className="lot-empty-state animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 20px',
        textAlign: 'center',
        maxWidth: 580,
        margin: '0 auto',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          background: hasAnyFilter
            ? 'color-mix(in srgb, var(--primary, #3b82f6) 12%, var(--card-bg, #231b17))'
            : 'rgba(148, 163, 184, 0.1)',
          color: hasAnyFilter ? 'var(--primary, #3b82f6)' : 'var(--text-muted, #94a3b8)',
          boxShadow: hasAnyFilter ? '0 0 0 6px color-mix(in srgb, var(--primary, #3b82f6) 6%, transparent)' : 'none',
        }}
      >
        {isSearchActive ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
        ) : hasAnyFilter ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 8px 0',
        }}
      >
        {isSearchActive
          ? `No lots found for "${search}"`
          : isHighlightedActive
            ? 'No lots found for selected billable lot'
            : hasAnyFilter
              ? 'No lots match active filters'
              : `No lots in ${currentTabLabel}`}
      </h3>

      {/* Explanatory description */}
      <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
        {/* Specific case: Selected billable lot + search */}
        {isHighlightedActive && isSearchActive && (
          <p style={{ margin: '0 0 8px' }}>
            Aap ne uper billable lot{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              #{highlightedLot?.lotNumber || highlightedLot?.lotNo || 'selected'} / {highlightedLot?.designNo || ''}
            </strong>{' '}
            select ki hui hai, jo search term <strong>&ldquo;{search}&rdquo;</strong> se match nahi karti.
          </p>
        )}

        {/* Highlighted lot without search */}
        {isHighlightedActive && !isSearchActive && (
          <p style={{ margin: '0 0 8px' }}>
            Billable lot select hai, lekin current status ya tab filter ki wajah se yeh show nahi ho rahi.
          </p>
        )}

        {/* General search description */}
        {!isHighlightedActive && isSearchActive && (
          <p style={{ margin: '0 0 8px' }}>
            {totalUnfilteredLots > 0 ? (
              <>
                <strong>{currentTabLabel}</strong> category mein <strong>{totalUnfilteredLots}</strong> lot{totalUnfilteredLots > 1 ? 's' : ''} mojood {totalUnfilteredLots > 1 ? 'hain' : 'hai'}, lekin search <strong>&ldquo;{search}&rdquo;</strong> ({activeSearchFieldLabel}) se koi lot match nahi hui.
              </>
            ) : (
              <>
                Search query <strong>&ldquo;{search}&rdquo;</strong> se koi lot nahi mili.
              </>
            )}
          </p>
        )}

        {/* No search, but other filters active */}
        {!isHighlightedActive && !isSearchActive && hasAnyFilter && (
          <p style={{ margin: '0 0 8px' }}>
            Active filters ki wajah se lots filter ho gayi hain. Tamam lots dekhne k liye filters hata dyn.
          </p>
        )}

        {/* Truly empty */}
        {!hasAnyFilter && (
          <p style={{ margin: 0 }}>
            Is category mein abhi koi lot mojood nahi hai.
          </p>
        )}
      </div>

      {/* Helpful Hint / Recommendation Boxes */}
      {/* 1. Matches exist if billable selection is cleared */}
      {isHighlightedActive && isSearchActive && matchesWithoutHighlight > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--success, #16a34a) 15%, var(--card-bg, #231b17))',
            border: '1px solid var(--success, #16a34a)',
            marginBottom: 16,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            💡 <strong>&ldquo;{search}&rdquo;</strong> se match hone wali{' '}
            <strong style={{ color: 'var(--success, #16a34a)' }}>{matchesWithoutHighlight}</strong> lot{matchesWithoutHighlight > 1 ? 's' : ''} baki collection mein mojood {matchesWithoutHighlight > 1 ? 'hain' : 'hai'}!
          </div>
          <button
            type="button"
            className="btn btn-sm btn-success"
            onClick={onClearHighlightedLot}
            style={{
              whiteSpace: 'nowrap',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Show Matching Lots
          </button>
        </div>
      )}

      {/* 2. Matches exist in the other tab (e.g. Completed vs Others) */}
      {isSearchActive && otherTabMatchCount > 0 && !matchesWithoutHighlight && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--primary, #3b82f6) 15%, var(--card-bg, #231b17))',
            border: '1px solid var(--primary, #3b82f6)',
            marginBottom: 16,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            💡 <strong>&ldquo;{search}&rdquo;</strong> se match hone wali{' '}
            <strong style={{ color: 'var(--primary, #3b82f6)' }}>{otherTabMatchCount}</strong> lot{otherTabMatchCount > 1 ? 's' : ''}{' '}
            <strong>&ldquo;{otherTabLabel}&rdquo;</strong> tab mein mojood {otherTabMatchCount > 1 ? 'hain' : 'hai'}!
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onSwitchTab?.(lotTableTab === 'others' ? 'completed' : 'others')}
            style={{
              whiteSpace: 'nowrap',
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            View in {otherTabLabel} ({otherTabMatchCount})
          </button>
        </div>
      )}

      {/* Active Filter Chips */}
      {hasAnyFilter && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            Active filters:
          </span>

          {isSearchActive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 14,
                fontSize: 12,
                background: 'color-mix(in srgb, var(--primary) 15%, transparent)',
                color: 'var(--primary)',
                border: '1px solid var(--primary)',
                fontWeight: 600,
              }}
            >
              Search: &ldquo;{search}&rdquo;
              {onClearSearch && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  title="Remove search filter"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}

          {isHighlightedActive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 14,
                fontSize: 12,
                background: 'color-mix(in srgb, var(--warning, #d97706) 15%, transparent)',
                color: 'var(--warning, #d97706)',
                border: '1px solid var(--warning, #d97706)',
                fontWeight: 600,
              }}
            >
              Selected Lot: #{highlightedLot?.lotNumber || highlightedLot?.lotNo || 'Billable'}
              {onClearHighlightedLot && (
                <button
                  type="button"
                  onClick={onClearHighlightedLot}
                  title="Deselect billable lot"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}

          {isPartyActive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 14,
                fontSize: 12,
                background: 'rgba(148, 163, 184, 0.15)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                fontWeight: 500,
              }}
            >
              Party: {partyDisplayName}
              {onClearPartyFilter && (
                <button
                  type="button"
                  onClick={onClearPartyFilter}
                  title="Remove party filter"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}

          {isStatusActive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 14,
                fontSize: 12,
                background: 'rgba(148, 163, 184, 0.15)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                fontWeight: 500,
              }}
            >
              Status: {statusFilter}
              {onClearStatusFilter && (
                <button
                  type="button"
                  onClick={onClearStatusFilter}
                  title="Remove status filter"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}

          {isDateActive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 14,
                fontSize: 12,
                background: 'rgba(148, 163, 184, 0.15)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                fontWeight: 500,
              }}
            >
              Date: {dateRange}
              {onClearDateRange && (
                <button
                  type="button"
                  onClick={onClearDateRange}
                  title="Reset date filter"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {hasAnyFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {isSearchActive && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClearSearch}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Clear Search (&ldquo;{search}&rdquo;)
            </button>
          )}

          {isHighlightedActive && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClearHighlightedLot}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Deselect Billable Lot
            </button>
          )}

          {(isPartyActive || isStatusActive || isDateActive) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onResetAllFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
              Reset All Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
