import React, { useEffect, useRef, useState } from 'react';
import apiService from '../../services/api';
import { useApp } from '../../context/AppContext';
import { normalizedBusinessOwnerId } from '../../utils/businessWorkspace';
import ReceiptThumb, { receiptPreviewKind } from './ReceiptThumb';

/**
 * Shows a bill receipt thumbnail without slowing down the page. The page + all data render first;
 * the bill image is fetched lazily and only when the row scrolls into view, so navigation stays
 * fast and we never bulk-download every bill. Rows known to have no bill never fetch.
 */
export default function LazyReceiptThumb({
  lotId,
  receipt: receiptProp,
  hasReceipt,
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
  const [inView, setInView] = useState(false);
  const fetchedForRef = useRef('');
  const lastReceiptVersionRef = useRef(ledgerReceiptsVersion);
  const containerRef = useRef(null);

  const receipt = receiptProp || localReceipt;
  const kind = receiptPreviewKind(receipt);
  // Default to allowing a fetch when the flag is missing (e.g. older payloads) for back-compat.
  const billExists = hasReceipt !== false;

  // A bumped receipt version means an upstream change (e.g. bill replaced) — drop the cached image.
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

  // Only start watching/fetching once the row is actually visible — keeps off-screen rows idle.
  useEffect(() => {
    if (receiptPreviewKind(receiptProp) !== 'none') return undefined;
    if (!billExists) return undefined;
    if (inView) return undefined;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [receiptProp, billExists, inView, ledgerReceiptsVersion]);

  useEffect(() => {
    const propKind = receiptPreviewKind(receiptProp);
    if (propKind !== 'none') {
      setLocalReceipt('');
      setChecked(true);
      setLoading(false);
      fetchedForRef.current = '';
      return undefined;
    }

    // No bill on this lot — show the empty label immediately, never hit the network.
    if (!billExists) {
      setLocalReceipt('');
      setLoading(false);
      setChecked(true);
      return undefined;
    }

    if (!inView) return undefined;

    const id = String(lotId || '').trim();
    const biz = normalizedBusinessOwnerId(businessOwnerId);
    const fetchKey = `${id}:${biz}`;
    if (!id || fetchedForRef.current === fetchKey) return undefined;

    let cancelled = false;
    setLoading(true);
    setChecked(false);

    // Defer slightly so the page paints first, then the bill streams in.
    const startFetch = async () => {
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
    };

    const schedule =
      typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
        ? (fn) => window.requestIdleCallback(fn, { timeout: 800 })
        : (fn) => setTimeout(fn, 80);
    const handle = schedule(() => {
      if (!cancelled) void startFetch();
    });

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        try {
          window.cancelIdleCallback(handle);
        } catch {
          /* ignore */
        }
      } else {
        clearTimeout(handle);
      }
    };
  }, [lotId, receiptProp, businessOwnerId, billExists, inView, patchLotReceipt, loadLedgerReceipts, ledgerReceiptsVersion]);

  if (kind !== 'none') {
    return <ReceiptThumb receipt={receipt} lotLabel={lotLabel} onOpen={onOpen} size={size} />;
  }

  if (billExists && (loading || !checked)) {
    return (
      <span
        ref={containerRef}
        className="skeleton-box"
        aria-label="Loading receipt"
        style={{ width: size, height: size, display: 'inline-block' }}
      />
    );
  }

  return (
    <span ref={containerRef} style={{ color: 'var(--text-muted)', fontSize: 12 }}>
      {emptyLabel}
    </span>
  );
}
