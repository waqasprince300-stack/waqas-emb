import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BusinessOwnerSwitcher from '../components/BusinessOwnerSwitcher';
import LotStatusSelect from '../components/LotStatusSelect';
import PartyPickerSelect from '../components/PartyPickerSelect';
import {
  Modal,
  FormGroup,
  StatusBadge as _StatusBadge,
  ActionBtn,
  SearchBar,
  EmptyState,
  ConfirmDialog,
} from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
  formatDisplayDate,
} from '../utils/dateFilters';
import { workspaceDisplayTitleForLot } from '../utils/businessWorkspace';
import { getAdminLedgerOrBusinessBill, getBusinessBillAmount } from '../utils/partyBillPrivacy';
import { generateSerialLotNumbers, previewSerialLotNumbers } from '../utils/lotSerial';
import {
  getRecentPartyIds,
  getRememberedItemTypes,
  getMachineHeadConfig,
  getAllMachineHeads,
  addCustomMachineHead,
  setDefaultMachineHead,
  removeCustomMachineHead,
  BASE_MACHINE_HEADS,
  rememberLotFormSave,
} from '../utils/lotFieldMemory';
import {
  STATUS_OPTIONS,
  lotSaveErrorToast,
  normalizeLotNumberKey,
  messageFromLotSaveError,
  hasPositiveBillAmount,
  checkIsCombinedDupatta,
} from '../utils/ghausiaHelpers';

// Sub-components
import LotForm from '../components/ghausia/LotForm';
import SummaryCards from '../components/ghausia/SummaryCards';
import BillableSection from '../components/ghausia/BillableSection';
import LotTableDesktop from '../components/ghausia/LotTableDesktop';
import LotMobileViews from '../components/ghausia/LotMobileViews';
import PaymentModal from '../components/ghausia/PaymentModal';
import CompleteBillModal from '../components/ghausia/CompleteBillModal';

export default function GhausiaCollection() {
  const location = useLocation();
  const {
    ghausiaLots,
    reportingLots,
    reportingPayments,
    reportingPartyEdits,
    addLot,
    updateLot,
    deleteLot,
    parties,
    getPartyName,
    partyEdits: partyEditsSingleWorkspace,
    payments: paymentsSingleWorkspace,
    addPayment,
    deletePayment,
    updatePartyEdit,
    initialDataLoading,
    scopedDataLoading,
    activeBusinessOwnerId,
    businessOwners,
    viewAllWorkspaces,
  } = useApp();

  const collectionLots = useMemo(
    () => (viewAllWorkspaces ? reportingLots : ghausiaLots),
    [viewAllWorkspaces, reportingLots, ghausiaLots]
  );
  const payments = useMemo(
    () => (viewAllWorkspaces ? reportingPayments : paymentsSingleWorkspace),
    [viewAllWorkspaces, reportingPayments, paymentsSingleWorkspace]
  );
  const partyEdits = useMemo(
    () => (viewAllWorkspaces ? reportingPartyEdits : partyEditsSingleWorkspace),
    [viewAllWorkspaces, reportingPartyEdits, partyEditsSingleWorkspace]
  );

  /** API business owner id for a row (critical when viewing all workspaces) */
  const lotBizId = (lot) => String(lot?.businessOwnerId ?? activeBusinessOwnerId ?? '').trim();
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lotSaving, setLotSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [stuckLotIdsFilter, setStuckLotIdsFilter] = useState([]);
  const [partyFilter, setPartyFilter] = useState('All');
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showSummaryCards, setShowSummaryCards] = useState(() => {
    return localStorage.getItem('hideLedgerSummary') !== 'true';
  });
  const customRange = useMemo(
    () => ({ start: customStart, end: customEnd }),
    [customStart, customEnd]
  );
  const [lotTableTab, setLotTableTab] = useState('others');
  const [viewMode, setViewMode] = useState('tile');
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    type: 'Received',
    amount: '',
    party: 'Owner',
    date: '',
    note: '',
    linkedLot: '',
  });
  const [payErrors, setPayErrors] = useState({});
  const [completeBillModal, setCompleteBillModal] = useState(null);
  const [completeBillInput, setCompleteBillInput] = useState('');
  const [completeBillError, setCompleteBillError] = useState('');
  const completeBillResolveRef = useRef(null);
  const [completionPersistingLotId, setCompletionPersistingLotId] = useState(null);
  /** Lots currently being completed/settled — blocks a second concurrent trigger (no double entry). */
  const completingLotsRef = useRef(new Set());
  const [inlineSummaryBusy, setInlineSummaryBusy] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [billableCollapsed, setBillableCollapsed] = useState(false);
  const [billableSearch, setBillableSearch] = useState('');
  const [highlightedBillableLotId, setHighlightedBillableLotId] = useState(null);
  const [debouncedBillableSearch, setDebouncedBillableSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBillableSearch(billableSearch), 300);
    return () => clearTimeout(timer);
  }, [billableSearch]);
  const [billablePage, setBillablePage] = useState(1);
  const BILLABLE_PAGE_SIZE = 5;
  /** Instant UI while complete/settle API calls finish (removed when server state catches up). */
  const [optimisticCompletions, setOptimisticCompletions] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      setModal('form');
    }
    if (params.get('status')) {
      setStatusFilter(params.get('status'));
    }
  }, [location.search]);

  const effectiveCollectionLots = useMemo(() => {
    if (!Object.keys(optimisticCompletions).length) return collectionLots;
    return collectionLots.map((l) => {
      const opt = optimisticCompletions[String(l.id)];
      return opt?.lotPatch ? { ...l, ...opt.lotPatch } : l;
    });
  }, [collectionLots, optimisticCompletions]);

  const effectivePayments = useMemo(() => {
    const pending = Object.values(optimisticCompletions)
      .map((o) => o.payment)
      .filter(Boolean);
    if (!pending.length) return payments;
    return [...payments, ...pending];
  }, [payments, optimisticCompletions]);

  const clearOptimisticCompletion = (lotKey) => {
    setOptimisticCompletions((prev) => {
      if (!prev[lotKey]) return prev;
      const next = { ...prev };
      delete next[lotKey];
      return next;
    });
  };

  const activeWorkspace = useMemo(() => {
    if (viewAllWorkspaces) return { name: 'All workspaces' };
    return businessOwners.find((o) => String(o.id || o._id) === String(activeBusinessOwnerId));
  }, [businessOwners, activeBusinessOwnerId, viewAllWorkspaces]);

  const dismissCompleteBillModal = () => {
    const resolve = completeBillResolveRef.current;
    completeBillResolveRef.current = null;
    setCompleteBillModal(null);
    setCompleteBillInput('');
    setCompleteBillError('');
    if (resolve) resolve(null);
  };

  const confirmCompleteBillModal = () => {
    const n = Number(completeBillInput);
    if (completeBillInput === '' || Number.isNaN(n) || n < 0) {
      setCompleteBillError('Enter a valid amount (0 or greater)');
      return;
    }
    const resolve = completeBillResolveRef.current;
    completeBillResolveRef.current = null;
    setCompleteBillModal(null);
    setCompleteBillInput('');
    setCompleteBillError('');
    if (resolve) resolve(n);
  };

  const promptBillAmountForCompletion = (lot, options = {}) =>
    new Promise((resolve) => {
      const unpaid = getOwnerUnpaidBalance(lot);
      const ov = options.billAmountOverride;
      const rawBill =
        ov !== undefined && ov !== null ? Number(ov) : Number(lot.billAmount || 0);
      completeBillResolveRef.current = resolve;
      const isCombDup = checkIsCombinedDupatta(lot);
      setCompleteBillInput(isCombDup ? '0' : (unpaid > 0 ? String(unpaid) : '0'));
      setCompleteBillError('');
      setCompleteBillModal({
        lot,
        fromBillable: !!options.fromBillable,
        billAmountOverride: options.billAmountOverride,
        unpaidBalance: unpaid,
        totalBill: rawBill,
      });
    });

  const persistLotCompletedWithPayment = async (lot, billAmount, options = {}) => {
    const { fromBillable = false } = options;
    const lotKey = String(lot.id);
    if (completingLotsRef.current.has(lotKey)) return;
    completingLotsRef.current.add(lotKey);
    setCompletionPersistingLotId(lot.id);

    const today = new Date().toISOString().slice(0, 10);
    const lotUpdate = {
      status: 'completed',
      receivedBackDate: today,
      billAmount:
        fromBillable && partyEdits[lot.id]?.amountChangeNote
          ? Number(lot.billAmount || 0)
          : billAmount,
      ...(fromBillable ? { completedFromBillable: false } : {}),
    };
    
    const normKey = normalizeLotNumberKey(lot.lotNumber || lot.lotNo);
    const existingOwnerPayments = payments.filter(
      (p) => normalizeLotNumberKey(p.linkedLot) === normKey && String(p.party || '').trim().toLowerCase() === 'owner'
    );
    const isReEditedLot = fromBillable && !!partyEdits[lot.id]?.amountChangeNote;
    const paymentAmount = Number(billAmount) || 0;
    const paymentType = 'Paid';

    const linkedLot = String(lot.lotNumber || lot.lotNo || '').trim();
    const partyName =
      (lot.partyName && String(lot.partyName).trim()) ||
      (lot.partyId ? getPartyName(lot.partyId) : '') ||
      '';
    const designNo = String(lot.designNo || '').trim() || '—';
    
    let optimisticPayment = null;
    if (paymentAmount > 0) {
      optimisticPayment = {
        id: `optimistic-${lotKey}-${Date.now()}`,
        type: paymentType,
        amount: paymentAmount,
        party: 'Owner',
        date: today,
        linkedLot,
        note: fromBillable
          ? (isReEditedLot ? `Billable lot settled (difference) — Party: ${partyName || '—'}; Design: ${designNo}` : `Defective lot settled — Party: ${partyName || '—'}`)
          : `Lot completed — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lot.itemType || lot.fabric || '—'}`,
        businessOwnerId: lotBizId(lot),
      };
    }

    setOptimisticCompletions((prev) => ({
      ...prev,
      [lotKey]: { lotPatch: lotUpdate, payment: optimisticPayment },
    }));

    try {
      try {
        await updateLot(lot.id, lotUpdate, { businessOwnerId: lotBizId(lot) });
      } catch (e) {
        clearOptimisticCompletion(lotKey);
        Swal.fire({ icon: 'error', title: 'Could not update lot', text: 'Please try again.' });
        return;
      }

      const partyEditPromise = updatePartyEdit(
        lot.id,
        {
          overrideStatus: 'Completed',
          completeDate: today,
        },
        { businessOwnerId: lotBizId(lot) }
      ).catch((_e) => {
        console.error(_e);
      });

      let paymentPromise = Promise.resolve();
      if (paymentAmount > 0) {
        paymentPromise = addPayment(
          {
            type: paymentType,
            amount: paymentAmount,
            party: 'Owner',
            date: today,
            linkedLot,
            note: fromBillable
              ? (isReEditedLot ? `Billable lot settled (difference) — Party: ${partyName || '—'}; Design: ${designNo}` : `Defective lot settled — Party: ${partyName || '—'}`)
              : `Lot completed — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lot.itemType || lot.fabric || '—'}`,
          },
          { businessOwnerId: lotBizId(lot) }
        ).catch(() => {
          Swal.fire({
            icon: 'warning',
            title: 'Lot updated; payment failed',
            text: 'The lot was marked completed, but saving the payment failed. Add it manually if needed.',
          });
        });
      }

      await Promise.all([partyEditPromise, paymentPromise]);
    } finally {
      completingLotsRef.current.delete(lotKey);
      setCompletionPersistingLotId(null);
      clearOptimisticCompletion(lotKey);
    }
  };

  const handleCompleteFromBillable = async (lot) => {
    const amount = await promptBillAmountForCompletion(lot, {
      fromBillable: true,
    });
    if (amount == null) return;
    await persistLotCompletedWithPayment(lot, amount, { fromBillable: true });
  };

  const recordOwnerReceivedForCompletedLot = async (lotRef, amount, paymentDate) => {
    const linkedLot = String(lotRef.lotNumber || lotRef.lotNo || '').trim();
    const partyName =
      (lotRef.partyName && String(lotRef.partyName).trim()) ||
      (lotRef.partyId ? getPartyName(lotRef.partyId) : '') ||
      '';
    const designNo = String(lotRef.designNo || '').trim() || '—';
    await addPayment(
      {
        type: 'Received',
        amount: Number(amount),
        party: 'Owner',
        date: paymentDate,
        linkedLot,
        note: `Lot completed — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lotRef.itemType || lotRef.fabric || '—'}`,
      },
      { businessOwnerId: lotBizId(lotRef) }
    );
  };

  const setLotStatus = async (lot, newStatus) => {
    if (newStatus === 'dispatched' && !lot.partyId) {
      Swal.fire({ icon: 'warning', title: 'Select a Party', text: 'You must assign a party before dispatching this lot.' });
      return;
    }
    if (newStatus === 'completed') {
      const amount = await promptBillAmountForCompletion(lot);
      if (amount == null) return;
      await persistLotCompletedWithPayment(lot, amount);
      return;
    }

    setInlineSummaryBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lotUpdate = { status: newStatus };
      if (newStatus === 'dispatched') lotUpdate.dispatchDate = today;
      if (newStatus === 'received back') lotUpdate.receivedBackDate = today;
      if (newStatus === 'rejected') lotUpdate.rejectedDate = today;
      if (newStatus === 'pending approval') lotUpdate.pendingReviewSubmittedAt = today;

      try {
        await updateLot(lot.id, lotUpdate, { businessOwnerId: lotBizId(lot) });
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not update lot', text: 'Please try again.' });
        return;
      }

      const ledgerStatus = newStatus === 'dispatched' ? 'In Progress' : newStatus;
      try {
        await updatePartyEdit(
          lot.id,
          {
            overrideStatus: ledgerStatus,
            completeDate: '',
          },
          { businessOwnerId: lotBizId(lot) }
        );
      } catch (e) {
        console.error(e);
      }
    } finally {
      setInlineSummaryBusy(false);
    }
  };

  // ─── Filtered & Paginated Lots ───
  const filtered = useMemo(() => {
    const list = effectiveCollectionLots.filter((l) => {
      if (highlightedBillableLotId && String(l.id) !== String(highlightedBillableLotId)) return false;
      const q = debouncedSearch.toLowerCase();
      const lotLabel = (l.lotNumber || l.lotNo || '').toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        String(l.designNo || '')
          .toLowerCase()
          .includes(q);
      if (!matchQ) return false;
      if (partyFilter !== 'All' && String(l.partyId || '') !== String(partyFilter)) return false;
      if (stuckLotIdsFilter.length > 0 && !stuckLotIdsFilter.includes(String(l.id))) return false;
      if (
        !isWithinDateRange(
          latestDateFrom(l, [
            'updatedAt',
            'createdAt',
            'receivedBackDate',
            'dispatchDate',
            'allotDate',
            'receivedDate',
            'rejectedDate',
            'pendingReviewSubmittedAt',
          ]),
          dateRange,
          customRange
        )
      )
        return false;
      if (lotTableTab === 'completed') return l.status === 'completed';
      if (l.status === 'completed') return false;
      return statusFilter === 'All' || l.status === statusFilter;
    });
    return [...list].sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'lot'));
  }, [
    effectiveCollectionLots,
    debouncedSearch,
    partyFilter,
    dateRange,
    customRange,
    statusFilter,
    stuckLotIdsFilter,
    lotTableTab,
    highlightedBillableLotId,
  ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedLots = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, partyFilter, dateRange, customRange, statusFilter, stuckLotIdsFilter, lotTableTab, viewAllWorkspaces]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleLots = useMemo(
    () =>
      effectiveCollectionLots.filter((l) => {
        if (partyFilter !== 'All' && String(l.partyId || '') !== String(partyFilter)) return false;
        if (stuckLotIdsFilter.length > 0 && !stuckLotIdsFilter.includes(String(l.id))) return false;
        return isWithinDateRange(
          latestDateFrom(l, [
            'updatedAt',
            'createdAt',
            'receivedBackDate',
            'dispatchDate',
            'allotDate',
            'receivedDate',
            'rejectedDate',
            'pendingReviewSubmittedAt',
          ]),
          dateRange,
          customRange
        );
      }),
    [effectiveCollectionLots, partyFilter, dateRange, customRange, stuckLotIdsFilter]
  );

  const completedLotsCount = useMemo(
    () => {
      let lots = visibleLots;
      if (highlightedBillableLotId) {
        lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
      }
      return lots.filter((l) => l.status === 'completed').length;
    },
    [visibleLots, highlightedBillableLotId]
  );
  const otherLotsCount = useMemo(() => {
      let lots = visibleLots;
      if (highlightedBillableLotId) {
        lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
      }
      return lots.length - lots.filter((l) => l.status === 'completed').length;
  }, [visibleLots, highlightedBillableLotId]);
  const othersTabStatusLabel =
    statusFilter === 'All'
      ? 'Others'
      : statusFilter
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  const othersTabCount = useMemo(() => {
    let lots = visibleLots;
    if (highlightedBillableLotId) {
      lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
    }
    if (statusFilter === 'All') return otherLotsCount;
    return lots.filter((l) => l.status === statusFilter).length;
  }, [visibleLots, statusFilter, otherLotsCount, highlightedBillableLotId]);
  const othersTabHint =
    statusFilter === 'All'
      ? 'Pending, dispatched, and received back (not completed)'
      : `${othersTabStatusLabel} lots in the current filters`;

  // ─── Billable Lots ───
  const billable = useMemo(
    () =>
      [...visibleLots.filter((l) => l.status === 'received back')].sort((a, b) =>
        compareRowsByUpdatedNewestFirst(a, b, 'lot')
      ),
    [visibleLots]
  );

  const getOwnerBillableAmount = (lot) => getBusinessBillAmount(lot);

  const getOwnerSettledAmount = useCallback(
    (lot) => {
      const normKey = normalizeLotNumberKey(lot.lotNumber || lot.lotNo);
      const existingOwnerPayments = payments.filter(
        (p) => normalizeLotNumberKey(p.linkedLot) === normKey && String(p.party || '').trim().toLowerCase() === 'owner'
      );
      const existingPaidToOwner = existingOwnerPayments
        .filter((p) => p.type === 'Paid')
        .reduce((s, p) => s + p.amount, 0);
      return existingPaidToOwner;
    },
    [payments]
  );

  const getOwnerUnpaidBalance = useCallback(
    (lot) => {
      const expectedAmount = getBusinessBillAmount(lot);
      const totalSettled = getOwnerSettledAmount(lot);
      return Math.max(0, expectedAmount - totalSettled);
    },
    [getOwnerSettledAmount]
  );
  const isCombinedDupatta = checkIsCombinedDupatta;
  const renderOwnerBillableAmount = (l) => {
    if (isCombinedDupatta(l)) {
      return (
        <span style={{ fontSize: 11, color: 'var(--warning, #d97706)', fontWeight: 600, background: 'var(--warning-bg, #fffbeb)', padding: '2px 8px', borderRadius: 12 }}>
          Combined Bill
        </span>
      );
    }
    return `Rs${getOwnerBillableAmount(l).toLocaleString()}`;
  };

  const renderOwnerUnpaidBalance = (l) => {
    if (isCombinedDupatta(l)) {
      return (
        <span style={{ fontSize: 11, color: 'var(--warning, #d97706)', fontWeight: 600, background: 'var(--warning-bg, #fffbeb)', padding: '2px 8px', borderRadius: 12 }}>
          Combined Bill
        </span>
      );
    }
    return `Rs${getOwnerUnpaidBalance(l).toLocaleString()}`;
  };
  const billableTotal = billable.reduce((s, l) => s + getOwnerUnpaidBalance(l), 0);

  const billableFiltered = useMemo(() => {
    const q = debouncedBillableSearch.trim().toLowerCase();
    if (!q) return billable;
    return billable.filter((l) => {
      const lotNo = String(l.lotNumber || l.lotNo || '').toLowerCase();
      const design = String(l.designNo || '').toLowerCase();
      const party = String(l.partyName || '').toLowerCase();
      return lotNo.includes(q) || design.includes(q) || party.includes(q);
    });
  }, [billable, debouncedBillableSearch]);

  const billablePageCount = Math.max(1, Math.ceil(billableFiltered.length / BILLABLE_PAGE_SIZE));
  const billableSafePage = Math.min(billablePage, billablePageCount);
  const billablePageItems = billableFiltered.slice(
    (billableSafePage - 1) * BILLABLE_PAGE_SIZE,
    billableSafePage * BILLABLE_PAGE_SIZE
  );

  useEffect(() => {
    setBillablePage(1);
  }, [debouncedBillableSearch]);

  useEffect(() => {
    if (billablePage > billablePageCount) setBillablePage(billablePageCount);
  }, [billablePage, billablePageCount]);
  const ownerIn = effectivePayments
    .filter((p) => p.type === 'Received')
    .reduce((s, p) => s + p.amount, 0);
  const ownerPaidToOwner = effectivePayments
    .filter((p) => p.type === 'Paid' && p.party === 'Owner')
    .reduce((s, p) => s + p.amount, 0);
  const billableSettledTotal = useMemo(
    () =>
      effectiveCollectionLots
        .filter((l) => l.status === 'completed' && l.completedFromBillable)
        .reduce((s, l) => s + Number(l.billAmount || 0), 0),
    [effectiveCollectionLots]
  );
  const ownerReceivedNet = ownerIn - ownerPaidToOwner - billableSettledTotal;
  const ownerReceivedIsPending = ownerReceivedNet < 0;
  const statsRefreshing = lotSaving || paymentSaving || deleteLoading || inlineSummaryBusy;

  // ─── Lot CRUD handlers ───
  const openEdit = (lot) => {
    let editPayload = lot;
    if (lot.suitType === '3-piece' && lot.suitComponent === 'main' && lot.linkedLotId) {
      const linkedDupatta = effectiveCollectionLots.find((l) => l.id === lot.linkedLotId || l._id === lot.linkedLotId);
      if (linkedDupatta) {
        editPayload = {
          ...lot,
          dupattaDetails: {
            partyId: linkedDupatta.partyId || '',
            partyName: linkedDupatta.partyName || '',
            fabric: linkedDupatta.fabric || '',
            itemType: linkedDupatta.itemType || linkedDupatta.fabric || '',
            customFabric: linkedDupatta.customFabric || '',
            quantity: linkedDupatta.quantity || '',
            billAmount: linkedDupatta.billAmount || '',
          }
        };
      }
    }
    setEditing(editPayload);
    setModal('form');
  };
  const openLinkedLot = (linkedId) => {
    const linked = effectiveCollectionLots.find((lot) => lot.id === linkedId || lot._id === linkedId);
    if (linked) {
      openEdit(linked);
    } else {
      Swal.fire({ icon: 'info', title: 'Not found', text: 'The linked lot could not be found in current collection.' });
    }
  };
  const openAdd = () => {
    setEditing(null);
    setModal('form');
  };

  const handleSave = async (form) => {
    if (form.status === 'dispatched' && !form.partyId) {
      Swal.fire({ icon: 'warning', title: 'Select a Party', text: 'You must select a party before dispatching this lot.' });
      return;
    }
    const bulkLotNumbers = Array.isArray(form.bulkLotNumbers) ? form.bulkLotNumbers : null;

    const prev = editing;
    const wasCompleted = prev?.status === 'completed';
    const nowCompleted = form.status === 'completed';
    const becomingCompleted = nowCompleted && !wasCompleted;
    let saveForm = { ...form };
    let recordOwnerPaymentAfterSave = false;

    if (bulkLotNumbers && bulkLotNumbers.length > 1 && !prev) {
      const targetBiz = String(form.saveBusinessOwnerId || activeBusinessOwnerId || '').trim();
      if (!targetBiz.trim()) {
        lotSaveErrorToast('Select a business collection before saving lots.');
        return;
      }

      const {
        saveBusinessOwnerId: _ignoreSaveOwner,
        bulkLotNumbers: _bulk,
        ...basePayload
      } = saveForm;
      const existingKeys = new Set(
        collectionLots
          .filter((l) => String(l.businessOwnerId ?? '') === targetBiz)
          .map((l) => normalizeLotNumberKey(l.lotNumber ?? l.lotNo))
      );

      setLotSaving(true);
      let created = 0;
      let skipped = 0;
      const failed = [];

      try {
        for (const lotNumber of bulkLotNumbers) {
          const lotKey = normalizeLotNumberKey(lotNumber);
          if (!lotKey) continue;
          if (existingKeys.has(lotKey)) {
            skipped += 1;
            continue;
          }
          try {
            await addLot(
              {
                ...basePayload,
                lotNumber,
                lotNo: lotNumber,
                status: 'pending',
              },
              { businessOwnerId: targetBiz }
            );
            existingKeys.add(lotKey);
            created += 1;
          } catch (e) {
            failed.push({ lotNumber, message: messageFromLotSaveError(e) });
          }
        }

        if (created === 0 && failed.length === 0) {
          lotSaveErrorToast(
            skipped > 0
              ? 'All lot numbers in this range already exist in this collection.'
              : 'No lots were saved. Check your lot numbers.'
          );
          return;
        }

        const parts = [`${created} lot${created === 1 ? '' : 's'} saved`];
        if (skipped > 0) parts.push(`${skipped} skipped (already exist)`);
        if (failed.length > 0) parts.push(`${failed.length} failed`);

        await Swal.fire({
          icon: failed.length > 0 ? 'warning' : 'success',
          title: 'Bulk save done',
          html: `<p style="margin:0 0 8px">${parts.join(' · ')}</p>${failed.length > 0
              ? `<p style="margin:0;font-size:13px;color:var(--text-muted, #64748b)">${failed
                .slice(0, 5)
                .map((f) => `${f.lotNumber}: ${f.message}`)
                .join('<br/>')}${failed.length > 5 ? '<br/>…' : ''}</p>`
              : ''
            }`,
        });

        if (created > 0) {
          rememberLotFormSave(saveForm, { collectionId: targetBiz, bulkLotNumbers });
        }

        setModal(null);
        setEditing(null);
      } finally {
        setLotSaving(false);
      }
      return;
    }

    if (becomingCompleted && !hasPositiveBillAmount(saveForm)) {
      const lotForPrompt = prev ? { ...prev, ...saveForm } : saveForm;
      const amount = await promptBillAmountForCompletion(lotForPrompt);
      if (amount == null) return;
      saveForm = { ...saveForm, billAmount: amount };
      recordOwnerPaymentAfterSave = true;
    }

    const lotKey = normalizeLotNumberKey(saveForm.lotNumber ?? saveForm.lotNo);
    const targetBiz = prev
      ? lotBizId(prev)
      : String(form.saveBusinessOwnerId || activeBusinessOwnerId || '').trim();

    if (lotKey) {
      if (!targetBiz.trim()) {
        lotSaveErrorToast('Select a business collection before saving lots.');
        return;
      }
      const dupLocal = collectionLots.some((l) => {
        if (prev && String(l.id) === String(prev.id)) return false;
        if (String(l.businessOwnerId ?? '') !== targetBiz) return false;
        if (normalizeLotNumberKey(l.lotNumber ?? l.lotNo) !== lotKey) return false;
        const thisSuitComp = saveForm.suitComponent || 'main';
        const thatSuitComp = l.suitComponent || 'main';
        const thisRework = Boolean(saveForm.isRework);
        const thatRework = Boolean(l.isRework);
        return thisSuitComp === thatSuitComp && thisRework === thatRework;
      });
      if (dupLocal) {
        lotSaveErrorToast(
          'A lot with this number already exists in this collection. Try a different number.'
        );
        return;
      }
    }

    const { saveBusinessOwnerId: _ignoreSaveOwner, ...lotPayloadForApi } = saveForm;

    const today = new Date().toISOString().slice(0, 10);
    setLotSaving(true);
    try {
      if (prev) {
        await updateLot(prev.id, lotPayloadForApi, { businessOwnerId: targetBiz });

        // Auto-sync lot number and design number to the linked lot
        if (prev.linkedLotId && (saveForm.lotNumber !== prev.lotNumber || saveForm.designNo !== prev.designNo)) {
          const linkedLot = collectionLots.find((l) => String(l.id || l._id) === String(prev.linkedLotId));
          const syncUpdates = {};
          if (saveForm.lotNumber !== prev.lotNumber) {
            let syncedLotNum = String(saveForm.lotNumber || '').trim();
            if (linkedLot && linkedLot.suitComponent === 'dupatta') {
              syncedLotNum = syncedLotNum.endsWith('-D') ? syncedLotNum : syncedLotNum + '-D';
            } else if (linkedLot && linkedLot.suitComponent === 'main') {
              syncedLotNum = syncedLotNum.endsWith('-D') ? syncedLotNum.slice(0, -2) : syncedLotNum;
            }
            syncUpdates.lotNumber = syncedLotNum;
            syncUpdates.lotNo = syncedLotNum;
          }
          if (saveForm.designNo !== prev.designNo) {
            syncUpdates.designNo = saveForm.designNo;
          }
          try {
            await updateLot(prev.linkedLotId, syncUpdates, { businessOwnerId: targetBiz });
          } catch (err) {
            console.warn('Failed to sync lot details to linked lot', err);
          }
        }
        if (saveForm.status === 'completed') {
          await updatePartyEdit(
            prev.id,
            {
              overrideStatus: 'Completed',
              completeDate: today,
            },
            { businessOwnerId: targetBiz }
          );
        }
        if (recordOwnerPaymentAfterSave) {
          try {
            await recordOwnerReceivedForCompletedLot(
              { ...prev, ...saveForm, businessOwnerId: targetBiz },
              saveForm.billAmount,
              today
            );
          } catch (e) {
            Swal.fire({
              icon: 'warning',
              title: 'Lot saved; payment failed',
              text: 'Add the owner payment manually from Payment Management if needed.',
            });
          }
        }
      } else {
        const created = await addLot(lotPayloadForApi, { businessOwnerId: targetBiz });
        if (saveForm.status === 'completed') {
          await updatePartyEdit(
            created.id,
            {
              overrideStatus: 'Completed',
              completeDate: today,
            },
            { businessOwnerId: targetBiz }
          );
        }
        if (recordOwnerPaymentAfterSave) {
          try {
            await recordOwnerReceivedForCompletedLot(
              { ...created, ...saveForm, businessOwnerId: targetBiz },
              saveForm.billAmount,
              today
            );
          } catch (e) {
            Swal.fire({
              icon: 'warning',
              title: 'Lot saved; payment failed',
              text: 'Add the owner payment manually from Payment Management if needed.',
            });
          }
        }
      }
      rememberLotFormSave(saveForm, { collectionId: targetBiz });
      setModal(null);
      setEditing(null);
    } catch (e) {
      lotSaveErrorToast(messageFromLotSaveError(e));
    } finally {
      setLotSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteLot(deleteTarget.id, { businessOwnerId: lotBizId(deleteTarget) });
      setDeleteTarget(null);
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Delete Failed',
        text: e?.message || 'Could not delete the lot. Please try again.',
        confirmButtonColor: 'var(--danger, #dc2626)',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSeparateDupattaBill = async () => {
    if (!editing || editing.suitComponent !== 'dupatta' || !editing.linkedLotId) return;
    const mainLot = collectionLots.find(l => String(l.id || l._id) === String(editing.linkedLotId));
    const mainBill = mainLot ? Number(mainLot.billAmount || 0) : 0;

    const { value: formValues } = await Swal.fire({
      title: 'Separate Dupatta Bill',
      html: `
        <div style="text-align: left; font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">
          This Dupatta's bill is currently combined with the Main Lot.<br/>
          Main Lot Bill: <strong>₨${mainBill.toLocaleString()}</strong>
        </div>
        <div style="margin-bottom: 12px; text-align: left;">
          <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">New Dupatta Bill Amount</label>
          <input id="swal-dup-bill" type="number" class="swal2-input" style="width: 100%; box-sizing: border-box; margin: 0;" placeholder="e.g. 500">
        </div>
        <div style="text-align: left;">
          <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">New Main Lot Bill Amount</label>
          <input id="swal-main-bill" type="number" class="swal2-input" style="width: 100%; box-sizing: border-box; margin: 0;" value="${mainBill}">
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">(Adjust this to reduce the main lot's bill)</div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Save Changes',
      preConfirm: () => {
        const dup = document.getElementById('swal-dup-bill').value;
        const main = document.getElementById('swal-main-bill').value;
        if (!dup || Number(dup) <= 0) {
          Swal.showValidationMessage('Enter a valid Dupatta bill amount');
          return false;
        }
        return { dupAmt: Number(dup), mainAmt: Number(main) };
      }
    });

    if (formValues) {
      setLotSaving(true);
      try {
        await updateLot(editing.id || editing._id, { billAmount: formValues.dupAmt, totalAmount: formValues.dupAmt }, { businessOwnerId: lotBizId(editing) });
        if (mainLot) {
          await updateLot(mainLot.id || mainLot._id, { 
            billAmount: formValues.mainAmt, 
            totalAmount: formValues.mainAmt,
            suitType: '3-piece',
            ownerBillingChoice: 'separate',
            dupattaDetails: { 
              ...(mainLot.dupattaDetails || {}), 
              partyId: editing.partyId || '',
              partyName: editing.partyName || '',
              billAmount: formValues.dupAmt 
            }
          }, { businessOwnerId: lotBizId(mainLot) });
        }
        setModal(null);
        setEditing(null);
        Swal.fire({ icon: 'success', title: 'Bill Separated', showConfirmButton: false, timer: 1500 });
      } catch (e) {
        Swal.fire('Error', 'Failed to separate bill', 'error');
      } finally {
        setLotSaving(false);
      }
    }
  };

  const handlePartyChange = async (lotId, partyId) => {
    setInlineSummaryBusy(true);
    try {
      const lot = collectionLots.find((l) => String(l.id) === String(lotId));
      const biz = lot ? lotBizId(lot) : String(activeBusinessOwnerId || '').trim();
      const currentDate = new Date().toISOString().slice(0, 10);
      const selectedParty = parties.find((p) => p.id === partyId);
      
      const currentStatus = lot?.status || 'pending';
      const shouldUpdateStatus = currentStatus === 'pending' || currentStatus === 'dispatched';
      
      const payload = {
        partyId: partyId || '',
        partyName: selectedParty ? selectedParty.name : '',
      };
      
      if (shouldUpdateStatus || !partyId) {
        payload.status = partyId ? 'dispatched' : 'pending';
        if (partyId) payload.dispatchDate = currentDate;
      }
      
      await updateLot(lotId, payload, { businessOwnerId: biz });
      
      if (partyId && shouldUpdateStatus) {
        await updatePartyEdit(
          lotId,
          {
            overrideStatus: 'In Progress',
            allotDate: currentDate,
          },
          { businessOwnerId: biz }
        );
      }
    } finally {
      setInlineSummaryBusy(false);
    }
  };

  const validatePayForm = () => {
    const errs = {};
    if (!payForm.amount) errs.amount = 'Amount is required';
    if (!payForm.date) errs.date = 'Date is required';
    if (payForm.type === 'Paid' && !payForm.party) errs.party = 'Please select a party';
    setPayErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddPayment = async () => {
    if (!validatePayForm()) return;
    setPaymentSaving(true);
    try {
      await addPayment(
        {
          type: payForm.type,
          amount: Number(payForm.amount),
          party: payForm.party,
          date: payForm.date,
          linkedLot: payForm.linkedLot,
          note: payForm.note,
        },
        { businessOwnerId: activeBusinessOwnerId }
      );
      setPayModal(false);
      setPayErrors({});
      setPayForm({
        type: 'Received',
        amount: '',
        party: 'Owner',
        date: '',
        note: '',
        linkedLot: '',
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save payment. Please try again.',
      });
    } finally {
      setPaymentSaving(false);
    }
  };

  // ─── Loading ───
  if (initialDataLoading || (!viewAllWorkspaces && scopedDataLoading)) {
    return (
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <LoaderDashboard height={30} width={30} />
      </div>
    );
  }

  return (
    <div>
      {/* Hero / Header */}
      <div
        className="ghausia-collection-page-hero"
        style={{
          marginBottom: 24,
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            padding: '22px 24px 18px',
          }}
        >
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--primary)',
                marginBottom: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary-light), var(--primary))',
                  boxShadow: '0 0 0 3px var(--primary-bg)',
                }}
              />
              Workspace
            </div>
            <h1
              className="page-title"
              style={{
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1.15,
                margin: 0,
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
              }}
            >
              {activeWorkspace?.name || 'Select a workspace'}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                marginTop: 10,
                lineHeight: 1.5,
                maxWidth: 560,
              }}
            >
              {viewAllWorkspaces
                ? 'Showing lots across every workspace. Pick a single workspace here to anchor new payments and the add-lot flow, or use "Business collection" in the lot form when adding in this view.'
                : 'Manage design lots, statuses, and owner billing for this business. Use the dropdown below to switch workspace or view all workspaces.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={() => {
                const next = !showSummaryCards;
                setShowSummaryCards(next);
                localStorage.setItem('hideLotsSummary', !next ? 'true' : 'false');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: showSummaryCards ? 'var(--text-secondary, #475569)' : 'var(--primary, #1e40af)',
                border: '1px solid var(--border)',
                background: showSummaryCards ? 'var(--card-bg, #ffffff)' : 'var(--primary-bg, #eff6ff)',
                borderRadius: 20,
                padding: '5px 14px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
              title={showSummaryCards ? 'Hide summary stat cards for privacy' : 'Show summary stat cards'}
            >
              {showSummaryCards ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  <span>Hide Summary</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Show Summary</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openAdd}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 18px',
                fontWeight: 700,
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(30, 64, 175, 0.25)',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add lot
            </button>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            padding: '14px 24px 18px',
            borderTop: '1px solid var(--border)',
            background: 'var(--card-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', width: '100%' }}>
            <span
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, minWidth: '70px' }}
            >
              Workspace:
            </span>
            <div style={{ flex: '1 1 300px' }}>
              <BusinessOwnerSwitcher compact />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        showSummaryCards={showSummaryCards}
        visibleLots={visibleLots}
        billable={billable}
        billableTotal={billableTotal}
        ownerReceivedNet={ownerReceivedNet}
        ownerReceivedIsPending={ownerReceivedIsPending}
        statsRefreshing={statsRefreshing}
      />

      {/* Billable Section */}
      <BillableSection
        billable={billable}
        billableTotal={billableTotal}
        billableCollapsed={billableCollapsed}
        setBillableCollapsed={setBillableCollapsed}
        billableSearch={billableSearch}
        setBillableSearch={setBillableSearch}
        billableFiltered={billableFiltered}
        billablePageItems={billablePageItems}
        billableSafePage={billableSafePage}
        billablePageCount={billablePageCount}
        setBillablePage={setBillablePage}
        BILLABLE_PAGE_SIZE={BILLABLE_PAGE_SIZE}
        highlightedBillableLotId={highlightedBillableLotId}
        setHighlightedBillableLotId={setHighlightedBillableLotId}
        setLotTableTab={setLotTableTab}
        setStatusFilter={setStatusFilter}
        setPartyFilter={setPartyFilter}
        setDateRange={setDateRange}
        completionPersistingLotId={completionPersistingLotId}
        handleCompleteFromBillable={handleCompleteFromBillable}
        getOwnerSettledAmount={getOwnerSettledAmount}
        renderOwnerUnpaidBalance={renderOwnerUnpaidBalance}
        partyEdits={partyEdits}
      />

      {/* Toolbar */}
      <div className="toolbar pl-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search lot no. or design..."
        />
        <select
          className="form-select pl-toolbar-filter pl-toolbar-filter--party"
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
        >
          <option value="All">All Parties</option>
          {parties.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <DateRangeSelect
          value={dateRange}
          onChange={setDateRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={({ start, end }) => {
            setCustomStart(start);
            setCustomEnd(end);
          }}
          className="pl-toolbar-filter pl-toolbar-filter--date"
        />
        {lotTableTab === 'others' ? (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setStuckLotIdsFilter([]); }}
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.filter((s) => s !== 'completed').map((s) => (
              <option key={s} value={s}>
                {s
                  .split(' ')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ')}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
            Completed lots only
          </span>
        )}
      </div>

      {/* Table tabs & View Mode Switcher */}
      <div
        role="tablist"
        aria-label="Lots by completion"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          marginBottom: 10,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { id: 'others', label: othersTabStatusLabel, count: othersTabCount, hint: othersTabHint },
            {
              id: 'completed',
              label: 'Completed',
              count: completedLotsCount,
              hint: 'Lots marked completed',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={lotTableTab === tab.id}
              title={tab.hint}
              onClick={() => { setLotTableTab(tab.id); setStuckLotIdsFilter([]); }}
              style={{
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderBottom: lotTableTab === tab.id ? '2px solid var(--primary, #1e40af)' : '2px solid transparent',
                marginBottom: -1,
                background: 'transparent',
                color: lotTableTab === tab.id ? 'var(--primary, #1e40af)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: lotTableTab === tab.id ? 'var(--primary-bg, #eff6ff)' : 'var(--primary-bg, #f3f4f6)',
                  color: lotTableTab === tab.id ? 'var(--primary, #1e40af)' : 'var(--text-muted)',
                  padding: '1px 6px',
                  borderRadius: 999,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* View Switcher */}
        <div className="mobile-view-switcher" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('table')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            List
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'tile' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('tile')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            Tiles
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <LotTableDesktop
        filtered={filtered}
        paginatedLots={paginatedLots}
        lotTableTab={lotTableTab}
        parties={parties}
        businessOwners={businessOwners}
        completionPersistingLotId={completionPersistingLotId}
        inlineSummaryBusy={inlineSummaryBusy}
        setLotStatus={setLotStatus}
        handlePartyChange={handlePartyChange}
        openEdit={openEdit}
        openLinkedLot={openLinkedLot}
        setDeleteTarget={setDeleteTarget}
        renderOwnerBillableAmount={renderOwnerBillableAmount}
      />

      {/* Mobile Views */}
      <LotMobileViews
        filtered={filtered}
        paginatedLots={paginatedLots}
        viewMode={viewMode}
        lotTableTab={lotTableTab}
        parties={parties}
        businessOwners={businessOwners}
        completionPersistingLotId={completionPersistingLotId}
        inlineSummaryBusy={inlineSummaryBusy}
        setLotStatus={setLotStatus}
        handlePartyChange={handlePartyChange}
        openEdit={openEdit}
        openLinkedLot={openLinkedLot}
        setDeleteTarget={setDeleteTarget}
        renderOwnerBillableAmount={renderOwnerBillableAmount}
      />

      {/* Pagination */}
      {filtered.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
            >
              Prev
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Lot Form Modal */}
      {modal === 'form' && (
        <Modal
          title={editing ? (editing.suitComponent === 'dupatta' ? 'Edit Lot (Dupatta)' : 'Edit Lot') : 'Add New Lot'}
          onClose={() => {
            if (!lotSaving) {
              setModal(null);
              setEditing(null);
            }
          }}
        >
          <LotForm
            key={editing?.id || 'new'}
            initial={editing}
            onSave={handleSave}
            onClose={() => {
              if (!lotSaving) {
                setModal(null);
                setEditing(null);
              }
            }}
            onSeparateBill={handleSeparateDupattaBill}
            parties={parties}
            saving={lotSaving}
            pickWorkspaceForNewLot={viewAllWorkspaces && !editing}
            workspaceOwnerOptions={businessOwners}
            defaultNewLotOwnerId={activeBusinessOwnerId}
            onJumpToLinkedLot={openLinkedLot}
          />
        </Modal>
      )}

      {/* Complete Bill Modal */}
      <CompleteBillModal
        completeBillModal={completeBillModal}
        completeBillInput={completeBillInput}
        setCompleteBillInput={setCompleteBillInput}
        completeBillError={completeBillError}
        setCompleteBillError={setCompleteBillError}
        dismissCompleteBillModal={dismissCompleteBillModal}
        confirmCompleteBillModal={confirmCompleteBillModal}
        ownerReceivedNet={ownerReceivedNet}
        getPartyName={getPartyName}
        partyEdits={partyEdits}
      />

      {/* Payment Modal */}
      <PaymentModal
        payModal={payModal}
        payForm={payForm}
        setPayForm={setPayForm}
        payErrors={payErrors}
        setPayErrors={setPayErrors}
        paymentSaving={paymentSaving}
        setPayModal={setPayModal}
        handleAddPayment={handleAddPayment}
        parties={parties}
        collectionLots={collectionLots}
      />

      {/* Confirm Delete */}
      {deleteTarget && (
        <ConfirmDialog
          message={
            (deleteTarget.suitComponent !== 'dupatta' && (deleteTarget.linkedLotId || (deleteTarget.suitType === '3-piece' && collectionLots.some(l => String(l.linkedLotId) === String(deleteTarget.id)))))
              ? `Delete lot ${deleteTarget.lotNumber || deleteTarget.lotNo} / ${deleteTarget.designNo}? This will also delete the linked Dupatta lot. This action cannot be undone.`
              : deleteTarget.suitComponent === 'dupatta' && deleteTarget.linkedLotId
              ? `Delete lot ${deleteTarget.lotNumber || deleteTarget.lotNo} / ${deleteTarget.designNo}? This will downgrade the linked Main lot to a 2-piece suit. This action cannot be undone.`
              : `Delete lot ${deleteTarget.lotNumber || deleteTarget.lotNo} / ${deleteTarget.designNo}? This action cannot be undone.`
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirming={deleteLoading}
        />
      )}
    </div>
  );
}
