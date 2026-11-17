import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import apiService from '../../services/api';
import Loader from '../Loader';
import { Modal } from '../UI';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { receiptPreviewKind } from './ReceiptThumb';
import { fileToFinalizedImage } from '../../utils/imageCompress';

/**
 * Single-modal slip viewer and manager for payments and lots.
 * Supports:
 * - Viewing slip
 * - Attaching slip (when missing)
 * - Updating/Replacing slip (in-place without modal stacking)
 * - Removing slip
 * - File picker, Mobile camera/gallery, Clipboard paste (Ctrl+V or button)
 */
export default function PaymentSlipCell({ payment, lot, partyEdit, isParty = false, canEdit }) {
  const initialReceipt = String(payment?.receipt || partyEdit?.receipt || lot?.receipt || '');
  const [loaded, setLoaded] = useState(initialReceipt);
  const [loading, setLoading] = useState(false);

  // Single modal control: mode can be 'view' or 'upload'
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view');
  const [uploadingSlip, setUploadingSlip] = useState('');
  const [savingSlip, setSavingSlip] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);

  const fileInputRef = useRef(null);

  const { user, isAdmin: authIsAdmin, isParty: authIsParty } = useAuth();
  const { updatePayment } = useApp();
  const isAdmin = Boolean(authIsAdmin || user?.role === 'admin') && !isParty && !authIsParty;
  const canEditPaymentSlip =
    (canEdit !== undefined ? canEdit : (isAdmin && Boolean(payment) && !payment?._synthetic)) &&
    payment?.type !== 'Tally';

  useEffect(() => {
    if (payment?.receipt) {
      setLoaded(payment.receipt);
    }
  }, [payment?.receipt]);

  const hasPaymentSlip = Boolean(payment?.receipt) || payment?.hasReceipt === true || Boolean(loaded);
  const hasLotSlip = Boolean(lot?.receipt) || lot?.hasReceipt === true || Boolean(partyEdit?.receipt);

  // Keyboard paste listener (Ctrl+V) when in upload mode
  useEffect(() => {
    if (!modalOpen || modalMode !== 'upload') return undefined;

    const handleWindowPaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item && String(item.type || '').startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            setProcessingFile(true);
            try {
              const stored = await fileToFinalizedImage(file);
              if (stored) setUploadingSlip(stored);
            } catch (err) {
              Swal.fire({ icon: 'error', title: 'Image error', text: err?.message || 'Could not process image.' });
            } finally {
              setProcessingFile(false);
            }
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [modalOpen, modalMode]);

  if (payment && payment._synthetic) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    setProcessingFile(true);
    try {
      const stored = await fileToFinalizedImage(file);
      if (stored) {
        setUploadingSlip(stored);
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'File error', text: err?.message || 'Could not read file.' });
    } finally {
      setProcessingFile(false);
    }
  };

  const handleClipboardButton = async () => {
    if (!navigator.clipboard?.read) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Use Ctrl+V or Choose File',
        timer: 3000,
      });
      return;
    }
    setProcessingFile(true);
    try {
      const items = await navigator.clipboard.read();
      let found = false;
      for (const item of items) {
        const imageType = (item.types || []).find((t) => String(t).startsWith('image/'));
        if (imageType) {
          // eslint-disable-next-line no-await-in-loop
          const blob = await item.getType(imageType);
          if (blob) {
            const ext = imageType.includes('png') ? 'png' : imageType.includes('webp') ? 'webp' : 'jpg';
            const file = new File([blob], `clipboard-slip.${ext}`, { type: blob.type || imageType });
            // eslint-disable-next-line no-await-in-loop
            const stored = await fileToFinalizedImage(file);
            if (stored) {
              setUploadingSlip(stored);
              found = true;
              break;
            }
          }
        }
      }
      if (!found) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'warning',
          title: 'No picture in clipboard. Copy image first.',
          timer: 3000,
        });
      }
    } catch {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Use Ctrl+V or Choose File',
        timer: 3000,
      });
    } finally {
      setProcessingFile(false);
    }
  };

  const handleSaveSlip = async (nextSlip) => {
    if (!payment || !updatePayment) return;
    setSavingSlip(true);
    try {
      const payId = payment.id ?? payment._id;
      const bizId = payment.businessOwnerId?._id ?? payment.businessOwnerId;
      await updatePayment(payId, { receipt: nextSlip }, { businessOwnerId: bizId });
      setLoaded(nextSlip);
      setModalOpen(false);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: nextSlip ? 'Payment slip saved' : 'Payment slip removed',
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Could not save slip',
        text: err?.message || 'Please try again.',
      });
    } finally {
      setSavingSlip(false);
    }
  };

  const handleRemoveSlip = async () => {
    const res = await Swal.fire({
      title: 'Remove slip?',
      text: 'Are you sure you want to remove the receipt slip from this payment?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, remove',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });
    if (res.isConfirmed) {
      await handleSaveSlip('');
    }
  };

  const openView = async () => {
    let src = loaded;

    if (!src) {
      setLoading(true);
      try {
        if (payment) {
          const full = await apiService.getPayment(payment.id ?? payment._id, {
            skipTenantHeader: isParty,
            businessOwnerId: isParty
              ? undefined
              : String(payment.businessOwnerId?._id ?? payment.businessOwnerId ?? '').trim() ||
                undefined,
          });
          src = String(full?.receipt || '');
        } else if (lot) {
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
    }

    if (src) {
      setModalMode('view');
      setModalOpen(true);
    }
  };

  const openAddSlip = () => {
    setUploadingSlip('');
    setModalMode('upload');
    setModalOpen(true);
  };

  // Render modal content
  const renderModal = () => {
    if (!modalOpen) return null;

    const modalTitle =
      modalMode === 'upload'
        ? loaded
          ? 'Update Payment Slip'
          : 'Attach Payment Slip'
        : lot && !payment
        ? `Lot ${lot.lotNo || lot.lotNumber || ''} Slip`.trim()
        : 'Payment Slip';

    const currentSrc = modalMode === 'upload' ? uploadingSlip : loaded;
    const kind = currentSrc ? receiptPreviewKind(currentSrc) : 'image';

    return (
      <Modal
        title={modalTitle}
        onClose={() => {
          if (!savingSlip && !processingFile) setModalOpen(false);
        }}
        overlayClassName="modal-overlay-global"
      >
        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFilePicked}
        />

        {modalMode === 'view' ? (
          /* ================= VIEW MODE ================= */
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {kind === 'pdf' ? (
              <iframe
                src={loaded}
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
                src={loaded}
                alt="Payment Slip"
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  display: 'block',
                  margin: '0 auto',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                }}
              />
            )}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
              <a
                href={loaded}
                target="_blank"
                rel="noopener noreferrer"
                download={`slip-${Date.now()}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--primary, #1e40af)',
                  textDecoration: 'none',
                  padding: '7px 14px',
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
              {canEditPaymentSlip && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadingSlip(loaded);
                      setModalMode('upload');
                    }}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--primary, #1e40af)',
                      padding: '7px 14px',
                      borderRadius: 6,
                      background: 'var(--primary-bg, #eff6ff)',
                      border: '1px solid var(--border, #bfdbfe)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Change Slip
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveSlip}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--danger, #dc2626)',
                      padding: '7px 14px',
                      borderRadius: 6,
                      background: 'var(--danger-bg, #fef2f2)',
                      border: '1px solid var(--danger-border, #fecaca)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                    </svg>
                    Remove Slip
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          /* ================= UPLOAD / REPLACE MODE ================= */
          <div style={{ padding: '8px 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginBottom: 12 }}>
              Upload or paste (Ctrl+V) receipt image or PDF for this payment ({payment?.party ? `${payment.party} - ` : ''}₨{Number(payment?.amount || 0).toLocaleString()}).
            </p>

            {/* Preview Box */}
            {uploadingSlip ? (
              <div
                style={{
                  position: 'relative',
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--card-bg, #ffffff)',
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                {kind === 'pdf' ? (
                  <div
                    style={{
                      padding: 20,
                      fontWeight: 700,
                      color: 'var(--danger, #dc2626)',
                      background: 'var(--danger-bg, #fef2f2)',
                      borderRadius: 8,
                    }}
                  >
                    PDF Slip Ready to Save
                  </div>
                ) : (
                  <img
                    src={uploadingSlip}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '320px',
                      objectFit: 'contain',
                      borderRadius: 8,
                      display: 'block',
                      margin: '0 auto',
                    }}
                  />
                )}
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processingFile}
                  >
                    📁 Change File
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={handleClipboardButton}
                    disabled={processingFile}
                  >
                    📋 Paste
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => setUploadingSlip('')}
                    style={{ color: 'var(--danger, #dc2626)' }}
                    disabled={processingFile}
                  >
                    ❌ Clear
                  </button>
                </div>
              </div>
            ) : (
              /* Dropzone / Action box when no file selected */
              <div
                style={{
                  border: '2px dashed var(--border, #cbd5e1)',
                  borderRadius: 12,
                  padding: '30px 16px',
                  textAlign: 'center',
                  background: 'var(--primary-bg, #f8fafc)',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Attach Receipt Picture or PDF
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Phone: Gallery se select karein ya WhatsApp se copy karke Paste dabayein.<br />
                  Computer: File select karein ya direct <strong>Ctrl+V</strong> press karein.
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processingFile}
                  >
                    {processingFile ? <Loader /> : '📁 Select from Gallery / Files'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleClipboardButton}
                    disabled={processingFile}
                  >
                    📋 Paste Image
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {loaded ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalMode('view')}
                  disabled={savingSlip || processingFile}
                >
                  Back to View
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={savingSlip || processingFile}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSaveSlip(uploadingSlip)}
                disabled={savingSlip || processingFile || !uploadingSlip || uploadingSlip === loaded}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {savingSlip ? <Loader /> : null}
                {savingSlip ? 'Saving...' : 'Save Receipt'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    );
  };

  // If no slip exists on payment or lot
  if (!hasPaymentSlip && !hasLotSlip) {
    if (canEditPaymentSlip) {
      return (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openAddSlip();
            }}
            title="Attach payment receipt"
            className="btn btn-secondary btn-xs"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              borderRadius: 6,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Slip
          </button>
          {renderModal()}
        </>
      );
    }
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  // When slip exists
  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={openView}
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

      {renderModal()}
    </>
  );
}
