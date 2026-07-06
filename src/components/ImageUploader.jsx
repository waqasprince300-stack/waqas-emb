import React, { useRef, useState } from "react";
import { Modal } from "./UI";
import Loader from "./Loader";
import { fileToFinalizedImage } from "../utils/imageCompress";
import { receiptPreviewKind } from "./receipt/ReceiptThumb";

/**
 * Reusable picture uploader for lot pictures / payment slips.
 * Stores each picture as a compressed base64 data URL (image) or a data URL (PDF).
 *
 * @param {string[]} value      Current stored images (data URLs).
 * @param {(next:string[])=>void} onChange
 * @param {number}  [max]       Max number of images (default 6).
 * @param {boolean} [disabled]
 * @param {string}  [addLabel]
 */
export default function ImageUploader({
  value = [],
  onChange,
  max = 6,
  disabled = false,
  addLabel = "Add picture",
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const images = Array.isArray(value) ? value.filter(Boolean) : [];
  const canAddMore = images.length < max;

  const handlePick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = "";
    if (!files.length) return;
    setError("");
    setBusy(true);
    try {
      const room = Math.max(0, max - images.length);
      const chosen = files.slice(0, room);
      const finalized = [];
      for (const file of chosen) {
        // eslint-disable-next-line no-await-in-loop
        const stored = await fileToFinalizedImage(file);
        if (stored) finalized.push(stored);
      }
      if (finalized.length) onChange([...images, ...finalized]);
    } catch (err) {
      setError(err?.message || "Could not add this picture.");
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (idx) => {
    const next = images.filter((_, i) => i !== idx);
    onChange(next);
  };

  const openPreview = (src) => {
    const kind = receiptPreviewKind(src);
    setPreview({ kind, src });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        {images.map((src, idx) => {
          const kind = receiptPreviewKind(src);
          return (
            <div
              key={idx}
              style={{
                position: "relative",
                width: 72,
                height: 72,
                borderRadius: 8,
                border: "1px solid var(--border)",
                overflow: "hidden",
                background: "#f3f4f6",
              }}
            >
              <button
                type="button"
                onClick={() => openPreview(src)}
                title="View picture"
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  width: "100%",
                  height: "100%",
                  lineHeight: 0,
                }}
              >
                {kind === "pdf" ? (
                  <span
                    style={{
                      display: "flex",
                      width: "100%",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#b91c1c",
                      background: "#FEF2F2",
                    }}
                  >
                    PDF
                  </span>
                ) : (
                  <img
                    src={src}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(17,24,39,0.75)",
                    color: "#fff",
                    fontSize: 13,
                    lineHeight: "20px",
                    cursor: "pointer",
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
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              border: "1px dashed var(--border)",
              background: "#fff",
              cursor: busy ? "wait" : "pointer",
              color: "var(--text-secondary)",
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            {busy ? (
              <Loader />
            ) : (
              <>
                <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
                <span style={{ fontSize: 10, textAlign: "center", padding: "0 4px" }}>
                  {addLabel}
                </span>
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
        style={{ display: "none" }}
      />

      <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>
        {images.length}/{max} pictures{max > 1 ? " · JPG, PNG ya PDF" : ""}
      </div>

      {error && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#dc2626" }}>{error}</div>
      )}

      {preview && (
        <Modal title="Picture" onClose={() => setPreview(null)}>
          {preview.kind === "pdf" ? (
            <iframe
              src={preview.src}
              title="PDF"
              style={{
                width: "100%",
                height: "70vh",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            />
          ) : (
            <img
              src={preview.src}
              alt=""
              style={{ maxWidth: "100%", borderRadius: 8, display: "block", margin: "0 auto" }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
