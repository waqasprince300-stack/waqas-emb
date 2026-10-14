import React, { useState } from 'react';
import Swal from 'sweetalert2';
import apiService from '../../services/api';
import Loader from '../Loader';
import { Modal } from '../UI';
import { receiptPreviewKind } from './ReceiptThumb';

/**
 * Lazy slip viewer for payments and lots.
 * Matches the Payment page slip viewer exactly.
 */
export default function PaymentSlipCell({ payment, lot, partyEdit, isParty = false }) {
  const initialReceipt = String(payment?.receipt || partyEdit?.receipt || lot?.receipt || '');
  const [loaded, setLoaded] = useState(initialReceipt);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const hasPaymentSlip = Boolean(payment?.receipt) || payment?.hasReceipt === true;
  const hasLotSlip = Boolean(lot?.receipt) || lot?.hasReceipt === true || Boolean(partyEdit?.receipt);

  if (payment && payment._synthetic) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  if (!hasPaymentSlip && !hasLotSlip) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  const open = async () => {
    let src = loaded;
    let title = 'Payment Slip';

    if (!src) {
      setLoading(true);
      try {
        if (payment) {
          title = 'Payment Slip';
          const full = await apiService.getPayment(payment.id ?? payment._id, {
            skipTenantHeader: isParty,
            businessOwnerId: isParty
              ? undefined
              : String(payment.businessOwnerId?._id ?? payment.businessOwnerId ?? '').trim() ||
                undefined,
          });
          src = String(full?.receipt || '');
        } else if (lot) {
          title = `Lot ${lot.lotNo || lot.lotNumber || ''} Slip`.trim();
          if (partyEdit?.receipt) {
            src = String(partyEdit.receipt);
          } else if (lot.receipt) {
            src = String(lot.receipt);
          } else {
            const full = await apiService.getGhausiaLot(lot.id ?? lot._id);
            src = String(full?.receipt || '');
          }
        }
        setLoaded(src);
      } catch (err) {
        src = '';
        await Swal.fire({
          icon: 'error',
          title: 'Could not load slip',
          text: err?.message || 'Please try again.',
        });
      } finally {
        setLoading(false);
      }
    } else {
      if (lot && !payment) {
        title = `Lot ${lot.lotNo || lot.lotNumber || ''} Slip`.trim();
      }
    }

    if (src) {
      setPreview({ kind: receiptPreviewKind(src), src, title });
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={open}
        title="View slip"
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? (
          <Loader />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary, #1e40af)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        )}
      </button>

      {preview && (
        <Modal
          title={preview.title || 'Payment Slip'}
          onClose={() => setPreview(null)}
          overlayClassName="modal-overlay-global"
        >
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {preview.kind === 'pdf' ? (
              <iframe
                src={preview.src}
                title="Slip PDF"
                style={{
                  width: '100%',
                  height: '70vh',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              />
            ) : (
              <img
                src={preview.src}
                alt={preview.title}
                style={{
                  maxWidth: '100%',
                  maxHeight: '72vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  display: 'block',
                  margin: '0 auto',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                }}
              />
            )}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 12 }}>
              <a
                href={preview.src}
                target="_blank"
                rel="noopener noreferrer"
                download={`slip-${Date.now()}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--primary, #1e40af)',
                  textDecoration: 'none',
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: 'var(--primary-bg, #eff6ff)',
                  border: '1px solid var(--border, #bfdbfe)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download / Open Full
              </a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
