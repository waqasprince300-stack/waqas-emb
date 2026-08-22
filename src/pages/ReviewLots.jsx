import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import LazyReceiptThumb from '../components/receipt/LazyReceiptThumb';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';
import { Modal, FormGroup, EmptyState, SearchBar } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import { compareRowsByUpdatedNewestFirst, formatDisplayDateTime } from '../utils/dateFilters';
import { getAdminLedgerOrBusinessBill } from '../utils/partyBillPrivacy';

import { normalizeLotKey, lotKeyFromLot } from '../utils/lotKeyHelpers';

function hasOwnerReceivedForLot(lot, payments) {
  const k = normalizeLotKey(lotKeyFromLot(lot));
  if (!k || !Array.isArray(payments)) return false;
  return payments.some((p) => String(p.party || '').trim().toLowerCase() === 'owner' && normalizeLotKey(p.linkedLot) === k);
}

function pendingRevisionIsReal(pe) {
  const pr = pe?.pendingRevision;
  if (!pr) return false;
  return Number(pr.fromAmount) !== Number(pr.toAmount);
}

/** Party submit moment for Review Lots (date + time). */
function formatReviewSubmittedAt(lot, pe) {
  const raw = lot?.pendingReviewSubmittedAt || pe?.updatedAt || lot?.updatedAt || '';
  if (!raw) return null;
  const label = formatDisplayDateTime(raw, '');
  return label || null;
}

function needsOwnerBillingChoice(lot, pe, payments) {
  return hasOwnerReceivedForLot(lot, payments) || pendingRevisionIsReal(pe);
}

/** Positive party ledger increase during pending review (for delta-only owner billing). */
function partyRevisionPositiveDelta(pe) {
  const pr = pe?.pendingRevision;
  if (!pr || !pendingRevisionIsReal(pe)) return 0;
  return Math.max(0, Number(pr.toAmount) - Number(pr.fromAmount));
}

/**
 * A 400 on approve almost always means our cached row is stale: the lot was already
 * approved/rejected/changed on the server, so it is no longer "pending approval".
 * We key off the 400 status (not the exact backend wording, which may change) and only
 * treat clearly unrelated client errors as real failures.
 */
function isStaleLotApprovalError(e) {
  const status = Number(e?.status);
  if (status !== 400) return false;
  const msg = String(e?.message || e || '').toLowerCase();
  // Wording-tolerant: anything about the lot's approval/status counts as "already updated".
  // Genuine input problems (amount/validation) keep the normal error message.
  const looksLikeValidationError =
    msg.includes('amount') || msg.includes('required') || msg.includes('invalid amount');
  return !looksLikeValidationError;
}

export default function ReviewLots() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef('');
  const [highlightLotId, setHighlightLotId] = useState(null);
  const {
    reportingLots,
    reportingPartyEdits,
    reportingPayments,
    parties,
    businessOwners,
    approveLotCompletion,
    rejectLotCompletion,
    refreshData,
    initialDataLoading,
  } = useApp();

  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [receiptPreview, setReceiptPreview] = useState(null);


  const businessName = (bizId) =>
    businessOwners.find((b) => String(b.id ?? b._id) === String(bizId || ''))?.name || '—';

  const partyName = (pid, fallback) =>
    parties.find((p) => String(p.id) === String(pid || ''))?.name || fallback || '—';

  const pendingLots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = reportingLots.filter((l) => {
      if (
        String(l.status || '')
          .toLowerCase()
          .trim() !== 'pending approval'
      )
        return false;
      if (!q) return true;
      const label =
        `${l.lotNo || ''} ${l.lotNumber || ''} ${l.designNo || ''} ${l.partyName || ''}`.toLowerCase();
      return label.includes(q);
    });
    return [...list].sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'lot'));
  }, [reportingLots, search]);

  /** Deep link: /review-lots?lotId=… → focus that pending lot. */
  useEffect(() => {
    const lotId = String(searchParams.get('lotId') || '').trim();
    if (!lotId || initialDataLoading) return;
    if (deepLinkAppliedRef.current === lotId) return;

    const lot = reportingLots.find((l) => String(l.id) === lotId);
    if (!lot) return;
    if (
      String(lot.status || '')
        .toLowerCase()
        .trim() !== 'pending approval'
    )
      return;

    deepLinkAppliedRef.current = lotId;
    setSearch(String(lot.lotNo || lot.lotNumber || '').trim());
    setHighlightLotId(lotId);

    const next = new URLSearchParams(searchParams);
    next.delete('lotId');
    setSearchParams(next, { replace: true });

    const t = setTimeout(() => {
      const el = document.getElementById(`rl-lot-row-${lotId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    const clearHl = setTimeout(() => setHighlightLotId(null), 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(clearHl);
    };
  }, [searchParams, setSearchParams, reportingLots, initialDataLoading]);

  const peBill = (lotId, lot) => {
    const pe = reportingPartyEdits[lotId] || {};
    return getAdminLedgerOrBusinessBill(lot, pe);
  };

  const handleApprove = async (lot) => {
    const pe = reportingPartyEdits[lot.id] || {};
    const ownerSettledForLot = hasOwnerReceivedForLot(lot, reportingPayments);

    if (ownerSettledForLot) {
      // Simplified workflow for already billed lots
      const ok = await Swal.fire({
        title: 'Already billed to owner',
        text: `This lot's bill has already been billed to the owner. Do you want to add any difference in the owner bill amount now?`,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Yes (Add Difference)',
        denyButtonText: 'No (Keep Same)',
        cancelButtonText: 'Cancel',
      });
      
      if (ok.isDismissed) return; // Cancelled
      
      let finalOwnerBillAmount = undefined;
      let skipBillable = false;

      if (ok.isDenied) {
        // No (Keep Same) -> Skip billable, go straight to completed
        skipBillable = true;
      } else if (ok.isConfirmed) {
        // Yes (Add Difference) -> Ask for the new total bill amount
        const partyBillNow = peBill(lot.id, lot);
        const oldOwnerBill = Number(pe.amountChangeNote?.ghausiaAmount || lot.billAmount || 0);
        const { value: customAmount } = await Swal.fire({
          title: 'Enter new Owner Bill Amount',
          input: 'number',
          inputValue: partyBillNow,
          html: `<div style="font-size: 14px; margin-bottom: 6px;">Previous Owner Bill: <strong>₨${oldOwnerBill.toLocaleString()}</strong></div><div style="font-size: 13px; color: var(--text-muted);">The difference will be calculated automatically in the Billable list.</div>`,
          showCancelButton: true,
          inputValidator: (value) => {
            if (!value || Number(value) < 0) {
              return 'Enter a valid positive number';
            }
          }
        });
        
        if (!customAmount) return; // Cancelled second popup
        finalOwnerBillAmount = Number(customAmount);
        skipBillable = false; // Go to billable to settle difference
      }

      setBusyId(lot.id);
      try {
        await approveLotCompletion(lot.id, {
          businessOwnerId: lot.businessOwnerId,
          ...(finalOwnerBillAmount !== undefined ? { ownerBillingChoice: 'custom_ghausia', ownerBillAmount: finalOwnerBillAmount } : {}),
          skipBillable,
        });
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Lot approved',
          showConfirmButton: false,
          timer: 2200,
          timerProgressBar: true,
        });
      } catch (e) {
        if (isStaleLotApprovalError(e)) {
          refreshData?.({ force: true });
          Swal.fire({ icon: 'info', title: 'Lot already updated', text: 'This lot is no longer awaiting approval.' });
        } else {
          Swal.fire({ icon: 'error', title: 'Could not approve', text: String(e?.message || e || '') });
        }
      } finally {
        setBusyId(null);
      }
      return;
    }

    // Normal workflow for lots NOT billed to owner yet
    const ok = await Swal.fire({
      title: 'Approve completion?',
      text: `${lot.lotNo || lot.lotNumber} will become billable to owner (received back).`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Approve',
      cancelButtonText: 'Cancel',
    });
    if (!ok.isConfirmed) return;
    
    setBusyId(lot.id);
    try {
      await approveLotCompletion(lot.id, {
        businessOwnerId: lot.businessOwnerId,
      });
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Lot approved',
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (e) {
      if (isStaleLotApprovalError(e)) {
        refreshData?.({ force: true });
        Swal.fire({
          icon: 'info',
          title: 'Lot already updated',
          text: 'This lot is no longer awaiting approval (it was already approved, rejected, or changed). The list has been refreshed.',
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Could not approve',
          text: String(e?.message || e || ''),
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (lot) => {
    setRejectReason('');
    setRejectModal(lot);
  };

  const submitReject = async () => {
    if (!rejectModal) return;
    const note = String(rejectReason || '').trim();
    if (!note) {
      Swal.fire({ icon: 'warning', title: 'Enter a rejection message' });
      return;
    }
    setBusyId(rejectModal.id);
    try {
      await rejectLotCompletion(rejectModal.id, note, {
        businessOwnerId: rejectModal.businessOwnerId,
      });
      setRejectModal(null);
      setRejectReason('');
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Lot rejected',
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Could not reject',
        text: String(e?.message || e || ''),
      });
    } finally {
      setBusyId(null);
    }
  };

  if (initialDataLoading) {
    return (
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <LoaderDashboard height={30} width={30} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Review lots</div>
          <div className="page-subtitle">
            Party-submitted completions wait here. Approve to make lots billable to owner, or reject
            with a note the party will see.
          </div>
        </div>
      </div>

      <div className="toolbar pl-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search lot, design, party…" />
        <span className="pl-toolbar-meta" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {pendingLots.length} awaiting review
        </span>
      </div>

      <div className="table-wrapper desktop-only-table">
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Design</th>
                <th>Party</th>
                <th>Collection</th>
                <th>Submitted</th>
                <th style={{ textAlign: 'right' }}>Amount (₨)</th>
                <th>Receipt</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLots.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState message="No lots are waiting for review" />
                  </td>
                </tr>
              ) : (
                pendingLots.map((l) => {
                  const pe = reportingPartyEdits[l.id] || {};
                  const submittedLabel = formatReviewSubmittedAt(l, pe);
                  return (
                    <tr
                      key={l.id}
                      id={`rl-lot-row-${l.id}`}
                      style={
                        String(highlightLotId) === String(l.id)
                          ? { background: 'var(--warning-bg, #fef3c7)', outline: '2px solid var(--warning, #f59e0b)' }
                          : undefined
                      }
                    >
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{l.lotNo || l.lotNumber}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{l.designNo}</td>
                      <td>{partyName(l.partyId, l.partyName)}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {businessName(l.businessOwnerId)}
                      </td>
                      <td
                        style={{
                          fontSize: 12.5,
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                        title="When the party submitted this lot for review"
                      >
                        {submittedLabel || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        ₨{peBill(l.id, l).toLocaleString()}
                      </td>
                      <td>
                        <LazyReceiptThumb
                          lotId={l.id}
                          receipt={pe.receipt}
                          hasReceipt={pe.hasReceipt}
                          businessOwnerId={l.businessOwnerId}
                          lotLabel={l.lotNo || l.lotNumber}
                          onOpen={setReceiptPreview}
                          emptyLabel="—"
                        />
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 220 }}>
                        <div>{pe.notes || '—'}</div>
                        {pendingRevisionIsReal(pe) ? (
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--warning, #92400e)',
                              marginTop: 6,
                              lineHeight: 1.35,
                            }}
                          >
                            Party revised bill: ₨
                            {Number(pe.pendingRevision.fromAmount).toLocaleString()} → ₨
                            {Number(pe.pendingRevision.toAmount).toLocaleString()}
                            {hasOwnerReceivedForLot(l, reportingPayments) ? (
                              <span> · Owner payment exists for this lot</span>
                            ) : null}
                          </div>
                        ) : hasOwnerReceivedForLot(l, reportingPayments) ? (
                          <div style={{ fontSize: 11, color: 'var(--primary-light, #0369a1)', marginTop: 6 }}>
                            Owner payment is linked to this lot — choose how Owner bill should
                            follow.
                          </div>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger, #b91c1c)', borderColor: 'var(--danger-bg, #fecaca)', marginRight: 6 }}
                          disabled={busyId === l.id}
                          onClick={() => openReject(l)}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          disabled={busyId === l.id}
                          onClick={() => handleApprove(l)}
                        >
                          {busyId === l.id ? (
                            <>
                              <Loader /> …
                            </>
                          ) : (
                            'Approve'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mobile-only-review-cards">
        {pendingLots.length === 0 ? (
          <EmptyState message="No lots are waiting for review" />
        ) : (
          pendingLots.map((l) => {
            const pe = reportingPartyEdits[l.id] || {};
            const submittedLabel = formatReviewSubmittedAt(l, pe);
            return (
              <div key={l.id} className="review-mobile-card" style={String(highlightLotId) === String(l.id) ? { outline: '2px solid var(--warning, #f59e0b)' } : undefined}>
                <div className="rl-mob-header">
                  <div className="rl-mob-lot-no">{l.lotNo || l.lotNumber}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger, #dc2626)' }}>
                    ₨{peBill(l.id, l).toLocaleString()}
                  </div>
                </div>
                <div className="pmc-body" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Design:</span>
                    <span style={{ fontWeight: 600 }}>{l.designNo}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Party:</span>
                    <span style={{ fontWeight: 600 }}>{partyName(l.partyId, l.partyName)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Collection:</span>
                    <span style={{ fontWeight: 600 }}>{businessName(l.businessOwnerId)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Submitted:</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>{submittedLabel || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13.5, marginTop: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Receipt:</span>
                    <LazyReceiptThumb
                      lotId={l.id}
                      receipt={pe.receipt}
                      hasReceipt={pe.hasReceipt}
                      businessOwnerId={l.businessOwnerId}
                      lotLabel={l.lotNo || l.lotNumber}
                      onOpen={setReceiptPreview}
                      emptyLabel="—"
                    />
                  </div>
                  {(pe.notes || pendingRevisionIsReal(pe) || hasOwnerReceivedForLot(l, reportingPayments)) && (
                    <div style={{ fontSize: 12.5, marginTop: 8, padding: '10px', background: 'var(--primary-bg, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px' }}>
                      {pe.notes && <div style={{ marginBottom: 6, color: 'var(--text-primary)' }}>{pe.notes}</div>}
                      {pendingRevisionIsReal(pe) ? (
                        <div style={{ fontSize: 11.5, color: 'var(--warning, #92400e)', lineHeight: 1.4 }}>
                          Party revised bill: ₨
                          {Number(pe.pendingRevision.fromAmount).toLocaleString()} → ₨
                          {Number(pe.pendingRevision.toAmount).toLocaleString()}
                          {hasOwnerReceivedForLot(l, reportingPayments) ? (
                            <span style={{ display: 'block', marginTop: 4 }}>· Owner payment exists</span>
                          ) : null}
                        </div>
                      ) : hasOwnerReceivedForLot(l, reportingPayments) ? (
                        <div style={{ fontSize: 11.5, color: 'var(--primary-light, #0369a1)' }}>
                          Owner payment is linked to this lot.
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 1, padding: '10px', fontSize: 14, color: 'var(--danger, #b91c1c)', borderColor: 'var(--danger-bg, #fecaca)' }}
                      disabled={busyId === l.id}
                      onClick={() => openReject(l)}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      style={{ flex: 1, padding: '10px', fontSize: 14 }}
                      disabled={busyId === l.id}
                      onClick={() => handleApprove(l)}
                    >
                      {busyId === l.id ? <><Loader /> …</> : 'Approve'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>



      {rejectModal && (
        <Modal
          title={`Reject completion — ${rejectModal.lotNo || rejectModal.lotNumber}`}
          onClose={() => !busyId && setRejectModal(null)}
          onFormSubmit={() => {
            void submitReject();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId}
                onClick={() => setRejectModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ background: 'var(--danger, #dc2626)', borderColor: 'var(--danger, #dc2626)' }}
                disabled={busyId}
              >
                {busyId ? (
                  <>
                    <Loader /> Rejecting…
                  </>
                ) : (
                  'Reject lot'
                )}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>
            The party will see this message on their ledger when the lot is rejected. They should
            return the lot to <strong>In progress</strong> before resubmitting.
          </p>
          <FormGroup label="Rejection description *">
            <textarea
              className="form-textarea"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain what needs to be fixed or corrected…"
              style={{ resize: 'vertical' }}
            />
          </FormGroup>
        </Modal>
      )}

      {receiptPreview?.kind === 'image' && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ''}`}
          onClose={() => setReceiptPreview(null)}
          footer={
            <button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>
              Close
            </button>
          }
        >
          <img src={receiptPreview.src} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
        </Modal>
      )}
      {receiptPreview?.kind === 'pdf' && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ''}`}
          onClose={() => setReceiptPreview(null)}
          footer={
            <button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>
              Close
            </button>
          }
        >
          <iframe
            src={receiptPreview.src}
            title="PDF"
            style={{
              width: '100%',
              height: '70vh',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          />
        </Modal>
      )}
      {receiptPreview?.kind === 'url' && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ''}`}
          onClose={() => setReceiptPreview(null)}
          footer={
            <>
              <a
                className="btn btn-primary"
                href={receiptPreview.src}
                target="_blank"
                rel="noreferrer"
              >
                Open
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setReceiptPreview(null)}
              >
                Close
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14 }}>{receiptPreview.src}</p>
        </Modal>
      )}
      {receiptPreview?.kind === 'filename' && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ''}`}
          onClose={() => setReceiptPreview(null)}
          footer={
            <button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>
              Close
            </button>
          }
        >
          <p>{receiptPreview.name}</p>
        </Modal>
      )}
    </div>
  );
}
