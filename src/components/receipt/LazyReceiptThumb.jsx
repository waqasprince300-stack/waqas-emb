import React, { useEffect, useRef, useState } from 'react';
import apiService from '../../services/api';
import { useApp } from '../../context/AppContext';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import ReceiptThumb, { receiptPreviewKind } from './ReceiptThumb';

/**
 * Shows a bill receipt thumbnail. Uses context receipt when present; otherwise
 * fetches a single lot's receipt on demand (keeps bootstrap fast).
 */
export default function LazyReceiptThumb({
  lotId,
  receipt: receiptProp,
  lotLabel,
  businessOwnerId,
  onOpen,
  emptyLabel = 'No bill',
  size = 44,
}) {
  const { patchLotReceipt, loadLedgerReceipts, ledgerReceiptsVersion } = useApp();
  const [localReceipt, setLocalReceipt] = useState('');
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const fetchedForRef = useRef('');
  const lastReceiptVersionRef = useRef(ledgerReceiptsVersion);

  const receipt = receiptProp || localReceipt;
  const kind = receiptPreviewKind(receipt);

  useEffect(() => {
    if (lastReceiptVersionRef.current !== ledgerReceiptsVersion) {
      lastReceiptVersionRef.current = ledgerReceiptsVersion;
      if (receiptPreviewKind(receiptProp) === 'none') {
        fetchedForRef.current = '';
        setLocalReceipt('');
        setChecked(false);
      }
    }
  }, [ledgerReceiptsVersion, receiptProp]);

  useEffect(() => {
    const propKind = receiptPreviewKind(receiptProp);
    if (propKind !== 'none') {
      setLocalReceipt('');
      setChecked(true);
      setLoading(false);
      fetchedForRef.current = '';
      return;
    }

    const id = String(lotId || '').trim();
    const biz = normalizedBusinessOwnerId(businessOwnerId);
    const fetchKey = `${id}:${biz}`;
    if (!id || fetchedForRef.current === fetchKey) return;

    let cancelled = false;
    setLoading(true);
    setChecked(false);

    (async () => {
      try {
        const row = await apiService.getPartyEditByLotId(id, {
          includeReceipts: true,
          businessOwnerId: biz || undefined,
        });
        if (cancelled) return;
        const r = row?.receipt ?? '';
        if (r) {
          fetchedForRef.current = fetchKey;
          setLocalReceipt(r);
          patchLotReceipt?.(id, r);
        } else {
          fetchedForRef.current = '';
        }
      } catch {
        if (!cancelled) {
          fetchedForRef.current = '';
          try {
            await loadLedgerReceipts?.({ force: true });
          } catch {
            /* bulk fallback also failed */
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setChecked(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lotId, receiptProp, businessOwnerId, patchLotReceipt, loadLedgerReceipts, ledgerReceiptsVersion]);

  if (kind !== 'none') {
    return <ReceiptThumb receipt={receipt} lotLabel={lotLabel} onOpen={onOpen} size={size} />;
  }

  if (loading) {
    return (
      <span
        className="skeleton-box"
        aria-label="Loading receipt"
        style={{ width: size, height: size, display: 'inline-block' }}
      />
    );
  }

  if (!checked) {
    return (
      <span
        className="skeleton-box"
        aria-label="Loading receipt"
        style={{ width: size, height: size, display: 'inline-block' }}
      />
    );
  }

  return (
    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
      {emptyLabel}
    </span>
  );
}
