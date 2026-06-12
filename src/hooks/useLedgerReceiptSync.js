import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

/** Default poll while Party Ledger is open. */
const RECEIPT_POLL_MS = 12_000;
/** Review Lots — admin approves here; poll faster when party uploads a bill. */
const REVIEW_LOTS_POLL_MS = 5_000;

/**
 * Keeps bill thumbnails in sync when another user (e.g. party) uploads on another device.
 * No full browser refresh needed.
 * @param {{ pollMs?: number }} [opts]
 */
export function useLedgerReceiptSync(opts = {}) {
  const { loadLedgerReceipts } = useApp();
  const pollMs = opts.pollMs ?? RECEIPT_POLL_MS;

  useEffect(() => {
    const pull = () => void loadLedgerReceipts({ force: true });

    pull();

    const interval = setInterval(pull, pollMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') pull();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadLedgerReceipts, pollMs]);
}

export { RECEIPT_POLL_MS, REVIEW_LOTS_POLL_MS };
