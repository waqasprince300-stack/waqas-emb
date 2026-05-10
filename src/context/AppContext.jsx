import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';

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

    async function loadAppData() {
      setInitialDataLoading(true);
      try {
        if (user?.role === 'admin') {
          const remoteOwners = await apiService.getBusinessOwners();
          if (Array.isArray(remoteOwners)) {
            setBusinessOwners(remoteOwners);
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
          const [
            remoteParties,
            remoteLots,
            remotePayments,
            remotePartyEdits,
            ledgerLots,
            ledgerPartyEdits,
            ledgerPayments,
          ] = await Promise.all([
            apiService.getParties(),
            apiService.getGhausiaLots(),
            apiService.getPayments(),
            apiService.getPartyEdits(),
            apiService.getGhausiaLots({ partyScope: 'all' }),
            apiService.getPartyEdits({ partyScope: 'all' }),
            apiService.getPayments({ partyScope: 'all' }),
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

          if (Array.isArray(ledgerLots)) {
            setPartyCrossLots(ledgerLots.map(normalizeLotData));
          }
          setPartyCrossPartyEdits(partyEditsArrayToMap(ledgerPartyEdits));
          if (Array.isArray(ledgerPayments)) {
            setPartyCrossPayments(ledgerPayments);
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
    const { businessOwnerId, ownerBillingChoice } = opts;
    const raw = await apiService.approveLotCompletion(lotId, { businessOwnerId, ownerBillingChoice });
    const normalized = mergeLotAcrossCollections(raw);
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
      getPartyById, getPartyName,
      initialDataLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
