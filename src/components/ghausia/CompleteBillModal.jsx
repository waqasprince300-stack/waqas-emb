import React from 'react';
import { Modal, FormGroup } from '../UI';
import { checkIsCombinedDupatta } from '../../utils/ghausiaHelpers';

export default function CompleteBillModal({
  completeBillModal,
  completeBillInput,
  setCompleteBillInput,
  completeBillError,
  setCompleteBillError,
  dismissCompleteBillModal,
  confirmCompleteBillModal,
  ownerReceivedNet,
  getPartyName,
  partyEdits,
}) {
  if (!completeBillModal) return null;

  const lot = completeBillModal.lot;
  const fromBillable = !!completeBillModal.fromBillable;
  const ov = completeBillModal.billAmountOverride;
  const rawBill =
    ov !== undefined && ov !== null ? Number(ov) : Number(lot.billAmount || 0);
  const confirmAmt = Number(completeBillInput);
  const amountForOwnerCheck =
    !Number.isNaN(confirmAmt) && confirmAmt > 0 ? confirmAmt : rawBill;
  const amountBill = rawBill.toLocaleString();
  const lotNo = String(lot.lotNumber || lot.lotNo || '').trim() || '—';
  const designNo = String(lot.designNo || '').trim() || '—';
  const partyLabel =
    (lot.partyName && String(lot.partyName).trim()) ||
    (lot.partyId ? getPartyName(lot.partyId) : '') ||
    '—';
  const isCombDup = checkIsCombinedDupatta(lot);

  return (
    <Modal
      title={fromBillable ? 'Confirm payment & complete lot' : 'Bill amount for completion'}
      onClose={dismissCompleteBillModal}
      onFormSubmit={() => {
        confirmCompleteBillModal();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={dismissCompleteBillModal}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {fromBillable ? 'Complete & settle' : 'Complete & record payment'}
          </button>
        </>
      }
    >
      {isCombDup ? (
        <p
          style={{
            textAlign: 'left',
            fontSize: 13,
            margin: '0 0 12px',
            color: 'var(--text-secondary)',
          }}
        >
          This lot&apos;s bill is <strong style={{ color: 'var(--warning, #d97706)' }}>combined</strong> with the main lot. You can complete and settle it directly (₨0 bill).
        </p>
      ) : completeBillModal.unpaidBalance === 0 ? (
        <p
          style={{
            textAlign: 'left',
            fontSize: 13,
            margin: '0 0 12px',
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: 'var(--success, #16a34a)', display: 'block', marginBottom: 6 }}>Is lot ka pura bill clear ho chuka hai!</strong>
          Iska total bill <strong>₨{amountBill}</strong> pehle hi clear ho chuka hai. &quot;Complete&quot; par click karein taa k lot mukammal ho jaye (koi nayi payment record nahi hogi).
        </p>
      ) : fromBillable ? (
        <p
          style={{
            textAlign: 'left',
            fontSize: 13,
            margin: '0 0 12px',
            color: 'var(--text-secondary)',
          }}
        >
          Neechay is lot ki baqi (unpaid) amount confirm karein. Lot <strong>Completed</strong> ho jayega, 
          aur Payment Management mein is amount ka naya bill (<strong>Bill → Owner</strong>) record ho jayega.
          {completeBillModal.totalBill > 0 ? (
            <>
              {' '}
              Total bill: <strong>₨{amountBill}</strong>. Baqi udhaar: <strong>₨{completeBillModal.unpaidBalance.toLocaleString()}</strong>.
            </>
          ) : (
            <> Is lot ka koi bill save nahi hai — neechay amount likhein.</>
          )}
          {amountForOwnerCheck > 0 && ownerReceivedNet < amountForOwnerCheck && (
            <span
              style={{ display: 'block', marginTop: 10, color: 'var(--warning, #b45309)', fontWeight: 600 }}
            >
              Aap k paas Owner ka advance (Received) cash khatam hai — yeh lot complete karne k baad Owner ka khata minus mein (<strong>Pending udhaar</strong>) chala jayega jab tak k aap naya cash receive nahi karte.
            </span>
          )}
        </p>
      ) : completeBillModal.totalBill > 0 ? (
        <p
          style={{
            textAlign: 'left',
            fontSize: 13,
            margin: '0 0 12px',
            color: 'var(--text-secondary)',
          }}
        >
          Is lot ka total bill <strong>₨{amountBill}</strong> hai, aur baqi <strong>₨{completeBillModal.unpaidBalance.toLocaleString()}</strong> udhaar rehta hai. Isay complete karne par Payment Management mein (<strong>Received</strong>) ki payment record hogi jo amount aap neechay confirm karenge.
        </p>
      ) : (
        <p
          style={{
            textAlign: 'left',
            fontSize: 13,
            margin: '0 0 12px',
            color: 'var(--text-secondary)',
          }}
        >
          Is lot ka koi bill save nahi hai. Owner se jo amount aap ne li hai wo neechay likhein taa k lot mukammal ho aur Payment Management mein (<strong>Received</strong>) ki entry save ho jaye.
        </p>
      )}
      <div
        style={{
          textAlign: 'left',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        <strong>Lot:</strong> {lotNo} · <strong>Design:</strong> {designNo}
        <br />
        <strong>Party:</strong> {partyLabel}
        <br />
      </div>
      {!isCombDup && completeBillModal.unpaidBalance > 0 && (
        <FormGroup
          label={rawBill > 0 ? 'Baqi udhaar amount (₨) — zaroorat ho toh change karein' : 'Vasool ki gayi amount (₨) *'}
        >
          <input
            className={`form-input${completeBillError ? ' input-error' : ''}`}
            type="number"
            min={0}
            step={1}
            value={completeBillInput}
            onChange={(e) => {
              setCompleteBillInput(e.target.value);
              setCompleteBillError('');
            }}
            placeholder={rawBill > 0 ? `Default ₨${completeBillModal.unpaidBalance.toLocaleString()}` : 'Amount (₨)'}
            autoFocus
          />
          {completeBillError && (
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11, marginTop: 3, display: 'block' }}>
              {completeBillError}
            </span>
          )}
        </FormGroup>
      )}
      <strong>Owner Received:</strong> ₨{ownerReceivedNet.toLocaleString()}
    </Modal>
  );
}
