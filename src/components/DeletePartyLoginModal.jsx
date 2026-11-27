import React from 'react';
import { Modal } from './UI';
import { formatApiError } from '../utils/formatApiError';

/**
 * Shared confirmation modal for safely deleting a party user's login account
 * while preserving all linked operational business data (parties, lots, ledger, payments).
 */
export default function DeletePartyLoginModal({
  user,
  organizationAdminName = '',
  busy = false,
  error = '',
  onClose,
  onConfirm,
}) {
  if (!user) return null;

  const displayName = user.name || user.email || 'this party user';
  const linkedParty = user.partyName || 'Unassigned';

  return (
    <Modal
      title="Delete Party User Login"
      maxWidth={480}
      onClose={() => !busy && onClose?.()}
      onFormSubmit={onConfirm}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            {busy ? 'Deleting…' : 'Delete Login Account'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 12 }}>
        Delete party login for{' '}
        <strong style={{ color: 'var(--text-primary)' }}>{displayName}</strong>
        {user.email ? ` (${user.email})` : ''}?
        {organizationAdminName ? (
          <>
            <br />
            <span style={{ fontSize: 12.5 }}>
              Organization Admin: <strong>{organizationAdminName}</strong>
            </span>
          </>
        ) : null}
      </p>
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--success-bg, #f0fdf4)',
          border: '1px solid var(--success, #86efac)',
          color: 'var(--success, #166534)',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <strong>Business Data Safe:</strong> Only the login credentials are deleted. Linked Party (
        {linkedParty}), lots, ledger entries, bills, and payments stay completely untouched.
      </div>
      {error ? (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>
          {typeof error === 'string' ? error : formatApiError(error, 'Could not delete login account')}
        </div>
      ) : null}
    </Modal>
  );
}
