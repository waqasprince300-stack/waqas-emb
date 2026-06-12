import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Text/number input with a small suggestion list from saved + live lot data.
 */
export default function LotFieldSuggest({
  value,
  onChange,
  suggestions = [],
  placeholder,
  className = 'form-input',
  type = 'text',
  min,
  disabled,
  inputMode,
}) {
  const listId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => suggestions, [suggestions]);
  const showList = open && filtered.length > 0 && !disabled;

  useEffect(() => {
    setActive(0);
  }, [value, filtered.length]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[active]) {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className={className}
        type={type}
        min={min}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        aria-expanded={showList}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 4px)',
            zIndex: 50,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 10,
            boxShadow: '0 10px 28px rgba(15,23,42,0.12)',
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {filtered.map((s, i) => (
            <li key={`${s}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: i === active ? '#eef2ff' : 'transparent',
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: i === active ? 700 : 500,
                  color: '#0f172a',
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
