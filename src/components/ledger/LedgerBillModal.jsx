import React from 'react';
import { Modal } from '../UI';

export default function LedgerBillModal({
  receiptPreview,
  setReceiptPreview,
  receiptPreviewKind,
}) {
  if (!receiptPreview) return null;

  const kind = receiptPreviewKind ? receiptPreviewKind(receiptPreview.url) : 'image';

  return (
    <Modal
      isOpen={Boolean(receiptPreview)}
      onClose={() => setReceiptPreview(null)}
      title={`Bill Receipt — Lot #${receiptPreview.lotNumber || 'N/A'}`}
    >
      <div style={{ padding: 16, textAlign: 'center' }}>
        {kind === 'pdf' ? (
          <iframe
            src={receiptPreview.url}
            title="Bill Receipt PDF"
            style={{ width: '100%', height: '500px', border: 'none' }}
          />
        ) : (
          <img
            src={receiptPreview.url}
            alt="Bill Receipt"
            style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, objectFit: 'contain' }}
          />
        )}
      </div>
    </Modal>
  );
}
