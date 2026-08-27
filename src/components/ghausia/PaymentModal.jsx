import React from 'react';
import { Modal, FormGroup } from '../UI';
import Loader from '../Loader';

export default function PaymentModal({
  payModal,
  payForm,
  setPayForm,
  payErrors,
  setPayErrors,
  paymentSaving,
  setPayModal,
  handleAddPayment,
  parties,
  collectionLots,
}) {
  if (!payModal) return null;

  return (
    <Modal
      title="Record Payment"
      onClose={() => {
        if (!paymentSaving) {
          setPayModal(false);
          setPayErrors({});
        }
      }}
      onFormSubmit={() => {
        void handleAddPayment();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setPayModal(false);
              setPayErrors({});
            }}
            disabled={paymentSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-success"
            disabled={paymentSaving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {paymentSaving ? (
              <>
                <Loader /> Saving…
              </>
            ) : (
              'Save Payment'
            )}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <FormGroup label="Type">
          <select
            className="form-select"
            value={payForm.type}
            onChange={(e) => {
              const newType = e.target.value;
              setPayForm((f) => ({
                ...f,
                type: newType,
                party: newType === 'Received' ? 'Owner' : '',
              }));
              setPayErrors((prev) => ({ ...prev, party: undefined }));
            }}
          >
            <option>Received</option>
            <option>Paid</option>
          </select>
        </FormGroup>
        <FormGroup label="Amount (₨) *">
          <input
            className={`form-input${payErrors.amount ? ' input-error' : ''}`}
            type="number"
            value={payForm.amount}
            onChange={(e) => {
              setPayForm((f) => ({ ...f, amount: e.target.value }));
              setPayErrors((p) => ({ ...p, amount: undefined }));
            }}
            placeholder="50000"
          />
          {payErrors.amount && (
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11, marginTop: 3, display: 'block' }}>
              {payErrors.amount}
            </span>
          )}
        </FormGroup>
        <FormGroup label={payForm.type === 'Received' ? 'Received From' : 'Paid To *'}>
          {payForm.type === 'Received' ? (
            <select
              className="form-select"
              value={payForm.party}
              onChange={(e) => setPayForm((f) => ({ ...f, party: e.target.value }))}
            >
              <option value="Owner">Owner</option>
              {parties.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                className={`form-select${payErrors.party ? ' input-error' : ''}`}
                value={payForm.party}
                onChange={(e) => {
                  setPayForm((f) => ({ ...f, party: e.target.value }));
                  setPayErrors((p) => ({ ...p, party: undefined }));
                }}
              >
                <option value="">— Select Party —</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
              {payErrors.party && (
                <span
                  style={{ color: 'var(--danger, #dc2626)', fontSize: 11, marginTop: 3, display: 'block' }}
                >
                  {payErrors.party}
                </span>
              )}
            </>
          )}
        </FormGroup>
        <FormGroup label="Date *">
          <input
            className={`form-input${payErrors.date ? ' input-error' : ''}`}
            type="date"
            value={payForm.date}
            onChange={(e) => {
              setPayForm((f) => ({ ...f, date: e.target.value }));
              setPayErrors((p) => ({ ...p, date: undefined }));
            }}
          />
          {payErrors.date && (
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11, marginTop: 3, display: 'block' }}>
              {payErrors.date}
            </span>
          )}
        </FormGroup>
        <FormGroup label="Linked Lot (optional)">
          <select
            className="form-select"
            value={payForm.linkedLot}
            onChange={(e) => setPayForm((f) => ({ ...f, linkedLot: e.target.value }))}
          >
            <option value="">None</option>
            {collectionLots.map((l) => (
              <option key={l.id} value={l.lotNumber}>
                {l.lotNumber || l.lotNo} / {l.designNo}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Note">
          <input
            className="form-input"
            value={payForm.note}
            onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Optional note"
          />
        </FormGroup>
      </div>
    </Modal>
  );
}
