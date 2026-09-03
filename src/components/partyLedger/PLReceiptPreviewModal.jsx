import React from 'react';
import { Modal } from '../UI';

/**
 * PLReceiptPreviewModal — Renders the receipt preview modal for Party Ledger.
 * Pure render component.
 */
export default function PLReceiptPreviewModal({
  receiptPreview,
  setReceiptPreview,
  isParty,
  ledgerLots,
  openEdit,
  getDisplayStatus,
}) {
  if (!receiptPreview) return null;

  return (
    <Modal
      title={receiptPreview.title ? `Receipt \u2014 ${receiptPreview.title}` : 'Receipt'}
      wide
      onClose={() => setReceiptPreview(null)}
    >
      {receiptPreview.kind === 'image' && (
        <img
          src={receiptPreview.src}
          alt="Receipt"
          style={{
            maxWidth: '100%',
            maxHeight: '78vh',
            width: 'auto',
            height: 'auto',
            display: 'block',
            margin: '0 auto',
            borderRadius: 8,
          }}
        />
      )}
      {receiptPreview.kind === 'pdf' && (
        <iframe
          title="Receipt PDF"
          src={receiptPreview.src}
          style={{
            width: '100%',
            height: '78vh',
            border: 'none',
            borderRadius: 8,
            background: 'var(--primary-bg, #f9fafb)',
          }}
        />
      )}
      {receiptPreview.kind === 'url' && (
        <img
          src={receiptPreview.src}
          alt="Receipt"
          style={{
            maxWidth: '100%',
            maxHeight: '78vh',
            display: 'block',
            margin: '0 auto',
            borderRadius: 8,
          }}
        />
      )}
      {receiptPreview.kind === 'filename' && (
        <div
          style={{
            padding: 16,
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 14,
          }}
        >
          <p style={{ margin: '0 0 12px' }}>No image preview for filename-only receipts.</p>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            {receiptPreview.name}
          </p>
          <p style={{ margin: '16px 0 0', fontSize: 13 }}>
            Edit this lot and upload an image or PDF again to store a preview.
          </p>
        </div>
      )}
      {isParty && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger, #dc2626)', fontWeight: 600 }}
            onClick={() => {
              const lotToEdit = ledgerLots.find((l) => (l.lotNo || l.lotNumber) === receiptPreview.title || l.id === receiptPreview.lotId);
              setReceiptPreview(null);
              if (lotToEdit) {
                openEdit(lotToEdit, getDisplayStatus(lotToEdit));
              }
            }}
          >
            Change or Delete Bill (Open Edit)
          </button>
        </div>
      )}
    </Modal>
  );
}
