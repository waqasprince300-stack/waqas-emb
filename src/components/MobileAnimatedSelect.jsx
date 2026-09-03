import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * MobileAnimatedSelect — looks like a native select but on mobile (<768px)
 * opens an iPhone-inspired centered picker popup with smooth animations.
 * On desktop it renders a normal native <select>.
 */
export default function MobileAnimatedSelect({
  value,
  onChange,
  options = [], // { value, label }
  placeholder = '— Select —',
  label = '', // e.g., "Party:", "Status:"
  style = {},
  className = '',
  id = '',
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

  const selectedOption = options.find((o) => String(o.value) === String(value));
  const displayText = selectedOption ? selectedOption.label : placeholder;

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
      <select
        id={id}
        className={className}
        style={style}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="All">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // Mobile: custom trigger + popup
  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className={`party-picker-trigger ${className}`}
        style={{ ...style, minHeight: 44, padding: '0 12px', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {label && <span className="party-picker-label">{label}</span>}
          <span className={`party-picker-value${!selectedOption ? ' placeholder' : ''}`}>
            {displayText}
          </span>
        </div>
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
              <div className="party-picker-handle">
                <div className="party-picker-handle-bar" />
              </div>

              <div className="party-picker-title">{placeholder}</div>

              <div className="party-picker-options">
                <button
                  type="button"
                  className={`party-picker-option${value === 'All' || !value ? ' selected' : ''}`}
                  onClick={() => handleSelect('All')}
                >
                  <span>{placeholder}</span>
                  {(value === 'All' || !value) && <CheckIcon />}
                </button>
                {options.map((o) => {
                  const isSel = String(o.value) === String(value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`party-picker-option${isSel ? ' selected' : ''}`}
                      onClick={() => handleSelect(o.value)}
                    >
                      <span>{o.label}</span>
                      {isSel && <CheckIcon />}
                    </button>
                  );
                })}
              </div>

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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-light, #2563eb)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
