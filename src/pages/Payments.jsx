import React, { useState, useMemo, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, EmptyState, SearchBar, PaginationFooter } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import ImageUploader from '../components/ImageUploader';
import OwnerLedgerModal from '../components/ledger/OwnerLedgerModal';
import PaymentSlipCell from '../components/receipt/PaymentSlipCell';
import {
  compareRowsByUpdatedNewestFirst,
  formatDisplayDate,
  DateRangeSelect,
  isWithinDateRange,
  toLocalYmd,
} from '../utils/dateFilters';
import { getAdminLedgerOrBusinessBill, getPartyLedgerBillNumeric } from '../utils/partyBillPrivacy';
import {
  adminPaymentPartyLabel,
  adminPaymentTypeLabel,
  isOwnerBillSettlement,
} from '../utils/paymentDisplay';

import {
  normalizeLotKey,
  lotDisplayRef,
  lotLinkValueFromLot,
  scopedLinkedLotKey,
} from '../utils/lotKeyHelpers';
import useDebounce from '../hooks/useDebounce';
import { numberToWords, formatLakhCrore } from '../utils/numberToWords';

/** Admin-approved / billable lot for party statement (mirrors Party Ledger “completed” side). */
function isLotPartyBillableStatus(status) {
  const s = String(status || '')
    .toLowerCase()
    .trim();
  return s === 'received back' || s === 'completed';
}

function partyRecordMatchesUser(partyIdOnRow, partyNameOnRow, userPartyId, userPartyName) {
  const pid = String(userPartyId || '').trim();
  const pname = String(userPartyName || '').trim().toLowerCase();
  if (partyIdOnRow != null && String(partyIdOnRow).trim() !== '') {
    return String(partyIdOnRow) === pid;
  }
  return Boolean(pname) && String(partyNameOnRow || '').trim().toLowerCase() === pname;
}

/** How a row appears for party login (mirror vs admin bookkeeping). */
function presentationType(row, isParty) {
  if (row._synthetic && row.type === 'Bill') return 'Bill';
  if (!isParty) return row.type;

  const partyLower = String(row.party || '')
    .toLowerCase()
    .trim();

  // Admin Paid → party: business paid you → show as inflow
  if (row.type === 'Paid' && partyLower !== 'owner') {
    return 'Received';
  }

  // Admin Received from party: you paid the business → show as Paid
  if (row.type === 'Received' && partyLower !== 'owner') {
    return 'Paid';
  }

  return row.type;
}

function findLotByLinkedValue(reportingLots, linkedLotValue, businessOwnerId = '') {
  if (!linkedLotValue || !reportingLots?.length) return undefined;
  const biz = String(businessOwnerId || '').trim();
  const rawLinked = String(linkedLotValue || '').trim();
  const key = normalizeLotKey(rawLinked.replace(/\s*\(rework\)\s*/i, ''));
  const linkedIsRework = /\(rework\)/i.test(rawLinked);
  const candidates = reportingLots.filter((l) => {
    const lotNoKey = normalizeLotKey(lotDisplayRef(l));
    if (lotNoKey !== key) return false;
    if (biz) {
      const lotBiz = String(l.businessOwnerId?._id ?? l.businessOwnerId ?? '').trim();
      if (lotBiz && lotBiz !== biz) return false;
    }
    return true;
  });
  return (
    candidates.find((l) => Boolean(l.isRework) === linkedIsRework) ||
    candidates[0]
  );
}

/** Admin: bill for party payout — party ledger when set & positive, else business bill on lot. */
function partyLedgerBillForLot(lot, partyEditsMap) {
  if (!lot) return 0;
  const pe = partyEditsMap[lot.id] || {};
  return getAdminLedgerOrBusinessBill(lot, pe);
}

/** Lot number + resolved design No for linked payments / synthetic bills */
function resolveLinkedLotDesignDisplay(payment, lotsPool) {
  const linked = String(payment?.linkedLot || '').trim();
  if (!linked) return { lotLabel: '', designLabel: '', isCombinedDupatta: false };
  const pBiz = String(
    payment?.businessOwnerId?._id ??
      payment?.businessOwnerId ??
      payment?.ownerWorkspaceId ??
      ''
  ).trim();
  if (payment._synthetic && payment.linkedDesignNo) {
    const lot = findLotByLinkedValue(lotsPool, linked, pBiz);
    const isCombinedDupatta = Boolean(lot && lot.suitComponent === 'dupatta' && (lot.billAmount === 0 || !lot.billAmount));
    return { lotLabel: linked, designLabel: String(payment.linkedDesignNo).trim(), isCombinedDupatta };
  }
  const lot = findLotByLinkedValue(lotsPool, linked, pBiz);
  const design = lot?.designNo != null ? String(lot.designNo).trim() : '';
  const isCombinedDupatta = Boolean(lot && lot.suitComponent === 'dupatta' && (lot.billAmount === 0 || !lot.billAmount));
  return { lotLabel: linked, designLabel: design, isCombinedDupatta };
}

function businessOwnerDisplayName(owner) {
  return String(owner?.name || '').trim() || 'Untitled';
}

function paymentBusinessOwnerId(p) {
  return p?.businessOwnerId != null ? String(p.businessOwnerId) : '';
}

function parseDateFlexible(ymd) {
  if (!ymd) return null;
  const d = typeof ymd === 'string' ? new Date(ymd) : new Date(ymd);
  return Number.isNaN(d.getTime()) ? null : d;
}

const paymentToast = (icon, title) => {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title,
    showConfirmButton: false,
    timer: icon === 'success' ? 2800 : 4200,
    timerProgressBar: true,
  });
};

export default function Payments() {
  const location = useLocation();
  const {
    payments,
    reportingPayments,
    reportingLots,
    addPayment,
    deletePayment,
    ghausiaLots,
    parties,
    initialDataLoading,
    scopedDataLoading,
    businessOwners,
    activeBusinessOwnerId,
    partyCrossPayments,
    partyCrossLots,
    partyCrossPartyEdits,
    reportingPartyEdits,
    refreshData,
    markNotificationsReadByContext,
  } = useApp();
  const { isAdmin, isParty, user } = useAuth();

  useEffect(() => {
    if (isParty && markNotificationsReadByContext) {
      markNotificationsReadByContext({ category: 'payments' });
    }
  }, [isParty, markNotificationsReadByContext]);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState(false);
  const [showOwnerLedger, setShowOwnerLedger] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [dateRange, setDateRange] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [ownerNameFilter, setOwnerNameFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [form, setForm] = useState({
    type: 'Received',
    amount: '',
    party: 'Owner',
    date: '',
    note: '',
    linkedLot: '',
    ownerWorkspaceId: '',
    receipt: '',
  });
  const [errors, setErrors] = useState({});
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      setModal(true);
    }
  }, [location.search]);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const [showSummaryCards, setShowSummaryCards] = useState(() => {
    return localStorage.getItem('hidePaymentsSummary') !== 'true';
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 400);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const visibleDbPayments = useMemo(() => {
    if (!isParty) return reportingPayments.filter((p) => p.type !== 'Tally');
    const pool = partyCrossPayments.length ? partyCrossPayments : payments;
    const pid = String(user?.partyId || '').trim();
    const pname = String(user?.partyName || '').trim();
    return pool.filter(
      (p) => p.type !== 'Tally' && partyRecordMatchesUser(p.partyId, p.party, pid, pname)
    );
  }, [isParty, reportingPayments, partyCrossPayments, payments, user?.partyId, user?.partyName]);

  const syntheticPartyBills = useMemo(() => {
    if (!isParty) return [];
    const pid = String(user?.partyId || '').trim();
    const pname = String(user?.partyName || '').trim();
    const lotsPool = partyCrossLots.length ? partyCrossLots : ghausiaLots;
    const rows = [];
    for (const l of lotsPool) {
      if (!partyRecordMatchesUser(l.partyId, l.partyName, pid, pname)) continue;
      if (!isLotPartyBillableStatus(l.status)) continue;
      const ref = lotLinkValueFromLot(l);

      const pe = partyCrossPartyEdits[l.id] || {};
      const amt = getPartyLedgerBillNumeric(pe);
      if (amt <= 0) continue;

      // Party ki original delivery / submission date (order freeze)
      // 1. pe.completeDate (party ne deliver karte waqt jo tareekh dali thi)
      // 2. l.pendingReviewSubmittedAt (jis waqt party ne send for approval kiya)
      // 3. l.receivedBackDate (lot ki delivery date)
      // 4. Fallback to dispatchDate -> allotDate -> createdAt
      const rawDate =
        pe.completeDate ||
        l.pendingReviewSubmittedAt ||
        l.receivedBackDate ||
        l.dispatchDate ||
        l.allotDate ||
        l.createdAt;

      const dateStr = toLocalYmd(rawDate) || toLocalYmd(l.allotDate);
      const submittedOnSameDay =
        l.pendingReviewSubmittedAt && toLocalYmd(l.pendingReviewSubmittedAt) === dateStr
          ? l.pendingReviewSubmittedAt
          : null;
      const parsedDate = parseDateFlexible(submittedOnSameDay || rawDate);
      const isoDate = parsedDate instanceof Date ? parsedDate.toISOString() : undefined;

      rows.push({
        id: `__bill__${l.id}`,
        _synthetic: true,
        type: 'Bill',
        amount: amt,
        party: pname || 'Party',
        date: dateStr,
        createdAt: isoDate,
        updatedAt: isoDate,
        note: `Work bill (${ref || 'lot'})`,
        linkedLot: ref || '',
        linkedLotId: l.id,
        linkedDesignNo: l.designNo != null ? String(l.designNo).trim() : '',
      });
    }
    return rows;
  }, [
    isParty,
    user?.partyId,
    user?.partyName,
    partyCrossLots,
    ghausiaLots,
    partyCrossPartyEdits,
  ]);

  const combinedRows = useMemo(() => {
    if (!isParty) return visibleDbPayments;
    return [...visibleDbPayments, ...syntheticPartyBills];
  }, [isParty, visibleDbPayments, syntheticPartyBills]);

  const lotsLookupForLinks = useMemo(() => {
    if (isParty) return partyCrossLots.length ? partyCrossLots : ghausiaLots;
    return reportingLots;
  }, [isParty, partyCrossLots, ghausiaLots, reportingLots]);

  const debouncedSearch = useDebounce(search, 300);
  const searchTerm = debouncedSearch.trim().toLowerCase();

  const combinedRowsWithBalance = useMemo(() => {
    // Calculate running balance for party perspective
    const sorted = [...combinedRows].sort((a, b) => compareRowsByUpdatedNewestFirst(b, a, 'payment'));
    let runningBalance = 0;
    return sorted.map((p) => {
      if (isParty) {
        const pt = presentationType(p, isParty);
        const val = Number(p.amount) || 0;
        if (pt === 'Bill') runningBalance += val;
        else if (pt === 'Received') runningBalance -= val;
        else if (pt === 'Paid') runningBalance += val;
        return { ...p, runningBalance };
      }
      return p;
    });
  }, [combinedRows, isParty]);

  const filtered = useMemo(
    () =>
      combinedRowsWithBalance.filter((p) => {
        const pt = presentationType(p, isParty);
        if (typeFilter === 'All') {
          // no type restriction
        } else if (typeFilter === 'Bill') {
          if (isParty) {
            if (pt !== 'Bill') return false;
          } else if (!isOwnerBillSettlement(p)) {
            return false;
          }
        } else if (typeFilter === 'Received') {
          if (pt !== 'Received') return false;
        } else if (typeFilter === 'Paid') {
          if (isParty) {
            if (pt !== 'Paid') return false;
          } else {
            // Real party payouts only — owner bill settlements belong under "Bill".
            if (p.type !== 'Paid' || isOwnerBillSettlement(p)) return false;
          }
        }
        if (isAdmin && ownerNameFilter !== 'All') {
          if (paymentBusinessOwnerId(p) !== ownerNameFilter) return false;
        }
        if (dateRange !== 'all') {
          if (!isWithinDateRange(p.date, dateRange, customDateRange)) return false;
        }

        if (searchTerm) {
          const { lotLabel, designLabel } = resolveLinkedLotDesignDisplay(p, lotsLookupForLinks);
          const party = String(p.party || '').toLowerCase();
          const note = String(p.note || '').toLowerCase();
          const lot = String(lotLabel || '').toLowerCase();
          const design = String(designLabel || '').toLowerCase();
          const amount = String(p.amount ?? '').toLowerCase();
          const date = String(formatDisplayDate(p.date, '') || '').toLowerCase();

          let matchQ = true;
          if (searchField === 'all') {
            const haystack = [party, note, lot, design, pt, String(p.type || ''), amount, date].map(v => v.toLowerCase()).join(' ');
            matchQ = haystack.includes(searchTerm);
          } else if (searchField === 'party') {
            matchQ = party.includes(searchTerm);
          } else if (searchField === 'note') {
            matchQ = note.includes(searchTerm);
          } else if (searchField === 'lotNo') {
            matchQ = lot.includes(searchTerm);
          } else if (searchField === 'designNo') {
            matchQ = design.includes(searchTerm);
          } else if (searchField === 'amount') {
            matchQ = amount.includes(searchTerm);
          } else if (searchField === 'date') {
            matchQ = date.includes(searchTerm);
          }
          if (!matchQ) return false;
        }
        return true;
      }),
    [combinedRowsWithBalance, typeFilter, ownerNameFilter, isAdmin, isParty, searchTerm, searchField, lotsLookupForLinks, dateRange, customDateRange]
  );
  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'payment')),
    [filtered]
  );
  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedPayments = sortedFiltered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    const handleOpenPayment = () => {
      setErrors({});
      setForm({
        type: 'Received',
        amount: '',
        party: 'Owner',
        date: '',
        note: '',
        linkedLot: '',
        ownerWorkspaceId: activeBusinessOwnerId || '',
        receipt: '',
      });
      setModal(true);
    };
    window.addEventListener('open-new-payment', handleOpenPayment);
    return () => window.removeEventListener('open-new-payment', handleOpenPayment);
  }, [activeBusinessOwnerId]);



  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, ownerNameFilter, searchTerm, searchField, dateRange, customDateRange]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const usedReceivedLotKeys = useMemo(
    () =>
      new Set(
        reportingPayments
          .filter((p) => p.type === 'Received' && p.linkedLot)
          .map((p) => scopedLinkedLotKey(p.linkedLot, paymentBusinessOwnerId(p)))
          .filter(Boolean)
      ),
    [reportingPayments]
  );

  const usedPaidLotKeys = useMemo(
    () =>
      new Set(
        reportingPayments
          .filter((p) => p.type === 'Paid' && p.linkedLot)
          .map((p) => scopedLinkedLotKey(p.linkedLot, paymentBusinessOwnerId(p)))
          .filter(Boolean)
      ),
    [reportingPayments]
  );

  const lotsForLinkedReceived = useMemo(() => {
    if (form.type !== 'Received') return ghausiaLots;
    if (isAdmin && String(form.ownerWorkspaceId || '').trim()) {
      return reportingLots.filter(
        (l) => String(l.businessOwnerId || '') === String(form.ownerWorkspaceId)
      );
    }
    return ghausiaLots;
  }, [form.type, form.ownerWorkspaceId, isAdmin, reportingLots, ghausiaLots]);

  const linkedLotOptions = useMemo(() => {
    if (form.type === 'Received') {
      return lotsForLinkedReceived.filter(
        (l) =>
          l.status === 'received back' &&
          !usedReceivedLotKeys.has(scopedLinkedLotKey(lotLinkValueFromLot(l), l.businessOwnerId))
      );
    }
    if (form.type !== 'Paid' || !form.party || form.party === 'Other') {
      return [];
    }
    const party = parties.find((p) => p.name === form.party);
    if (!party) return [];
    const paidLotPool =
      isAdmin && String(form.ownerWorkspaceId || '').trim()
        ? reportingLots.filter(
            (l) => String(l.businessOwnerId || '') === String(form.ownerWorkspaceId)
          )
        : ghausiaLots;
    return paidLotPool.filter((l) => {
      if (l.status !== 'completed') return false;
      const byId = party.id != null && l.partyId != null && String(l.partyId) === String(party.id);
      const byName = l.partyName && String(l.partyName).trim() === String(party.name).trim();
      if (!byId && !byName) return false;
      if (usedPaidLotKeys.has(scopedLinkedLotKey(lotLinkValueFromLot(l), l.businessOwnerId))) return false;
      return true;
    });
  }, [
    form.type,
    form.party,
    form.ownerWorkspaceId,
    lotsForLinkedReceived,
    ghausiaLots,
    reportingLots,
    isAdmin,
    parties,
    usedReceivedLotKeys,
    usedPaidLotKeys,
  ]);

  const partyStatementSummary = useMemo(() => {
    if (!isParty) return null;
    const billed = syntheticPartyBills.reduce((s, r) => s + Number(r.amount || 0), 0);
    const paidFromAdmin = visibleDbPayments
      .filter((p) => p.type === 'Paid')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const paidToBusiness = visibleDbPayments
      .filter((p) => p.type === 'Received')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    /** Business still owes party (negative = party ahead): billed work − cash paid to party + cash party returned to business */
    const due = billed - paidFromAdmin + paidToBusiness;
    return { billed, paidFromAdmin, paidToBusiness, due };
  }, [isParty, syntheticPartyBills, visibleDbPayments]);

  /** Payments included in admin summary cards (respects Owner / workspace filter; excludes non-cash Tally snapshots). */
  const adminSummaryPaymentsPool = useMemo(() => {
    const nonTally = reportingPayments.filter((p) => p.type !== 'Tally');
    if (!isAdmin) return nonTally;
    if (ownerNameFilter === 'All') return nonTally;
    const wid = String(ownerNameFilter).trim();
    return nonTally.filter((p) => paymentBusinessOwnerId(p) === wid);
  }, [isAdmin, reportingPayments, ownerNameFilter]);

  const paidToNonOwnerParties = useMemo(() => {
    return adminSummaryPaymentsPool
      .filter((p) => p.type === 'Paid' && String(p.party || '').toLowerCase() !== 'owner')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
  }, [adminSummaryPaymentsPool]);

  /** Inflows credited to workspace owner capital — only “Received” with party Owner, not party → business Received rows. */
  const ownerIn = useMemo(
    () =>
      adminSummaryPaymentsPool
        .filter(
          (p) =>
            p.type === 'Received' &&
            String(p.party || '')
              .toLowerCase()
              .trim() === 'owner'
        )
        .reduce((s, p) => s + Number(p.amount || 0), 0),
    [adminSummaryPaymentsPool]
  );

  /** Cash Received from embroidery parties (party repaying / paying in) — excludes Owner-row receipts. */
  const receivedFromParties = useMemo(
    () =>
      adminSummaryPaymentsPool
        .filter(
          (p) =>
            p.type === 'Received' &&
            String(p.party || '')
              .toLowerCase()
              .trim() !== 'owner'
        )
        .reduce((s, p) => s + Number(p.amount || 0), 0),
    [adminSummaryPaymentsPool]
  );

  /** Same subset as Paid to Parties (used if cash-flow bar is re-enabled). */
  const _partyOut = paidToNonOwnerParties;

  /** Net workspace cash: owner + party money in, minus paid out to parties (± same amount from a party cancels). */
  const balance = ownerIn + receivedFromParties - paidToNonOwnerParties;

  const adminSummaryTransactionCount = adminSummaryPaymentsPool.length;

  /** Business / collection is mandatory only for "Received from Owner" (capital in). */
  const businessCollectionRequired =
    form.type === 'Received' &&
    String(form.party || '')
      .toLowerCase()
      .trim() === 'owner';

  const validateForm = () => {
    const newErrors = {};
    const numAmt = Number(form.amount);
    if (!form.amount || String(form.amount).trim() === '') {
      newErrors.amount = 'Amount is required';
    } else if (!Number.isFinite(numAmt) || numAmt <= 0) {
      newErrors.amount = 'Amount must be greater than zero';
    }
    if (!form.date) newErrors.date = 'Date is required';
    if (form.type === 'Paid' && !form.party) newErrors.party = 'Please select a party';
    // Business / collection is required ONLY when money is received from the Owner (capital in).
    // For money received from another party, or any Paid entry, it is optional.
    if (isAdmin && businessCollectionRequired && !String(form.ownerWorkspaceId || '').trim()) {
      newErrors.ownerWorkspaceId =
        'Select which business / collection this owner payment belongs to.';
    }
    if (form.linkedLot) {
      const targetBiz =
        String(form.ownerWorkspaceId || activeBusinessOwnerId || '').trim();
      const scopedKey = scopedLinkedLotKey(form.linkedLot, targetBiz);
      const dup = reportingPayments.some((p) => {
        if (p.type !== form.type || !p.linkedLot) return false;
        const pBiz = paymentBusinessOwnerId(p);
        if (targetBiz && pBiz && targetBiz !== pBiz) return false;
        return scopedLinkedLotKey(p.linkedLot, pBiz) === scopedKey;
      });
      if (dup) {
        newErrors.linkedLot =
          form.type === 'Received'
            ? 'An owner payment is already linked to this lot in this workspace. Each lot can only be used once.'
            : 'A party payment is already linked to this lot in this workspace. Each lot can only be paid once.';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setPaymentSaving(true);
    try {
      const payload = {
        type: form.type,
        amount: form.amount,
        party: form.party,
        date: form.date,
        note: form.note || '',
        linkedLot: form.linkedLot || '',
        receipt: form.receipt || '',
      };
      const targetBiz =
        isAdmin && String(form.ownerWorkspaceId || '').trim()
          ? form.ownerWorkspaceId
          : activeBusinessOwnerId;
      await addPayment(payload, { businessOwnerId: targetBiz });
      setForm({
        type: 'Received',
        amount: '',
        party: 'Owner',
        date: '',
        note: '',
        linkedLot: '',
        ownerWorkspaceId: activeBusinessOwnerId || '',
        receipt: '',
      });
      setErrors({});
      setModal(false);
      paymentToast('success', 'Payment saved successfully');
    } catch (err) {
      paymentToast('error', 'Payment could not be saved. Please try again.');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDelete = async (paymentRow) => {
    if (!isAdmin) return;
    const id = paymentRow?.id ?? paymentRow?._id;
    if (!id) return;
    const result = await Swal.fire({
      title: 'Delete Payment?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'var(--danger, #dc2626)',
      cancelButtonColor: 'var(--text-muted, #6b7280)',
      confirmButtonText: 'Yes, delete it',
    });
    if (!result.isConfirmed) return;
    try {
      await deletePayment(id, {
        businessOwnerId: paymentRow.businessOwnerId,
      });
      paymentToast('success', 'Payment deleted');
    } catch (e) {
      paymentToast('error', String(e?.message || e || 'Could not delete payment'));
    }
  };

  const handleClose = () => {
    setModal(false);
    setErrors({});
    setForm({
      type: 'Received',
      amount: '',
      party: 'Owner',
      date: '',
      note: '',
      linkedLot: '',
      ownerWorkspaceId: activeBusinessOwnerId || '',
      receipt: '',
    });
  };

  const businessOwnersSorted = useMemo(
    () =>
      [...businessOwners].sort((a, b) =>
        businessOwnerDisplayName(a).localeCompare(businessOwnerDisplayName(b), undefined, {
          sensitivity: 'base',
        })
      ),
    [businessOwners]
  );

  const paymentOwnerColumn = (payment) => {
    const bid = paymentBusinessOwnerId(payment);
    if (!bid) return '—';
    const bo = businessOwners.find((b) => String(b.id ?? b._id) === bid);
    return bo ? businessOwnerDisplayName(bo) : '—';
  };

  if (initialDataLoading || scopedDataLoading) {
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
    <div style={{ paddingBottom: 100 }}>
      <div className="page-header">
        <div>
          <div className="page-title">{isParty ? 'My Payments (Mera Khata)' : 'Payments'}</div>
          <div className="page-subtitle" style={{ marginTop: 4 }}>
            {isParty
              ? 'Aapke mukammal kaam ke bills aur factory se mili hui payments ka saaf hisaab'
              : 'Track all money received from owner and paid to parties'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            onClick={() => {
              const next = !showSummaryCards;
              setShowSummaryCards(next);
              localStorage.setItem('hidePaymentsSummary', !next ? 'true' : 'false');
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

          {isAdmin && (
            <div className="desktop-only-action">
              <button
                className="btn btn-success"
                onClick={() => {
                  setErrors({});
                  setForm({
                    type: 'Received',
                    amount: '',
                    party: 'Owner',
                    date: '',
                    note: '',
                    linkedLot: '',
                    ownerWorkspaceId: activeBusinessOwnerId || '',
                    receipt: '',
                  });
                setModal(true);
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Record Payment
            </button>
          </div>
        )}
      </div>
    </div>

      {isAdmin && (
        <div className={`mobile-only-sticky-action ${isScrolling ? 'is-scrolling' : ''}`}>
          <button
            className="btn btn-success"
            style={{ width: '100%', boxShadow: '0 4px 12px rgba(21, 128, 61, 0.3)' }}
            onClick={() => {
              setErrors({});
              setForm({
                type: 'Received',
                amount: '',
                party: 'Owner',
                date: '',
                note: '',
                linkedLot: '',
                ownerWorkspaceId: activeBusinessOwnerId || '',
                receipt: '',
              });
              setModal(true);
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ marginRight: 6 }}
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Record Payment
          </button>
        </div>
      )}

      {/* Summary */}
      {showSummaryCards && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
            marginBottom: 24,
          }}
        >
          {isParty && partyStatementSummary
            ? [
              {
                label: 'Kul Kaam (Work Billed)',
                value: partyStatementSummary.billed,
                color: '#2563eb',
                icon: '🧾',
                note: 'Mukammal lots ka kul bill',
              },
              {
                label: 'Wasool Shuda (Received)',
                value: partyStatementSummary.paidFromAdmin,
                color: '#16a34a',
                icon: '💵',
                note: 'Factory se mili hui payments',
              },
              {
                label: 'Kul Baqaya (Net Balance)',
                value: Math.abs(partyStatementSummary.due),
                color:
                  partyStatementSummary.due > 0
                    ? '#16a34a'
                    : partyStatementSummary.due < 0
                      ? '#d97706'
                      : '#64748b',
                icon:
                  partyStatementSummary.due > 0 ? '↗' : partyStatementSummary.due < 0 ? '↘' : '=',
                note:
                  partyStatementSummary.due > 0
                    ? 'Aap ne factory se lena hai'
                    : partyStatementSummary.due < 0
                      ? 'Advance mila hua hai'
                      : 'Hisaab barabar hai',
              },
              {
                label: 'Kul Records',
                value: combinedRows.length,
                color: '#6366f1',
                icon: '📋',
                isCount: true,
                note: 'Bills aur payments ki tadaad',
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  background: 'var(--card-bg, #fff)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '18px 20px',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}
                >
                  {c.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {c.icon && !c.isCount && (
                      <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.icon}</span>
                    )}
                    <span style={{ fontSize: 'clamp(12px, 4vw, 22px)', fontWeight: 700, color: c.color, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
                      {c.isCount ? c.value : `₨${Number(c.value).toLocaleString()}`}
                    </span>
                  </div>
                  <div style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                    {!c.isCount && formatLakhCrore(c.value) ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1.5px 6px',
                          borderRadius: 6,
                          background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                          color: 'var(--text-secondary, #c2b6b1)',
                          border: '1px solid var(--border)',
                          letterSpacing: '0.01em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatLakhCrore(c.value)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {c.note && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginTop: 3,
                    }}
                  >
                    {c.note}
                  </div>
                )}
              </div>
            ))
          : [
              {
                label: 'Received from Owner',
                value: ownerIn,
                color: 'var(--success, #15803d)',
                icon: '↓',
              },
              {
                label: 'Received from parties',
                value: receivedFromParties,
                color: 'var(--success, #059669)',
                icon: '↓',
                note: 'Party → business',
              },
              {
                label: 'Paid to Parties',
                value: paidToNonOwnerParties,
                color: 'var(--danger, #dc2626)',
                icon: '↑',
              },
              {
                label: 'Net Balance',
                value: Math.abs(balance),
                color: balance >= 0 ? 'var(--success, #15803d)' : 'var(--danger, #dc2626)',
                icon: balance >= 0 ? '+' : '-',
                note:
                  balance >= 0
                    ? 'Credit (owner + parties in − paid out)'
                    : 'Debit (owner + parties in − paid out)',
              },
              {
                label: 'Total Transactions',
                value: adminSummaryTransactionCount,
                color: 'var(--primary, #1e40af)',
                isCount: true,
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  background: 'var(--card-bg, #fff)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '18px 20px',
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}
                >
                  {c.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    {c.icon && !c.isCount && (
                      <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.icon}</span>
                    )}
                    <span style={{ fontSize: 'clamp(12px, 4vw, 22px)', fontWeight: 700, color: c.color, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
                      {c.isCount ? c.value : `₨${c.value.toLocaleString()}`}
                    </span>
                  </div>
                  <div style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                    {!c.isCount && formatLakhCrore(c.value) ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1.5px 6px',
                          borderRadius: 6,
                          background: 'var(--primary-bg, rgba(255, 255, 255, 0.08))',
                          color: 'var(--text-secondary, #c2b6b1)',
                          border: '1px solid var(--border)',
                          letterSpacing: '0.01em',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatLakhCrore(c.value)}
                      </span>
                    ) : null}
                  </div>
                </div>
                {c.note && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      marginTop: 3,
                    }}
                  >
                    {c.note}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Filter */}
      <div className={`toolbar pl-toolbar${isParty ? ' pl-toolbar--party-user' : ''}`}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search..."
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          resultCount={filtered.length}
          searchOptions={[
            { label: 'All', value: 'all' },
            { label: 'Party', value: 'party' },
            { label: 'Lot No', value: 'lotNo' },
            { label: 'Design', value: 'designNo' },
            { label: 'Note', value: 'note' },
            { label: 'Amount', value: 'amount' },
            { label: 'Date', value: 'date' },
          ]}
        />
        {isAdmin && businessOwners.length > 0 && (
          <>
            <select
              className="form-select pl-toolbar-filter pl-toolbar-filter--owner"
              value={ownerNameFilter}
              onChange={(e) => setOwnerNameFilter(e.target.value)}
              aria-label="Filter by owner name"
            >
              <option value="All">All owners</option>
              {businessOwnersSorted.map((o) => {
                const id = String(o.id ?? o._id);
                return (
                  <option key={id} value={id}>
                    {businessOwnerDisplayName(o)}
                  </option>
                );
              })}
            </select>
            {ownerNameFilter !== 'All' && (
              <button
                className="btn btn-secondary hide-print pl-toolbar-filter pl-toolbar-filter--ledger"
                onClick={() => setShowOwnerLedger(true)}
                title="View Owner Ledger"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>View Ledger</span>
              </button>
            )}
          </>
        )}
        <DateRangeSelect
          value={dateRange}
          onChange={setDateRange}
          customStart={customDateRange.start}
          customEnd={customDateRange.end}
          onCustomChange={setCustomDateRange}
          className="pl-toolbar-filter hide-print"
        />
        <select
          className="form-select pl-toolbar-filter pl-toolbar-filter--type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {isParty ? (
            <>
              <option value="All">All (Sab Khata)</option>
              <option value="Received">Wasooli (Mili Hui Payments)</option>
              <option value="Bill">Kaam ke Bills (Work Bills)</option>
            </>
          ) : (
            <>
              <option value="All">All Types</option>
              <option>Received</option>
              <option>Paid</option>
              <option value="Bill">Bill</option>
            </>
          )}
        </select>
        {isParty && (
          <button
            className="btn btn-view-mode hide-print pl-toolbar-filter"
            onClick={() => window.print()}
            style={{ fontSize: 13, padding: '4px 10px', whiteSpace: 'nowrap' }}
          >
            Download PDF
          </button>
        )}
        <span className="pl-toolbar-meta" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {filtered.length} records
        </span>
      </div>

      <div ref={listTopRef} />

      {/* Table for Desktop & Tablet */}
      <div className="table-wrapper desktop-only-table">
        <div className="table-scroll">
          <table className="fixed-grid-table payments-table">
            <colgroup>
              {isParty ? (
                <>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '7%' }} />
                </>
              ) : isAdmin ? (
                <>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '7%' }} />
                </>
              ) : (
                <>
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Type</th>
                {!isParty && <th>Party / From</th>}
                {isAdmin && <th>Owner Name</th>}
                <th>Lot · Design</th>
                <th>Note</th>
                <th style={{ textAlign: 'right' }}>Amount (₨)</th>
                {isParty && <th style={{ textAlign: 'right' }}>Kul Baqaya (Balance)</th>}
                <th style={{ textAlign: 'center' }}>Slip</th>
                {!isParty && <th style={{ textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isParty ? 8 : (isAdmin ? 10 : 9)}>
                    <EmptyState message="No payment records found" />
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((p, i) => {
                  const pt = presentationType(p, isParty);
                  const partyReceived = isParty && pt === 'Received';
                  const partyWorkBill = isParty && pt === 'Bill';
                  const ownerBill = !isParty && isOwnerBillSettlement(p);
                  const badgeGreen = isParty ? partyReceived : p.type === 'Received';

                  const typeLabel = isParty
                    ? partyWorkBill
                      ? '🧾 Kaam ka Bill'
                      : '💵 Wasooli (Mili)'
                    : adminPaymentTypeLabel(p);

                  const partyLabel = isParty
                    ? String(p.party || '—')
                    : adminPaymentPartyLabel(p, businessOwners);

                  const amt = Number(p.amount ?? 0);
                  const showPlus = isParty ? partyWorkBill : p.type !== 'Paid';
                  const amtColor = ownerBill
                    ? 'var(--warning, #d97706)'
                    : partyWorkBill
                      ? '#2563eb'
                      : partyReceived
                        ? '#16a34a'
                        : showPlus
                          ? '#16a34a'
                          : 'var(--danger, #dc2626)';

                  const { lotLabel, designLabel, isCombinedDupatta } = resolveLinkedLotDesignDisplay(
                    p,
                    lotsLookupForLinks
                  );

                  return (
                    <tr key={`${String(p.id)}-${p._synthetic ? 'b' : 'p'}`}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {filtered.length - (pageStart + i)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDisplayDate(p.date)}</td>
                      <td>
                        <span
                          style={{
                            background: ownerBill
                              ? 'var(--warning-bg, #fffbeb)'
                              : partyWorkBill
                                ? 'rgba(37, 99, 235, 0.08)'
                                : badgeGreen
                                  ? 'var(--success-bg, #f0fdf4)'
                                  : 'var(--danger-bg, #fef2f2)',
                            color: ownerBill
                              ? 'var(--warning, #92400e)'
                              : partyWorkBill
                                ? '#2563eb'
                                : badgeGreen
                                  ? 'var(--success, #166534)'
                                  : 'var(--danger, #991b1b)',
                            border: `1px solid ${
                              ownerBill
                                ? 'var(--warning-bg, #fcd34d)'
                                : partyWorkBill
                                  ? 'rgba(37, 99, 235, 0.25)'
                                  : badgeGreen
                                    ? 'var(--success-bg, #bbf7d0)'
                                    : 'var(--danger-bg, #fecaca)'
                            }`,
                            borderRadius: 20,
                            padding: '3px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      {!isParty && (
                        <td style={{ fontWeight: 500 }}>
                          <span className="table-cell-ellipsis" title={partyLabel}>
                            {partyLabel}
                          </span>
                        </td>
                      )}
                      {isAdmin && (
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                          {(() => {
                            const ownerLabel = p._synthetic ? '—' : paymentOwnerColumn(p);
                            return (
                              <span className="table-cell-ellipsis" title={typeof ownerLabel === 'string' ? ownerLabel : ''}>
                                {ownerLabel}
                              </span>
                            );
                          })()}
                        </td>
                      )}
                      <td>
                        {lotLabel ? (
                          <div
                            style={{
                              background: 'var(--primary-bg, #eff6ff)',
                              color: 'var(--primary, #1e40af)',
                              border: '1px solid var(--border, #bfdbfe)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              fontSize: 12,
                              fontWeight: 600,
                              lineHeight: 1.35,
                            }}
                          >
                            <div>{lotLabel}</div>
                            {designLabel ? (
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  opacity: 0.9,
                                  marginTop: 3,
                                }}
                              >
                                Design: {designLabel}
                              </div>
                            ) : null}
                            {!isParty && isCombinedDupatta && (
                              <div style={{ fontSize: 11, color: 'var(--warning, #d97706)', marginTop: 2, fontWeight: 600 }}>
                                This lot&apos;s bill is combined with the main lot
                              </div>
                            )}
                            {String(p.note || '').toLowerCase().includes('(difference)') && (
                              <div style={{ fontSize: 10, color: 'var(--danger, #dc2626)', marginTop: 4, fontWeight: 700, background: 'var(--danger-bg, #fef2f2)', display: 'inline-block', padding: '2px 6px', borderRadius: 4 }}>
                                + Rate Added
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        <div className="table-cell-clamp-2" title={p.note || ''}>
                          {p.note || '—'}
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: 14,
                          color: amtColor,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div>{showPlus ? '+' : '−'}₨{amt.toLocaleString()}</div>
                        {isParty && (
                          <div style={{ fontSize: 10.5, color: partyWorkBill ? '#3b82f6' : '#10b981', fontWeight: 600, marginTop: 2 }}>
                            {partyWorkBill ? 'Kaam Jama' : 'Raqam Mili'}
                          </div>
                        )}
                      </td>
                      {isParty && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: (p.runningBalance || 0) > 0 ? 'var(--text-primary, #1e293b)' : (p.runningBalance || 0) < 0 ? '#047857' : '#64748b' }}>
                            ₨{Math.abs(p.runningBalance || 0).toLocaleString()}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            {(p.runningBalance || 0) > 0 ? (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', background: 'rgba(22, 163, 74, 0.08)', padding: '1px 6px', borderRadius: 4, display: 'inline-block' }}>
                                Lena Hai
                              </span>
                            ) : (p.runningBalance || 0) < 0 ? (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#d97706', background: 'rgba(217, 119, 6, 0.08)', padding: '1px 6px', borderRadius: 4, display: 'inline-block' }}>
                                Advance
                              </span>
                            ) : (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', background: 'rgba(100, 116, 139, 0.08)', padding: '1px 6px', borderRadius: 4, display: 'inline-block' }}>
                                Barabar
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <PaymentSlipCell payment={p} isParty={isParty} canEdit={isAdmin && !p._synthetic} />
                      </td>
                      {!isParty && (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn-icon"
                            onClick={() => handleDelete(p)}
                            title="Delete payment"
                            disabled={!isAdmin || p._synthetic}
                            style={
                              !isAdmin || p._synthetic
                                ? { opacity: 0.45, cursor: 'not-allowed' }
                                : undefined
                            }
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke='var(--danger, #dc2626)'
                              strokeWidth="2"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card List — zero horizontal scroll */}
      <div className="mobile-only-payment-cards">
        {filtered.length === 0 ? (
          <EmptyState message="No payment records found" />
        ) : (
          paginatedPayments.map((p) => {
            const pt = presentationType(p, isParty);
            const partyReceived = isParty && pt === 'Received';
            const partyWorkBill = isParty && pt === 'Bill';
            const ownerBill = !isParty && isOwnerBillSettlement(p);
            const badgeGreen = isParty ? partyReceived : p.type === 'Received';

            const typeLabel = isParty
              ? partyWorkBill
                ? '🧾 Kaam ka Bill'
                : '💵 Wasooli (Mili)'
              : adminPaymentTypeLabel(p);

            const partyLabel = isParty
              ? String(p.party || '—')
              : adminPaymentPartyLabel(p, businessOwners);

            const amt = Number(p.amount ?? 0);
            const showPlus = isParty ? partyWorkBill : p.type !== 'Paid';
            const amtColor = ownerBill
              ? 'var(--warning, #d97706)'
              : partyWorkBill
                ? 'var(--primary-light, #2563eb)'
                : partyReceived
                  ? 'var(--success, #16a34a)'
                  : showPlus
                    ? 'var(--success, #16a34a)'
                    : 'var(--danger, #dc2626)';

            const { lotLabel, designLabel, isCombinedDupatta } = resolveLinkedLotDesignDisplay(
              p,
              lotsLookupForLinks
            );

            return (
              <div
                key={`mob-${String(p.id)}-${p._synthetic ? 'b' : 'p'}`}
                className="payment-card-mobile"
              >
                <div className="pmc-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: ownerBill
                          ? 'var(--warning-bg, #fffbeb)'
                          : partyWorkBill
                            ? 'rgba(37, 99, 235, 0.08)'
                            : badgeGreen
                              ? 'var(--success-bg, #f0fdf4)'
                              : 'var(--danger-bg, #fef2f2)',
                        color: ownerBill
                          ? 'var(--warning, #92400e)'
                          : partyWorkBill
                            ? 'var(--primary-light, #2563eb)'
                            : badgeGreen
                              ? 'var(--success, #166534)'
                              : 'var(--danger, #991b1b)',
                        border: `1px solid ${
                          ownerBill
                            ? 'var(--warning-bg, #fcd34d)'
                            : partyWorkBill
                              ? 'rgba(37, 99, 235, 0.25)'
                              : badgeGreen
                                ? 'var(--success-bg, #bbf7d0)'
                                : 'var(--danger-bg, #fecaca)'
                        }`,
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {typeLabel}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDisplayDate(p.date)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: amtColor }}>
                      {showPlus ? '+' : '−'}₨{amt.toLocaleString()}
                    </span>
                    {isParty && (
                      <span style={{ fontSize: 10, color: partyWorkBill ? '#3b82f6' : '#10b981', fontWeight: 600 }}>
                        {partyWorkBill ? 'Kaam Jama' : 'Raqam Mili'}
                      </span>
                    )}
                    {isParty && p.runningBalance !== undefined && (
                      <span style={{ fontSize: 11, color: (p.runningBalance || 0) > 0 ? '#16a34a' : (p.runningBalance || 0) < 0 ? '#d97706' : '#64748b', marginTop: 2, fontWeight: 600 }}>
                        Baqaya: ₨{Math.abs(p.runningBalance).toLocaleString()} {(p.runningBalance || 0) > 0 ? '(Lena)' : (p.runningBalance || 0) < 0 ? '(Advance)' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {(!isParty || lotLabel || p.note) && (
                  <div className="pmc-body">
                    {!isParty && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
                        Party: {partyLabel}
                      </div>
                    )}
                    {isAdmin && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>
                        Owner: {p._synthetic ? '—' : paymentOwnerColumn(p)}
                      </div>
                    )}
                    {lotLabel && (
                      <div
                        style={{
                          marginTop: 6,
                          background: 'var(--primary-bg, #eff6ff)',
                          color: 'var(--primary, #1e40af)',
                          border: '1px solid var(--border, #bfdbfe)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'inline-block',
                        }}
                      >
                        Lot #{lotLabel} {designLabel ? `— Design: ${designLabel}` : ''}
                        {!isParty && isCombinedDupatta && (
                          <div style={{ fontSize: 11, color: 'var(--warning, #d97706)', marginTop: 2, fontWeight: 600 }}>
                            This lot&apos;s bill is combined with the main lot
                          </div>
                        )}
                        {String(p.note || '').toLowerCase().includes('(difference)') && (
                          <div style={{ fontSize: 10, color: 'var(--danger, #dc2626)', marginTop: 4, fontWeight: 700, background: 'var(--danger-bg, #fef2f2)', display: 'inline-block', padding: '2px 6px', borderRadius: 4 }}>
                            + Rate Added
                          </div>
                        )}
                      </div>
                    )}
                    {p.note && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #475569)', marginTop: 4 }}>
                        Note: {p.note}
                      </div>
                    )}
                  </div>
                )}

                <div className="pmc-footer">
                  <PaymentSlipCell payment={p} isParty={isParty} canEdit={isAdmin && !p._synthetic} />
                  {isAdmin && !p._synthetic && (
                    <button
                      className="btn-icon"
                      onClick={() => handleDelete(p)}
                      title="Delete payment"
                      style={{ marginLeft: 'auto' }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke='var(--danger, #dc2626)'
                        strokeWidth="2"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <PaginationFooter
        currentPage={safeCurrentPage}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageStart={pageStart}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
        scrollTargetRef={listTopRef}
      />

      {/* Add Payment Modal */}
      {modal && (
        <Modal
          title="Record New Payment"
          onClose={() => {
            if (!paymentSaving) handleClose();
          }}
          onFormSubmit={() => {
            void handleSave();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleClose}
                disabled={paymentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={paymentSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {paymentSaving ? (
                  <>
                    <Loader /> Saving…
                  </>
                ) : (
                  'Save Payment'
                )}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <FormGroup label="Type">
              <select
                className="form-select"
                value={form.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setForm((f) => ({
                    ...f,
                    type: newType,
                    party: newType === 'Received' ? 'Owner' : '',
                    linkedLot: '',
                    amount: '',
                    ownerWorkspaceId:
                      newType === 'Received' && isAdmin ? activeBusinessOwnerId || '' : '',
                  }));
                  setErrors((prev) => ({
                    ...prev,
                    party: undefined,
                    ownerWorkspaceId: undefined,
                  }));
                }}
              >
                <option>Received</option>
                <option>Paid</option>
              </select>
            </FormGroup>
            <FormGroup label={form.type === 'Received' ? 'Received From' : 'Paid To *'}>
              {form.type === 'Received' ? (
                <select
                  className="form-select"
                  value={form.party}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      party: v,
                      linkedLot: '',
                      amount: '',
                      ownerWorkspaceId: isAdmin
                        ? v === 'Owner'
                          ? f.ownerWorkspaceId || activeBusinessOwnerId || ''
                          : activeBusinessOwnerId || ''
                        : '',
                    }));
                    setErrors((prev) => ({
                      ...prev,
                      ownerWorkspaceId: undefined,
                    }));
                  }}
                >
                  <option value="Owner">Owner</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    className={`form-select${errors.party ? ' input-error' : ''}`}
                    value={form.party}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        party: e.target.value,
                        linkedLot: '',
                        amount: '',
                        ownerWorkspaceId: f.ownerWorkspaceId,
                      }));
                      setErrors((p) => ({ ...p, party: undefined }));
                    }}
                  >
                    <option value="">— Select Party —</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                  {errors.party && (
                    <span
                      style={{
                        color: 'var(--danger, #dc2626)',
                        fontSize: 11,
                        marginTop: 3,
                        display: 'block',
                      }}
                    >
                      {errors.party}
                    </span>
                  )}
                </>
              )}
            </FormGroup>
            {isAdmin && (
              <FormGroup
                label={
                  businessCollectionRequired
                    ? 'Business / collection *'
                    : 'Business / collection (optional)'
                }
              >
                <select
                  className={`form-select${errors.ownerWorkspaceId ? ' input-error' : ''}`}
                  value={form.ownerWorkspaceId}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      ownerWorkspaceId: e.target.value,
                      linkedLot: '',
                      amount: '',
                    }));
                    setErrors((prev) => ({
                      ...prev,
                      ownerWorkspaceId: undefined,
                    }));
                  }}
                >
                  <option value="">— Select business / collection —</option>
                  {businessOwners.map((o) => (
                    <option key={o.id || o._id} value={o.id || o._id}>
                      {businessOwnerDisplayName(o)}
                    </option>
                  ))}
                </select>
                {errors.ownerWorkspaceId && (
                  <span
                    style={{
                      color: 'var(--danger, #dc2626)',
                      fontSize: 11,
                      marginTop: 3,
                      display: 'block',
                    }}
                  >
                    {errors.ownerWorkspaceId}
                  </span>
                )}
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  {businessCollectionRequired
                    ? 'Received from Owner: choose the business / collection this capital belongs to (required).'
                    : 'Optional here — leave as is unless this entry belongs to a specific collection.'}
                </span>
              </FormGroup>
            )}
            <FormGroup label="Linked Lot (optional)">
              <select
                className={`form-select${errors.linkedLot ? ' input-error' : ''}`}
                value={form.linkedLot}
                onChange={(e) => {
                  const v = e.target.value;
                  const paidPool =
                    form.type === 'Paid'
                      ? isAdmin && String(form.ownerWorkspaceId || '').trim()
                        ? reportingLots.filter(
                            (l) => String(l.businessOwnerId || '') === String(form.ownerWorkspaceId)
                          )
                        : ghausiaLots
                      : null;
                  const receivedPool = form.type === 'Received' ? lotsForLinkedReceived : null;
                  const primaryPool = paidPool || receivedPool;
                  let lot =
                    v && primaryPool?.length ? findLotByLinkedValue(primaryPool, v) : undefined;
                  if (!lot && v) {
                    lot = findLotByLinkedValue(reportingLots, v);
                  }
                  let bill = 0;
                  if (lot && v) {
                    bill =
                      form.type === 'Paid'
                        ? partyLedgerBillForLot(lot, reportingPartyEdits)
                        : Number(lot.billAmount || 0);
                  }
                  setForm((f) => ({
                    ...f,
                    linkedLot: v,
                    amount: v && bill > 0 ? String(bill) : v ? '' : '',
                  }));
                  setErrors((p) => ({
                    ...p,
                    linkedLot: undefined,
                    amount: undefined,
                  }));
                }}
                disabled={
                  (form.type === 'Paid' && !form.party) ||
                  (form.type === 'Received' && isAdmin && !String(form.ownerWorkspaceId || '').trim())
                }
              >
                <option value="">None</option>
                {linkedLotOptions.map((l) => (
                  <option key={l.id} value={lotLinkValueFromLot(l)}>
                    {(l.lotNo || l.lotNumber)
                      ? `${lotLinkValueFromLot(l)} / ${l.designNo || '—'}`
                      : `(No Lot) / ${l.designNo || '—'}`}
                    {form.type === 'Received' ? ` — ${l.status}` : ''}
                  </option>
                ))}
              </select>
              {errors.linkedLot && (
                <span
                  style={{
                    color: 'var(--danger, #dc2626)',
                    fontSize: 11,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  {errors.linkedLot}
                </span>
              )}
              {form.type === 'Received' && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  Lots that already have a linked Received payment are hidden. Use None when the
                  payment is not tied to a single lot.
                </span>
              )}
              {form.type === 'Received' && isAdmin && !form.ownerWorkspaceId && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  Choose a business / collection to load lots for this workspace.
                </span>
              )}
              {form.type === 'Paid' && !form.party && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  Select a party to list completed lots for that party.
                </span>
              )}
              {form.type === 'Paid' &&
                form.party &&
                form.party !== 'Other' &&
                linkedLotOptions.length === 0 && (
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      marginTop: 4,
                      display: 'block',
                    }}
                  >
                    No completed lots left for this party (remaining lots may already have a Paid
                    entry linked).
                  </span>
                )}
            </FormGroup>
            <FormGroup label="Amount (₨) *">
              <input
                className={`form-input${errors.amount ? ' input-error' : ''}`}
                type="number"
                value={form.amount}
                onChange={(e) => {
                  setForm((f) => ({ ...f, amount: e.target.value }));
                  setErrors((p) => ({ ...p, amount: undefined }));
                }}
                placeholder={form.linkedLot ? 'Filled from lot bill, or enter amount' : '50000'}
              />
              {form.linkedLot && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  {form.type === 'Paid'
                    ? 'Default is the Party Ledger bill for this lot (not the owner figure) — you can change it before saving.'
                    : 'Default is the bill amount on the lot — you can change it before saving.'}
                </span>
              )}
              {errors.amount && (
                <span
                  style={{
                    color: 'var(--danger, #dc2626)',
                    fontSize: 11,
                    marginTop: 3,
                    display: 'block',
                  }}
                >
                  {errors.amount}
                </span>
              )}
              {form.amount && numberToWords(form.amount) && (
                <span
                  style={{
                    color: 'var(--success, #047857)',
                    fontSize: 12,
                    fontWeight: 600,
                    marginTop: 5,
                    display: 'block',
                    letterSpacing: '0.01em',
                    lineHeight: 1.4,
                  }}
                >
                  💰 {numberToWords(form.amount)}
                </span>
              )}
            </FormGroup>
            <FormGroup label="Date *">
              <div style={{ position: 'relative' }}>
                <input
                  className={`form-input${errors.date ? ' input-error' : ''}`}
                  type="date"
                  value={form.date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, date: e.target.value }));
                    setErrors((p) => ({ ...p, date: undefined }));
                  }}
                  style={{ paddingRight: 72, width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = toLocalYmd();
                    setForm((f) => ({ ...f, date: today }));
                    setErrors((p) => ({ ...p, date: undefined }));
                  }}
                  style={{
                    position: 'absolute',
                    right: 34,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--primary, #1e40af)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 4px',
                    lineHeight: 1.2,
                  }}
                >
                  Today
                </button>
              </div>
              {errors.date && (
                <span
                  style={{
                    color: 'var(--danger, #dc2626)',
                    fontSize: 11,
                    marginTop: 3,
                    display: 'block',
                  }}
                >
                  {errors.date}
                </span>
              )}
            </FormGroup>
            <FormGroup label="Note">
              <input
                className="form-input"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional note"
              />
            </FormGroup>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormGroup label="Payment slip (optional)">
                <ImageUploader
                  value={form.receipt ? [form.receipt] : []}
                  onChange={(arr) => setForm((f) => ({ ...f, receipt: arr[0] || '' }))}
                  max={1}
                  addLabel="Add slip"
                />
              </FormGroup>
            </div>
          </div>
        </Modal>
      )}
      {showOwnerLedger && ownerNameFilter !== 'All' && (
        <OwnerLedgerModal
          ownerId={ownerNameFilter}
          ownerName={businessOwnerDisplayName(businessOwners.find(o => String(o.id ?? o._id) === String(ownerNameFilter)))}
          payments={reportingPayments}
          lots={reportingLots}
          onRefresh={() => refreshData?.({ force: true })}
          onClose={() => setShowOwnerLedger(false)}
        />
      )}
    </div>
  );
}
