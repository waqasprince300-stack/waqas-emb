import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { connectRealtime, disconnectRealtime, onDataChanged } from '../services/realtime';
import { useAuth } from './AuthContext';
import {
  normalizedBusinessOwnerId,
  workspaceLabelEmbeddedInLot,
} from '../utils/businessWorkspace';

const AppContext = createContext(null);

const normalizeDateString = (value) => {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date?.toISOString()?.slice(0, 10);
};

/** API may populate `businessOwnerId` as `{ _id, name }`; UI keeps a string id. */
function businessOwnerIdToString(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object' && raw !== null) {
    const oid = raw._id ?? raw.id;
    if (oid != null) return String(oid);
  }
  return String(raw);
}

const normalizeLotData = (lot) => {
  const id = lot.id || lot._id || '';
  const lotNumber = lot.lotNumber || lot.lotNo || '';
  const itemType = lot.itemType || lot.fabric || '';
  const fabric = lot.fabric || lot.itemType || '';
  const quantity = Number(lot.quantity ?? lot.pieces ?? 0);
  const pieces = Number(lot.pieces ?? lot.quantity ?? 0);
  const partyId = lot.partyId != null && lot.partyId !== '' ? String(lot.partyId) : '';
  const status = typeof lot.status === 'string'
    ? lot.status
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .toLowerCase()
    : 'pending';

  return {
    ...lot,
    id,
    lotNumber,
    lotNo: lotNumber,
    designNo: lot.designNo || '',
    description: lot.description || lot.notes || '',
    fabric,
    itemType,
    customFabric: lot.customFabric || '',
    colors: Number(lot.colors ?? 0),
    quantity,
    pieces,
    unit: lot.unit || 'pieces',
    rate: Number(lot.rate ?? 0),
    billAmount: Number(lot.billAmount ?? 0),
    totalAmount: Number(lot.totalAmount ?? lot.billAmount ?? 0),
    partyId,
    partyName: lot.partyName || '',
    businessOwnerId: businessOwnerIdToString(lot.businessOwnerId),
    allotDate: normalizeDateString(lot.allotDate || lot.receivedDate || lot.createdAt || lot.updatedAt),
    dispatchDate: normalizeDateString(lot.dispatchDate),
    receivedBackDate: normalizeDateString(lot.receivedBackDate),
    receivedDate: normalizeDateString(lot.receivedDate),
    status: status || 'Pending',
    notes: lot.notes || '',
    rejectionNote: lot.rejectionNote ? String(lot.rejectionNote).trim() : '',
    embeddedWorkspaceName: workspaceLabelEmbeddedInLot(lot),
  };
};

const INITIAL_PARTIES = [];

const INITIAL_GHAUSIA = [];

// Party ledger entries are derived from ghausia lots (when assigned to a party)
// They can have extra editable fields: completeDate, partyBillAmount, receipt
const INITIAL_PARTY_EDITS = {};

const INITIAL_PAYMENTS = [];
const BUSINESS_OWNER_KEY = 'waqas_emb_business_owner_id';
/** UI-only flag: show merged lots across all business workspaces without breaking API headers */
const WORKSPACE_VIEW_ALL_KEY = 'waqas_emb_workspace_view_all';

/** Dropdown value for BusinessOwnerSwitcher → “All workspaces”. */
export const ADMIN_ALL_WORKSPACES_ID = '__all_workspaces__';

/** Mongo/API may return only `_id`; UI uses `id` everywhere. */
const normalizeParty = (p) => {
  if (!p) return p;
  const rawId = p.id ?? p._id;
  const id = rawId != null && rawId !== '' ? String(rawId) : '';
  return { ...p, id };
};

const normalizeOwners = (owners) =>
  (Array.isArray(owners) ? owners : []).map((o) => {
    const id = normalizedBusinessOwnerId(o?.id ?? o?._id);
    return { ...o, id, _id: id };
  });

const FULL_REFRESH_INTERVAL_MS = 45_000;
/** Minimum gap between background refreshes triggered by page navigation (prevents API spam). */
const NAV_REFRESH_MIN_INTERVAL_MS = 10_000;
/** Realtime pushes mean data actually changed, so refresh quickly but still coalesce bursts. */
const REALTIME_MIN_INTERVAL_MS = 2_500;
/** After a local write, keep background/realtime refreshes paused this long so optimistic
 *  state isn't overwritten by a slightly-stale refetch mid-operation (cause of double entries). */
const WRITE_SETTLE_MS = 1_500;

const partyEditsArrayToMap = (remotePartyEdits) => {
  if (!Array.isArray(remotePartyEdits)) return INITIAL_PARTY_EDITS;
  return remotePartyEdits.reduce((acc, item) => {
    const lotId = item.lotId != null ? String(item.lotId) : '';
    if (!lotId) return acc;
    acc[lotId] = {
      ...item,
      completeDate: item.completeDate ? normalizeDateString(item.completeDate) : '',
      allotDate: item.allotDate ? normalizeDateString(item.allotDate) : '',
    };
    return acc;
  }, {});
};

/** Merge bootstrap party edits without wiping already-hydrated receipt images / lot pictures. */
const mergePartyEditsFromRemote = (remotePartyEdits, prev = {}) => {
  if (!Array.isArray(remotePartyEdits)) return prev;
  const incoming = partyEditsArrayToMap(remotePartyEdits);
  const next = { ...prev };
  Object.keys(incoming).forEach((lotId) => {
    const remote = incoming[lotId];
    const existing = prev[lotId];
    const remoteReceipt = remote.receipt;
    // Lot pictures are excluded from list payloads; keep the hydrated copy when the remote omits them.
    const remoteLotImages = Array.isArray(remote.lotImages) ? remote.lotImages : undefined;
    next[lotId] = {
      ...remote,
      receipt:
        remoteReceipt != null && remoteReceipt !== ''
          ? remoteReceipt
          : (existing?.receipt ?? ''),
      lotImages:
        remoteLotImages !== undefined
          ? remoteLotImages
          : (existing?.lotImages ?? []),
    };
  });
  return next;
};

export function AppProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [parties, setParties] = useState(INITIAL_PARTIES);
  const [ghausiaLots, setGhausiaLots] = useState(INITIAL_GHAUSIA);
  const [partyEdits, setPartyEdits] = useState(INITIAL_PARTY_EDITS);
  const [payments, setPayments] = useState(INITIAL_PAYMENTS);
  const [businessOwners, setBusinessOwners] = useState([]);
  const [activeBusinessOwnerId, setActiveBusinessOwnerId] = useState(() => {
    try {
      return localStorage.getItem(BUSINESS_OWNER_KEY) || '';
    } catch {
      return '';
    }
  });
  const [adminReportingLots, setAdminReportingLots] = useState(INITIAL_GHAUSIA);
  const [adminReportingPayments, setAdminReportingPayments] = useState(INITIAL_PAYMENTS);
  const [adminReportingPartyEdits, setAdminReportingPartyEdits] = useState(INITIAL_PARTY_EDITS);
  /** Party login: all businesses — used for Party Ledger only */
  const [partyCrossLots, setPartyCrossLots] = useState(INITIAL_GHAUSIA);
  const [partyCrossPartyEdits, setPartyCrossPartyEdits] = useState(INITIAL_PARTY_EDITS);
  const [partyCrossPayments, setPartyCrossPayments] = useState(INITIAL_PAYMENTS);
  /** 'idle' = nothing yet, 'minimal' = dashboard/reporting data ready, 'full' = scoped data ready. */
  const [initialDataPhase, setInitialDataPhase] = useState('idle');
  const [scopedDataLoading, setScopedDataLoading] = useState(true);
  /** True only during a background (post-navigation) refresh — does NOT block the UI. */
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [bootstrapLoadError, setBootstrapLoadError] = useState(null);
  const queryClient = useQueryClient();
  const hasLoadedOnceRef = useRef(false);
  /** Bumped to re-run the loader for a background refresh (e.g. on page navigation). */
  const [refreshTick, setRefreshTick] = useState(0);
  const lastRefreshRef = useRef(0);
  const lastFullBootstrapRef = useRef(0);
  /** Last time ANY refresh (light or full) actually hit the network — used to skip rapid nav refetches. */
  const lastAnyRefreshRef = useRef(0);
  /** Number of in-flight write requests + timestamp of the last one — pauses refresh while saving. */
  const pendingWritesRef = useRef(0);
  const lastWriteAtRef = useRef(0);
  /** True when selecting a different workspace (vs first load / nav refresh) — enables cache-first switch. */
  const workspaceSwitchRef = useRef(false);
  const loadGenerationRef = useRef(0);
  /** True for the next loader run only when it was triggered as a non-blocking background refresh. */
  const isBackgroundRefreshRef = useRef(false);
  const initialDataLoading = initialDataPhase === 'idle';

  const applyReporting = useCallback((reporting) => {
    if (!reporting) return;
    if (Array.isArray(reporting.lots)) setAdminReportingLots(reporting.lots.map(normalizeLotData));
    if (Array.isArray(reporting.payments)) setAdminReportingPayments(reporting.payments);
    if (Array.isArray(reporting.partyEdits)) {
      setAdminReportingPartyEdits((prev) => mergePartyEditsFromRemote(reporting.partyEdits, prev));
    }
  }, []);

  const applyPartyCross = useCallback((cross) => {
    if (!cross) return;
    if (Array.isArray(cross.lots)) setPartyCrossLots(cross.lots.map(normalizeLotData));
    if (Array.isArray(cross.payments)) setPartyCrossPayments(cross.payments);
    if (Array.isArray(cross.partyEdits)) {
      setPartyCrossPartyEdits((prev) => mergePartyEditsFromRemote(cross.partyEdits, prev));
    }
  }, []);

  const applyScoped = useCallback((data) => {
    if (Array.isArray(data.ghausiaLots)) setGhausiaLots(data.ghausiaLots.map(normalizeLotData));
    if (Array.isArray(data.payments)) setPayments(data.payments);
    if (Array.isArray(data.partyEdits)) {
      setPartyEdits((prev) => mergePartyEditsFromRemote(data.partyEdits, prev));
    }
  }, []);

  const ledgerReceiptsLoadRef = useRef(null);
  /** Bumped after each successful ledger receipt pull — lets thumbnails retry. */
  const [ledgerReceiptsVersion, setLedgerReceiptsVersion] = useState(0);

  const mergeReceiptRows = useCallback((setter, rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    setter((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        const lotId = row?.lotId != null ? String(row.lotId) : '';
        if (!lotId) return;
        const incomingReceipt = row.receipt ?? '';
        const incomingLotImages = Array.isArray(row.lotImages) ? row.lotImages : undefined;
        if (!incomingReceipt && incomingLotImages === undefined) return;
        const existing = next[lotId] || { lotId };
        next[lotId] = {
          ...existing,
          ...(incomingReceipt ? { receipt: incomingReceipt } : {}),
          ...(incomingLotImages !== undefined ? { lotImages: incomingLotImages } : {}),
        };
      });
      return next;
    });
  }, []);

  /**
   * Load bill images for Party Ledger / Review Lots.
   * Uses the existing bulk partyEdits API (works on production). Per-lot lazy fetch
   * is preferred when the server supports GET /partyEdits/lot/:id.
   */
  const loadLedgerReceipts = useCallback(async (opts = {}) => {
    if (!isAuthenticated) return;
    if (user?.role !== 'admin' && user?.role !== 'party') return;

    if (opts.force) {
      ledgerReceiptsLoadRef.current = null;
    } else if (ledgerReceiptsLoadRef.current) {
      return ledgerReceiptsLoadRef.current;
    }

    const task = (async () => {
      try {
        if (user?.role === 'admin') {
          const reporting = await apiService.getPartyEdits({
            scope: 'all',
            includeReceipts: true,
          });
          mergeReceiptRows(setAdminReportingPartyEdits, reporting);
        } else {
          const cross = await apiService.getPartyEdits({
            skipTenantHeader: true,
            partyScope: 'all',
            includeReceipts: true,
          });
          mergeReceiptRows(setPartyCrossPartyEdits, cross);
        }
        setLedgerReceiptsVersion((v) => v + 1);
      } catch (error) {
        console.warn('Ledger receipt load failed', error);
        ledgerReceiptsLoadRef.current = null;
        throw error;
      }
    })();

    ledgerReceiptsLoadRef.current = task;
    return task;
  }, [isAuthenticated, mergeReceiptRows, user?.role]);

  /** Drop a single lot's cached bill image so the thumbnail re-fetches it (e.g. bill replaced). */
  const invalidateLotReceipt = useCallback((lotId) => {
    const id = lotId != null ? String(lotId) : '';
    if (!id) return;
    const clear = (prev) => {
      const existing = prev[id];
      if (!existing || !existing.receipt) return prev;
      return { ...prev, [id]: { ...existing, receipt: '' } };
    };
    setPartyEdits(clear);
    setAdminReportingPartyEdits(clear);
    setPartyCrossPartyEdits(clear);
  }, []);

  /** Cache a single lot receipt after lazy fetch (avoids bulk hydration). */
  const patchLotReceipt = useCallback((lotId, receipt) => {
    if (!lotId || !receipt) return;
    const merge = (prev) => {
      const existing = prev[lotId];
      if (existing?.receipt === receipt) return prev;
      return { ...prev, [lotId]: { ...(existing || { lotId }), receipt } };
    };
    setPartyEdits(merge);
    if (user?.role === 'admin') setAdminReportingPartyEdits(merge);
    if (user?.role === 'party') setPartyCrossPartyEdits(merge);
  }, [user?.role]);

  /** Track a write request so background/realtime refreshes pause until it settles. */
  const trackWrite = useCallback((promise) => {
    pendingWritesRef.current += 1;
    return Promise.resolve(promise).finally(() => {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      lastWriteAtRef.current = Date.now();
    });
  }, []);

  /** True while a write is in flight or just settled — used to skip refetches that could
   *  overwrite correct optimistic state mid-save (prevents flicker + duplicate entries). */
  const isRefreshSuppressed = useCallback(
    () => pendingWritesRef.current > 0 || Date.now() - lastWriteAtRef.current < WRITE_SETTLE_MS,
    [],
  );

  const runLightBootstrapRefresh = useCallback(async () => {
    if (!isAuthenticated || user?.role === 'super_admin' || user?.role === 'personal_khata') return;
    // A save is in progress (or just finished) — its optimistic update is already correct.
    if (isRefreshSuppressed()) return;

    const gen = ++loadGenerationRef.current;
    const isAdminUser = user?.role === 'admin';
    const partyOpts = isAdminUser ? {} : { skipTenantHeader: true };

    setBackgroundRefreshing(true);
    try {
      // A single full bootstrap already contains parties + reporting/partyCross + scoped rows.
      // Avoid the extra "minimal" round-trip here so navigation refreshes hit the DB once, not twice.
      const full = await queryClient.fetchQuery({
        queryKey: ['bootstrap', user?._id, user?.role, isAdminUser ? String(activeBusinessOwnerId || '') : 'party', 'full'],
        queryFn: () => apiService.getBootstrap({ ...partyOpts }),
        staleTime: 0,
      });
      if (gen !== loadGenerationRef.current) return;

      if (Array.isArray(full?.parties)) setParties(full.parties.map(normalizeParty));
      applyScoped(full || {});
      if (isAdminUser) {
        applyReporting(full?.reporting);
      } else {
        setBusinessOwners(normalizeOwners(full?.businessOwners));
        applyPartyCross(full?.partyCross);
      }
      setBootstrapLoadError(null);
    } catch (error) {
      if (gen === loadGenerationRef.current) {
        console.warn('Background refresh failed', error);
      }
    } finally {
      if (gen === loadGenerationRef.current) {
        setBackgroundRefreshing(false);
      }
    }
  }, [
    activeBusinessOwnerId,
    applyPartyCross,
    applyReporting,
    applyScoped,
    isAuthenticated,
    isRefreshSuppressed,
    queryClient,
    user?._id,
    user?.role,
  ]);

  const readViewAllWorkspaces = () => {
    try {
      return localStorage.getItem(WORKSPACE_VIEW_ALL_KEY) === '1';
    } catch {
      return false;
    }
  };

  const [viewAllWorkspaces, setViewAllWorkspaces] = useState(readViewAllWorkspaces);

  /** Local CRUD keeps state in sync per workspace; drop cached bootstrap so a workspace switch refetches fresh data. */
  const invalidateBootstrapCache = () => {
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
  };

  /**
   * Background refresh of all app data (no full-screen loader). Used on page navigation so each
   * page shows the latest server state without a manual browser reload. Throttled to avoid spam.
   */
  const refreshData = useCallback((opts = {}) => {
    if (!isAuthenticated) return;
    if (user?.role === 'super_admin' || user?.role === 'personal_khata') return;
    // Don't refetch while a save is in flight/settling — would race optimistic state.
    if (isRefreshSuppressed() && !opts.force) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 800 && !opts.force) return;
    lastRefreshRef.current = now;

    if (opts.force) {
      lastFullBootstrapRef.current = 0;
    }

    // Skip rapid navigation refetches: if we refreshed in the last 10s, the data is fresh enough.
    // This stops the "bar bar API call" churn when the user hops between pages quickly.
    if (
      hasLoadedOnceRef.current
      && !opts.force
      && now - lastAnyRefreshRef.current < NAV_REFRESH_MIN_INTERVAL_MS
    ) {
      return;
    }

    if (
      hasLoadedOnceRef.current
      && !opts.force
      && now - lastFullBootstrapRef.current < FULL_REFRESH_INTERVAL_MS
    ) {
      lastAnyRefreshRef.current = now;
      void runLightBootstrapRefresh();
      return;
    }

    lastFullBootstrapRef.current = now;
    lastAnyRefreshRef.current = now;
    isBackgroundRefreshRef.current = true;
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
    setRefreshTick((t) => t + 1);
  }, [isAuthenticated, isRefreshSuppressed, user?.role, queryClient, runLightBootstrapRefresh]);

  const selectBusinessOwner = (id) => {
    const nextId = String(id || '');
    if (nextId === String(activeBusinessOwnerId || '') && !viewAllWorkspaces) {
      return;
    }
    try {
      localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
    } catch { /* ignore */ }
    // Keep React Query's per-workspace cache so revisiting a workspace is instant (cache-first);
    // the loader below refreshes it in the background. Don't wipe the cache on a plain switch.
    workspaceSwitchRef.current = true;
    setViewAllWorkspaces(false);
    localStorage.setItem(BUSINESS_OWNER_KEY, nextId);
    setActiveBusinessOwnerId(nextId);
  };

  const selectAllWorkspacesView = () => {
    try {
      localStorage.setItem(WORKSPACE_VIEW_ALL_KEY, '1');
    } catch { /* ignore */ }
    setViewAllWorkspaces(true);
  };

  useEffect(() => {
    const clearAllData = () => {
      setParties(INITIAL_PARTIES);
      setGhausiaLots(INITIAL_GHAUSIA);
      setPartyEdits(INITIAL_PARTY_EDITS);
      setPayments(INITIAL_PAYMENTS);
      setAdminReportingLots(INITIAL_GHAUSIA);
      setAdminReportingPayments(INITIAL_PAYMENTS);
      setAdminReportingPartyEdits(INITIAL_PARTY_EDITS);
      setPartyCrossLots(INITIAL_GHAUSIA);
      setPartyCrossPartyEdits(INITIAL_PARTY_EDITS);
      setPartyCrossPayments(INITIAL_PAYMENTS);
      setBusinessOwners([]);
    };

    const markLoaded = (didFullBootstrap = false) => {
      setInitialDataPhase('full');
      setScopedDataLoading(false);
      setBackgroundRefreshing(false);
      hasLoadedOnceRef.current = true;
      if (didFullBootstrap) {
        lastFullBootstrapRef.current = Date.now();
      }
    };

    // Roles without business data: clear and finish immediately.
    if (!isAuthenticated || user?.role === 'super_admin' || user?.role === 'personal_khata') {
      clearAllData();
      try {
        localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
      } catch { /* ignore */ }
      setViewAllWorkspaces(false);
      markLoaded();
      return;
    }

    const isAdminUser = user?.role === 'admin';
    /** Party JWT is cross-workspace — never reuse admin cached `x-business-owner-id` from localStorage. */
    const partyOpts = isAdminUser ? {} : { skipTenantHeader: true };

    const fullBootstrapKey = ['bootstrap', user?._id, user?.role, isAdminUser ? String(activeBusinessOwnerId || '') : 'party', 'full'];

    const applyFullPayload = (full) => {
      if (Array.isArray(full?.parties)) setParties(full.parties.map(normalizeParty));
      applyScoped(full || {});
      if (isAdminUser) {
        applyReporting(full?.reporting);
      } else {
        setBusinessOwners(normalizeOwners(full?.businessOwners));
        applyPartyCross(full?.partyCross);
      }
    };

    async function loadAppData() {
      const gen = ++loadGenerationRef.current;
      const isFirst = !hasLoadedOnceRef.current;
      // A plain workspace switch already knows a valid owner — skip the minimal round-trip and
      // show cached workspace data instantly (cache-first), refreshing in the background.
      const isWorkspaceSwitch = !isFirst && workspaceSwitchRef.current;
      workspaceSwitchRef.current = false;
      // Background nav refresh: don't block the UI. First load keeps the loader.
      const isBg = !isFirst && !isWorkspaceSwitch && isBackgroundRefreshRef.current;
      isBackgroundRefreshRef.current = false;

      if (isFirst) {
        setInitialDataPhase('idle');
        setScopedDataLoading(true);
        setBootstrapLoadError(null);
      } else if (isWorkspaceSwitch) {
        const cached = queryClient.getQueryData(fullBootstrapKey);
        if (cached) {
          applyFullPayload(cached);
          setScopedDataLoading(false);
          setBackgroundRefreshing(true);
        } else {
          setScopedDataLoading(true);
        }
      } else if (isBg) {
        setBackgroundRefreshing(true);
      } else {
        setScopedDataLoading(true);
      }

      try {
        // Phase A — minimal payload (resolves owners / active workspace). Skipped on a plain switch.
        if (!isWorkspaceSwitch) {
          const minimal = await queryClient.fetchQuery({
            queryKey: ['bootstrap', user?._id, user?.role, 'minimal'],
            queryFn: () => apiService.getBootstrap({ minimal: true, ...partyOpts }),
          });
          if (gen !== loadGenerationRef.current) return;

          if (Array.isArray(minimal?.parties)) setParties(minimal.parties.map(normalizeParty));

          if (isAdminUser) {
            const remoteOwners = normalizeOwners(minimal?.businessOwners);
              setBusinessOwners(remoteOwners);
              if (remoteOwners.length === 0) {
                try {
                  localStorage.removeItem(BUSINESS_OWNER_KEY);
                  localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
                } catch { /* ignore */ }
                setViewAllWorkspaces(false);
                setActiveBusinessOwnerId('');
              clearAllData();
              markLoaded(true);
                return;
              }
              const selectedExists = remoteOwners.some((owner) => String(owner.id || owner._id) === String(activeBusinessOwnerId));
              const nextOwner = selectedExists
                ? activeBusinessOwnerId
                : String(remoteOwners[0]?.id || remoteOwners[0]?._id || '');
              if (nextOwner && nextOwner !== activeBusinessOwnerId) {
                localStorage.setItem(BUSINESS_OWNER_KEY, nextOwner);
                setActiveBusinessOwnerId(nextOwner);
              return; // effect re-runs with the resolved workspace; minimal comes from cache
            }
            applyReporting(minimal?.reporting);
          } else {
            setBusinessOwners(normalizeOwners(minimal?.businessOwners));
            applyPartyCross(minimal?.partyCross);
          }

          if (gen !== loadGenerationRef.current) return;
          setInitialDataPhase('minimal');
        }

        // Phase B — full payload: workspace-scoped lots/payments/partyEdits for Ghausia / Payments.
        const full = await queryClient.fetchQuery({
          queryKey: fullBootstrapKey,
          queryFn: () => apiService.getBootstrap({ ...partyOpts }),
        });
        if (gen !== loadGenerationRef.current) return;

        if (Array.isArray(full?.parties)) setParties(full.parties.map(normalizeParty));
        applyScoped(full || {});
        if (isAdminUser) {
          applyReporting(full?.reporting);
        } else {
          setBusinessOwners(normalizeOwners(full?.businessOwners));
          applyPartyCross(full?.partyCross);
        }
        setBootstrapLoadError(null);
        markLoaded(true);
      } catch (error) {
        console.error('Unable to load bootstrap data', error);
        if (gen === loadGenerationRef.current && isFirst) {
          setBootstrapLoadError(error?.message || 'Unable to load data');
        }
        if (gen === loadGenerationRef.current) {
          markLoaded(false);
        }
      }
    }

    loadAppData();
  }, [
    activeBusinessOwnerId,
    applyPartyCross,
    applyReporting,
    applyScoped,
    isAuthenticated,
    user?._id,
    user?.role,
    queryClient,
    refreshTick,
  ]);

  // When the user returns to this tab, refresh metadata + bill thumbnails (party may have uploaded).
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (user?.role === 'super_admin' || user?.role === 'personal_khata') return undefined;

    let timer = null;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasLoadedOnceRef.current) {
        // Don't refetch if a refresh already ran very recently (e.g. navigation just triggered one).
        if (Date.now() - lastAnyRefreshRef.current < NAV_REFRESH_MIN_INTERVAL_MS) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          lastAnyRefreshRef.current = Date.now();
          // Refresh row data + bill presence flags only; images stay lazy per visible row.
          void runLightBootstrapRefresh();
        }, 300);
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, user?.role, runLightBootstrapRefresh]);

  // Realtime: when anyone in the same org writes (e.g. a party uploads/saves a bill), the backend
  // pushes a "data:changed" event so this client refreshes within ~1s — no aggressive polling.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (user?.role !== 'admin' && user?.role !== 'party') return undefined;

    connectRealtime();
    let timer = null;
    const pendingLotIds = new Set();
    const handleChange = (payload) => {
      if (!hasLoadedOnceRef.current) return;
      // Remember which lots changed so we can drop just their cached bill image (cheap, no bulk).
      const lotId = payload && payload.lotId != null ? String(payload.lotId) : '';
      if (lotId) pendingLotIds.add(lotId);

      if (Date.now() - lastAnyRefreshRef.current < REALTIME_MIN_INTERVAL_MS) {
        // A refresh just ran; let it settle, then reconcile once more shortly.
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => handleChange(null), REALTIME_MIN_INTERVAL_MS);
        return;
      }
      if (timer) clearTimeout(timer);
      // Small debounce so a burst of events (multiple rows) collapses into one refresh.
      timer = setTimeout(() => {
        // A local save is in flight/settling — defer so we don't race optimistic state.
        if (isRefreshSuppressed()) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => handleChange(null), WRITE_SETTLE_MS);
          return;
        }
        lastAnyRefreshRef.current = Date.now();
        // Invalidate only the changed lots' cached images, then refresh row data + bill flags.
        pendingLotIds.forEach((id) => invalidateLotReceipt(id));
        pendingLotIds.clear();
        setLedgerReceiptsVersion((v) => v + 1);
        void runLightBootstrapRefresh();
      }, 400);
    };

    const unsubscribe = onDataChanged(handleChange);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, user?.role, runLightBootstrapRefresh, invalidateLotReceipt, isRefreshSuppressed]);

  // Tear down the socket entirely when the user signs out.
  useEffect(() => {
    if (!isAuthenticated) disconnectRealtime();
  }, [isAuthenticated]);

  const createBusinessOwner = async (data) => {
    const created = await apiService.createBusinessOwner(data);
    invalidateBootstrapCache();
    setBusinessOwners((current) => [...current, created]);
    selectBusinessOwner(created.id || created._id);
    return created;
  };

  const deleteBusinessOwner = async (id, opts = {}) => {
    const idStr = String(id ?? '').trim();
    if (!idStr) return;
    await apiService.deleteBusinessOwner(id, opts);
    invalidateBootstrapCache();

    const removedLotIds = new Set();
    for (const l of ghausiaLots) {
      if (String(l.businessOwnerId ?? '') === idStr) removedLotIds.add(String(l.id));
    }
    for (const l of adminReportingLots) {
      if (String(l.businessOwnerId ?? '') === idStr) removedLotIds.add(String(l.id));
    }

    const remaining = businessOwners.filter((o) => String(o.id || o._id) !== idStr);

    setBusinessOwners(remaining);
    setGhausiaLots((arr) => arr.filter((l) => String(l.businessOwnerId ?? '') !== idStr));
    setAdminReportingLots((arr) => arr.filter((l) => String(l.businessOwnerId ?? '') !== idStr));
    setParties((arr) => arr.filter((p) => String(p.businessOwnerId ?? '') !== idStr));
    setPayments((arr) => arr.filter((p) => String(p.businessOwnerId ?? '') !== idStr));
    setAdminReportingPayments((arr) => arr.filter((p) => String(p.businessOwnerId ?? '') !== idStr));
    setPartyEdits((prev) => {
      if (removedLotIds.size === 0) return prev;
      const next = { ...prev };
      for (const lid of removedLotIds) delete next[lid];
      return next;
    });
    setAdminReportingPartyEdits((prev) => {
      if (removedLotIds.size === 0) return prev;
      const next = { ...prev };
      for (const lid of removedLotIds) delete next[lid];
      return next;
    });

    if (String(activeBusinessOwnerId ?? '') === idStr) {
      if (remaining.length === 0) {
        try {
          localStorage.removeItem(BUSINESS_OWNER_KEY);
          localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
        } catch { /* ignore */ }
        setViewAllWorkspaces(false);
        setActiveBusinessOwnerId('');
        setParties(INITIAL_PARTIES);
        setGhausiaLots(INITIAL_GHAUSIA);
        setPartyEdits(INITIAL_PARTY_EDITS);
        setPayments(INITIAL_PAYMENTS);
        setAdminReportingLots(INITIAL_GHAUSIA);
        setAdminReportingPayments(INITIAL_PAYMENTS);
        setAdminReportingPartyEdits(INITIAL_PARTY_EDITS);
      } else {
        selectBusinessOwner(String(remaining[0].id || remaining[0]._id));
      }
    }
  };

  const addParty = async (p) => {
    const created = normalizeParty(await apiService.createParty(p));
    setParties(arr => [...arr, created]);
    return created;
  };

  const updateParty = async (id, p) => {
    const updated = normalizeParty(await apiService.updateParty(id, p));
    const idStr = String(id);
    setParties(arr => arr.map(x => String(x.id) === idStr ? updated : x));
    return updated;
  };

  const deleteParty = async (id) => {
    await apiService.deleteParty(id);
    const idStr = String(id);
    setParties(arr => arr.filter(x => String(x.id) !== idStr));
  };

  const addLot = async (lot, opts = {}) => {
    const { businessOwnerId } = opts;
    const created = normalizeLotData(await trackWrite(apiService.createGhausiaLot(lot, businessOwnerId)));
    setGhausiaLots((arr) => [...arr, created]);
    if (user?.role === 'admin') {
      setAdminReportingLots((arr) => [...arr, created]);
    }
    return created;
  };

  const updateLot = async (id, patch, opts = {}) => {
    const { businessOwnerId } = opts;
    const updated = normalizeLotData(await trackWrite(apiService.updateGhausiaLot(id, patch, businessOwnerId)));
    const idStr = String(id);
    setGhausiaLots((arr) => {
      const has = arr.some((x) => String(x.id) === idStr);
      if (!has) return arr;
      return arr.map((x) => (String(x.id) === idStr ? updated : x));
    });
    if (user?.role === 'admin') {
      setAdminReportingLots((arr) => arr.map((x) => (String(x.id) === idStr ? updated : x)));
    }
    if (user?.role === 'party') {
      setPartyCrossLots((arr) => arr.map((x) => (String(x.id) === idStr ? updated : x)));
    }
    return updated;
  };

  const deleteLot = async (id, opts = {}) => {
    const { businessOwnerId } = opts;
    await trackWrite(apiService.deleteGhausiaLot(id, businessOwnerId));
    const idStr = String(id);
    setGhausiaLots((arr) => arr.filter((x) => String(x.id) !== idStr));
    if (user?.role === 'admin') {
      setAdminReportingLots((arr) => arr.filter((x) => String(x.id) !== idStr));
    }
    if (user?.role === 'party') {
      setPartyCrossLots((arr) => arr.filter((x) => String(x.id) !== idStr));
    }
  };

  const mergeLotAcrossCollections = (raw) => {
    const normalized = normalizeLotData(raw);
    const idStr = String(normalized.id);
    const apply = (arr) =>
      arr.some((x) => String(x.id) === idStr)
        ? arr.map((x) => (String(x.id) === idStr ? normalized : x))
        : arr;
    setGhausiaLots(apply);
    if (user?.role === 'admin') {
      setAdminReportingLots(apply);
    }
    if (user?.role === 'party') {
      setPartyCrossLots(apply);
    }
    return normalized;
  };

  const approveLotCompletion = async (lotId, opts = {}) => {
    const { businessOwnerId, ownerBillingChoice, ownerBillAmount, resolvedBusinessBill } = opts;
    const raw = await trackWrite(apiService.approveLotCompletion(lotId, {
      businessOwnerId,
      ownerBillingChoice,
      ownerBillAmount,
    }));

    const unwrapLot = (payload) => {
      if (!payload || typeof payload !== 'object') return payload;
      if (payload.lot && typeof payload.lot === 'object') return payload.lot;
      if (payload.data && typeof payload.data === 'object') return payload.data;
      return payload;
    };

    let body = unwrapLot(raw);
    if (
      resolvedBusinessBill != null &&
      Number.isFinite(Number(resolvedBusinessBill))
    ) {
      const amt = Number(resolvedBusinessBill);
      if (body && typeof body === 'object') {
        body = { ...body, billAmount: amt, totalAmount: amt };
      } else {
        body = { id: lotId, billAmount: amt, totalAmount: amt };
      }
    }
    if (body && typeof body === 'object' && body.id == null && body._id == null) {
      body = { ...body, id: lotId };
    }

    const normalized = mergeLotAcrossCollections(body);
    const idStr = String(lotId);
    const mergePe = (prev) => ({
      ...prev,
      [idStr]: {
        ...(prev[idStr] || {}),
        overrideStatus: 'Completed',
        completeDate: normalized.receivedBackDate || prev[idStr]?.completeDate,
        pendingRevision: undefined,
      },
    });
    setPartyEdits(mergePe);
    setAdminReportingPartyEdits(mergePe);
    setPartyCrossPartyEdits(mergePe);
    return normalized;
  };

  const rejectLotCompletion = async (lotId, rejectionNote, opts = {}) => {
    const { businessOwnerId } = opts;
    const raw = await trackWrite(apiService.rejectLotCompletion(lotId, rejectionNote, businessOwnerId));
    const normalized = mergeLotAcrossCollections(raw);
    const idStr = String(lotId);
    const mergePe = (prev) => ({
      ...prev,
      [idStr]: {
        ...(prev[idStr] || {}),
        overrideStatus: 'Rejected',
        pendingRevision: undefined,
      },
    });
    setPartyEdits(mergePe);
    setAdminReportingPartyEdits(mergePe);
    setPartyCrossPartyEdits(mergePe);
    return normalized;
  };

  const updatePartyEdit = async (lotId, data, opts = {}) => {
    const { businessOwnerId } = opts;
    try {
      const result = await trackWrite(apiService.upsertPartyEditByLotId(lotId, data, businessOwnerId));
      const normalizedEdit = {
        ...result,
        completeDate: result.completeDate ? normalizeDateString(result.completeDate) : '',
        allotDate: result.allotDate ? normalizeDateString(result.allotDate) : '',
      };
      setPartyEdits((prev) => ({ ...prev, [lotId]: normalizedEdit }));
      if (user?.role === 'admin') {
        setAdminReportingPartyEdits((prev) => ({ ...prev, [lotId]: normalizedEdit }));
      }
      if (user?.role === 'party') {
        setPartyCrossPartyEdits((prev) => ({ ...prev, [lotId]: normalizedEdit }));
      }
      return normalizedEdit;
    } catch (error) {
      console.error('Error updating party edit:', error);
      throw error;
    }
  };

  const addPayment = async (p, opts = {}) => {
    const { businessOwnerId } = opts;
    const payment = await trackWrite(apiService.createPayment({ ...p, amount: Number(p.amount) }, businessOwnerId));
    setPayments((arr) => [...arr, payment]);
    if (user?.role === 'admin') {
      setAdminReportingPayments((arr) => [...arr, payment]);
    }
    if (user?.role === 'party') {
      setPartyCrossPayments((arr) => [...arr, payment]);
    }
    return payment;
  };

  const deletePayment = async (id, opts = {}) => {
    const { businessOwnerId } = opts;
    await trackWrite(apiService.deletePayment(id, businessOwnerId));
    const idStr = String(id);
    setPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
    if (user?.role === 'admin') {
      setAdminReportingPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
    }
    if (user?.role === 'party') {
      setPartyCrossPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
    }
  };

  const partiesById = useMemo(() => {
    const map = new Map();
    for (const p of parties) map.set(String(p.id), p);
    return map;
  }, [parties]);
  const getPartyById = (id) => {
    if (id == null || id === '') return undefined;
    return partiesById.get(String(id));
  };
  const getPartyName = (id) => getPartyById(id)?.name || 'Unknown';

  const reportingLots = user?.role === 'admin' ? adminReportingLots : ghausiaLots;
  const reportingPayments = user?.role === 'admin' ? adminReportingPayments : payments;
  const reportingPartyEdits = user?.role === 'admin' ? adminReportingPartyEdits : partyEdits;

  const contextValue = useMemo(() => ({
      parties, addParty, updateParty, deleteParty,
      ghausiaLots, addLot, updateLot, deleteLot,
      approveLotCompletion, rejectLotCompletion,
    partyEdits, updatePartyEdit, patchLotReceipt, loadLedgerReceipts, ledgerReceiptsVersion,
      payments, addPayment, deletePayment,
      reportingLots, reportingPayments, reportingPartyEdits,
      partyCrossLots, partyCrossPartyEdits, partyCrossPayments,
      businessOwners,
      activeBusinessOwnerId,
      selectBusinessOwner,
      selectAllWorkspacesView,
      viewAllWorkspaces,
      createBusinessOwner,
      deleteBusinessOwner,
      getPartyById, getPartyName,
      initialDataLoading,
    initialDataPhase,
    scopedDataLoading,
    backgroundRefreshing,
    bootstrapLoadError,
    refreshData,
  }), [
    parties, addParty, updateParty, deleteParty,
    ghausiaLots, addLot, updateLot, deleteLot,
    approveLotCompletion, rejectLotCompletion,
    partyEdits, updatePartyEdit, patchLotReceipt, loadLedgerReceipts, ledgerReceiptsVersion,
    payments, addPayment, deletePayment,
    reportingLots, reportingPayments, reportingPartyEdits,
    partyCrossLots, partyCrossPartyEdits, partyCrossPayments,
    businessOwners,
    activeBusinessOwnerId,
    viewAllWorkspaces,
    initialDataLoading,
    initialDataPhase,
    scopedDataLoading,
    backgroundRefreshing,
    bootstrapLoadError,
    refreshData,
    getPartyById, getPartyName,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
