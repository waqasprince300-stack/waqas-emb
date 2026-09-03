import React, { useState, useMemo, useEffect, useRef } from 'react';
/* eslint-disable react-hooks/exhaustive-deps */
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import LoaderDashboard from '../components/LoaderDashboard';
import apiService from '../services/api';
import {
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
} from '../utils/dateFilters';
import { getPartyLedgerBillNumeric } from '../utils/partyBillPrivacy';
import { workspaceDisplayTitleForLot, normalizedBusinessOwnerId } from '../utils/businessWorkspace';
import {
  countPendingBillRevisionRequests,
  hasPendingBillRevisionRequest,
  partyEditForLot,
} from '../utils/partyLedgerNotifications';
import {
  partyFacingLedgerDisplayLabel,
} from '../utils/partyFacingLabels';

// Sub-components
import PLSummaryCards from '../components/partyLedger/PLSummaryCards';
import PLToolbar from '../components/partyLedger/PLToolbar';
import PLDesktopTable from '../components/partyLedger/PLDesktopTable';
import PLMobileTiles from '../components/partyLedger/PLMobileTiles';
import PLMobileCards from '../components/partyLedger/PLMobileCards';
import PLEditModal from '../components/partyLedger/PLEditModal';
import PLPicturesModal from '../components/partyLedger/PLPicturesModal';
import PLReceiptPreviewModal from '../components/partyLedger/PLReceiptPreviewModal';
import PLRevisionRequestModal from '../components/partyLedger/PLRevisionRequestModal';
import PLRevisionReviewModal from '../components/partyLedger/PLRevisionReviewModal';

// From the party's perspective: dispatched = In Progress, received back = Completed
// If party name is unknown, status should be Pending
const toLedgerStatus = (status, partyName) => {
  if (
    !partyName ||
    String(partyName).toLowerCase().includes('unknown') ||
    String(status).toLowerCase() === 'pending'
  ) {
    return 'Pending';
  }
  if (String(status).toLowerCase() === 'received back') return 'Completed';
  return 'In Progress';
};

function pendingRevisionIsReal(pe) {
  const pr = pe?.pendingRevision;
  if (!pr) return false;
  return Number(pr.fromAmount) !== Number(pr.toAmount);
}

/** Max lot pictures = number of colors on the lot (minimum 1). */
function lotPicturesMax(lot) {
  const n = Number(lot?.colors);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function readReceiptAsStoredValue(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }
    resolve(file.name);
  });
}

/** Target max decoded size for bill photos (JPEG); keeps JSON payload under typical proxy limits. */
const LEDGER_BILL_IMG_MAX_BYTES = 240 * 1024;

function approxBytesFromDataUrl(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  if (i === -1) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length * 3) / 4 - pad;
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = dataUrl;
  });
}

async function compressPartyLedgerBillImage(dataUrl, maxBytes = LEDGER_BILL_IMG_MAX_BYTES) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return dataUrl;

  let img;
  try {
    img = await dataUrlToImage(dataUrl);
  } catch {
    throw new Error('Could not read this image (try JPG/PNG or a smaller file).');
  }

  const mime = 'image/jpeg';
  let maxEdge = Math.min(1600, Math.max(img.width, img.height));
  let quality = 0.86;

  const encode = (edge, q) => {
    const long = Math.max(img.width, img.height);
    const scale = Math.min(1, edge / long);
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'var(--card-bg, #ffffff)';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL(mime, q);
  };

  let out = encode(maxEdge, quality);
  for (let i = 0; i < 22 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
    if (quality > 0.28) {
      quality -= 0.06;
      out = encode(maxEdge, quality);
    } else {
      maxEdge = Math.round(maxEdge * 0.82);
      if (maxEdge < 200) break;
      quality = 0.82;
      out = encode(maxEdge, quality);
    }
  }
  if (approxBytesFromDataUrl(out) > maxBytes) {
    maxEdge = 180;
    quality = 0.72;
    out = encode(maxEdge, quality);
    for (let i = 0; i < 8 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
      quality = Math.max(0.22, quality - 0.08);
      out = encode(maxEdge, quality);
    }
  }
  return out;
}

async function finalizeLedgerReceiptStoredValue(stored) {
  if (!stored) return '';
  if (/^data:image\//i.test(String(stored))) return compressPartyLedgerBillImage(stored);
  return stored;
}
/** Admin/workspace lot still awaiting dispatch â€” party must not self-set "In Progress". */
function adminLotNotDispatched(lot) {
  return (
    String(lot?.status || '')
      .toLowerCase()
      .trim() === 'pending'
  );
}

export default function PartyLedger() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef('');
  const [highlightLotId, setHighlightLotId] = useState(null);
  const {
    reportingLots,
    reportingPayments,
    reportingPartyEdits,
    partyCrossLots,
    partyCrossPayments,
    partyCrossPartyEdits,
    updateLot,
    updatePartyEdit,
    addPayment,
    parties,
    businessOwners,
    initialDataLoading,
    patchLotImages,
    patchLotReceipt,
  } = useApp();

  const { isAdmin, isParty, user } = useAuth();

  /** Admin: merged lots/edits/payments across all workspaces; party login: scoped cross-collection rows */
  const ledgerLots = isParty ? partyCrossLots : reportingLots;
  const ledgerPayments = isParty ? partyCrossPayments : reportingPayments;
  const ledgerPartyEdits = isParty ? partyCrossPartyEdits : reportingPartyEdits;
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [workspaceFilter, setWorkspaceFilter] = useState('All');
  const [partyFilter, setPartyFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const customRange = useMemo(
    () => ({ start: customStart, end: customEnd }),
    [customStart, customEnd]
  );
  const [editingId, setEditingId] = useState(null);
  const [ledgerEditKind, setLedgerEditKind] = useState(null);
  /** null | 'pendingReview' | 'standard' â€” pending = awaiting admin, party may still edit */
  const [editForm, setEditForm] = useState({});
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerFormErrors, setLedgerFormErrors] = useState({});
  const [receiptPreview, setReceiptPreview] = useState(null);
  /** Party quick-upload bill snapshot to API row */
  const [billPicSavingLotId, setBillPicSavingLotId] = useState(null);
  /** Lot pictures modal (both admin & party): { lot } while open */
  const [picsLot, setPicsLot] = useState(null);
  const [picsImages, setPicsImages] = useState([]);
  const [picsLoading, setPicsLoading] = useState(false);
  const [picsSaving, setPicsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  /** Split view: non-completed vs completed (same for admin & party) */
  const [ledgerLotsTab, setLedgerLotsTab] = useState('other');
  const [viewMode, setViewMode] = useState('tile');
  const [showSummaryCards, setShowSummaryCards] = useState(() => {
    const saved = localStorage.getItem('pl_show_summary_cards_v1');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('pl_show_summary_cards_v1', String(showSummaryCards));
  }, [showSummaryCards]);
  /** Party: request a bill-amount change on a completed lot { lot, newAmount, reason } */
  const [revisionRequest, setRevisionRequest] = useState(null);
  const [revisionSaving, setRevisionSaving] = useState(false);
  /** Admin: review a party's pending bill-change request */
  const [revisionReview, setRevisionReview] = useState(null);
  const [revisionReviewSaving, setRevisionReviewSaving] = useState(false);

  const samePartyId = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

  const currentPartyObj = useMemo(() => {
    if (!isParty) return null;
    return parties.find((p) => samePartyId(p.id, user?.partyId)) || null;
  }, [isParty, parties, user?.partyId]);

  const getWorkspaceOverrideForLot = (l) => {
    if (!isParty || !currentPartyObj) return null;
    const bizId = normalizedBusinessOwnerId(l?.businessOwnerId);
    if (!bizId || !Array.isArray(currentPartyObj.workspaceOverrides)) return null;
    return (
      currentPartyObj.workspaceOverrides.find(
        (o) => String(o.businessOwnerId ?? '').trim() === String(bizId).trim()
      ) || null
    );
  };

  const showWorkspaceColForLot = (l) => {
    if (isParty) {
      if (currentPartyObj?.showWorkspace === false) return false;
      const ov = getWorkspaceOverrideForLot(l);
      if (ov && ov.showWorkspace === false) return false;
      return true;
    }
    return isAdmin && (workspaceFilter === 'All' || businessOwners.length > 1);
  };

  const workspaceNameForLot = (l) => {
    if (isParty) {
      const ov = getWorkspaceOverrideForLot(l);
      if (ov && ov.alias) return ov.alias;
      if (currentPartyObj?.workspaceAlias) return currentPartyObj.workspaceAlias;
    }
    return workspaceDisplayTitleForLot(l, businessOwners, { shortIdFallback: true });
  };

  const getPartyAllotDate = (l) => {
    if (isParty) {
      if (adminLotNotDispatched(l) || !l.dispatchDate) {
        return null;
      }
      return l.dispatchDate || l.allotDate;
    }
    return l.allotDate;
  };

  const lotWorkspaceOpts = (lot) => {
    const biz = normalizedBusinessOwnerId(lot?.businessOwnerId);
    return biz ? { businessOwnerId: biz } : {};
  };

  const normalizeLotKey = (v) =>
    String(v ?? '')
      .trim()
      .toLowerCase();
  const lotNumberOf = (lot) => lot?.lotNo || lot?.lotNumber || '';

  /** Owner settlement payments linked to this lot (admin already "made payment & settled"). */
  const ownerSettlementForLot = (lot) => {
    const key = normalizeLotKey(lotNumberOf(lot));
    if (!key) return [];
    return ledgerPayments.filter(
      (p) =>
        p.type === 'Paid' &&
        String(p.party || '')
          .trim()
          .toLowerCase() === 'owner' &&
        normalizeLotKey(p.linkedLot) === key
    );
  };

  const assignedLots = useMemo(() => {
    const byWorkspace = (l) => {
      if (isParty || !isAdmin) return true;
      if (workspaceFilter === 'All') return true;
      return normalizedBusinessOwnerId(l.businessOwnerId) === String(workspaceFilter).trim();
    };

    return ledgerLots
      .filter(byWorkspace)
      .filter((l) => String(l.partyId || '').trim() || String(l.partyName || '').trim())
      .filter((lot) =>
        isWithinDateRange(
          latestDateFrom(lot, [
            'updatedAt',
            'createdAt',
            'receivedBackDate',
            'dispatchDate',
            'allotDate',
            'receivedDate',
          ]),
          dateRange,
          customRange
        )
      );
  }, [ledgerLots, dateRange, customRange, isAdmin, isParty, workspaceFilter]);

  const formatYmd = (value) => {
    if (!value) return '';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  };

  /** Party ledger completion date: party edit override, else Ghausia lot received-back date (syncs to PartyLedger.completeDate on server). */
  const getDisplayCompleteDate = (l, pe) => {
    const ymd = formatYmd(pe.completeDate) || formatYmd(l.receivedBackDate);
    return ymd || null;
  };

  const getDisplayStatus = (l) => {
    const ls = String(l.status || '')
      .trim()
      .toLowerCase();
    if (ls === 'pending approval') return 'Pending review';
    if (ls === 'rejected') return 'Rejected';
    const pe = ledgerPartyEdits[l.id] || {};
    // If overrideStatus explicitly set to Completed, honour it
    if (pe.overrideStatus && pe.overrideStatus.toLowerCase() === 'completed') return 'Completed';
    // Otherwise derive from lot status, passing party name to check if known
    const partyNameDisplay = getPartyNameLocal(l.partyId, l.partyName);
    return toLedgerStatus(
      pe.overrideStatus || l.status,
      partyNameDisplay !== 'â€”' ? partyNameDisplay : ''
    );
  };

  const getPartyNameLocal = (partyId, fallback) =>
    parties.find((p) => samePartyId(p.id, partyId))?.name || fallback || 'â€”';

  /** Totals use party ledger amounts only (same figure party and admin see in the table â€” never lot bill fallback). */
  const getLedgerAmountForTotals = (l) => {
    const pe = ledgerPartyEdits[l.id] || {};
    return getPartyLedgerBillNumeric(pe);
  };

  const filtered = useMemo(() => {
    const list = assignedLots.filter((l) => {
      const q = debouncedSearch.toLowerCase();
      const lotLabel = (l.lotNo || l.lotNumber || '').toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        String(l.designNo || '')
          .toLowerCase()
          .includes(q);
      const matchP = partyFilter === 'All' || samePartyId(l.partyId, partyFilter);
      const displayStatus = getDisplayStatus(l);
      const matchTab =
        ledgerLotsTab === 'completed'
          ? displayStatus === 'Completed'
          : displayStatus !== 'Completed';
      const matchS =
        matchTab &&
        (ledgerLotsTab === 'completed' || statusFilter === 'All' || displayStatus === statusFilter);
      return matchQ && matchP && matchS;
    });
    return [...list].sort((a, b) => {
      if (ledgerLotsTab === 'completed' && isAdmin) {
        const aPend = hasPendingBillRevisionRequest(partyEditForLot(ledgerPartyEdits, a));
        const bPend = hasPendingBillRevisionRequest(partyEditForLot(ledgerPartyEdits, b));
        if (aPend !== bPend) return aPend ? -1 : 1;
      }
      return compareRowsByUpdatedNewestFirst(a, b, 'lot');
    });
  }, [assignedLots, debouncedSearch, partyFilter, ledgerLotsTab, statusFilter, ledgerPartyEdits, isAdmin]);

  /** Summary cards ignore Status filter â€” only party / search / dates / workspace (via assignedLots). */
  const lotsForSummaryStats = useMemo(() => {
    return assignedLots.filter((lot) => {
      if (partyFilter !== 'All' && !samePartyId(lot.partyId, partyFilter)) return false;

      const q = debouncedSearch.toLowerCase();
      if (q) {
        let match = false;
        if (lot.lotNo && String(lot.lotNo).toLowerCase().includes(q)) match = true;
        if (lot.lotNumber && String(lot.lotNumber).toLowerCase().includes(q)) match = true;
        if (lot.designNo && String(lot.designNo).toLowerCase().includes(q)) match = true;
        if (!match) return false;
      }
      return true;
    });
  }, [assignedLots, debouncedSearch, partyFilter, ledgerPartyEdits]);

  const otherLotsTabCount = useMemo(
    () => assignedLots.reduce((n, l) => n + (getDisplayStatus(l) !== 'Completed' ? 1 : 0), 0),
    [assignedLots, ledgerPartyEdits]
  );
  const completedLotsTabCount = useMemo(
    () => assignedLots.reduce((n, l) => n + (getDisplayStatus(l) === 'Completed' ? 1 : 0), 0),
    [assignedLots, ledgerPartyEdits]
  );
  /**
   * Total pending bill-change requests across all ledger lots (ignores the active
   * party/workspace/date filters) so this banner matches the sidebar badge exactly.
   */
  const pendingRevisionRequestCount = useMemo(
    () => countPendingBillRevisionRequests(ledgerLots, ledgerPartyEdits),
    [ledgerLots, ledgerPartyEdits]
  );

  const showPartyNameCol = !isParty;
  const showWorkspaceCol = (isAdmin && workspaceFilter === 'All') || isParty;
  const ledgerTableColSpan = 13 + (showPartyNameCol ? 1 : 0) + (showWorkspaceCol ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedLots = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const savePartyLotReceiptFromFile = async (lot, file) => {
    if (!file) return;
    setBillPicSavingLotId(lot.id);
    try {
      const raw = await readReceiptAsStoredValue(file);
      const receipt = await finalizeLedgerReceiptStoredValue(raw);
      await updatePartyEdit(lot.id, { receipt }, lotWorkspaceOpts(lot));
    } catch (e) {
      const msg =
        e?.message || (typeof e === 'string' ? e : 'Could not save bill photo. Try a smaller JPG.');
      await Swal.fire({
        icon: 'error',
        title: 'Upload failed',
        text: msg,
      });
    } finally {
      setBillPicSavingLotId(null);
    }
  };

  const removePartyLotReceipt = async (lot) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: 'Delete bill photo?',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });
    if (!ok.isConfirmed) return;
    setBillPicSavingLotId(lot.id);
    try {
      await updatePartyEdit(lot.id, { receipt: '' }, lotWorkspaceOpts(lot));
    } catch (e) {
      await Swal.fire({
        icon: 'error',
        title: 'Could not remove photo',
        text: e?.message || 'Please try again.',
      });
    } finally {
      setBillPicSavingLotId(null);
    }
  };

  /** Open the lot-pictures modal immediately; hydrate pictures in the background (lotImages only). */
  const openLotPictures = async (lot) => {
    setPicsLot(lot);
    const maxPics = lotPicturesMax(lot);
    const pe = ledgerPartyEdits[lot.id] || {};
    const cached = Array.isArray(pe.lotImages) ? pe.lotImages.filter(Boolean) : [];
    setPicsImages(cached.slice(0, maxPics));
    setPicsLoading(cached.length === 0);
    try {
      const row = await apiService.getPartyEditByLotId(lot.id, {
        includeLotImages: true,
        businessOwnerId: normalizedBusinessOwnerId(lot.businessOwnerId) || undefined,
        skipTenantHeader: isParty,
      });
      const imgs = Array.isArray(row?.lotImages) ? row.lotImages.filter(Boolean) : [];
      setPicsImages(imgs.slice(0, maxPics));
      patchLotImages?.(lot.id, imgs);
    } catch {
      // No party edit yet (404) or transient error â€” keep cached / empty.
    } finally {
      setPicsLoading(false);
    }
  };

  const saveLotPictures = async () => {
    if (!picsLot) return;
    const maxPics = lotPicturesMax(picsLot);
    const trimmed = picsImages.slice(0, maxPics);
    if (trimmed.length !== picsImages.length) {
      setPicsImages(trimmed);
    }
    setPicsSaving(true);
    try {
      await updatePartyEdit(picsLot.id, { lotImages: trimmed }, lotWorkspaceOpts(picsLot));
      setPicsLot(null);
      setPicsImages([]);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Pictures saved',
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (e) {
      await Swal.fire({
        icon: 'error',
        title: 'Could not save pictures',
        text: e?.message || 'Please try again with smaller images.',
      });
    } finally {
      setPicsSaving(false);
    }
  };

  /** Party: submit a request to the admin to change the agreed bill on a completed lot. */
  const submitRevisionRequest = async () => {
    if (!revisionRequest) return;
    const { lot } = revisionRequest;
    const pe = ledgerPartyEdits[lot.id] || {};
    const current = getPartyLedgerBillNumeric(pe) || 0;
    const next = Number(revisionRequest.newAmount);
    const reason = String(revisionRequest.reason || '').trim();
    if (!Number.isFinite(next) || next < 0) {
      await Swal.fire({ icon: 'error', title: 'Enter a valid amount' });
      return;
    }
    if (next === current) {
      await Swal.fire({
        icon: 'info',
        title: 'Same amount',
        text: 'New amount must differ from the current amount.',
      });
      return;
    }
    if (!reason) {
      await Swal.fire({
        icon: 'error',
        title: 'Reason required',
        text: 'Please enter a reason for the bill change.',
      });
      return;
    }
    setRevisionSaving(true);
    try {
      await updatePartyEdit(
        lot.id,
        {
          billRevisionRequest: {
            fromAmount: current,
            toAmount: next,
            reason,
            requestedAt: new Date().toISOString(),
            status: 'pending',
          },
        },
        lotWorkspaceOpts(lot)
      );
      setRevisionRequest(null);
      await Swal.fire({
        icon: 'success',
        title: 'Request sent',
        text: 'Your bill change request was sent to the business. The amount updates when approved.',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (e) {
      await Swal.fire({
        icon: 'error',
        title: 'Request fail',
        text: e?.message || 'Please try again.',
      });
    } finally {
      setRevisionSaving(false);
    }
  };

  /** Admin: approve a party's bill-change request and reconcile the owner bill + settlement. */
  const approveRevision = async () => {
    if (!revisionReview) return;
    const { lot } = revisionReview;
    const pe = ledgerPartyEdits[lot.id] || {};
    const req = pe.billRevisionRequest || {};
    const fromAmount = Number(req.fromAmount) || getPartyLedgerBillNumeric(pe) || 0;
    const toAmount = Number(req.toAmount) || 0;
    const updateOwner = !!revisionReview.updateOwnerBill;
    const prevOwnerBill = Number(lot.billAmount) || 0;
    const customOwner =
      revisionReview.useCustomOwner && revisionReview.customOwnerAmount !== ''
        ? Number(revisionReview.customOwnerAmount)
        : null;
    const newOwnerBill = updateOwner
      ? customOwner != null && Number.isFinite(customOwner) && customOwner >= 0
        ? customOwner
        : toAmount
      : prevOwnerBill;
    const settlements = ownerSettlementForLot(lot);
    const ownerChanged = updateOwner && newOwnerBill !== prevOwnerBill;

    setRevisionReviewSaving(true);
    try {
      const tasks = [
        updatePartyEdit(
          lot.id,
          {
            partyBillAmount: toAmount,
            amountChangeNote: {
              previousAmount: fromAmount,
              updatedAmount: toAmount,
              difference: toAmount - fromAmount,
              ghausiaAmount: prevOwnerBill,
              changedAt: new Date().toISOString(),
              source: 'party-request',
            },
            billRevisionRequest: null,
          },
          lotWorkspaceOpts(lot)
        ),
      ];
      if (ownerChanged) {
        tasks.push(
          updateLot(
            lot.id,
            { billAmount: newOwnerBill, totalAmount: newOwnerBill },
            lotWorkspaceOpts(lot)
          )
        );
      }
      await Promise.all(tasks);

      if (ownerChanged && settlements.length > 0) {
        const delta = newOwnerBill - prevOwnerBill;
        const lotNo = lotNumberOf(lot);
        const common = {
          party: 'Owner',
          date: new Date().toISOString().slice(0, 10),
          linkedLot: String(lotNo),
        };
        if (delta > 0) {
          await addPayment(
            {
              ...common,
              type: 'Paid',
              amount: delta,
              note: `Bill revision adjustment (+) â€” lot ${lotNo}: owner bill â‚¨${prevOwnerBill.toLocaleString()} â†’ â‚¨${newOwnerBill.toLocaleString()}`,
            },
            lotWorkspaceOpts(lot)
          );
        } else if (delta < 0) {
          await addPayment(
            {
              ...common,
              type: 'Received',
              amount: Math.abs(delta),
              note: `Bill revision adjustment (âˆ’) â€” lot ${lotNo}: owner bill â‚¨${prevOwnerBill.toLocaleString()} â†’ â‚¨${newOwnerBill.toLocaleString()}`,
            },
            lotWorkspaceOpts(lot)
          );
        }
      }

      setRevisionReview(null);
      await Swal.fire({
        icon: 'success',
        title: 'Approved',
        text:
          ownerChanged && settlements.length > 0
            ? 'Party ledger and owner bill updated; adjustment payment recorded for settlement.'
            : ownerChanged
              ? 'Party ledger and owner bill were updated.'
              : 'Party ledger amount updated (owner bill unchanged).',
        timer: 2600,
        showConfirmButton: false,
      });
    } catch (e) {
      await Swal.fire({
        icon: 'error',
        title: 'Approve fail',
        text: e?.message || 'Please try again.',
      });
    } finally {
      setRevisionReviewSaving(false);
    }
  };

  /** Admin: reject a party's bill-change request with a reason. */
  const rejectRevision = async () => {
    if (!revisionReview) return;
    const { lot } = revisionReview;
    const pe = ledgerPartyEdits[lot.id] || {};
    const req = pe.billRevisionRequest || {};
    const note = String(revisionReview.rejectionNote || '').trim();
    if (!note) {
      await Swal.fire({
        icon: 'error',
        title: 'Reason required',
        text: 'Please enter a reason for rejection.',
      });
      return;
    }
    setRevisionReviewSaving(true);
    try {
      await updatePartyEdit(
        lot.id,
        {
          billRevisionRequest: {
            ...req,
            status: 'rejected',
            rejectionNote: note,
            resolvedAt: new Date().toISOString(),
          },
        },
        lotWorkspaceOpts(lot)
      );
      setRevisionReview(null);
      await Swal.fire({
        icon: 'success',
        title: 'Request rejected',
        timer: 1800,
        showConfirmButton: false,
      });
    } catch (e) {
      await Swal.fire({
        icon: 'error',
        title: 'Reject fail',
        text: e?.message || 'Please try again.',
      });
    } finally {
      setRevisionReviewSaving(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    partyFilter,
    statusFilter,
    ledgerLotsTab,
    dateRange,
    customStart,
    customEnd,
    workspaceFilter,
  ]);

  useEffect(() => {
    if (ledgerLotsTab === 'other' && statusFilter === 'Completed') {
      setStatusFilter('All');
    }
  }, [ledgerLotsTab, statusFilter]);

  useEffect(() => {
    if (ledgerLotsTab === 'completed') {
      setStatusFilter('All');
    }
  }, [ledgerLotsTab]);

  useEffect(() => {
    if (isParty) {
      setPartyFilter('All');
    }
  }, [isParty, user?.partyId]);

  /** Deep link: /party-ledger?lotId=â€¦ â†’ show that lot (and open bill review if billReview=1). */
  useEffect(() => {
    const lotId = String(searchParams.get('lotId') || '').trim();
    if (!lotId) {
      deepLinkAppliedRef.current = '';
      return;
    }
    if (initialDataLoading) return;
    if (deepLinkAppliedRef.current === lotId) return;

    const lot = ledgerLots.find((l) => String(l.id) === lotId);
    if (!lot) return;

    deepLinkAppliedRef.current = lotId;
    const openBillReview = String(searchParams.get('billReview') || '').trim() === '1';
    const status = getDisplayStatus(lot);
    if (status === 'Completed') {
      setLedgerLotsTab('completed');
    } else {
      setLedgerLotsTab('other');
      if (
        status === 'Rejected' ||
        status === 'Pending' ||
        status === 'In Progress' ||
        status === 'Pending review'
      ) {
        setStatusFilter(status);
      } else {
        setStatusFilter('All');
      }
    }
    setPartyFilter('All');
    setWorkspaceFilter('All');
    setDateRange('all');
    setCustomStart('');
    setCustomEnd('');
    setSearch(String(lot.lotNo || lot.lotNumber || '').trim());
    setHighlightLotId(lotId);
    setCurrentPage(1);

    const next = new URLSearchParams(searchParams);
    next.delete('lotId');
    next.delete('billReview');
    setSearchParams(next, { replace: true });

    const pe = ledgerPartyEdits[lot.id] || {};
    const shouldOpenReview = isAdmin && (openBillReview || hasPendingBillRevisionRequest(pe));

    const t = setTimeout(() => {
      const el = document.getElementById(`pl-lot-row-${lotId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (shouldOpenReview) {
        setRevisionReview({
          lot,
          updateOwnerBill: true,
          useCustomOwner: false,
          customOwnerAmount: '',
          rejectionNote: '',
        });
      } else if (isParty && (status === 'Rejected' || status === 'Pending review')) {
        openEdit(lot);
      }
    }, 350);
    const clearHl = setTimeout(() => setHighlightLotId(null), 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(clearHl);
    };
  }, [searchParams, setSearchParams, ledgerLots, ledgerPartyEdits, initialDataLoading, isAdmin]);

  const jumpToPendingBillRevision = () => {
    const pendingLot = ledgerLots.find(
      (l) =>
        getDisplayStatus(l) === 'Completed' &&
        hasPendingBillRevisionRequest(partyEditForLot(ledgerPartyEdits, l))
    );
    if (!pendingLot) {
      setLedgerLotsTab('completed');
      return;
    }
    deepLinkAppliedRef.current = '';
    setSearchParams(
      {
        lotId: String(pendingLot.id),
        billReview: '1',
      },
      { replace: false }
    );
  };

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const openEdit = (lot, initialStatus) => {
    const pe = ledgerPartyEdits[lot.id] || {};
    const statusForForm = initialStatus || getDisplayStatus(lot);
    const rowDisplay = getDisplayStatus(lot);
    if (!isAdmin && rowDisplay === 'Completed') return;
    const kind = rowDisplay === 'Pending review' ? 'pendingReview' : 'standard';
    setLedgerEditKind(kind);
    const existingComplete = formatYmd(pe.completeDate) || formatYmd(lot.receivedBackDate) || '';
    setLedgerFormErrors({});
    const peOpen = ledgerPartyEdits[lot.id] || {};
    const initialBill =
      peOpen.partyBillAmount != null && peOpen.partyBillAmount !== ''
        ? String(peOpen.partyBillAmount)
        : '';

    setEditForm({
      allotDate: isParty ? (getPartyAllotDate(lot) || '') : (lot.allotDate || ''),
      completeDate:
        existingComplete ||
        (statusForForm === 'Completed' ? new Date().toISOString().slice(0, 10) : ''),
      status: statusForForm,
      billAmount: initialBill,
      receipt: pe.receipt || '',
      notes: pe.notes || '',
      partyId: lot.partyId != null && lot.partyId !== '' ? String(lot.partyId) : '',
      partyName: getPartyNameLocal(lot.partyId, lot.partyName),
    });
    setEditingId(lot.id);
  };

  const handleSave = async () => {
    const lot = ledgerLots.find((l) => l.id === editingId);
    if (!lot) return;

    if (ledgerEditKind === 'pendingReview') {
      const err = {};
      if (!String(editForm.partyId || '').trim()) {
        err.partyId = 'Party is required.';
      }
      if (!String(editForm.completeDate || '').trim()) {
        err.completeDate = 'Complete date is required.';
      }
      if (Object.keys(err).length > 0) {
        setLedgerFormErrors(err);
        return;
      }
      setLedgerFormErrors({});
      setLedgerSaving(true);
      try {
        let receiptToSave;
        try {
          receiptToSave = await finalizeLedgerReceiptStoredValue(editForm.receipt);
        } catch (receiptErr) {
          await Swal.fire({
            icon: 'error',
            title: 'Receipt could not be processed',
            text: receiptErr?.message || 'Try a smaller JPG/PNG or a different photo.',
          });
          return;
        }
        const partyChanged =
          String(editForm.partyId || '').trim() !== '' &&
          !samePartyId(editForm.partyId, lot.partyId);
        const prevPe = ledgerPartyEdits[lot.id] || {};
        const previousLedgerAmount = getPartyLedgerBillNumeric(prevPe);
        const nextLedgerAmount = Number(editForm.billAmount) || 0;
        const ghausiaAmount = Number(lot.billAmount || 0);
        let pendingRevisionPayload = null;

        if (previousLedgerAmount !== nextLedgerAmount) {
          const diff = nextLedgerAmount - previousLedgerAmount;
          const businessLine = !isParty
            ? `<div><strong>Business / owner bill on lot:</strong> â‚¨${ghausiaAmount.toLocaleString()}</div>`
            : '';
          const footnote = isParty
            ? `<div style="margin-top:10px;color:var(--warning, #92400e)">This lot stays <strong>under business review</strong>. The business reconciles your ledger separately â€” you do not see the business-side bill.</div>`
            : `<div style="margin-top:10px;color:var(--warning, #92400e)">This lot stays <strong>under admin review</strong>. If the owner was already billed for this lot, the admin will choose how to update the business bill when approving.</div>`;
          const result = await Swal.fire({
            title: isParty ? 'Ledger amount change' : 'Party bill amount change',
            icon: 'question',
            html: `
            <div style="text-align:left;font-size:14px;line-height:1.6;color:var(--text-primary)">
              <div><strong>${isParty ? 'Your amount (old)' : 'Party ledger (old)'}:</strong> â‚¨${previousLedgerAmount.toLocaleString()}</div>
              <div><strong>${isParty ? 'Your amount (new)' : 'Party ledger (new)'}:</strong> â‚¨${nextLedgerAmount.toLocaleString()}</div>
              <div><strong>Difference:</strong> â‚¨${diff.toLocaleString()}</div>
              ${businessLine}
              ${footnote}
            </div>
          `,
            showCancelButton: true,
            confirmButtonText: 'Save & keep in review',
            cancelButtonText: 'Cancel',
          });
          if (!result.isConfirmed) {
            return;
          }
          pendingRevisionPayload = {
            fromAmount: previousLedgerAmount,
            toAmount: nextLedgerAmount,
            ghausiaAmount,
            updatedAt: new Date().toISOString(),
          };
        }

        const reviewTasks = [
          updatePartyEdit(
            editingId,
            {
              completeDate: editForm.completeDate || new Date().toISOString().slice(0, 10),
              partyBillAmount: nextLedgerAmount,
              receipt: receiptToSave,
              pendingRevision: pendingRevisionPayload,
            },
            lotWorkspaceOpts(lot)
          ),
        ];
        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          reviewTasks.push(
            updateLot(
              editingId,
              {
                partyId: editForm.partyId,
                partyName: sel?.name || editForm.partyName,
              },
              lotWorkspaceOpts(lot)
            )
          );
        }
        await Promise.all(reviewTasks);

        setEditingId(null);
        setLedgerEditKind(null);
      } catch (e) {
        const msg = e?.message || (typeof e === 'string' ? e : 'Save failed. Please try again.');
        await Swal.fire({
          icon: 'error',
          title: 'Could not save',
          text: msg,
        });
      } finally {
        setLedgerSaving(false);
      }
      return;
    }

    if (editForm.status === 'Completed') {
      const err = {};
      if (!String(editForm.partyId || '').trim())
        err.partyId = 'Party is required when status is Completed.';
      if (!String(editForm.completeDate || '').trim())
        err.completeDate = 'Complete date is required when status is Completed.';
      if (Object.keys(err).length > 0) {
        setLedgerFormErrors(err);
        return;
      }
    }
    setLedgerFormErrors({});

    setLedgerSaving(true);
    try {
      let receiptToSave;
      try {
        receiptToSave = await finalizeLedgerReceiptStoredValue(editForm.receipt);
      } catch (receiptErr) {
        await Swal.fire({
          icon: 'error',
          title: 'Receipt could not be processed',
          text: receiptErr?.message || 'Try a smaller JPG/PNG or a different photo.',
        });
        return;
      }

      const partyChanged =
        String(editForm.partyId || '').trim() !== '' && !samePartyId(editForm.partyId, lot.partyId);

      const prevPeStd = ledgerPartyEdits[lot.id] || {};
      const previousLedgerAmount = getPartyLedgerBillNumeric(prevPeStd);
      const nextLedgerAmount = Number(editForm.billAmount) || 0;
      const completedAmountChanged =
        getDisplayStatus(lot) === 'Completed' && previousLedgerAmount !== nextLedgerAmount;
      let amountChangeNote = null;

      if (completedAmountChanged) {
        if (!isAdmin) return;
        const ghausiaAmount = Number(lot.billAmount || 0);
        const difference = nextLedgerAmount - previousLedgerAmount;
        const result = await Swal.fire({
          title: 'Confirm completed lot amount change',
          icon: 'warning',
          html: `
            <div style="text-align:left;font-size:14px;line-height:1.6;color:var(--text-primary)">
              <div><strong>Owner amount:</strong> â‚¨${ghausiaAmount.toLocaleString()}</div>
              <div><strong>Current party ledger amount:</strong> â‚¨${previousLedgerAmount.toLocaleString()}</div>
              <div><strong>Updated party ledger amount:</strong> â‚¨${nextLedgerAmount.toLocaleString()}</div>
              <div><strong>Difference:</strong> â‚¨${difference.toLocaleString()}</div>
              <div style="margin-top:10px;color:var(--warning)">Only the party ledger is updated. The business (owner) bill on the lot is <strong>not</strong> changed â€” edit it in the collection workspace or when reviewing completion so the owner sees the correct amount.</div>
              <div style="margin-top:8px;color:var(--text-muted);font-size:12px">No payment transaction will be created automatically.</div>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: 'Save amount note',
          cancelButtonText: 'Cancel',
        });
        if (!result.isConfirmed) {
          return;
        }
        amountChangeNote = {
          previousAmount: previousLedgerAmount,
          updatedAmount: nextLedgerAmount,
          difference,
          ghausiaAmount,
          changedAt: new Date().toISOString(),
        };
      }

      if (editForm.status === 'Completed') {
        const lotUpdates = {
          status: 'pending approval',
          receivedBackDate: editForm.completeDate || new Date().toISOString().slice(0, 10),
        };
        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          lotUpdates.partyId = editForm.partyId;
          lotUpdates.partyName = sel?.name || editForm.partyName;
        }
        await Promise.all([
          updatePartyEdit(
            editingId,
            {
              completeDate: editForm.completeDate || new Date().toISOString().slice(0, 10),
              partyBillAmount: Number(editForm.billAmount) || 0,
              receipt: receiptToSave,
              notes: editForm.notes,
              overrideStatus: 'Pending Approval',
              ...(amountChangeNote ? { amountChangeNote } : {}),
            },
            lotWorkspaceOpts(lot)
          ),
          updateLot(editingId, lotUpdates, lotWorkspaceOpts(lot)),
        ]);
      } else {
        if (isParty && getDisplayStatus(lot) === 'In Progress' && editForm.status === 'Pending') {
          await Swal.fire({
            icon: 'info',
            title: 'Not available',
            text: 'From In Progress you can only submit for review. You cannot save as not received.',
          });
          return;
        }
        if (
          isParty &&
          (adminLotNotDispatched(lot) || getDisplayStatus(lot) === 'Pending') &&
          editForm.status !== 'Pending'
        ) {
          await Swal.fire({
            icon: 'info',
            title: 'Not available',
            text: 'You cannot change status until the business has dispatched this lot to you.',
          });
          return;
        }
        const nextOverrideStatus = editForm.status === 'Pending' ? 'Pending' : 'In Progress';
        const lotUpdates = {};
        const lowerStatus = (lot.status || '').toLowerCase();
        if (editForm.status === 'Pending') {
          if (lowerStatus !== 'pending') {
            lotUpdates.status = 'pending';
            lotUpdates.dispatchDate = '';
          }
        } else if (lowerStatus !== 'dispatched') {
          lotUpdates.status = 'dispatched';
          lotUpdates.dispatchDate = lot.dispatchDate || new Date().toISOString().slice(0, 10);
        }
        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          lotUpdates.partyId = editForm.partyId;
          lotUpdates.partyName = sel?.name || editForm.partyName;
        }
        const stdTasks = [
          updatePartyEdit(
            editingId,
            {
              completeDate: editForm.completeDate || null,
              partyBillAmount: Number(editForm.billAmount) || 0,
              receipt: receiptToSave,
              notes: editForm.notes,
              overrideStatus: nextOverrideStatus,
            },
            lotWorkspaceOpts(lot)
          ),
        ];
        if (Object.keys(lotUpdates).length > 0) {
          stdTasks.push(updateLot(editingId, lotUpdates, lotWorkspaceOpts(lot)));
        }
        await Promise.all(stdTasks);
      }

      setEditingId(null);
      setLedgerEditKind(null);
    } catch (e) {
      const msg = e?.message || (typeof e === 'string' ? e : 'Save failed. Please try again.');
      await Swal.fire({
        icon: 'error',
        title: 'Could not save',
        text: msg,
      });
    } finally {
      setLedgerSaving(false);
    }
  };

  const totals = useMemo(() => {
    let completedAmount = 0;
    let inProgressAmount = 0;
    let otherAmount = 0;
    let pending = 0;
    let inProgress = 0;
    let pendingReview = 0;
    let rejected = 0;
    let completed = 0;

    lotsForSummaryStats.forEach((l) => {
      const status = getDisplayStatus(l);
      const bill = getLedgerAmountForTotals(l);

      if (status === 'Completed') {
        completedAmount += bill;
        completed += 1;
      } else if (status === 'Pending') {
        pending += 1;
      } else if (status === 'In Progress') {
        inProgressAmount += bill;
        inProgress += 1;
      } else if (status === 'Pending review') {
        otherAmount += bill;
        pendingReview += 1;
      } else if (status === 'Rejected') {
        otherAmount += bill;
        rejected += 1;
      } else {
        otherAmount += bill;
      }
    });

    return {
      lots: lotsForSummaryStats.length,
      billTotal: lotsForSummaryStats.reduce((s, l) => s + getLedgerAmountForTotals(l), 0),
      completed,
      pending,
      inProgress,
      pendingReview,
      rejected,
      otherCount: pendingReview + rejected,
      completedAmount,
      inProgressAmount,
      otherAmount,
      withReceipt: lotsForSummaryStats.filter((l) => ledgerPartyEdits[l.id]?.receipt).length,
    };
  }, [lotsForSummaryStats, ledgerPartyEdits, isParty]);

  const partyBalanceInfo = useMemo(() => {
    const withinWorkspace = (p) => {
      if (!isAdmin || workspaceFilter === 'All') return true;
      return String(p.businessOwnerId ?? '').trim() === String(workspaceFilter).trim();
    };
    const paysDateScoped = ledgerPayments.filter(
      (p) => p.type === 'Paid' && isWithinDateRange(p.updatedAt || p.date, dateRange, customRange)
    );
    const pays = paysDateScoped.filter(withinWorkspace);
    const receivedDateScoped = ledgerPayments.filter(
      (p) =>
        p.type === 'Received' && isWithinDateRange(p.updatedAt || p.date, dateRange, customRange)
    );
    const receiveds = receivedDateScoped.filter(withinWorkspace);

    if (partyFilter === 'All') {
      const names = [
        ...new Set(
          lotsForSummaryStats
            .map((l) => getPartyNameLocal(l.partyId, l.partyName).trim())
            .filter((n) => n && n !== 'â€”')
        ),
      ];

      let balance = 0;
      let receivedFromBusiness = 0;
      let paidToBusiness = 0;

      names.forEach((name) => {
        const billSum = lotsForSummaryStats
          .filter((l) => getPartyNameLocal(l.partyId, l.partyName).trim() === name)
          .reduce((s, l) => s + getLedgerAmountForTotals(l), 0);

        const partyIn = pays
          .filter((p) => String(p.party || '').trim() === name)
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const partyOut = receiveds
          .filter((p) => String(p.party || '').trim() === name)
          .reduce((s, p) => s + Number(p.amount || 0), 0);

        receivedFromBusiness += partyIn;
        paidToBusiness += partyOut;
        balance += billSum - partyIn + partyOut;
      });

      return {
        balance,
        receivedFromBusiness,
        paidToBusiness,
        completedNet: totals.completedAmount - receivedFromBusiness + paidToBusiness,
        hint:
          workspaceFilter === 'All'
            ? isParty
              ? 'Overall ledger (Status filter does not change these totals).'
              : 'Overall totals for filtered workspaces â€” Status filter only changes the table below.'
            : isParty
              ? 'Overall for this workspace (Status filter does not change these totals).'
              : 'Overall for this workspace â€” Status filter only changes the table below.',
      };
    }

    const party = parties.find((p) => samePartyId(p.id, partyFilter));
    const pname = (party?.name || '').trim();

    const receivedFromBusiness = pays
      .filter((p) => String(p.party || '').trim() === pname)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const paidToBusiness = receiveds
      .filter((p) => String(p.party || '').trim() === pname)
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    return {
      balance: totals.billTotal - receivedFromBusiness + paidToBusiness,
      receivedFromBusiness,
      paidToBusiness,
      completedNet: totals.completedAmount - receivedFromBusiness + paidToBusiness,
      hint: pname
        ? isParty
          ? `${pname} â€” overall balance (bill âˆ’ paid to you + you paid back). Status filter does not change this.`
          : `${pname}: overall = bill âˆ’ paid to party + received from party. Status filter only filters the table.`
        : 'Bill âˆ’ paid to party + received from party (overall; Status filter ignores summary).',
    };
  }, [
    partyFilter,
    lotsForSummaryStats,
    ledgerPayments,
    parties,
    totals.billTotal,
    totals.completedAmount,
    dateRange,
    customRange,
    isAdmin,
    workspaceFilter,
    isParty,
  ]);
  const handleRowStatusChange = async (lot, newStatus) => {
    if (newStatus === 'Completed') {
      openEdit(lot, 'Completed');
      return;
    }
    if (isParty && getDisplayStatus(lot) === 'In Progress') {
      if (newStatus === 'In Progress') return;
      await Swal.fire({
        icon: 'info',
        title: 'Not available',
        text: 'From In Progress you can only submit this lot for review. You cannot move it back to not received.',
      });
      return;
    }
    if (isParty && adminLotNotDispatched(lot) && newStatus === 'In Progress') {
      await Swal.fire({
        icon: 'info',
        title: 'Not available',
        text: 'You cannot set this to In Progress until the business has sent the lot to you. Your status will move forward when that happens on the business side.',
      });
      return;
    }
    if (newStatus === 'Pending') {
      await updatePartyEdit(
        lot.id,
        { overrideStatus: 'Pending', completeDate: '' },
        lotWorkspaceOpts(lot)
      );
      if ((lot.status || '').toLowerCase() !== 'pending') {
        await updateLot(lot.id, { status: 'pending', dispatchDate: '' }, lotWorkspaceOpts(lot));
      }
      return;
    }
    await updatePartyEdit(lot.id, { overrideStatus: 'In Progress' }, lotWorkspaceOpts(lot));
    const lowerStatus = (lot.status || '').toLowerCase();
    if (lowerStatus !== 'dispatched') {
      await updateLot(
        lot.id,
        {
          status: 'dispatched',
          dispatchDate: new Date().toISOString().slice(0, 10),
        },
        lotWorkspaceOpts(lot)
      );
    }
  };

  const handleDirectBillUpload = async (lot, file) => {
    try {
      const stored = await readReceiptAsStoredValue(file);
      const cropped = await finalizeLedgerReceiptStoredValue(stored);
      await updatePartyEdit(lot.id, { receipt: cropped }, lotWorkspaceOpts(lot));
      patchLotReceipt?.(lot.id, cropped);
    } catch (err) {
      await Swal.fire({
        icon: 'error',
        title: 'Could not upload bill',
        text: err?.message || 'Try a smaller JPG/PNG.',
      });
    }
  };

  const editingLot = ledgerLots.find((l) => l.id === editingId);

  if (initialDataLoading) {
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

  const renderLotPicturesButton = (l, pe, options = {}) => {
    const extraStyle = options.extraStyle || {};
    const picsMax = lotPicturesMax(l);
    const hydrated = Array.isArray(pe.lotImages) && pe.lotImages.length > 0 ? pe.lotImages.length : null;
    const counted = Number(pe.lotImagesCount);
    const picsCount = hydrated != null ? hydrated : Number.isFinite(counted) && counted >= 0 ? counted : pe.hasLotImages ? null : 0;
    return (
      <button
        type="button"
        onClick={() => void openLotPictures(l)}
        title={`Lot pictures (max ${picsMax} â€” one per color)`}
        style={{
          fontSize: 11,
          fontWeight: 600,
          border: '1px solid #E0E7FF',
          background: 'linear-gradient(180deg, #F8FAFF 0%, var(--primary-bg, #eef2ff) 100%)',
          color: 'var(--primary, #3730a3)',
          cursor: 'pointer',
          padding: '3px 8px',
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          ...extraStyle,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span>Pictures</span>
        <span style={{
          background: picsCount == null || picsCount > 0 ? 'var(--purple, #4f46e5)' : 'var(--border, #c7d2fe)',
          color: picsCount == null || picsCount > 0 ? 'var(--card-bg, #ffffff)' : 'var(--purple, #4338ca)',
          borderRadius: 999,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1.4,
        }}>
          {picsCount != null ? `${picsCount}/${picsMax}` : `â€¢/${picsMax}`}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="page-header pl-page-header">
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div className="page-title" style={{ margin: 0, padding: 0 }}>{isParty ? 'My Lots' : 'Party Ledger'}</div>
            <button
              type="button"
              onClick={() => setShowSummaryCards((prev) => !prev)}
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
          </div>
          <div className="page-subtitle desktop-only-action" style={{ margin: 0, marginTop: 4 }}>
            {isAdmin
              ? 'All workspaces by default \u2014 filter by party, workspace, dates, and status'
              : 'Your assigned lots \u2014 update status, amounts, and completion details'}
          </div>
        </div>
      </div>
      {isAdmin && pendingRevisionRequestCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            background: 'var(--primary-bg, #fffbeb)',
            border: '1px solid var(--warning-bg, #fcd34d)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--warning, #92400e)', fontWeight: 600 }}>
            {pendingRevisionRequestCount} bill change request
            {pendingRevisionRequestCount === 1 ? '' : 's'} pending party bill-change review.
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: 'var(--warning, #f59e0b)', color: 'var(--card-bg, #ffffff)', border: 'none' }}
            onClick={jumpToPendingBillRevision}
          >
            Open request
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {showSummaryCards && (
        <PLSummaryCards
          totals={totals}
          partyBalanceInfo={partyBalanceInfo}
          isParty={isParty}
        />
      )}

      {/* Tabs + Toolbar + Filters */}
      <PLToolbar
        ledgerLotsTab={ledgerLotsTab}
        setLedgerLotsTab={setLedgerLotsTab}
        otherLotsTabCount={otherLotsTabCount}
        completedLotsTabCount={completedLotsTabCount}
        viewMode={viewMode}
        setViewMode={setViewMode}
        search={search}
        setSearch={setSearch}
        workspaceFilter={workspaceFilter}
        setWorkspaceFilter={setWorkspaceFilter}
        businessOwners={businessOwners}
        partyFilter={partyFilter}
        setPartyFilter={setPartyFilter}
        parties={parties}
        dateRange={dateRange}
        setDateRange={setDateRange}
        customStart={customStart}
        customEnd={customEnd}
        setCustomStart={setCustomStart}
        setCustomEnd={setCustomEnd}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isAdmin={isAdmin}
        isParty={isParty}
      />

      {/* Desktop Table */}
      <PLDesktopTable
        filtered={filtered}
        paginatedLots={paginatedLots}
        ledgerTableColSpan={ledgerTableColSpan}
        ledgerPartyEdits={ledgerPartyEdits}
        isParty={isParty}
        isAdmin={isAdmin}
        showPartyNameCol={showPartyNameCol}
        showWorkspaceCol={showWorkspaceCol}
        highlightLotId={highlightLotId}
        billPicSavingLotId={billPicSavingLotId}
        getDisplayStatus={getDisplayStatus}
        getPartyNameLocal={getPartyNameLocal}
        getDisplayCompleteDate={getDisplayCompleteDate}
        getPartyAllotDate={getPartyAllotDate}
        showWorkspaceColForLot={showWorkspaceColForLot}
        workspaceNameForLot={workspaceNameForLot}
        openEdit={openEdit}
        handleRowStatusChange={handleRowStatusChange}
        savePartyLotReceiptFromFile={savePartyLotReceiptFromFile}
        removePartyLotReceipt={removePartyLotReceipt}
        setReceiptPreview={setReceiptPreview}
        setRevisionRequest={setRevisionRequest}
        setRevisionReview={setRevisionReview}
        renderLotPicturesButton={renderLotPicturesButton}
        getPartyLedgerBillNumeric={getPartyLedgerBillNumeric}
        pendingRevisionIsReal={pendingRevisionIsReal}
      />

      {/* Mobile Views */}
      {viewMode === 'tile' ? (
        <PLMobileTiles
          filtered={filtered}
          paginatedLots={paginatedLots}
          ledgerPartyEdits={ledgerPartyEdits}
          isParty={isParty}
          isAdmin={isAdmin}
          showPartyNameCol={showPartyNameCol}
          getDisplayStatus={getDisplayStatus}
          getPartyNameLocal={getPartyNameLocal}
          getDisplayCompleteDate={getDisplayCompleteDate}
          getPartyAllotDate={getPartyAllotDate}
          showWorkspaceColForLot={showWorkspaceColForLot}
          workspaceNameForLot={workspaceNameForLot}
          openEdit={openEdit}
          handleRowStatusChange={handleRowStatusChange}
          handleDirectBillUpload={handleDirectBillUpload}
          setReceiptPreview={setReceiptPreview}
          setRevisionRequest={setRevisionRequest}
          setRevisionReview={setRevisionReview}
          renderLotPicturesButton={renderLotPicturesButton}
          getPartyLedgerBillNumeric={getPartyLedgerBillNumeric}
        />
      ) : (
        <PLMobileCards
          filtered={filtered}
          paginatedLots={paginatedLots}
          ledgerPartyEdits={ledgerPartyEdits}
          isParty={isParty}
          isAdmin={isAdmin}
          showPartyNameCol={showPartyNameCol}
          getDisplayStatus={getDisplayStatus}
          getPartyNameLocal={getPartyNameLocal}
          getDisplayCompleteDate={getDisplayCompleteDate}
          getPartyAllotDate={getPartyAllotDate}
          showWorkspaceColForLot={showWorkspaceColForLot}
          workspaceNameForLot={workspaceNameForLot}
          openEdit={openEdit}
          handleRowStatusChange={handleRowStatusChange}
          handleDirectBillUpload={handleDirectBillUpload}
          setReceiptPreview={setReceiptPreview}
          setRevisionRequest={setRevisionRequest}
          setRevisionReview={setRevisionReview}
          renderLotPicturesButton={renderLotPicturesButton}
          getPartyLedgerBillNumeric={getPartyLedgerBillNumeric}
        />
      )}

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

      {/* Modals */}
      <PLEditModal
        editingId={editingId}
        editingLot={editingLot}
        editForm={editForm}
        setEditForm={setEditForm}
        ledgerEditKind={ledgerEditKind}
        ledgerSaving={ledgerSaving}
        ledgerFormErrors={ledgerFormErrors}
        setLedgerFormErrors={setLedgerFormErrors}
        handleSave={handleSave}
        onClose={() => {
          if (!ledgerSaving) {
            setEditingId(null);
            setLedgerEditKind(null);
            setLedgerFormErrors({});
          }
        }}
        parties={parties}
        isParty={isParty}
        isAdmin={isAdmin}
        setReceiptPreview={setReceiptPreview}
        getDisplayStatus={getDisplayStatus}
        samePartyId={samePartyId}
      />

      <PLPicturesModal
        picsLot={picsLot}
        picsImages={picsImages}
        setPicsImages={setPicsImages}
        picsLoading={picsLoading}
        picsSaving={picsSaving}
        saveLotPictures={saveLotPictures}
        onClose={() => {
          if (!picsSaving) {
            setPicsLot(null);
            setPicsImages([]);
          }
        }}
        lotPicturesMax={lotPicturesMax}
      />

      <PLReceiptPreviewModal
        receiptPreview={receiptPreview}
        setReceiptPreview={setReceiptPreview}
        isParty={isParty}
        ledgerLots={ledgerLots}
        openEdit={openEdit}
        getDisplayStatus={getDisplayStatus}
      />

      <PLRevisionRequestModal
        revisionRequest={revisionRequest}
        setRevisionRequest={setRevisionRequest}
        revisionSaving={revisionSaving}
        submitRevisionRequest={submitRevisionRequest}
        ledgerPartyEdits={ledgerPartyEdits}
      />

      <PLRevisionReviewModal
        revisionReview={revisionReview}
        setRevisionReview={setRevisionReview}
        revisionReviewSaving={revisionReviewSaving}
        approveRevision={approveRevision}
        rejectRevision={rejectRevision}
        ledgerPartyEdits={ledgerPartyEdits}
        getPartyNameLocal={getPartyNameLocal}
        ownerSettlementForLot={ownerSettlementForLot}
      />
    </div>
  );
}
