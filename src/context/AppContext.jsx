import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { connectRealtime, disconnectRealtime, onDataChanged } from '../services/realtime';
import { useAuth } from './AuthContext';
import {
  normalizeDateString,
  normalizeLotData,
  normalizeParty,
  normalizeOwners,
  INITIAL_PARTY_EDITS,
  mergePartyEditsFromRemote,
} from '../utils/lotNormalizer';

import { usePartiesData, INITIAL_PARTIES } from '../hooks/usePartiesData';
import { useBusinessOwnersData } from '../hooks/useBusinessOwnersData';
import { useNotificationsData } from '../hooks/useNotificationsData';
import { usePaymentsData, INITIAL_PAYMENTS } from '../hooks/usePaymentsData';

const AppContext = createContext(null);

const INITIAL_GHAUSIA = [];
const BUSINESS_OWNER_KEY = 'waqas_emb_business_owner_id';
const WORKSPACE_VIEW_ALL_KEY = 'waqas_emb_workspace_view_all';

export const ADMIN_ALL_WORKSPACES_ID = '__all_workspaces__';

const FULL_REFRESH_INTERVAL_MS = 45_000;
const NAV_REFRESH_MIN_INTERVAL_MS = 10_000;
const REALTIME_MIN_INTERVAL_MS = 2_500;
const WRITE_SETTLE_MS = 1_500;

export function AppProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

  // 1. Ref tracking
  const hasLoadedOnceRef = useRef(false);
  const workspaceSwitchRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const isBackgroundRefreshRef = useRef(false);

  const lastRefreshRef = useRef(0);
  const lastFullBootstrapRef = useRef(0);
  const lastAnyRefreshRef = useRef(0);

  const pendingWritesRef = useRef(0);
  const lastWriteAtRef = useRef(0);

  const ledgerReceiptsLoadRef = useRef(null);

  // 2. Track Write helper for pause-on-save
  const trackWrite = useCallback((promise) => {
    pendingWritesRef.current += 1;
    return Promise.resolve(promise).finally(() => {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
      lastWriteAtRef.current = Date.now();
    });
  }, []);

  const isRefreshSuppressed = useCallback(
    () => pendingWritesRef.current > 0 || Date.now() - lastWriteAtRef.current < WRITE_SETTLE_MS,
    []
  );

  const invalidateBootstrapCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
  }, [queryClient]);

  // 3. Domain Hooks
  const {
    parties,
    setParties,
    addParty,
    updateParty,
    deleteParty,
    getPartyById,
    getPartyName,
  } = usePartiesData();

  const {
    businessOwners,
    setBusinessOwners,
    activeBusinessOwnerId,
    setActiveBusinessOwnerId,
    viewAllWorkspaces,
    setViewAllWorkspaces,
    selectBusinessOwner,
    selectAllWorkspacesView,
    createBusinessOwner,
  } = useBusinessOwnersData({ invalidateBootstrapCache, workspaceSwitchRef });

  const {
    notifications,
    notificationUnreadCount,
    pendingLotNotice,
    setPendingLotNotice,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearPendingLotNotice,
  } = useNotificationsData({ isAuthenticated, userRole: user?.role });

  const {
    payments,
    setPayments,
    adminReportingPayments,
    setAdminReportingPayments,
    partyCrossPayments,
    setPartyCrossPayments,
    addPayment,
    deletePayment,
  } = usePaymentsData({ trackWrite, userRole: user?.role });

  // 4. Lots and Party Edits State
  const [ghausiaLots, setGhausiaLots] = useState(INITIAL_GHAUSIA);
  const [partyEdits, setPartyEdits] = useState(INITIAL_PARTY_EDITS);

  const [adminReportingLots, setAdminReportingLots] = useState(INITIAL_GHAUSIA);
  const [adminReportingPartyEdits, setAdminReportingPartyEdits] = useState(INITIAL_PARTY_EDITS);

  const [partyCrossLots, setPartyCrossLots] = useState(INITIAL_GHAUSIA);
  const [partyCrossPartyEdits, setPartyCrossPartyEdits] = useState(INITIAL_PARTY_EDITS);

  // Loading States
  const [initialDataPhase, setInitialDataPhase] = useState('idle');
  const [scopedDataLoading, setScopedDataLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [bootstrapLoadError, setBootstrapLoadError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [ledgerReceiptsVersion, setLedgerReceiptsVersion] = useState(0);

  const initialDataLoading = initialDataPhase === 'idle';

  // Apply Payloads Helpers
  const applyReporting = useCallback((reporting) => {
    if (!reporting) return;
    if (Array.isArray(reporting.lots)) setAdminReportingLots(reporting.lots.map(normalizeLotData));
    if (Array.isArray(reporting.payments)) setAdminReportingPayments(reporting.payments);
    if (Array.isArray(reporting.partyEdits)) {
      setAdminReportingPartyEdits((prev) => mergePartyEditsFromRemote(reporting.partyEdits, prev));
    }
  }, [setAdminReportingPayments]);

  const applyPartyCross = useCallback((cross) => {
    if (!cross) return;
    if (Array.isArray(cross.lots)) setPartyCrossLots(cross.lots.map(normalizeLotData));
    if (Array.isArray(cross.payments)) setPartyCrossPayments(cross.payments);
    if (Array.isArray(cross.partyEdits)) {
      setPartyCrossPartyEdits((prev) => mergePartyEditsFromRemote(cross.partyEdits, prev));
    }
  }, [setPartyCrossPayments]);

  const applyScoped = useCallback((data) => {
    if (Array.isArray(data.ghausiaLots)) setGhausiaLots(data.ghausiaLots.map(normalizeLotData));
    if (Array.isArray(data.payments)) setPayments(data.payments);
    if (Array.isArray(data.partyEdits)) {
      setPartyEdits((prev) => mergePartyEditsFromRemote(data.partyEdits, prev));
    }
  }, [setPayments]);

  // Receipts Helpers
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
        const lotImagesCount =
          incomingLotImages !== undefined
            ? incomingLotImages.length
            : Number.isFinite(Number(row.lotImagesCount))
              ? Number(row.lotImagesCount)
              : existing.lotImagesCount;
        next[lotId] = {
          ...existing,
          ...(incomingReceipt ? { receipt: incomingReceipt, hasReceipt: true } : {}),
          ...(incomingLotImages !== undefined
            ? {
                lotImages: incomingLotImages,
                lotImagesCount,
                hasLotImages: incomingLotImages.length > 0,
              }
            : {}),
        };
      });
      return next;
    });
  }, []);

  const loadLedgerReceipts = useCallback(
    async (opts = {}) => {
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
    },
    [isAuthenticated, mergeReceiptRows, user?.role]
  );

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

  const patchLotReceipt = useCallback(
    (lotId, receipt) => {
      if (!lotId || !receipt) return;
      const merge = (prev) => {
        const existing = prev[lotId];
        if (existing?.receipt === receipt) return prev;
        return { ...prev, [lotId]: { ...(existing || { lotId }), receipt, hasReceipt: true } };
      };
      setPartyEdits(merge);
      if (user?.role === 'admin') setAdminReportingPartyEdits(merge);
      if (user?.role === 'party') setPartyCrossPartyEdits(merge);
    },
    [user?.role]
  );

  const patchLotImages = useCallback(
    (lotId, lotImages) => {
      if (!lotId || !Array.isArray(lotImages)) return;
      const count = lotImages.length;
      const merge = (prev) => {
        const existing = prev[lotId] || { lotId };
        return {
          ...prev,
          [lotId]: {
            ...existing,
            lotImages,
            lotImagesCount: count,
            hasLotImages: count > 0,
          },
        };
      };
      setPartyEdits(merge);
      if (user?.role === 'admin') setAdminReportingPartyEdits(merge);
      if (user?.role === 'party') setPartyCrossPartyEdits(merge);
    },
    [user?.role]
  );

  // Background Refreshes
  const runLightBootstrapRefresh = useCallback(async () => {
    if (!isAuthenticated || user?.role === 'super_admin' || user?.role === 'personal_khata') return;
    if (isRefreshSuppressed()) return;

    const gen = ++loadGenerationRef.current;
    const isAdminUser = user?.role === 'admin';
    const partyOpts = isAdminUser ? {} : { skipTenantHeader: true };

    setBackgroundRefreshing(true);
    try {
      const full = await queryClient.fetchQuery({
        queryKey: [
          'bootstrap',
          user?._id,
          user?.role,
          isAdminUser ? String(activeBusinessOwnerId || '') : 'party',
          'full',
        ],
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
    setBusinessOwners,
    setParties,
    user?._id,
    user?.role,
  ]);

  const refreshData = useCallback(
    (opts = {}) => {
      if (!isAuthenticated) return;
      if (user?.role === 'super_admin' || user?.role === 'personal_khata') return;
      if (isRefreshSuppressed() && !opts.force) return;
      const now = Date.now();
      if (now - lastRefreshRef.current < 800 && !opts.force) return;
      lastRefreshRef.current = now;

      if (opts.force) {
        lastFullBootstrapRef.current = 0;
      }

      if (
        hasLoadedOnceRef.current &&
        !opts.force &&
        now - lastAnyRefreshRef.current < NAV_REFRESH_MIN_INTERVAL_MS
      ) {
        return;
      }

      if (
        hasLoadedOnceRef.current &&
        !opts.force &&
        now - lastFullBootstrapRef.current < FULL_REFRESH_INTERVAL_MS
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
    },
    [isAuthenticated, isRefreshSuppressed, user?.role, queryClient, runLightBootstrapRefresh]
  );

  // App Data Bootstrap Effect
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

    if (!isAuthenticated || user?.role === 'super_admin' || user?.role === 'personal_khata') {
      clearAllData();
      try {
        localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
      } catch {
        /* ignore */
      }
      setViewAllWorkspaces(false);
      markLoaded();
      return;
    }

    const isAdminUser = user?.role === 'admin';
    const partyOpts = isAdminUser ? {} : { skipTenantHeader: true };

    const fullBootstrapKey = [
      'bootstrap',
      user?._id,
      user?.role,
      isAdminUser ? String(activeBusinessOwnerId || '') : 'party',
      'full',
    ];

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
      const isWorkspaceSwitch = !isFirst && workspaceSwitchRef.current;
      workspaceSwitchRef.current = false;
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
              } catch {
                /* ignore */
              }
              setViewAllWorkspaces(false);
              setActiveBusinessOwnerId('');
              clearAllData();
              markLoaded(true);
              return;
            }
            const selectedExists = remoteOwners.some(
              (owner) => String(owner.id || owner._id) === String(activeBusinessOwnerId)
            );
            const nextOwner = selectedExists
              ? activeBusinessOwnerId
              : String(remoteOwners[0]?.id || remoteOwners[0]?._id || '');
            if (nextOwner && nextOwner !== activeBusinessOwnerId) {
              localStorage.setItem(BUSINESS_OWNER_KEY, nextOwner);
              setActiveBusinessOwnerId(nextOwner);
              return;
            }
            applyReporting(minimal?.reporting);
          } else {
            setBusinessOwners(normalizeOwners(minimal?.businessOwners));
            applyPartyCross(minimal?.partyCross);
          }

          if (gen !== loadGenerationRef.current) return;
          setInitialDataPhase('minimal');
        }

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
    queryClient,
    refreshTick,
    setActiveBusinessOwnerId,
    setBusinessOwners,
    setParties,
    setPayments,
    setAdminReportingPayments,
    setPartyCrossPayments,
    setViewAllWorkspaces,
    user?._id,
    user?.role,
  ]);

  // Tab Visibility Refresh Effect
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (user?.role === 'super_admin' || user?.role === 'personal_khata') return undefined;

    let timer = null;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasLoadedOnceRef.current) {
        if (Date.now() - lastAnyRefreshRef.current < NAV_REFRESH_MIN_INTERVAL_MS) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          lastAnyRefreshRef.current = Date.now();
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

  // Realtime Socket Effect
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (user?.role !== 'admin' && user?.role !== 'party') return undefined;

    connectRealtime();
    let timer = null;
    const pendingLotIds = new Set();
    const handleChange = (payload) => {
      if (!hasLoadedOnceRef.current) return;
      const lotId = payload && payload.lotId != null ? String(payload.lotId) : '';
      if (lotId) pendingLotIds.add(lotId);

      const action = payload && payload.action != null ? String(payload.action) : '';
      if (
        action === 'lot_rejected' ||
        action === 'lot_pending_review' ||
        action === 'bill_revision_request' ||
        action === 'bill_revision_approved' ||
        action === 'bill_revision_rejected' ||
        action === 'payment_recorded'
      ) {
        setPendingLotNotice({
          action,
          lotId: lotId || (payload.paymentId != null ? String(payload.paymentId) : ''),
          linkPath: payload.linkPath || (action === 'payment_recorded' ? '/payments' : ''),
          at: payload.at || Date.now(),
        });
        void refreshNotifications();
      }

      if (Date.now() - lastAnyRefreshRef.current < REALTIME_MIN_INTERVAL_MS) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => handleChange(null), REALTIME_MIN_INTERVAL_MS);
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (isRefreshSuppressed()) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => handleChange(null), WRITE_SETTLE_MS);
          return;
        }
        lastAnyRefreshRef.current = Date.now();
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
  }, [
    isAuthenticated,
    user?.role,
    runLightBootstrapRefresh,
    invalidateLotReceipt,
    isRefreshSuppressed,
    refreshNotifications,
    setPendingLotNotice,
  ]);

  useEffect(() => {
    if (!isAuthenticated) disconnectRealtime();
  }, [isAuthenticated]);

  // Business Owner CRUD helpers
  const deleteBusinessOwner = useCallback(
    async (id, opts = {}) => {
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
      setAdminReportingPayments((arr) =>
        arr.filter((p) => String(p.businessOwnerId ?? '') !== idStr)
      );
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
          } catch {
            /* ignore */
          }
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
    },
    [
      activeBusinessOwnerId,
      adminReportingLots,
      businessOwners,
      ghausiaLots,
      invalidateBootstrapCache,
      selectBusinessOwner,
      setActiveBusinessOwnerId,
      setBusinessOwners,
      setParties,
      setPayments,
      setAdminReportingPayments,
      setViewAllWorkspaces,
    ]
  );

  // Lot CRUD Handlers
  const addLot = useCallback(
    async (lot, opts = {}) => {
      const { businessOwnerId } = opts;
      const created = normalizeLotData(
        await trackWrite(apiService.createGhausiaLot(lot, businessOwnerId))
      );
      setGhausiaLots((arr) => [...arr, created]);
      if (user?.role === 'admin') {
        setAdminReportingLots((arr) => [...arr, created]);
      }
      return created;
    },
    [trackWrite, user?.role]
  );

  const updateLot = useCallback(
    async (id, patch, opts = {}) => {
      const { businessOwnerId } = opts;
      const updated = normalizeLotData(
        await trackWrite(apiService.updateGhausiaLot(id, patch, businessOwnerId))
      );
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
    },
    [trackWrite, user?.role]
  );

  const deleteLot = useCallback(
    async (id, opts = {}) => {
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
    },
    [trackWrite, user?.role]
  );

  const mergeLotAcrossCollections = useCallback(
    (raw) => {
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
    },
    [user?.role]
  );

  const approveLotCompletion = useCallback(
    async (lotId, opts = {}) => {
      const { businessOwnerId, ownerBillingChoice, ownerBillAmount, resolvedBusinessBill } = opts;
      const raw = await trackWrite(
        apiService.approveLotCompletion(lotId, {
          businessOwnerId,
          ownerBillingChoice,
          ownerBillAmount,
        })
      );

      const unwrapLot = (payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        if (payload.lot && typeof payload.lot === 'object') return payload.lot;
        if (payload.data && typeof payload.data === 'object') return payload.data;
        return payload;
      };

      let body = unwrapLot(raw);
      if (resolvedBusinessBill != null && Number.isFinite(Number(resolvedBusinessBill))) {
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
    },
    [mergeLotAcrossCollections, trackWrite]
  );

  const rejectLotCompletion = useCallback(
    async (lotId, rejectionNote, opts = {}) => {
      const { businessOwnerId } = opts;
      const raw = await trackWrite(
        apiService.rejectLotCompletion(lotId, rejectionNote, businessOwnerId)
      );
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
    },
    [mergeLotAcrossCollections, trackWrite]
  );

  const updatePartyEdit = useCallback(
    async (lotId, data, opts = {}) => {
      const { businessOwnerId } = opts;
      try {
        const result = await trackWrite(
          apiService.upsertPartyEditByLotId(lotId, data, businessOwnerId)
        );
        const imgs = Array.isArray(result.lotImages) ? result.lotImages : undefined;
        const lotImagesCount =
          imgs !== undefined
            ? imgs.length
            : Number.isFinite(Number(result.lotImagesCount))
              ? Number(result.lotImagesCount)
              : undefined;
        const normalizedEdit = {
          ...result,
          completeDate: result.completeDate ? normalizeDateString(result.completeDate) : '',
          allotDate: result.allotDate ? normalizeDateString(result.allotDate) : '',
          ...(lotImagesCount !== undefined
            ? { lotImagesCount, hasLotImages: lotImagesCount > 0 }
            : {}),
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
    },
    [trackWrite, user?.role]
  );

  const reportingLots = user?.role === 'admin' ? adminReportingLots : ghausiaLots;
  const reportingPayments = user?.role === 'admin' ? adminReportingPayments : payments;
  const reportingPartyEdits = user?.role === 'admin' ? adminReportingPartyEdits : partyEdits;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contextValue = useMemo(
    () => ({
      parties,
      addParty,
      updateParty,
      deleteParty,
      ghausiaLots,
      addLot,
      updateLot,
      deleteLot,
      approveLotCompletion,
      rejectLotCompletion,
      partyEdits,
      updatePartyEdit,
      patchLotReceipt,
      patchLotImages,
      loadLedgerReceipts,
      ledgerReceiptsVersion,
      payments,
      addPayment,
      deletePayment,
      reportingLots,
      reportingPayments,
      reportingPartyEdits,
      partyCrossLots,
      partyCrossPartyEdits,
      partyCrossPayments,
      businessOwners,
      activeBusinessOwnerId,
      selectBusinessOwner,
      selectAllWorkspacesView,
      viewAllWorkspaces,
      createBusinessOwner,
      deleteBusinessOwner,
      getPartyById,
      getPartyName,
      initialDataLoading,
      initialDataPhase,
      scopedDataLoading,
      backgroundRefreshing,
      bootstrapLoadError,
      refreshData,
      notifications,
      notificationUnreadCount,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      pendingLotNotice,
      clearPendingLotNotice,
    }),
    [
      parties,
      addParty,
      updateParty,
      deleteParty,
      ghausiaLots,
      addLot,
      updateLot,
      deleteLot,
      approveLotCompletion,
      rejectLotCompletion,
      partyEdits,
      updatePartyEdit,
      patchLotReceipt,
      patchLotImages,
      loadLedgerReceipts,
      ledgerReceiptsVersion,
      payments,
      addPayment,
      deletePayment,
      reportingLots,
      reportingPayments,
      reportingPartyEdits,
      partyCrossLots,
      partyCrossPartyEdits,
      partyCrossPayments,
      businessOwners,
      activeBusinessOwnerId,
      selectBusinessOwner,
      selectAllWorkspacesView,
      viewAllWorkspaces,
      createBusinessOwner,
      deleteBusinessOwner,
      getPartyById,
      getPartyName,
      initialDataLoading,
      initialDataPhase,
      scopedDataLoading,
      backgroundRefreshing,
      bootstrapLoadError,
      refreshData,
      notifications,
      notificationUnreadCount,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      pendingLotNotice,
      clearPendingLotNotice,
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
