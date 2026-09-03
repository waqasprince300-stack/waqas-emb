import React from 'react';
import Swal from 'sweetalert2';
import { Modal, FormGroup, StatusBadge } from '../UI';
import Loader from '../Loader';
import { receiptPreviewKind } from '../receipt/ReceiptThumb';
import {
  partyFacingLedgerDisplayLabel,
  partyFacingLotStatusLabel,
} from '../../utils/partyFacingLabels';

/** Party UI label for ledger display statuses. */
function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

const toTitleCase = (s) =>
  String(s || '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Admin/workspace lot still awaiting dispatch. */
function adminLotNotDispatched(lot) {
  return (
    String(lot?.status || '')
      .toLowerCase()
      .trim() === 'pending'
  );
}

async function readReceiptAsStoredValue(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }
    resolve(file.name);
  });
}

function approxBytesFromDataUrl(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i === -1) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length * 3) / 4 - pad;
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = dataUrl;
  });
}

const LEDGER_BILL_IMG_MAX_BYTES = 240 * 1024;

async function compressPartyLedgerBillImage(dataUrl, maxBytes = LEDGER_BILL_IMG_MAX_BYTES) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return dataUrl;
  let img;
  try {
    img = await dataUrlToImage(dataUrl);
  } catch {
    throw new Error('Could not read this image (try JPG/PNG or a smaller file).');
  }
  const mime = 'image/jpeg';
  let maxEdge = Math.min(1600, Math.max(img.width, img.height));
  let quality = 0.86;
  const encode = (edge, q) => {
    const long = Math.max(img.width, img.height);
    const scale = Math.min(1, edge / long);
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'var(--card-bg, #ffffff)';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL(mime, q);
  };
  let out = encode(maxEdge, quality);
  for (let i = 0; i < 22 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
    if (quality > 0.28) { quality -= 0.06; out = encode(maxEdge, quality); }
    else { maxEdge = Math.round(maxEdge * 0.82); if (maxEdge < 200) break; quality = 0.82; out = encode(maxEdge, quality); }
  }
  if (approxBytesFromDataUrl(out) > maxBytes) {
    maxEdge = 180; quality = 0.72; out = encode(maxEdge, quality);
    for (let i = 0; i < 8 && approxBytesFromDataUrl(out) > maxBytes; i += 1) { quality = Math.max(0.22, quality - 0.08); out = encode(maxEdge, quality); }
  }
  return out;
}

async function finalizeLedgerReceiptStoredValue(stored) {
  if (!stored) return '';
  if (/^data:image\//i.test(String(stored))) return compressPartyLedgerBillImage(stored);
  return stored;
}

/**
 * PLEditModal — Renders the Edit lot modal for Party Ledger.
 * Handles its own receipt file reading (since it uses inline async handlers),
 * but delegates save to the parent's handleSave callback.
 */
export default function PLEditModal({
  editingId,
  editingLot,
  editForm,
  setEditForm,
  ledgerEditKind,
  ledgerSaving,
  ledgerFormErrors,
  setLedgerFormErrors,
  handleSave,
  onClose,
  parties,
  isParty,
  isAdmin,
  setReceiptPreview,
  getDisplayStatus,
  samePartyId,
}) {
  if (!editingId || !editingLot) return null;

  return (
    <Modal
      title={`Edit \u2014 ${editingLot.lotNo || editingLot.lotNumber} / ${editingLot.designNo}`}
      onClose={onClose}
      onFormSubmit={() => {
        void handleSave();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={ledgerSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={ledgerSaving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {ledgerSaving ? (
              <>
                <Loader /> Saving\u2026
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </>
      }
    >
      {/* Read-only info */}
      <div
        style={{
          background: 'var(--primary-bg, #f8fafc)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Lot Info (read-only)
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '6px 16px',
            fontSize: 13,
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Description: </span>
            {editingLot.description}
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Fabric: </span>
            {editingLot.fabric || editingLot.itemType}
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Colors: </span>
            {editingLot.colors}
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Pieces: </span>
            {editingLot.pieces}
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>
              {isParty ? 'Business order status: ' : 'Owner Status: '}
            </span>
            <StatusBadge
              status={toTitleCase(editingLot.status)}
              label={isParty ? partyFacingLotStatusLabel(editingLot.status) : undefined}
            />
          </div>
        </div>
      </div>

      <div className="grid-2">
        {!isParty && (
          <FormGroup
            label={
              ledgerEditKind === 'pendingReview' || editForm.status === 'Completed'
                ? 'Party Name *'
                : 'Party Name'
            }
          >
            <select
              className="form-select"
              value={editForm.partyId}
              onChange={(e) => {
                const sel = parties.find((p) => samePartyId(p.id, e.target.value));
                setEditForm((f) => ({
                  ...f,
                  partyId: e.target.value,
                  partyName: sel?.name || '',
                }));
                if (ledgerFormErrors.partyId)
                  setLedgerFormErrors((e2) => ({ ...e2, partyId: '' }));
              }}
            >
              <option value="">&mdash; Select Party &mdash;</option>
              {parties.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
            {ledgerFormErrors.partyId && (
              <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11 }}>{ledgerFormErrors.partyId}</span>
            )}
          </FormGroup>
        )}
        <FormGroup label={isParty ? "Dispatch / Allot Date" : "Allot Date"}>
          <input
            className="form-input"
            type="date"
            disabled={isParty}
            value={editForm.allotDate}
            onChange={(e) => setEditForm((f) => ({ ...f, allotDate: e.target.value }))}
          />
        </FormGroup>
        <FormGroup label="Status">
          {ledgerEditKind === 'pendingReview' ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--warning, #92400e)',
                padding: '8px 10px',
                background: 'var(--warning-bg, #fef3c7)',
                borderRadius: 8,
                border: '1px solid var(--warning-bg, #fcd34d)',
              }}
            >
              Pending business review &mdash; you can update bill, receipt, and dates; the lot stays
              under review until approved.
            </div>
          ) : isParty && editingLot && (adminLotNotDispatched(editingLot) || getDisplayStatus(editingLot) === 'Pending') ? (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--warning, #b45309)',
                padding: '8px 12px',
                background: 'var(--warning-bg, #fef3c7)',
                borderRadius: 8,
                border: '1px solid var(--warning-bg, #fcd34d)',
              }}
            >
              Not received yet &mdash; status cannot be changed until dispatched
            </div>
          ) : (
            <select
              className="form-select"
              value={editForm.status}
              onChange={(e) => {
                const next = e.target.value;
                setEditForm((f) => ({
                  ...f,
                  status: next,
                  ...(next !== 'Completed' ? { completeDate: '' } : {}),
                }));
                setLedgerFormErrors({});
              }}
            >
              {!(isParty && editingLot && getDisplayStatus(editingLot) === 'In Progress') ? (
                <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
              ) : null}
              {isParty &&
                editingLot &&
                adminLotNotDispatched(editingLot) &&
                editForm.status === 'In Progress' ? (
                <option value="In Progress">
                  {partyFacingStatusLabel('In Progress', isParty)}
                </option>
              ) : null}
              {!(isParty && editingLot && adminLotNotDispatched(editingLot)) ? (
                <option value="In Progress">
                  {partyFacingStatusLabel('In Progress', isParty)}
                </option>
              ) : null}
              <option value="Completed">{isParty ? 'Submit for review' : 'Completed'}</option>
            </select>
          )}
        </FormGroup>
        {(editForm.status === 'Completed' || ledgerEditKind === 'pendingReview') && (
          <FormGroup label="Complete Date *">
            <input
              className="form-input"
              type="date"
              value={editForm.completeDate}
              onChange={(e) => {
                setEditForm((f) => ({
                  ...f,
                  completeDate: e.target.value,
                }));
                if (ledgerFormErrors.completeDate)
                  setLedgerFormErrors((e2) => ({
                    ...e2,
                    completeDate: '',
                  }));
              }}
            />
            {ledgerFormErrors.completeDate && (
              <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11 }}>
                {ledgerFormErrors.completeDate}
              </span>
            )}
          </FormGroup>
        )}
        <FormGroup label={isParty ? 'Your ledger amount (\u20A8)' : 'Bill Amount (\u20A8)'}>
          <input
            className="form-input"
            type="number"
            value={editForm.billAmount}
            onChange={(e) => setEditForm((f) => ({ ...f, billAmount: e.target.value }))}
            placeholder="0"
          />
        </FormGroup>
      </div>

      <FormGroup label="Upload Bill Receipt (image or PDF)">
        <input
          className="form-input"
          type="file"
          accept="image/*,.pdf,application/pdf"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) {
              setEditForm((f) => ({ ...f, receipt: '' }));
              return;
            }
            try {
              const stored = await readReceiptAsStoredValue(file);
              const cropped = await finalizeLedgerReceiptStoredValue(stored);
              setEditForm((f) => ({ ...f, receipt: cropped }));
            } catch (err) {
              await Swal.fire({
                icon: 'error',
                title: 'Could not process file',
                text: err?.message || 'Try a smaller JPG/PNG. PDFs must be under a few MB.',
              });
              setEditForm((f) => ({ ...f, receipt: '' }));
            }
          }}
        />
        {editForm.receipt && (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {receiptPreviewKind(editForm.receipt) === 'image' && (
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  lineHeight: 0,
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 0, border: 'none' }}
                  onClick={() =>
                    setReceiptPreview({
                      kind: 'image',
                      src: editForm.receipt,
                      title: editingLot?.lotNo || editingLot?.lotNumber,
                    })
                  }
                >
                  <img
                    src={editForm.receipt}
                    alt=""
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      display: 'block',
                    }}
                  />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Remove receipt"
                  title="Remove receipt"
                  onClick={() => setEditForm((f) => ({ ...f, receipt: '' }))}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 24,
                    height: 24,
                    minWidth: 24,
                    minHeight: 24,
                    padding: 0,
                    borderRadius: '50%',
                    border: '1px solid var(--border, #e2e8f0)',
                    background: 'var(--card-bg, #fff)',
                    color: 'var(--text-muted, #64748b)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 700,
                    lineHeight: 1,
                    boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
                  }}
                >
                  {'\u00d7'}
                </button>
              </div>
            )}
            {receiptPreviewKind(editForm.receipt) === 'pdf' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setReceiptPreview({
                      kind: 'pdf',
                      src: editForm.receipt,
                      title: editingLot?.lotNo || editingLot?.lotNumber,
                    })
                  }
                >
                  Preview PDF
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label="Remove receipt"
                  title="Remove receipt"
                  onClick={() => setEditForm((f) => ({ ...f, receipt: '' }))}
                  style={{
                    width: 28,
                    height: 28,
                    minWidth: 28,
                    padding: 0,
                    borderRadius: '50%',
                    border: '1px solid var(--border, #e2e8f0)',
                    color: 'var(--text-muted, #64748b)',
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {'\u00d7'}
                </button>
              </div>
            )}
            <span style={{ fontSize: 12, color: 'var(--success, #15803d)' }}>
              {receiptPreviewKind(editForm.receipt) === 'filename'
                ? `\uD83D\uDCCE ${editForm.receipt}`
                : receiptPreviewKind(editForm.receipt) === 'pdf'
                  ? 'PDF attached \u2014 preview or remove beside'
                  : 'Receipt attached \u2014 click thumbnail to enlarge'}
            </span>
            {receiptPreviewKind(editForm.receipt) === 'filename' && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Remove receipt"
                title="Remove receipt"
                onClick={() => setEditForm((f) => ({ ...f, receipt: '' }))}
                style={{
                  width: 28,
                  height: 28,
                  minWidth: 28,
                  padding: 0,
                  borderRadius: '50%',
                  border: '1px solid var(--border, #e2e8f0)',
                  color: 'var(--text-muted, #64748b)',
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {'\u00d7'}
              </button>
            )}
          </div>
        )}
      </FormGroup>
      <FormGroup label="Notes">
        <textarea
          className="form-textarea"
          rows={2}
          value={editForm.notes}
          onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional notes..."
          style={{ resize: 'vertical' }}
        />
      </FormGroup>

      {ledgerEditKind === 'pendingReview' && (
        <div className="alert alert-warning">
          <strong>Note:</strong>{' '}
          {isParty
            ? 'Saving updates your submission while it is still under business review. If you change your ledger amount, the business will see the old and new figures when they reconcile.'
            : 'Saving updates this submission while it is under review. If you change the bill amount, the admin will see the old and new figures and can choose how the owner business bill should follow when they approve.'}
        </div>
      )}
      {editForm.status === 'Completed' && ledgerEditKind !== 'pendingReview' && (
        <div className="alert alert-warning">
          <strong>Note:</strong>{' '}
          {isParty
            ? 'Submitting completes your ledger entry and sends this lot for business review. Once approved it shows as Delivered. If rejected, you will see the business feedback on this row.'
            : "Submitting completes the ledger entry and sends this lot to the admin for approval. Once approved it becomes billable to the owner (Received back). If rejected, you will see the admin's feedback on this row."}
        </div>
      )}
    </Modal>
  );
}
