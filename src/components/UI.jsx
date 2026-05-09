import React from 'react';
import Loader from './Loader';

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: wide ? 820 : 680 }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function FormGroup({ label, children, half }) {
  return (
    <div className="form-group" style={half ? { gridColumn: 'span 1' } : {}}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    'Pending':       'badge badge-pending',
    'Dispatched':    'badge badge-dispatched',
    'Received Back': 'badge badge-received',
    'Completed':     'badge badge-completed',
    'In Progress':   'badge badge-inprogress',
    'Pending Approval': 'badge badge-inprogress',
    'Rejected':       'badge badge-dispatched',
  };
  return <span className={map[status] || 'badge'}>{status}</span>;
}

export function ActionBtn({ variant = 'edit', onClick }) {
  const styles = {
    edit:   { bg: '#EFF6FF', color: '#1e40af', border: '#BFDBFE', label: 'Edit' },
    delete: { bg: '#FEF2F2', color: '#dc2626', border: '#FECACA', label: 'Delete' },
  };
  const s = styles[variant];
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6, cursor: 'pointer',
        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {s.label}
    </button>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="search-input">
      <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function EmptyState({ message = 'No records found' }) {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
      <p>{message}</p>
    </div>
  );
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirming }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !confirming) onCancel(); }}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>Confirm Delete</h3>
          <button className="modal-close" onClick={onCancel} disabled={confirming}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={confirming} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {confirming ? <><Loader /> Deleting…</> : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
