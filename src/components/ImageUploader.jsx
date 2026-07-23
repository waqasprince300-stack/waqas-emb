import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './UI';
import Loader from './Loader';
import { fileToFinalizedImage } from '../utils/imageCompress';
import { receiptPreviewKind } from './receipt/ReceiptThumb';

function filesFromClipboardData(clipboardData) {
  const files = [];
  const items = clipboardData?.items;
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || item.kind !== 'file') continue;
      if (!String(item.type || '').startsWith('image/')) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (!files.length && clipboardData?.files?.length) {
    for (let i = 0; i < clipboardData.files.length; i += 1) {
      const file = clipboardData.files[i];
      if (file && String(file.type || '').startsWith('image/')) {
        files.push(file);
      }
    }
  }
  return files;
}

/** Mobile-friendly: read image(s) via Clipboard API after a tap on Paste. */
async function filesFromClipboardApi() {
  if (!navigator.clipboard?.read) {
    throw new Error(
      'This browser cannot read the clipboard. Use Add slip and pick from Gallery, or save the WhatsApp image first.'
    );
  }
  const items = await navigator.clipboard.read();
  const files = [];
  for (const item of items) {
    const types = Array.isArray(item.types) ? item.types : [];
    const imageType = types.find((t) => String(t).startsWith('image/'));
    if (!imageType) continue;
    // eslint-disable-next-line no-await-in-loop
    const blob = await item.getType(imageType);
    if (!blob) continue;
    const ext = imageType.includes('png') ? 'png' : imageType.includes('webp') ? 'webp' : 'jpg';
    files.push(
      new File([blob], `clipboard-slip.${ext}`, {
        type: blob.type || imageType,
      })
    );
  }
  if (!files.length) {
    throw new Error(
      'No image in clipboard. In WhatsApp: long-press the slip → Copy, then tap Paste here.'
    );
  }
  return files;
}

/**
 * Reusable picture uploader for lot pictures / payment slips.
 * Stores each picture as a compressed base64 data URL (image) or a data URL (PDF).
 * Supports file pick and clipboard paste (desktop Ctrl/Cmd+V, mobile Paste button).
 *
 * @param {string[]} value      Current stored images (data URLs).
 * @param {(next:string[])=>void} onChange
 * @param {number}  [max]       Max number of images (default 6).
 * @param {boolean} [disabled]
 * @param {string}  [addLabel]
 * @param {number}  [thumbSize]   Thumbnail edge size in px (default 72).
 */
export default function ImageUploader({
  value = [],
  onChange,
  max = 6,
  disabled = false,
  addLabel = 'Add picture',
  thumbSize = 72,
}) {
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const images = useMemo(() => (Array.isArray(value) ? value.filter(Boolean) : []), [value]);
  const canAddMore = images.length < max;
  const canPaste = !disabled && (canAddMore || max === 1);

  const addFiles = useCallback(
    async (files, { replace = false } = {}) => {
      const list = Array.from(files || []).filter(Boolean);
      if (!list.length || disabled) return;
      const base = replace && max === 1 ? [] : images;
      if (!replace && base.length >= max) return;
      setError('');
      setBusy(true);
      try {
        const room = Math.max(0, max - base.length);
        const chosen = list.slice(0, room);
        const finalized = [];
        for (const file of chosen) {
          // eslint-disable-next-line no-await-in-loop
          const stored = await fileToFinalizedImage(file);
          if (stored) finalized.push(stored);
        }
        if (finalized.length) onChange([...base, ...finalized]);
      } catch (err) {
        setError(err?.message || 'Could not add this picture.');
      } finally {
        setBusy(false);
      }
    },
    [disabled, images, max, onChange]
  );

  const handlePick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';
    await addFiles(files);
  };

  const pasteClipboardFiles = useCallback(
    (files) => {
      if (!files?.length) return;
      void addFiles(files, { replace: max === 1 && images.length >= 1 });
    },
    [addFiles, images.length, max]
  );

  const handlePasteEvent = useCallback(
    (e) => {
      if (!canPaste || busy) return;
      const files = filesFromClipboardData(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      pasteClipboardFiles(files);
    },
    [busy, canPaste, pasteClipboardFiles]
  );

  const handlePasteButton = async () => {
    if (!canPaste || busy) return;
    setError('');
    setBusy(true);
    try {
      const files = await filesFromClipboardApi();
      setBusy(false);
      pasteClipboardFiles(files);
    } catch (err) {
      setBusy(false);
      const name = err?.name || '';
      if (name === 'NotAllowedError') {
        setError('Clipboard permission denied. Allow paste when asked, or use Add slip → Gallery.');
      } else {
        setError(err?.message || 'Could not paste from clipboard.');
      }
    }
  };

  // Desktop: Ctrl/Cmd+V while this uploader is on screen.
  useEffect(() => {
    if (!canPaste) return undefined;
    const onPaste = (e) => {
      if (busy) return;
      const files = filesFromClipboardData(e.clipboardData);
      if (!files.length) return;
      const root = rootRef.current;
      const active = document.activeElement;
      if (active && root && !root.contains(active)) {
        const otherUploader = active.closest?.('[data-image-uploader]');
        if (otherUploader && otherUploader !== root) return;
      }
      e.preventDefault();
      pasteClipboardFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [busy, canPaste, pasteClipboardFiles]);

  const removeAt = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    onChange(next);
  };

  const openPreview = (src) => {
    const kind = receiptPreviewKind(src);
    setPreview({ kind, src });
  };

  const tileBtnStyle = {
    width: thumbSize,
    height: thumbSize,
    borderRadius: 10,
    border: '1px dashed #C7D2FE',
    background: '#F8FAFF',
    cursor: busy ? 'wait' : 'pointer',
    color: '#4338ca',
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  };

  return (
    <div
      ref={rootRef}
      data-image-uploader
      tabIndex={0}
      onPaste={handlePasteEvent}
      style={{ outline: 'none' }}
      aria-label={`${addLabel}. You can also paste an image from the clipboard.`}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {images.map((src, idx) => {
          const kind = receiptPreviewKind(src);
          return (
            <div
              key={idx}
              style={{
                position: 'relative',
                width: thumbSize,
                height: thumbSize,
                borderRadius: 10,
                border: '1px solid #E5E7EB',
                overflow: 'hidden',
                background: '#f8fafc',
                boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
              }}
            >
              <button
                type="button"
                onClick={() => openPreview(src)}
                title="View picture"
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  width: '100%',
                  height: '100%',
                  lineHeight: 0,
                }}
              >
                {kind === 'pdf' ? (
                  <span
                    style={{
                      display: 'flex',
                      width: '100%',
                      height: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#b91c1c',
                      background: '#FEF2F2',
                    }}
                  >
                    PDF
                  </span>
                ) : (
                  <img
                    src={src}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
              </button>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  aria-label="Remove picture"
                  title="Remove picture"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(17,24,39,0.75)',
                    color: '#fff',
                    fontSize: 13,
                    lineHeight: '20px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {!disabled && canAddMore && (
          <button
            type="button"
            onClick={() => {
              rootRef.current?.focus?.();
              inputRef.current?.click();
            }}
            disabled={busy}
            title="Pick from gallery or files"
            style={tileBtnStyle}
          >
            {busy ? (
              <Loader />
            ) : (
              <>
                <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 10, textAlign: 'center', padding: '0 4px' }}>
                  {addLabel}
                </span>
              </>
            )}
          </button>
        )}

        {canPaste && (
          <button
            type="button"
            onClick={() => void handlePasteButton()}
            disabled={busy}
            title="Paste image copied from WhatsApp or clipboard"
            style={{
              ...tileBtnStyle,
              borderColor: '#86efac',
              background: '#f0fdf4',
              color: '#166534',
            }}
          >
            {busy ? (
              <Loader />
            ) : (
              <>
                <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>
                  ⎘
                </span>
                <span style={{ fontSize: 10, textAlign: 'center', padding: '0 4px' }}>Paste</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple={max > 1}
        onChange={handlePick}
        style={{ display: 'none' }}
      />

      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        {images.length}/{max} pictures
        {max > 1 ? ' · JPG, PNG ya PDF' : ''}
        {!disabled ? (
          <>
            <br />
            Phone: WhatsApp pe slip long-press → Copy → yahan <strong>Paste</strong>. Warna{' '}
            <strong>{addLabel}</strong> se Gallery.
            <br />
            Computer: Ctrl+V / Cmd+V, ya Paste button.
          </>
        ) : null}
      </div>

      {error && <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626' }}>{error}</div>}

      {preview && (
        <Modal title="Picture" onClose={() => setPreview(null)}>
          {preview.kind === 'pdf' ? (
            <iframe
              src={preview.src}
              title="PDF"
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
              alt=""
              style={{ maxWidth: '100%', borderRadius: 8, display: 'block', margin: '0 auto' }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
