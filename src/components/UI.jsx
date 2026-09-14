import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Loader from './Loader';

export function Modal({ title, onClose, children, footer, wide, onFormSubmit, overlayClassName }) {
  const overlayClass = ['modal-overlay', overlayClassName].filter(Boolean).join(' ');
  const body = (
    <>
      <div className="modal-body">{children}</div>
      {footer ? <div className="modal-footer">{footer}</div> : null}
    </>
  );

  const modalContent = (
    <div
      className={overlayClass}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box" style={{ maxWidth: wide ? 820 : 680 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        {onFormSubmit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onFormSubmit(e);
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}

export function FormGroup({ label, children, half }) {
  return (
    <div className="form-group" style={half ? { gridColumn: 'span 1' } : {}}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

export function StatusBadge({ status, label }) {
  const map = {
    'Pending': 'badge badge-pending',
    'Dispatched': 'badge badge-dispatched',
    'Received Back': 'badge badge-received',
    'Completed': 'badge badge-completed',
    'In Progress': 'badge badge-inprogress',
    'Pending Approval': 'badge badge-inprogress',
    'Rejected': 'badge badge-dispatched',
  };
  // Normalize to title-case so both 'pending approval' and 'Pending Approval' match
  const titleCase = String(status || '')
    .trim()
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return <span className={map[titleCase] || 'badge'}>{label || status}</span>;
}

export function ActionBtn({ variant = 'edit', onClick }) {
  const styles = {
    edit: { bg: 'var(--primary-bg, #eff6ff)', color: 'var(--primary, #1e40af)', border: 'var(--border, #bfdbfe)', label: 'Edit' },
    delete: { bg: 'var(--danger-bg, #fef2f2)', color: 'var(--danger, #dc2626)', border: 'var(--danger-bg, #fecaca)', label: 'Delete' },
  };
  const s = styles[variant];
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 6,
        cursor: 'pointer',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {s.label}
    </button>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  searchOptions,
  searchField,
  onSearchFieldChange,
  resultCount,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="search-input-container">
      <div className="search-input">
        {searchOptions && searchOptions.length > 0 && (
          <div className="search-pills">
            {searchOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`search-pill ${searchField === opt.value ? 'active' : ''}`}
                onClick={() => onSearchFieldChange?.(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="search-input-wrapper">
          <svg
            className="search-icon"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val);
              if (!val && searchField !== 'all') {
                onSearchFieldChange?.('all');
              }
            }}
            placeholder={placeholder}
          />
          {!value && (
            <div className="search-shortcut-hint">
              <span>Ctrl K</span>
            </div>
          )}
          {value && (
            <button
              className="search-clear-btn"
              onClick={() => {
                onChange('');
                onSearchFieldChange?.('all');
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
      {typeof resultCount === 'number' && value && (
        <div className="search-result-count">{resultCount} found</div>
      )}
    </div>
  );
}

export function HighlightText({ text, query }) {
  if (!query || !text) return <>{text}</>;
  const lowerText = String(text).toLowerCase();
  const lowerQuery = String(query).toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.substring(0, idx)}
      <mark className="search-highlight">{text.substring(idx, idx + query.length)}</mark>
      {text.substring(idx + query.length)}
    </>
  );
}

export function EmptyState({ message = 'No records found' }) {
  return (
    <div className="empty-state">
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <p>{message}</p>
    </div>
  );
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirming }) {
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel();
      }}
    >
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>Confirm Delete</h3>
          <button className="modal-close" onClick={onCancel} disabled={confirming}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={confirming}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {confirming ? (
              <>
                <Loader /> Deleting…
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
