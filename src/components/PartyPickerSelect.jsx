import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * PartyPickerSelect — looks like a native select but on mobile (<768px)
 * opens an iPhone-inspired centered picker popup with smooth animations.
 * On desktop it renders a normal native <select>.
 */
export default function PartyPickerSelect({
  value,
  onChange,
  parties = [],
  placeholder = '— Select Party —',
  style = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const triggerRef = useRef(null);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const selectedParty = parties.find((p) => String(p.id) === String(value));
  const displayText = selectedParty ? selectedParty.name : placeholder;

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setClosing(false);
    }, 220);
  }, []);

  const handleSelect = useCallback((val) => {
    onChange(val);
    handleClose();
  }, [onChange, handleClose]);

  // Desktop: render normal native select
  if (!isMobile) {
    return (
      <div style={{ position: 'relative', ...style }}>
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary, #64748b)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          Party:
        </div>
        <select
          className="form-select"
          style={{ fontSize: 12, padding: '4px 8px 4px 42px', borderRadius: 6, width: '100%' }}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{placeholder}</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Mobile: custom trigger + popup
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="party-picker-trigger"
        style={style}
      >
        <span className="party-picker-label">Party:</span>
        <span className={`party-picker-value${!selectedParty ? ' placeholder' : ''}`}>
          {displayText}
        </span>
        <svg className="party-picker-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div className={`party-picker-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
            <div
              className={`party-picker-popup${closing ? ' closing' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="party-picker-handle">
                <div className="party-picker-handle-bar" />
              </div>

              {/* Title */}
              <div className="party-picker-title">Select Party</div>

              {/* Options list */}
              <div className="party-picker-options">
                <button
                  type="button"
                  className={`party-picker-option${!value ? ' selected' : ''}`}
                  onClick={() => handleSelect('')}
                >
                  <span>— None —</span>
                  {!value && <CheckIcon />}
                </button>
                {parties.map((p) => {
                  const isSel = String(p.id) === String(value);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`party-picker-option${isSel ? ' selected' : ''}`}
                      onClick={() => handleSelect(p.id)}
                    >
                      <span>{p.name}</span>
                      {isSel && <CheckIcon />}
                    </button>
                  );
                })}
              </div>

              {/* Cancel button */}
              <button type="button" className="party-picker-cancel" onClick={handleClose}>
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
