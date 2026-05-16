import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';
import {
  workspaceLabelEmbeddedInLot,
  normalizedBusinessOwnerId,
  normalizeBusinessOwnersListResponse,
  extractBusinessOwnersArrayFromResponse,
  ownerDisplayNameFromRow,
  businessOwnerDisplayFromApiPayload,
} from '../utils/businessWorkspace';

const AppContext = createContext(null);

const normalizeDateString = (value) => {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date?.toISOString()?.slice(0, 10);
};

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
    businessOwnerId: lot.businessOwnerId != null ? String(lot.businessOwnerId) : '',
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

const partyEditsArrayToMap = (remotePartyEdits) => {
  if (!Array.isArray(remotePartyEdits)) return INITIAL_PARTY_EDITS;
  return remotePartyEdits.reduce((acc, item) => {
    acc[item.lotId] = {
      ...item,
      completeDate: item.completeDate ? normalizeDateString(item.completeDate) : '',
      allotDate: item.allotDate ? normalizeDateString(item.allotDate) : '',
    };
    return acc;
  }, {});
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
  const [initialDataLoading, setInitialDataLoading] = useState(true);

  const readViewAllWorkspaces = () => {
    try {
      return localStorage.getItem(WORKSPACE_VIEW_ALL_KEY) === '1';
    } catch {
      return false;
    }
  };

  const [viewAllWorkspaces, setViewAllWorkspaces] = useState(readViewAllWorkspaces);

  const selectBusinessOwner = (id) => {
    const nextId = String(id || '');
    try {
      localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
    } catch { /* ignore */ }
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
    if (!isAuthenticated) {
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
      try {
        localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
      } catch { /* ignore */ }
      setViewAllWorkspaces(false);
      setInitialDataLoading(false);
      return;
    }

    if (user?.role === 'super_admin') {
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
      try {
        localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
      } catch { /* ignore */ }
      setViewAllWorkspaces(false);
      setInitialDataLoading(false);
      return;
    }

    async function loadAppData() {
      setInitialDataLoading(true);
      try {
        if (user?.role === 'admin') {
          const remoteOwners = await apiService.getBusinessOwners();
          if (Array.isArray(remoteOwners)) {
            setBusinessOwners(remoteOwners);
            if (remoteOwners.length === 0) {
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
              setInitialDataLoading(false);
              return;
            }
            const selectedExists = remoteOwners.some((owner) => String(owner.id || owner._id) === String(activeBusinessOwnerId));
            const nextOwner = selectedExists
              ? activeBusinessOwnerId
              : String(remoteOwners[0]?.id || remoteOwners[0]?._id || '');
            if (nextOwner && nextOwner !== activeBusinessOwnerId) {
              localStorage.setItem(BUSINESS_OWNER_KEY, nextOwner);
              setActiveBusinessOwnerId(nextOwner);
              return;
            }
          }
        }

        const isAdminUser = user?.role === 'admin';

        if (isAdminUser) {
          const [
            remoteParties,
            remoteLots,
            remotePayments,
            remotePartyEdits,
            allLots,
            allPayments,
            allPartyEdits,
          ] = await Promise.all([
            apiService.getParties(),
            apiService.getGhausiaLots(),
            apiService.getPayments(),
            apiService.getPartyEdits(),
            apiService.getGhausiaLots({ scope: 'all' }),
            apiService.getPayments({ scope: 'all' }),
            apiService.getPartyEdits({ scope: 'all' }),
          ]);

          if (Array.isArray(remoteParties)) {
            setParties(remoteParties.map(normalizeParty));
          }

          if (Array.isArray(remoteLots)) {
            setGhausiaLots(remoteLots.map(normalizeLotData));
          }

          if (Array.isArray(remotePayments)) {
            setPayments(remotePayments);
          }

          setPartyEdits(partyEditsArrayToMap(remotePartyEdits));

          if (Array.isArray(allLots)) {
            setAdminReportingLots(allLots.map(normalizeLotData));
          }
          if (Array.isArray(allPayments)) {
            setAdminReportingPayments(allPayments);
          }
          setAdminReportingPartyEdits(partyEditsArrayToMap(allPartyEdits));
        } else {
          /** Party JWT is cross-workspace — never reuse admin cached `x-business-owner-id` from localStorage. */
          const partyReadOpts = { skipTenantHeader: true };

          const [
            remoteParties,
            remoteLots,
            remotePayments,
            remotePartyEdits,
            ledgerLots,
            ledgerPartyEdits,
            ledgerPayments,
          ] = await Promise.all([
            apiService.getParties(partyReadOpts),
            apiService.getGhausiaLots(partyReadOpts),
            apiService.getPayments(partyReadOpts),
            apiService.getPartyEdits(partyReadOpts),
            apiService.getGhausiaLots({ ...partyReadOpts, partyScope: 'all' }),
            apiService.getPartyEdits({ ...partyReadOpts, partyScope: 'all' }),
            apiService.getPayments({ ...partyReadOpts, partyScope: 'all' }),
          ]);

          if (Array.isArray(remoteParties)) {
            setParties(remoteParties.map(normalizeParty));
          }

          if (Array.isArray(remoteLots)) {
            setGhausiaLots(remoteLots.map(normalizeLotData));
          }

          if (Array.isArray(remotePayments)) {
            setPayments(remotePayments);
          }

          setPartyEdits(partyEditsArrayToMap(remotePartyEdits));

          const normalizedPartyLedgerLots = Array.isArray(ledgerLots)
            ? ledgerLots.map(normalizeLotData)
            : [];
          if (Array.isArray(ledgerLots)) {
            setPartyCrossLots(normalizedPartyLedgerLots);
          }
          setPartyCrossPartyEdits(partyEditsArrayToMap(ledgerPartyEdits));
          if (Array.isArray(ledgerPayments)) {
            setPartyCrossPayments(ledgerPayments);
          }

          /** Workspace names for party (admin gets full owners list separately). */
          try {
            const byId = new Map();

            const ingestOwnerRow = (row) => {
              if (!row || typeof row !== 'object') return;
              const id = normalizedBusinessOwnerId(row?.id ?? row?._id);
              if (!id) return;
              const nm = ownerDisplayNameFromRow(row);
              const existing = byId.get(id);
              const name =
                nm ||
                (existing ? ownerDisplayNameFromRow(existing) : '') ||
                String(existing?.name ?? '').trim();
              const merged = {
                ...(existing || {}),
                ...row,
                id,
                _id: id,
              };
              if (name) merged.name = name;
              byId.set(id, merged);
            };

            const ownersResp = await apiService.getBusinessOwners(partyReadOpts).catch(() => null);

            /** Prefer legacy bare-array behaviour; then broaden with extract helper. */
            if (Array.isArray(ownersResp) && ownersResp.length) {
              ownersResp.forEach((o) => ingestOwnerRow({ ...o, id: normalizedBusinessOwnerId(o?.id ?? o?._id) }));
            } else {
              extractBusinessOwnersArrayFromResponse(ownersResp).forEach((o) =>
                ingestOwnerRow(o && typeof o === 'object' ? o : {}),
              );
            }

            try {
              const colsResp = await apiService.getCollections(partyReadOpts).catch(() => null);
              const colList = Array.isArray(colsResp)
                ? colsResp
                : normalizeBusinessOwnersListResponse(colsResp);
              colList.forEach((c) => {
                if (!c || typeof c !== 'object') return;
                let cid = normalizedBusinessOwnerId(
                  c.businessOwnerId ??
                    c.businessOwner ??
                    c.ownerId ??
                    c.workspaceOwnerId,
                );
                const bo = c.businessOwner ?? c.owner;
                if (bo != null && typeof bo === 'object') {
                  const innerId = normalizedBusinessOwnerId(bo._id ?? bo.id);
                  if (innerId) cid = innerId;
                  ingestOwnerRow({ ...bo, id: innerId, _id: innerId });
                }
                const cname = ownerDisplayNameFromRow(c);
                if (cid && cname && !ownerDisplayNameFromRow(byId.get(cid))) {
                  ingestOwnerRow({ id: cid, name: cname });
                }
              });
            } catch {
              /* optional */
            }

            normalizedPartyLedgerLots.forEach((l) => {
              const wid = normalizedBusinessOwnerId(l.businessOwnerId);
              if (!wid) return;
              const embedded = workspaceLabelEmbeddedInLot(l);
              if (embedded) ingestOwnerRow({ id: wid, name: embedded });
            });

            const needFetchIds = [...new Set(
              normalizedPartyLedgerLots
                .map((l) => normalizedBusinessOwnerId(l.businessOwnerId))
                .filter(Boolean),
            )].filter((wid) => !ownerDisplayNameFromRow(byId.get(wid)));

            await Promise.all(
              needFetchIds.map(async (wid) => {
                try {
                  const raw = await apiService.getBusinessOwner(wid);
                  const row = businessOwnerDisplayFromApiPayload(raw, wid);
                  if (row) ingestOwnerRow(row);
                } catch {
                  /* route may be forbidden for party JWT */
                }
              }),
            );

            const sortLabel = (o) =>
              ownerDisplayNameFromRow(o || {}) ||
              String(o?.name ?? '').trim();

            setBusinessOwners(
              [...byId.values()].sort((a, b) =>
                String(sortLabel(a)).localeCompare(String(sortLabel(b))),
              ),
            );
          } catch (e) {
            console.warn('Party workspace directory merge failed', e);
            try {
              const owners = await apiService.getBusinessOwners(partyReadOpts);
              if (Array.isArray(owners) && owners.length) {
                setBusinessOwners(
                  owners.map((o) => ({
                    ...o,
                    id: normalizedBusinessOwnerId(o?.id ?? o?._id),
                  })),
                );
              }
            } catch {
              /* keep previous businessOwners rather than wiping */
            }
          }
        }
      } catch (error) {
        console.error('Unable to load persisted data from JSON Server', error);
      } finally {
        setInitialDataLoading(false);
      }
    }

    loadAppData();
  }, [activeBusinessOwnerId, isAuthenticated, user?._id, user?.role]);

  const createBusinessOwner = async (data) => {
    const created = await apiService.createBusinessOwner(data);
    setBusinessOwners((current) => [...current, created]);
    selectBusinessOwner(created.id || created._id);
    return created;
  };

  const deleteBusinessOwner = async (id, opts = {}) => {
    const idStr = String(id ?? '').trim();
    if (!idStr) return;
    await apiService.deleteBusinessOwner(id, opts);

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
    const created = normalizeLotData(await apiService.createGhausiaLot(lot, businessOwnerId));
    setGhausiaLots((arr) => [...arr, created]);
    if (user?.role === 'admin') {
      setAdminReportingLots((arr) => [...arr, created]);
    }
    return created;
  };

  const updateLot = async (id, patch, opts = {}) => {
    const { businessOwnerId } = opts;
    const updated = normalizeLotData(await apiService.updateGhausiaLot(id, patch, businessOwnerId));
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
    await apiService.deleteGhausiaLot(id, businessOwnerId);
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
    const raw = await apiService.approveLotCompletion(lotId, {
      businessOwnerId,
      ownerBillingChoice,
      ownerBillAmount,
    });

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
    const raw = await apiService.rejectLotCompletion(lotId, rejectionNote, businessOwnerId);
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
      const result = await apiService.upsertPartyEditByLotId(lotId, data, businessOwnerId);
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
    const payment = await apiService.createPayment({ ...p, amount: Number(p.amount) }, businessOwnerId);
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
    await apiService.deletePayment(id, businessOwnerId);
    const idStr = String(id);
    setPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
    if (user?.role === 'admin') {
      setAdminReportingPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
    }
    if (user?.role === 'party') {
      setPartyCrossPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
    }
  };

  const getPartyById = (id) => {
    if (id == null || id === '') return undefined;
    const idStr = String(id);
    return parties.find(p => String(p.id) === idStr);
  };
  const getPartyName = (id) => getPartyById(id)?.name || 'Unknown';

  const reportingLots = user?.role === 'admin' ? adminReportingLots : ghausiaLots;
  const reportingPayments = user?.role === 'admin' ? adminReportingPayments : payments;
  const reportingPartyEdits = user?.role === 'admin' ? adminReportingPartyEdits : partyEdits;

  return (
    <AppContext.Provider value={{
      parties, addParty, updateParty, deleteParty,
      ghausiaLots, addLot, updateLot, deleteLot,
      approveLotCompletion, rejectLotCompletion,
      partyEdits, updatePartyEdit,
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
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
