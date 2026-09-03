import React from 'react';
import { Modal, FormGroup } from '../UI';
import Loader from '../Loader';
import { getPartyLedgerBillNumeric } from '../../utils/partyBillPrivacy';

/**
 * PLRevisionRequestModal — Party's bill change request modal.
 * Pure render component.
 */
export default function PLRevisionRequestModal({
  revisionRequest,
  setRevisionRequest,
  revisionSaving,
  submitRevisionRequest,
  ledgerPartyEdits,
}) {
  if (!revisionRequest) return null;

  return (
    <Modal
      title={`Request bill change \u2014 ${revisionRequest.lot.lotNo || revisionRequest.lot.lotNumber}`}
      onClose={() => {
        if (!revisionSaving) setRevisionRequest(null);
      }}
      onFormSubmit={() => {
        void submitRevisionRequest();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={revisionSaving}
            onClick={() => setRevisionRequest(null)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={revisionSaving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {revisionSaving ? (
              <>
                <Loader /> Sending{'\u2026'}
              </>
            ) : (
              'Send request'
            )}
          </button>
        </>
      }
    >
      <div className="alert alert-warning" style={{ marginBottom: 16 }}>
        This lot is complete. You are requesting a new bill amount from the business &mdash; the
        amount updates <strong>only when approved</strong>.
      </div>
      <FormGroup label="Current ledger amount (\u20A8)">
        <input
          className="form-input"
          value={`\u20A8${Number(
            getPartyLedgerBillNumeric(ledgerPartyEdits[revisionRequest.lot.id] || {}) || 0
          ).toLocaleString()}`}
          disabled
        />
      </FormGroup>
      <FormGroup label="New amount (\u20A8) *">
        <input
          className="form-input"
          type="number"
          value={revisionRequest.newAmount}
          onChange={(e) => setRevisionRequest((r) => ({ ...r, newAmount: e.target.value }))}
          placeholder="0"
        />
      </FormGroup>
      <FormGroup label="Reason *">
        <textarea
          className="form-textarea"
          rows={3}
          value={revisionRequest.reason}
          onChange={(e) => setRevisionRequest((r) => ({ ...r, reason: e.target.value }))}
          placeholder="Reason for bill change..."
          style={{ resize: 'vertical' }}
        />
      </FormGroup>
    </Modal>
  );
}
