import React from 'react';

/** @returns {'image'|'pdf'|'url'|'filename'|'none'} */
export function receiptPreviewKind(receipt) {
  const s = String(receipt || '').trim();
  if (!s) return 'none';
  if (/^data:image\//i.test(s)) return 'image';
  if (/^data:application\/pdf/i.test(s)) return 'pdf';
  if (/^https?:\/\//i.test(s)) return 'url';
  return 'filename';
}

export default function ReceiptThumb({ receipt, lotLabel, onOpen, size = 44 }) {
  const kind = receiptPreviewKind(receipt);
  if (kind === 'none') return null;

  const baseBtn = {
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: 8,
    lineHeight: 0,
    display: 'inline-block',
    verticalAlign: 'middle',
  };

  if (kind === 'image') {
    return (
      <button
        type="button"
        aria-label="View receipt image"
        title="View receipt"
        style={baseBtn}
        onClick={() => onOpen({ kind: 'image', src: receipt, title: lotLabel })}
      >
        <img
          src={receipt}
          alt=""
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'block',
          }}
        />
      </button>
    );
  }

  if (kind === 'pdf') {
    return (
      <button
        type="button"
        aria-label="View receipt PDF"
        title="View receipt PDF"
        style={{ ...baseBtn, padding: 6, background: '#FEF2F2', border: '1px solid #FECACA' }}
        onClick={() => onOpen({ kind: 'pdf', src: receipt, title: lotLabel })}
      >
        <span style={{ fontSize: size * 0.55 }}>PDF</span>
      </button>
    );
  }

  if (kind === 'url') {
    return (
      <button
        type="button"
        aria-label="View receipt"
        title="View receipt"
        style={baseBtn}
        onClick={() => onOpen({ kind: 'url', src: receipt, title: lotLabel })}
      >
        <img
          src={receipt}
          alt=""
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
            borderRadius: 8,
            border: '1px solid var(--border)',
            display: 'block',
            background: '#f3f4f6',
          }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Receipt file"
      title={receipt}
      style={{
        ...baseBtn,
        padding: '6px 8px',
        background: '#F0FDF4',
        border: '1px solid #BBF7D0',
        borderRadius: 8,
        fontSize: 12,
      }}
      onClick={() => onOpen({ kind: 'filename', name: receipt, title: lotLabel })}
    >
      File
    </button>
  );
}
