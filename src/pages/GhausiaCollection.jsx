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
  PaginationFooter,
} from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
  compareBillableLotsNewestFirst,
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
  matchLotSearch,
} from '../utils/ghausiaHelpers';

// Sub-components
import LotForm from '../components/ghausia/LotForm';
import SummaryCards from '../components/ghausia/SummaryCards';
import BillableSection from '../components/ghausia/BillableSection';
import LotTableDesktop from '../components/ghausia/LotTableDesktop';
import LotMobileViews from '../components/ghausia/LotMobileViews';
import PaymentModal from '../components/ghausia/PaymentModal';
import CompleteBillModal from '../components/ghausia/CompleteBillModal';
import OwnerBillModal from '../components/ledger/OwnerBillModal';
import OwnerBillsListModal from '../components/ledger/OwnerBillsListModal';
import useDebounce from '../hooks/useDebounce';
import apiService from '../services/api';

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
    refreshData,
    markLotsBilledLocally,
    revertLotsBilledLocally,
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
  const [searchField, setSearchField] = useState('all');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('All');
  const [stuckLotIdsFilter, setStuckLotIdsFilter] = useState([]);
  const [partyFilter, setPartyFilter] = useState('All');
  const [componentFilter, setComponentFilter] = useState('All');
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
  const lotsSectionTopRef = useRef(null);
  const [billableCollapsed, setBillableCollapsed] = useState(() => {
    return localStorage.getItem('ghausia_billable_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('ghausia_billable_collapsed', String(billableCollapsed));
  }, [billableCollapsed]);

  const [billableSearch, setBillableSearch] = useState('');
  const [highlightedBillableLotId, setHighlightedBillableLotId] = useState(null);
  const debouncedBillableSearch = useDebounce(billableSearch, 300);
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
    const compParam = params.get('component') || params.get('componentType') || params.get('type');
    if (compParam && ['main', 'dupatta'].includes(compParam.toLowerCase())) {
      setComponentFilter(compParam.toLowerCase());
    }
    const q = params.get('search') || params.get('lotNo') || params.get('lotNumber');
    if (q) {
      setSearch(q);
      setSearchField('all');
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

    const nowD = new Date();
    const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
    const lotUpdate = {
      status: 'completed',
      receivedBackDate: today,
      billAmount:
        fromBillable && partyEdits[lot.id]?.amountChangeNote
          ? Number(lot.billAmount || 0)
          : billAmount,
      ...(fromBillable ? { completedFromBillable: false } : {}),
    };

    const rawLotNum = String(lot.lotNumber || lot.lotNo || '').trim();
    const normKey = rawLotNum ? normalizeLotNumberKey(rawLotNum) : null;
    const isReworkLot = Boolean(lot.isRework);
    const existingOwnerPayments = normKey
      ? payments.filter((p) => {
        if (!p.linkedLot) return false;
        if (String(p.party || '').trim().toLowerCase() !== 'owner') return false;
        const paymentLinkedKey = normalizeLotNumberKey(
          String(p.linkedLot).replace(/\s*\(rework\)\s*/i, '')
        );
        if (paymentLinkedKey !== normKey) return false;
        const paymentIsRework =
          /rework/i.test(p.linkedLot || '') || /rework/i.test(p.note || '');
        return paymentIsRework === isReworkLot;
      })
      : [];
    const isReEditedLot = fromBillable && !!partyEdits[lot.id]?.amountChangeNote;
    const paymentAmount = Number(billAmount) || 0;
    const paymentType = 'Paid';

    const linkedLot = isReworkLot ? `${rawLotNum} (Rework)` : rawLotNum;
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
          ? (isReworkLot
            ? `Rework lot settled — Party: ${partyName || '—'}; Design: ${designNo}`
            : (isReEditedLot ? `Billable lot settled (difference) — Party: ${partyName || '—'}; Design: ${designNo}` : `Defective lot settled — Party: ${partyName || '—'}`))
          : (isReworkLot
            ? `Rework lot completed — Party: ${partyName || '—'}; Design: ${designNo}`
            : `Lot completed — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lot.itemType || lot.fabric || '—'}`),
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
      const nowD = new Date();
    const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
      const lotUpdate = { status: newStatus };
      if (newStatus === 'dispatched') lotUpdate.dispatchDate = today;
      if (newStatus === 'received back') {
        lotUpdate.receivedBackDate = today;
        lotUpdate.completionApprovedAt = new Date().toISOString();
      }
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

  const partyMap = useMemo(
    () => new Map((parties || []).map((p) => [String(p?.id), String(p?.name || '').toLowerCase()])),
    [parties]
  );

  // ─── Filtered & Paginated Lots ───
  const filtered = useMemo(() => {
    const list = effectiveCollectionLots.filter((l) => {
      if (highlightedBillableLotId && String(l.id) !== String(highlightedBillableLotId)) return false;
      if (componentFilter === 'dupatta' && l.suitComponent !== 'dupatta') return false;
      if (componentFilter === 'main' && l.suitComponent === 'dupatta') return false;
      if (!matchLotSearch(l, debouncedSearch, searchField, partyMap)) return false;
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
      const isCompleted = l.status === 'completed' || Boolean(l.ownerBillId) || Boolean(l.billedInBillNo);
      if (lotTableTab === 'completed') return isCompleted;
      if (isCompleted) return false;
      return statusFilter === 'All' || l.status === statusFilter;
    });
    return [...list].sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'lot'));
  }, [
    effectiveCollectionLots,
    debouncedSearch,
    searchField,
    partyMap,
    componentFilter,
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
  }, [debouncedSearch, searchField, componentFilter, partyFilter, dateRange, customRange, statusFilter, stuckLotIdsFilter, lotTableTab, viewAllWorkspaces]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleLots = useMemo(
    () =>
      effectiveCollectionLots.filter((l) => {
        if (componentFilter === 'dupatta' && l.suitComponent !== 'dupatta') return false;
        if (componentFilter === 'main' && l.suitComponent === 'dupatta') return false;
        if (partyFilter !== 'All' && String(l.partyId || '') !== String(partyFilter)) return false;
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
    [effectiveCollectionLots, componentFilter, partyFilter, dateRange, customRange]
  );

  const isLotCompletedOrBilled = (l) =>
    l.status === 'completed' || Boolean(l.ownerBillId) || Boolean(l.billedInBillNo);

  const completedLotsCount = useMemo(
    () => {
      let lots = visibleLots;
      if (highlightedBillableLotId) {
        lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
      }
      if (stuckLotIdsFilter.length > 0) {
        lots = lots.filter(l => stuckLotIdsFilter.includes(String(l.id)));
      }
      return lots.filter(isLotCompletedOrBilled).length;
    },
    [visibleLots, highlightedBillableLotId, stuckLotIdsFilter]
  );
  const otherLotsCount = useMemo(() => {
    let lots = visibleLots;
    if (highlightedBillableLotId) {
      lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
    }
    if (stuckLotIdsFilter.length > 0) {
      lots = lots.filter(l => stuckLotIdsFilter.includes(String(l.id)));
    }
    return lots.filter((l) => !isLotCompletedOrBilled(l)).length;
  }, [visibleLots, highlightedBillableLotId, stuckLotIdsFilter]);
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
    if (stuckLotIdsFilter.length > 0) {
      lots = lots.filter(l => stuckLotIdsFilter.includes(String(l.id)));
    }
    if (statusFilter === 'All') return otherLotsCount;
    return lots.filter((l) => !isLotCompletedOrBilled(l) && l.status === statusFilter).length;
  }, [visibleLots, statusFilter, otherLotsCount, highlightedBillableLotId, stuckLotIdsFilter]);
  const othersTabHint =
    statusFilter === 'All'
      ? 'Pending, dispatched, and received back (not completed)'
      : `${othersTabStatusLabel} lots in the current filters`;

  // Search-aware tab counts so tab badge numbers match search queries
  const searchOthersCount = useMemo(() => {
    if (!debouncedSearch.trim()) return othersTabCount;
    let lots = visibleLots.filter((l) => !isLotCompletedOrBilled(l));
    if (highlightedBillableLotId) {
      lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
    }
    if (stuckLotIdsFilter.length > 0) {
      lots = lots.filter(l => stuckLotIdsFilter.includes(String(l.id)));
    }
    if (statusFilter !== 'All') {
      lots = lots.filter(l => l.status === statusFilter);
    }
    return lots.filter(l => matchLotSearch(l, debouncedSearch, searchField, partyMap)).length;
  }, [visibleLots, highlightedBillableLotId, stuckLotIdsFilter, statusFilter, debouncedSearch, searchField, partyMap, othersTabCount]);

  const searchCompletedCount = useMemo(() => {
    if (!debouncedSearch.trim()) return completedLotsCount;
    let lots = visibleLots.filter(isLotCompletedOrBilled);
    if (highlightedBillableLotId) {
      lots = lots.filter(l => String(l.id) === String(highlightedBillableLotId));
    }
    if (stuckLotIdsFilter.length > 0) {
      lots = lots.filter(l => stuckLotIdsFilter.includes(String(l.id)));
    }
    return lots.filter(l => matchLotSearch(l, debouncedSearch, searchField, partyMap)).length;
  }, [visibleLots, highlightedBillableLotId, stuckLotIdsFilter, debouncedSearch, searchField, partyMap, completedLotsCount]);

  const displayOthersTabCount = debouncedSearch.trim() ? searchOthersCount : othersTabCount;
  const displayCompletedLotsCount = debouncedSearch.trim() ? searchCompletedCount : completedLotsCount;

  // Selected billable lot object
  const highlightedLot = useMemo(() => {
    if (!highlightedBillableLotId) return null;
    return effectiveCollectionLots.find(l => String(l.id) === String(highlightedBillableLotId)) || null;
  }, [highlightedBillableLotId, effectiveCollectionLots]);

  // Check if matches exist without highlighted billable lot filter
  const matchesWithoutHighlight = useMemo(() => {
    if (!highlightedBillableLotId || !debouncedSearch.trim()) return 0;
    return effectiveCollectionLots.filter(l => {
      if (componentFilter === 'dupatta' && l.suitComponent !== 'dupatta') return false;
      if (componentFilter === 'main' && l.suitComponent === 'dupatta') return false;
      if (lotTableTab === 'completed' && l.status !== 'completed') return false;
      if (lotTableTab === 'others' && l.status === 'completed') return false;
      return matchLotSearch(l, debouncedSearch, searchField, partyMap);
    }).length;
  }, [highlightedBillableLotId, debouncedSearch, searchField, partyMap, effectiveCollectionLots, lotTableTab, componentFilter]);

  // Check if search query matches lots in the other tab
  const otherTabMatchCount = useMemo(() => {
    if (!debouncedSearch.trim()) return 0;
    const targetStatus = lotTableTab === 'others' ? 'completed' : 'others';
    return effectiveCollectionLots.filter(l => {
      if (componentFilter === 'dupatta' && l.suitComponent !== 'dupatta') return false;
      if (componentFilter === 'main' && l.suitComponent === 'dupatta') return false;
      const isCompleted = l.status === 'completed' || Boolean(l.ownerBillId) || Boolean(l.billedInBillNo);
      if (targetStatus === 'completed' && !isCompleted) return false;
      if (targetStatus === 'others' && isCompleted) return false;
      return matchLotSearch(l, debouncedSearch, searchField, partyMap);
    }).length;
  }, [debouncedSearch, searchField, partyMap, effectiveCollectionLots, lotTableTab, componentFilter]);

  // Filter clear callbacks
  const handleClearSearch = useCallback(() => {
    setSearch('');
    setSearchField('all');
  }, []);

  const handleClearHighlightedLot = useCallback(() => {
    setHighlightedBillableLotId(null);
  }, []);

  const handleClearPartyFilter = useCallback(() => {
    setPartyFilter('All');
  }, []);

  const handleClearComponentFilter = useCallback(() => {
    setComponentFilter('All');
  }, []);

  const handleClearStatusFilter = useCallback(() => {
    setStatusFilter('All');
  }, []);

  const handleClearDateRange = useCallback(() => {
    setDateRange('all');
  }, []);

  const handleResetAllFilters = useCallback(() => {
    setSearch('');
    setSearchField('all');
    setPartyFilter('All');
    setComponentFilter('All');
    setStatusFilter('All');
    setDateRange('all');
    setStuckLotIdsFilter([]);
    setHighlightedBillableLotId(null);
  }, []);

  // ─── Owner Bill & Settle Integration State ───
  const [showOwnerBillModal, setShowOwnerBillModal] = useState(false);
  const [showBillsHistoryModal, setShowBillsHistoryModal] = useState(false);
  const [selectedBillToView, setSelectedBillToView] = useState(null);

  const activeBillOwnerId = useMemo(() => {
    if (!viewAllWorkspaces && activeBusinessOwnerId) {
      return String(activeBusinessOwnerId);
    }
    if (businessOwners && businessOwners.length > 0) {
      return String(businessOwners[0].id || businessOwners[0]._id);
    }
    return '';
  }, [viewAllWorkspaces, activeBusinessOwnerId, businessOwners]);

  // Synchronous cache lookup so there is ZERO flash of stale amount on page load / navigation
  const [ownerBills, setOwnerBills] = useState(() => {
    try {
      const targetId = (!viewAllWorkspaces && activeBusinessOwnerId)
        ? String(activeBusinessOwnerId)
        : (businessOwners && businessOwners.length > 0 ? String(businessOwners[0].id || businessOwners[0]._id) : '');
      if (targetId) {
        const cached = sessionStorage.getItem(`waqas_owner_bills_${targetId}`);
        if (cached) return JSON.parse(cached);
      }
    } catch (_) {
      // ignore cache read error
    }
    return [];
  });

  const [ownerBillsDefaults, setOwnerBillsDefaults] = useState(() => {
    try {
      const targetId = (!viewAllWorkspaces && activeBusinessOwnerId)
        ? String(activeBusinessOwnerId)
        : (businessOwners && businessOwners.length > 0 ? String(businessOwners[0].id || businessOwners[0]._id) : '');
      if (targetId) {
        const cached = sessionStorage.getItem(`waqas_owner_defaults_${targetId}`);
        if (cached) return JSON.parse(cached);
      }
    } catch (_) {
      // ignore cache read error
    }
    return null;
  });

  const fetchOwnerBills = useCallback(async () => {
    if (!activeBillOwnerId) {
      setOwnerBills([]);
      setOwnerBillsDefaults(null);
      return;
    }
    try {
      const res = await apiService.getOwnerBills(activeBillOwnerId);
      const bills = res?.bills || [];
      const defaults = res?.nextDefaults || null;
      setOwnerBills(bills);
      setOwnerBillsDefaults(defaults);
      try {
        sessionStorage.setItem(`waqas_owner_bills_${activeBillOwnerId}`, JSON.stringify(bills));
        sessionStorage.setItem(`waqas_owner_defaults_${activeBillOwnerId}`, JSON.stringify(defaults));
      } catch (_) {
        // ignore cache write error
      }
    } catch (_) {
      // Ignore background bill sync errors silently
    }
  }, [activeBillOwnerId]);

  useEffect(() => {
    try {
      if (activeBillOwnerId) {
        const cached = sessionStorage.getItem(`waqas_owner_bills_${activeBillOwnerId}`);
        if (cached) setOwnerBills(JSON.parse(cached));
        const cachedDefs = sessionStorage.getItem(`waqas_owner_defaults_${activeBillOwnerId}`);
        if (cachedDefs) setOwnerBillsDefaults(JSON.parse(cachedDefs));
      }
    } catch (_) {
      // ignore cache read error
    }
    fetchOwnerBills();
  }, [activeBillOwnerId, fetchOwnerBills]);

  // ─── Billable Lots (Strictly 'received back' and unbilled; newest approved always on top) ───
  const billable = useMemo(
    () =>
      effectiveCollectionLots
        .filter((l) => {
          if (l.status !== 'received back') return false;
          if (l.ownerBillId || l.billedInBillNo) return false;
          if (viewAllWorkspaces) return true;
          const matchesOwner =
            !activeBillOwnerId ||
            !l.businessOwnerId ||
            String(l.businessOwnerId) === String(activeBillOwnerId);
          return matchesOwner;
        })
        .sort((a, b) => compareBillableLotsNewestFirst(a, b)),
    [effectiveCollectionLots, activeBillOwnerId, viewAllWorkspaces]
  );

  const activeBillOwnerName = useMemo(() => {
    if (!viewAllWorkspaces && activeWorkspace?.name && activeWorkspace.name !== 'All workspaces') {
      return activeWorkspace.name;
    }
    const matched = businessOwners?.find(
      (o) => String(o.id || o._id) === String(activeBillOwnerId)
    );
    return matched?.name || 'Owner';
  }, [viewAllWorkspaces, activeWorkspace, businessOwners, activeBillOwnerId]);

  const ownerPaymentsForBill = useMemo(() => {
    const bizNameLower = String(activeWorkspace?.name || '').trim().toLowerCase();
    const ownerNameLower = String(activeBillOwnerName || '').trim().toLowerCase();
    const firstOwnerId = businessOwners?.[0] ? String(businessOwners[0].id || businessOwners[0]._id) : '';
    return payments.filter((p) => {
      const isReceived = p.type === 'Received';
      if (!isReceived) return false;
      const partyLower = String(p.party || '').trim().toLowerCase();
      const isOwnerParty =
        partyLower === 'owner' ||
        partyLower === '' ||
        (bizNameLower && bizNameLower !== 'all workspaces' && partyLower === bizNameLower) ||
        (ownerNameLower && ownerNameLower !== 'owner' && partyLower === ownerNameLower);
      const matchesBiz =
        !activeBillOwnerId ||
        (p.businessOwnerId
          ? String(p.businessOwnerId) === String(activeBillOwnerId)
          : (businessOwners.length <= 1 || String(activeBillOwnerId) === firstOwnerId));
      return isOwnerParty && matchesBiz;
    });
  }, [payments, activeWorkspace, activeBillOwnerId, activeBillOwnerName, businessOwners]);

  const allWorkspaceBillableLots = useMemo(
    () =>
      billable.filter(
        (l) =>
          !activeBillOwnerId ||
          !l.businessOwnerId ||
          String(l.businessOwnerId) === String(activeBillOwnerId)
      ),
    [billable, activeBillOwnerId]
  );

  const modalCandidateLots = useMemo(() => {
    if (!selectedBillToView) return allWorkspaceBillableLots;
    const billLotsFormatted = (selectedBillToView.lots || []).map((bLot) => {
      const found = effectiveCollectionLots.find(
        (l) => String(l.id || l._id) === String(bLot.lotId || bLot._id || bLot.id)
      );
      return (
        found || {
          _id: bLot.lotId,
          id: bLot.lotId,
          lotNo: bLot.lotNo,
          lotNumber: bLot.lotNo,
          designNo: bLot.designNo,
          suitQuantity: bLot.quantity,
          rate: bLot.rate,
          billAmount: bLot.amount,
          status: 'completed',
          ownerBillId: selectedBillToView.id || selectedBillToView._id,
          billedInBillNo: selectedBillToView.billNo,
        }
      );
    });
    return [...billLotsFormatted, ...allWorkspaceBillableLots];
  }, [selectedBillToView, allWorkspaceBillableLots, effectiveCollectionLots]);

  const getOwnerBillableAmount = (lot) => getBusinessBillAmount(lot);

  const getOwnerSettledAmount = useCallback(
    (lot) => {
      const rawLotNum = String(lot?.lotNumber || lot?.lotNo || '').trim();
      if (!rawLotNum) return 0;
      const normKey = normalizeLotNumberKey(rawLotNum);
      const isReworkLot = Boolean(lot?.isRework);
      const existingOwnerPayments = payments.filter((p) => {
        if (!p.linkedLot) return false;
        if (String(p.party || '').trim().toLowerCase() !== 'owner') return false;
        const paymentLinkedKey = normalizeLotNumberKey(
          String(p.linkedLot).replace(/\s*\(rework\)\s*/i, '')
        );
        if (paymentLinkedKey !== normKey) return false;
        const paymentIsRework =
          /rework/i.test(p.linkedLot || '') || /rework/i.test(p.note || '');
        return paymentIsRework === isReworkLot;
      });
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
  const ownerIn = useMemo(() => {
    const bizNameLower = String(activeWorkspace?.name || '').trim().toLowerCase();
    const ownerNamesSet = new Set(
      (businessOwners || []).map((o) => String(o?.name || '').trim().toLowerCase()).filter(Boolean)
    );
    return effectivePayments
      .filter((p) => {
        if (p.type !== 'Received') return false;
        const partyLower = String(p.party || '').trim().toLowerCase();
        return (
          partyLower === 'owner' ||
          partyLower === '' ||
          (bizNameLower && bizNameLower !== 'all workspaces' && partyLower === bizNameLower) ||
          (viewAllWorkspaces && ownerNamesSet.has(partyLower))
        );
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [effectivePayments, activeWorkspace, viewAllWorkspaces, businessOwners]);

  const ownerPaidToOwner = useMemo(() => {
    const bizNameLower = String(activeWorkspace?.name || '').trim().toLowerCase();
    const ownerNamesSet = new Set(
      (businessOwners || []).map((o) => String(o?.name || '').trim().toLowerCase()).filter(Boolean)
    );
    return effectivePayments
      .filter((p) => {
        if (p.type !== 'Paid') return false;
        // Exclude auto-generated OwnerBill lot-settlement Paid records (already counted in billableSettledTotal)
        const isAutoOwnerBillPaid =
          Boolean(p.ownerBillId) ||
          (p.billedInBillNo && p.billedInBillNo !== 'none') ||
          String(p.note || '').includes('billed to owner');
        if (isAutoOwnerBillPaid) return false;
        const partyLower = String(p.party || '').trim().toLowerCase();
        return (
          partyLower === 'owner' ||
          (bizNameLower && bizNameLower !== 'all workspaces' && partyLower === bizNameLower) ||
          (viewAllWorkspaces && ownerNamesSet.has(partyLower))
        );
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [effectivePayments, activeWorkspace, viewAllWorkspaces, businessOwners]);

  const billableSettledTotal = useMemo(
    () =>
      effectiveCollectionLots
        .filter((l) => {
          const isBilled = (l.status === 'completed' && l.completedFromBillable) || Boolean(l.ownerBillId) || Boolean(l.billedInBillNo);
          if (!isBilled) return false;
          if (viewAllWorkspaces) return true;
          const matchesBiz =
            !activeBillOwnerId ||
            !l.businessOwnerId ||
            String(l.businessOwnerId) === String(activeBillOwnerId);
          return matchesBiz;
        })
        .reduce((s, l) => s + Number(getBusinessBillAmount(l) || l.billAmount || 0), 0),
    [effectiveCollectionLots, activeBillOwnerId, viewAllWorkspaces]
  );
  const ownerReceivedNet = ownerIn - ownerPaidToOwner - billableSettledTotal;
  const ownerReceivedIsPending = ownerReceivedNet < 0;

  const latestTallyBaqaya = useMemo(() => {
    const tallyPayments = (effectivePayments || []).filter((p) => {
      const pBiz = String(p.businessOwnerId || p.ownerWorkspaceId || '');
      const matchesBiz = !activeBillOwnerId || !pBiz || pBiz === String(activeBillOwnerId);
      return p.type === 'Tally' && matchesBiz;
    });
    if (tallyPayments.length === 0) return null;

    const sorted = [...tallyPayments].sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    for (const t of sorted) {
      const amt = Number(t.amount || 0);
      if (amt > 0) return amt;
      const note = String(t.note || '');
      const m = note.match(/Baqaya:\s*Rs\s*([0-9,]+)/i);
      if (m) {
        const parsed = Number(m[1].replace(/,/g, ''));
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return null;
  }, [effectivePayments, activeBillOwnerId]);

  const latestFinalizedBill = useMemo(() => {
    if (!ownerBills || ownerBills.length === 0) return null;
    const sorted = [...ownerBills].sort((a, b) => {
      const bookDiff = Number(b.bookNo || 1) - Number(a.bookNo || 1);
      if (bookDiff !== 0) return bookDiff;
      return Number(b.billNo || 0) - Number(a.billNo || 0);
    });
    return sorted[0] || null;
  }, [ownerBills]);

  // When an owner bill is finalized, the true receivable is anchored by the latest bill's Baqaya:
  // Receivable = Latest Bill Baqaya + Unbilled Lots (ready to bill) - Fresh Payments (received after latest bill)
  const ownerReceivableFromBills = useMemo(() => {
    if (viewAllWorkspaces && businessOwners && businessOwners.length > 1) {
      return null;
    }
    const baseBaqaya = latestFinalizedBill
      ? Number(latestFinalizedBill.grandTotalBaqaya || 0)
      : latestTallyBaqaya;

    if (baseBaqaya == null) return null;
    const unbilledLotsWork = allWorkspaceBillableLots.reduce(
      (s, l) => s + getOwnerUnpaidBalance(l),
      0
    );

    const settledPaymentIds = new Set(ownerBillsDefaults?.billedPaymentIds || []);
    (ownerBills || []).forEach((b) => {
      (b.paymentsReceived || []).forEach((p) => {
        const pid = String(p.paymentId || p._id || p.id || '').trim();
        if (pid) settledPaymentIds.add(pid);
      });
    });

    const freshReceived = ownerPaymentsForBill
      .filter((p) => {
        if (p.type !== 'Received') return false;
        const pid = String(p._id || p.id || '');
        if (settledPaymentIds.has(pid)) return false;
        if (p.billedInBillNo && p.billedInBillNo !== 'none') return false;
        if (p.isLegacySettled) return false;
        return true;
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const net = baseBaqaya + unbilledLotsWork - freshReceived;
    return Math.round(net);
  }, [
    viewAllWorkspaces,
    businessOwners,
    latestFinalizedBill,
    latestTallyBaqaya,
    allWorkspaceBillableLots,
    getOwnerUnpaidBalance,
    ownerBills,
    ownerBillsDefaults,
    ownerPaymentsForBill,
  ]);

  // Unbilled received payments for this billing cycle
  const unbilledOwnerReceived = useMemo(() => {
    return ownerPaymentsForBill
      .filter((p) => p.type === 'Received' && (!p.billedInBillNo || p.billedInBillNo === 'none') && !p.isLegacySettled)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [ownerPaymentsForBill]);

  // Previous Balance before unbilled received payments (true Sabqa Baqaya carried forward)
  const initialPreviousBalanceForBill = useMemo(() => {
    if (latestFinalizedBill && latestFinalizedBill.grandTotalBaqaya != null) {
      return Number(latestFinalizedBill.grandTotalBaqaya);
    }
    if (latestTallyBaqaya != null) {
      return latestTallyBaqaya;
    }
    const rawNet = -ownerReceivedNet;
    const grossBal = rawNet + unbilledOwnerReceived;
    return Math.max(0, Math.round(grossBal));
  }, [latestFinalizedBill, latestTallyBaqaya, ownerReceivedNet, unbilledOwnerReceived]);

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

  useEffect(() => {
    const handleOpenLot = () => {
      openAdd();
    };
    window.addEventListener('open-new-lot', handleOpenLot);
    return () => window.removeEventListener('open-new-lot', handleOpenLot);
  }, []);



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
      const isReworkBulk = Boolean(basePayload.isRework);
      const suitCompBulk = basePayload.suitComponent || 'main';
      const existingKeys = new Set(
        collectionLots
          .filter((l) =>
            String(l.businessOwnerId ?? '') === targetBiz &&
            Boolean(l.isRework) === isReworkBulk &&
            (l.suitComponent || 'main') === suitCompBulk
          )
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

    const nowD = new Date();
    const today = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
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
        <div className="ghausia-hero-top">
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
                localStorage.setItem('hideLedgerSummary', !next ? 'true' : 'false');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: showSummaryCards ? 'var(--text-secondary, #475569)' : 'var(--primary, #1e40af)',
                border: '1px solid var(--border)',
                background: showSummaryCards ? 'var(--card-bg, #ffffff)' : 'var(--primary-bg, #eff6ff)',
                borderRadius: 20,
                padding: '5px 14px',
                minWidth: 126,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
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
        ownerIn={ownerIn}
        ownerPaidToOwner={ownerPaidToOwner}
        billableSettledTotal={billableSettledTotal}
        ownerReceivableFromBills={ownerReceivableFromBills}
        latestFinalizedBill={latestFinalizedBill}
        statsRefreshing={statsRefreshing}
        onOpenBillModal={() => {
          setSelectedBillToView(null);
          setShowOwnerBillModal(true);
        }}
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
        onOpenBillModal={() => {
          setSelectedBillToView(null);
          setShowOwnerBillModal(true);
        }}
        onOpenBillHistory={() => {
          setShowBillsHistoryModal(true);
        }}
      />

      {/* Active Billable Filter Banner */}
      {highlightedLot && (
        <div
          className="billable-filter-banner animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 14px',
            marginBottom: 14,
            background: 'color-mix(in srgb, var(--primary, #3b82f6) 12%, var(--card-bg, #231b17))',
            border: '1px solid var(--primary, #3b82f6)',
            borderRadius: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
            <span style={{ fontSize: 16 }}>📌</span>
            <span>
              <strong>Billable Lot Selected:</strong> Table is filtered to show only Lot{' '}
              <strong style={{ color: 'var(--primary, #3b82f6)' }}>
                {(highlightedLot.lotNumber || highlightedLot.lotNo)
                  ? `#${highlightedLot.lotNumber || highlightedLot.lotNo} / ${highlightedLot.designNo || '—'}`
                  : `(No Lot) / ${highlightedLot.designNo || '—'}`}
              </strong>{' '}
              {highlightedLot.isRework && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    background: 'var(--primary-bg, #fffbeb)',
                    color: 'var(--primary, #b45309)',
                    border: '1px solid var(--border, #fde68a)',
                    borderRadius: 4,
                    marginRight: 6,
                  }}
                >
                  Rework
                </span>
              )}
              ({highlightedLot.partyName || 'Own Factory'}).
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setHighlightedBillableLotId(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--primary, #3b82f6)',
              borderColor: 'var(--primary, #3b82f6)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            ✕ Show All Lots (Deselect)
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar pl-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search..."
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          resultCount={filtered.length}
          searchOptions={[
            { label: 'All', value: 'all' },
            { label: 'Lot', value: 'lotNo' },
            { label: 'Design', value: 'designNo' },
            { label: 'Fabric', value: 'fabric' },
            { label: 'Desc', value: 'description' },
            { label: 'Party', value: 'partyName' },
          ]}
        />
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
          containerClassName="pl-toolbar-filter pl-toolbar-filter--date"
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

        <select
          className="form-select pl-toolbar-filter pl-toolbar-filter--type"
          value={componentFilter}
          onChange={(e) => setComponentFilter(e.target.value)}
          aria-label="Filter by lot type"
        >
          <option value="All">All Types</option>
          <option value="main">Main Lots Only</option>
          <option value="dupatta">Dupatta Lots Only</option>
        </select>

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
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center', minWidth: 140 }}>
            Completed lots only
          </span>
        )}
      </div>

      {/* Table tabs & View Mode Switcher */}
      <div
        ref={lotsSectionTopRef}
        role="tablist"
        aria-label="Lots by completion"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          marginBottom: 16,
        }}
      >
        <div className="segmented-tabs">
          {[
            {
              id: 'others',
              label: othersTabStatusLabel,
              count: displayOthersTabCount,
              hint: debouncedSearch.trim()
                ? `${displayOthersTabCount} matching lots (of ${othersTabCount} in category)`
                : othersTabHint,
            },
            {
              id: 'completed',
              label: 'Completed',
              count: displayCompletedLotsCount,
              hint: debouncedSearch.trim()
                ? `${displayCompletedLotsCount} matching lots (of ${completedLotsCount} completed)`
                : 'Lots marked completed',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={lotTableTab === tab.id}
              title={tab.hint}
              className={`segmented-tab ${lotTableTab === tab.id ? 'active' : ''}`}
              onClick={() => { setLotTableTab(tab.id); setStuckLotIdsFilter([]); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tab.label}
              <span
                className="glass-badge"
                style={{
                  padding: '2px 6px',
                  fontSize: 11,
                  background: lotTableTab === tab.id ? 'var(--primary-bg, #eff6ff)' : 'rgba(0,0,0,0.06)',
                  color: lotTableTab === tab.id ? 'var(--primary, #1e40af)' : 'inherit',
                  border: 'none'
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* View Switcher */}
        <div className="segmented-tabs mobile-view-switcher">
          <button
            type="button"
            className={`segmented-tab ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            List
          </button>
          <button
            type="button"
            className={`segmented-tab ${viewMode === 'tile' ? 'active' : ''}`}
            onClick={() => setViewMode('tile')}
            style={{ padding: '6px 10px', fontSize: 12 }}
          >
            Tiles
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <LotTableDesktop
        filtered={filtered}
        paginatedLots={paginatedLots}
        search={search}
        searchField={searchField}
        componentFilter={componentFilter}
        partyFilter={partyFilter}
        statusFilter={statusFilter}
        dateRange={dateRange}
        highlightedBillableLotId={highlightedBillableLotId}
        highlightedLot={highlightedLot}
        totalUnfilteredLots={lotTableTab === 'completed' ? completedLotsCount : othersTabCount}
        matchesWithoutHighlight={matchesWithoutHighlight}
        otherTabMatchCount={otherTabMatchCount}
        onClearSearch={handleClearSearch}
        onClearHighlightedLot={handleClearHighlightedLot}
        onClearComponentFilter={handleClearComponentFilter}
        onClearPartyFilter={handleClearPartyFilter}
        onClearStatusFilter={handleClearStatusFilter}
        onClearDateRange={handleClearDateRange}
        onResetAllFilters={handleResetAllFilters}
        onSwitchTab={(targetTab) => { setLotTableTab(targetTab); setStuckLotIdsFilter([]); }}
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
        search={search}
        searchField={searchField}
        componentFilter={componentFilter}
        partyFilter={partyFilter}
        statusFilter={statusFilter}
        dateRange={dateRange}
        highlightedBillableLotId={highlightedBillableLotId}
        highlightedLot={highlightedLot}
        totalUnfilteredLots={lotTableTab === 'completed' ? completedLotsCount : othersTabCount}
        matchesWithoutHighlight={matchesWithoutHighlight}
        otherTabMatchCount={otherTabMatchCount}
        onClearSearch={handleClearSearch}
        onClearHighlightedLot={handleClearHighlightedLot}
        onClearComponentFilter={handleClearComponentFilter}
        onClearPartyFilter={handleClearPartyFilter}
        onClearStatusFilter={handleClearStatusFilter}
        onClearDateRange={handleClearDateRange}
        onResetAllFilters={handleResetAllFilters}
        onSwitchTab={(targetTab) => { setLotTableTab(targetTab); setStuckLotIdsFilter([]); }}
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
      <PaginationFooter
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageStart={pageStart}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
        scrollTargetRef={lotsSectionTopRef}
      />

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

      {/* Owner Bill / Parchi Modal */}
      {showOwnerBillModal && (
        <OwnerBillModal
          ownerId={activeBillOwnerId}
          ownerName={activeBillOwnerName}
          candidateLots={modalCandidateLots}
          candidatePayments={ownerPaymentsForBill}
          existingBill={selectedBillToView}
          initialPreviousBalance={initialPreviousBalanceForBill}
          onClose={() => {
            setShowOwnerBillModal(false);
            setSelectedBillToView(null);
          }}
          onSaved={(savedBill) => {
            const billedLots = savedBill?.lots || [];
            if (selectedBillToView) {
              revertLotsBilledLocally(
                selectedBillToView.id || selectedBillToView._id,
                selectedBillToView.billNo,
                selectedBillToView.bookNo,
                activeBillOwnerId
              );
            }
            markLotsBilledLocally(billedLots, savedBill);
            setOptimisticCompletions((prev) => {
              const next = { ...prev };
              billedLots.forEach((bl) => {
                const id = String(bl.lotId || bl.id || bl._id || '');
                if (id) {
                  next[id] = {
                    lotPatch: {
                      status: 'completed',
                      ownerBillId: savedBill?.id || savedBill?._id,
                      billedInBillNo: savedBill?.billNo,
                      billedInBookNo: savedBill?.bookNo,
                    },
                  };
                }
              });
              return next;
            });
            refreshData({ force: true });
            fetchOwnerBills();
          }}
        />
      )}

      {/* Owner Past Bills History Modal */}
      {showBillsHistoryModal && (
        <OwnerBillsListModal
          ownerId={activeBillOwnerId}
          ownerName={activeBillOwnerName}
          onClose={() => setShowBillsHistoryModal(false)}
          onSelectBill={(b) => {
            setSelectedBillToView(b);
            setShowOwnerBillModal(true);
          }}
          onCreateNew={() => {
            setShowBillsHistoryModal(false);
            setSelectedBillToView(null);
            setShowOwnerBillModal(true);
          }}
          onBillDeleted={(b) => {
            revertLotsBilledLocally(b?.id || b?._id, b?.billNo, b?.bookNo, activeBillOwnerId);
            setOptimisticCompletions((prev) => {
              const next = { ...prev };
              (b?.lots || []).forEach((bl) => {
                const id = String(bl.lotId || bl.id || bl._id || '');
                if (id) delete next[id];
              });
              return next;
            });
            refreshData({ force: true });
            fetchOwnerBills();
          }}
        />
      )}
    </div>
  );
}
