import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function titleCaseStatus(s) {
  return String(s || '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Custom status dropdown so the menu lines up with the trigger
 * (native OS &lt;select&gt; popups often sit left of the field).
 */
export default function LotStatusSelect({
  value,
  options = [],
  onChange,
  disabled = false,
  className = '',
  style,
  labelFor = (s) => titleCaseStatus(s),
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  const close = () => {
    setOpen(false);
    setMenuPos(null);
  };

  const placeMenu = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 168),
    });
  };

  const toggle = () => {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    placeMenu();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const onReposition = () => placeMenu();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  return (
    <>
      <div
        ref={wrapRef}
        style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}
      >
        <button
          type="button"
          className={`form-select lot-status-select${className ? ` ${className}` : ''}${open ? ' lot-status-select--open' : ''}`}
          style={{
            width: 168,
            minWidth: 168,
            fontSize: 12,
            padding: '5px 28px 5px 8px',
            textAlign: 'left',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.65 : 1,
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            ...style,
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={toggle}
        >
          {labelFor(value)}
        </button>
      </div>

      {open &&
        menuPos &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label="Lot status"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              margin: 0,
              padding: 4,
              listStyle: 'none',
              zIndex: 10050,
              background: '#fff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
              maxHeight: 'min(280px, calc(100vh - 24px))',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            {options.map((s) => {
              const selected = s === value;
              return (
                <li key={s} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      if (s !== value) onChange?.(s);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      background: selected ? '#334155' : 'transparent',
                      color: selected ? '#fff' : '#0f172a',
                      fontWeight: selected ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = '#f1f5f9';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {labelFor(s)}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </>
  );
}
