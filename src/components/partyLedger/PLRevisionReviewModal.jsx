import React from 'react';
import { Modal, FormGroup } from '../UI';
import Loader from '../Loader';

/**
 * PLRevisionReviewModal — Admin's bill change review (approve/reject) modal.
 * Pure render component — inline computations (delta, settled, newOwner) stay here
 * since they are simple Number() calculations, not closures over parent state.
 */
export default function PLRevisionReviewModal({
  revisionReview,
  setRevisionReview,
  revisionReviewSaving,
  approveRevision,
  rejectRevision,
  ledgerPartyEdits,
  getPartyNameLocal,
  ownerSettlementForLot,
}) {
  if (!revisionReview) return null;

  const lot = revisionReview.lot;
  const pe = ledgerPartyEdits[lot.id] || {};
  const req = pe.billRevisionRequest || {};
  const fromA = Number(req.fromAmount) || 0;
  const toA = Number(req.toAmount) || 0;
  const ownerBill = Number(lot.billAmount) || 0;
  const settled = ownerSettlementForLot(lot).length > 0;
  const newOwner = revisionReview.updateOwnerBill
    ? revisionReview.useCustomOwner && revisionReview.customOwnerAmount !== ''
      ? Number(revisionReview.customOwnerAmount) || 0
      : toA
    : ownerBill;
  const delta = newOwner - ownerBill;

  return (
    <Modal
      title={`Bill change request \u2014 ${lot.lotNo || lot.lotNumber}`}
      onClose={() => {
        if (!revisionReviewSaving) setRevisionReview(null);
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger, #b91c1c)', borderColor: 'var(--danger-bg, #fecaca)' }}
            disabled={revisionReviewSaving}
            onClick={() => void rejectRevision()}
          >
            Reject
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={revisionReviewSaving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            onClick={() => void approveRevision()}
          >
            {revisionReviewSaving ? (
              <>
                <Loader /> Saving{'\u2026'}
              </>
            ) : (
              'Approve & apply'
            )}
          </button>
        </>
      }
    >
      <div
        style={{
          background: 'var(--primary-bg, #f8fafc)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 16,
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Party: </span>
          {getPartyNameLocal(lot.partyId, lot.partyName)}
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Party ledger change: </span>
          <strong>
            \u20A8{fromA.toLocaleString()} \u2192 \u20A8{toA.toLocaleString()}
          </strong>{' '}
          <span
            style={{
              color: delta === 0 ? 'var(--text-muted, #64748b)' : toA - fromA >= 0 ? 'var(--success, #0f766e)' : 'var(--danger, #dc2626)',
            }}
          >
            ({toA - fromA >= 0 ? '+' : '\u2212'}\u20A8{Math.abs(toA - fromA).toLocaleString()})
          </span>
        </div>
        {req.reason ? (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Reason: </span>
            {req.reason}
          </div>
        ) : null}
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Current owner bill: </span>
          \u20A8{ownerBill.toLocaleString()}
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Settlement: </span>
          {settled ? (
            <span style={{ color: 'var(--warning, #92400e)', fontWeight: 600 }}>
              Payment settled for this lot
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted, #64748b)' }}>No settlement payment</span>
          )}
        </div>
      </div>

      <FormGroup label="Owner bill handling">
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          <input
            type="checkbox"
            checked={revisionReview.updateOwnerBill}
            onChange={(e) =>
              setRevisionReview((r) => ({ ...r, updateOwnerBill: e.target.checked }))
            }
          />
          Also update owner bill
        </label>
        {revisionReview.updateOwnerBill && (
          <>
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={revisionReview.useCustomOwner}
                onChange={(e) =>
                  setRevisionReview((r) => ({ ...r, useCustomOwner: e.target.checked }))
                }
              />
              Use custom owner amount (otherwise party amount applies)
            </label>
            {revisionReview.useCustomOwner && (
              <input
                className="form-input"
                type="number"
                value={revisionReview.customOwnerAmount}
                onChange={(e) =>
                  setRevisionReview((r) => ({ ...r, customOwnerAmount: e.target.value }))
                }
                placeholder="Custom owner bill (\u20A8)"
              />
            )}
          </>
        )}
      </FormGroup>

      <div
        style={{
          background: revisionReview.updateOwnerBill ? 'var(--primary-bg, #eff6ff)' : 'var(--primary-bg, #f8fafc)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 12.5,
          color: 'var(--text-secondary, #334155)',
          lineHeight: 1.6,
        }}
      >
        <div>
          New owner bill: <strong>\u20A8{Number(newOwner).toLocaleString()}</strong>
          {revisionReview.updateOwnerBill ? (
            <span
              style={{ color: delta === 0 ? 'var(--text-muted, #64748b)' : delta > 0 ? 'var(--success, #0f766e)' : 'var(--danger, #dc2626)' }}
            >
              {' '}
              ({delta >= 0 ? '+' : '\u2212'}\u20A8{Math.abs(delta).toLocaleString()})
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted, #64748b)' }}> (unchanged)</span>
          )}
        </div>
        {revisionReview.updateOwnerBill && settled && delta !== 0 && (
          <div style={{ marginTop: 6, color: 'var(--warning, #92400e)', fontWeight: 600 }}>
            {delta > 0
              ? `Adjustment: extra Paid \u2192 Owner payment of \u20A8${delta.toLocaleString()} will be recorded.`
              : `Adjustment: reversing Received \u2190 Owner payment of \u20A8${Math.abs(delta).toLocaleString()} will be recorded.`}
          </div>
        )}
      </div>

      <FormGroup label="Rejection reason (Reject only)">
        <textarea
          className="form-textarea"
          rows={2}
          value={revisionReview.rejectionNote}
          onChange={(e) =>
            setRevisionReview((r) => ({ ...r, rejectionNote: e.target.value }))
          }
          placeholder="Enter reason if rejecting..."
          style={{ resize: 'vertical' }}
        />
      </FormGroup>
    </Modal>
  );
}
