import React, { useState, useMemo, useEffect, useRef } from 'react';
/* eslint-disable react-hooks/exhaustive-deps */
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, StatusBadge, SearchBar, EmptyState } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import LazyReceiptThumb from '../components/receipt/LazyReceiptThumb';
import { receiptPreviewKind } from '../components/receipt/ReceiptThumb';
import ImageUploader from '../components/ImageUploader';
import apiService from '../services/api';
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
  formatDisplayDate,
} from '../utils/dateFilters';
import { getPartyLedgerBillDisplay, getPartyLedgerBillNumeric } from '../utils/partyBillPrivacy';
import { workspaceDisplayTitleForLot, normalizedBusinessOwnerId } from '../utils/businessWorkspace';
import {
  countPendingBillRevisionRequests,
  hasPendingBillRevisionRequest,
  partyEditForLot,
} from '../utils/partyLedgerNotifications';
import {
  partyFacingLedgerDisplayLabel,
  partyFacingLotStatusLabel,
} from '../utils/partyFacingLabels';

// From the party's perspective: dispatched = In Progress, received back = Completed
// If party name is unknown, status should be Pending
const toLedgerStatus = (status, partyName) => {
  if (!partyName || !String(partyName).trim()) return 'Pending';
  if (!status) return 'Pending';
  const s = String(status).trim().toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'completed' || s === 'received back') return 'Completed';
  return 'In Progress';
};

const toTitleCase = (s) =>
  String(s || '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Party UI label for ledger display statuses. */
function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

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
    ctx.fillStyle = '#ffffff';
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
/** Admin/workspace lot still awaiting dispatch — party must not self-set "In Progress". */
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
  } = useApp();

  const { isAdmin, isParty, user } = useAuth();

  /** Admin: merged lots/edits/payments across all workspaces; party login: scoped cross-collection rows */
  const ledgerLots = isParty ? partyCrossLots : reportingLots;
  const ledgerPayments = isParty ? partyCrossPayments : reportingPayments;
  const ledgerPartyEdits = isParty ? partyCrossPartyEdits : reportingPartyEdits;
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState('');
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
  /** null | 'pendingReview' | 'standard' — pending = awaiting admin, party may still edit */
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
  /** Party: request a bill-amount change on a completed lot { lot, newAmount, reason } */
  const [revisionRequest, setRevisionRequest] = useState(null);
  const [revisionSaving, setRevisionSaving] = useState(false);
  /** Admin: review a party's pending bill-change request */
  const [revisionReview, setRevisionReview] = useState(null);
  const [revisionReviewSaving, setRevisionReviewSaving] = useState(false);

  const workspaceNameForLot = (l) =>
    workspaceDisplayTitleForLot(l, businessOwners, { shortIdFallback: true });

  const samePartyId = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

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
      partyNameDisplay !== '—' ? partyNameDisplay : ''
    );
  };

  const getPartyNameLocal = (partyId, fallback) =>
    parties.find((p) => samePartyId(p.id, partyId))?.name || fallback || '—';

  /** Totals use party ledger amounts only (same figure party and admin see in the table — never lot bill fallback). */
  const getLedgerAmountForTotals = (l) => {
    const pe = ledgerPartyEdits[l.id] || {};
    return getPartyLedgerBillNumeric(pe);
  };

  const filtered = useMemo(() => {
    const list = assignedLots.filter((l) => {
      const q = search.toLowerCase();
      const lotLabel = (l.lotNo || l.lotNumber || '').toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        String(l.designNo || '')
          .toLowerCase()
          .includes(q) ||
        String(l.description || '')
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
  }, [assignedLots, search, partyFilter, ledgerLotsTab, statusFilter, ledgerPartyEdits, isAdmin]);

  /** Summary cards ignore Status filter — only party / search / dates / workspace (via assignedLots). */
  const lotsForSummaryStats = useMemo(() => {
    return assignedLots.filter((l) => {
      const q = search.toLowerCase();
      const lotLabel = (l.lotNo || l.lotNumber || '').toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        String(l.designNo || '')
          .toLowerCase()
          .includes(q) ||
        String(l.description || '')
          .toLowerCase()
          .includes(q);
      const matchP = partyFilter === 'All' || samePartyId(l.partyId, partyFilter);
      return matchQ && matchP;
    });
  }, [assignedLots, search, partyFilter, ledgerPartyEdits]);

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
      // No party edit yet (404) or transient error — keep cached / empty.
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
              note: `Bill revision adjustment (+) — lot ${lotNo}: owner bill ₨${prevOwnerBill.toLocaleString()} → ₨${newOwnerBill.toLocaleString()}`,
            },
            lotWorkspaceOpts(lot)
          );
        } else if (delta < 0) {
          await addPayment(
            {
              ...common,
              type: 'Received',
              amount: Math.abs(delta),
              note: `Bill revision adjustment (−) — lot ${lotNo}: owner bill ₨${prevOwnerBill.toLocaleString()} → ₨${newOwnerBill.toLocaleString()}`,
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

  /** Deep link: /party-ledger?lotId=… → show that lot (and open bill review if billReview=1). */
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
      allotDate: lot.allotDate || '',
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
            ? `<div><strong>Business / owner bill on lot:</strong> ₨${ghausiaAmount.toLocaleString()}</div>`
            : '';
          const footnote = isParty
            ? `<div style="margin-top:10px;color:#92400e">This lot stays <strong>under business review</strong>. The business reconciles your ledger separately — you do not see the business-side bill.</div>`
            : `<div style="margin-top:10px;color:#92400e">This lot stays <strong>under admin review</strong>. If the owner was already billed for this lot, the admin will choose how to update the business bill when approving.</div>`;
          const result = await Swal.fire({
            title: isParty ? 'Ledger amount change' : 'Party bill amount change',
            icon: 'question',
            html: `
            <div style="text-align:left;font-size:14px;line-height:1.6">
              <div><strong>${isParty ? 'Your amount (old)' : 'Party ledger (old)'}:</strong> ₨${previousLedgerAmount.toLocaleString()}</div>
              <div><strong>${isParty ? 'Your amount (new)' : 'Party ledger (new)'}:</strong> ₨${nextLedgerAmount.toLocaleString()}</div>
              <div><strong>Difference:</strong> ₨${diff.toLocaleString()}</div>
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
            <div style="text-align:left;font-size:14px;line-height:1.6">
              <div><strong>Ghausia amount:</strong> ₨${ghausiaAmount.toLocaleString()}</div>
              <div><strong>Current party ledger amount:</strong> ₨${previousLedgerAmount.toLocaleString()}</div>
              <div><strong>Updated party ledger amount:</strong> ₨${nextLedgerAmount.toLocaleString()}</div>
              <div><strong>Difference:</strong> ₨${difference.toLocaleString()}</div>
              <div style="margin-top:10px;color:#92400e">Only the party ledger is updated. The business (Ghausia) bill on the lot is <strong>not</strong> changed — edit it in the collection workspace or when reviewing completion so the owner sees the correct amount.</div>
              <div style="margin-top:8px;color:#64748b;font-size:12px">No payment transaction will be created automatically.</div>
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
        if (isParty && adminLotNotDispatched(lot) && editForm.status === 'In Progress') {
          await Swal.fire({
            icon: 'info',
            title: 'Not available',
            text: 'You cannot save In Progress until the business has sent this lot to you.',
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
            .filter((n) => n && n !== '—')
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
              : 'Overall totals for filtered workspaces — Status filter only changes the table below.'
            : isParty
              ? 'Overall for this workspace (Status filter does not change these totals).'
              : 'Overall for this workspace — Status filter only changes the table below.',
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
          ? `${pname} — overall balance (bill − paid to you + you paid back). Status filter does not change this.`
          : `${pname}: overall = bill − paid to party + received from party. Status filter only filters the table.`
        : 'Bill − paid to party + received from party (overall; Status filter ignores summary).',
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

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{isParty ? 'My Lots' : 'Party Ledger'}</div>
          <div className="page-subtitle">
            {isAdmin
              ? 'All workspaces by default — filter by party, workspace, dates, and status'
              : 'Your assigned lots — update status, amounts, and completion details'}
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
            background: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            {pendingRevisionRequestCount} bill change request
            {pendingRevisionRequestCount === 1 ? '' : 's'} pending party bill-change review.
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
            onClick={jumpToPendingBillRevision}
          >
            Open request
          </button>
        </div>
      )}

      {/* Summary — overall (Status filter does not affect these cards) */}
      <div className="pl-grid">
        {[
          {
            key: 'assigned',
            label: isParty ? 'My lots' : 'Assigned Lots',
            value: totals.lots,
            color: '#1e40af',
            sub: 'Overall (not limited by Status filter)',
          },
          {
            key: 'bill',
            label: isParty ? 'Your ledger total' : 'Total Bill Value',
            value: `₨${totals.billTotal.toLocaleString()}`,
            color: '#7c3aed',
            sub: 'All lots in this view',
          },
          {
            key: 'completed',
            label: (
              <>
                Completed{' '}
                <strong style={{ fontSize: 14, color: '#15803d' }}>({totals.completed})</strong>
              </>
            ),
            value: `₨${totals.completedAmount.toLocaleString()}`,
            color: '#15803d',
          },
          {
            key: 'pending',
            label: (
              <>
                {isParty ? 'Not received yet' : 'Pending'}{' '}
                <strong style={{ fontSize: 14, color: '#d97706' }}>({totals.pending})</strong>
              </>
            ),
            value: isParty ? 'Business has not sent this to you yet' : 'Awaiting dispatch',
            color: '#d97706',
          },
          {
            key: 'inprogress',
            label: (
              <>
                {isParty ? 'With you / in progress' : 'In Progress'}{' '}
                <strong style={{ fontSize: 14, color: '#d97706' }}>({totals.inProgress})</strong>
              </>
            ),
            value: `₨${totals.inProgressAmount.toLocaleString()}`,
            color: '#d97706',
          },
          {
            key: 'other-status',
            label: (
              <>
                {isParty ? 'Review / rework' : 'Pending review + Rejected'}{' '}
                <strong style={{ fontSize: 14, color: '#a16207' }}>({totals.otherCount})</strong>
              </>
            ),
            value: totals.otherCount > 0 ? `₨${totals.otherAmount.toLocaleString()}` : 'None',
            color: '#a16207',
            sub:
              totals.otherCount > 0
                ? `${totals.pendingReview} in review · ${totals.rejected} rejected`
                : undefined,
          },
          {
            key: 'completed-lots-balance',
            label: `Completed lots ${
              partyBalanceInfo.completedNet >= 0
                ? `balance (${isParty ? 'owed to you' : 'still payable'})`
                : '(advance)'
            }`,
            value: `₨${partyBalanceInfo.completedNet.toLocaleString()}`,
            color: `${partyBalanceInfo.completedNet >= 0 ? '#0f766e' : '#dc2626'}`,
            sub: partyBalanceInfo.hint,
          },
          {
            key: 'balance',
            label: `Overall balance ${
              partyBalanceInfo.balance >= 0
                ? `(${isParty ? 'owed to you' : 'payable'})`
                : `(${isParty ? 'you owe' : 'advance'})`
            }`,
            value: `₨${partyBalanceInfo.balance.toLocaleString()}`,
            color: partyBalanceInfo.balance >= 0 ? '#0f766e' : '#dc2626',
            sub: partyBalanceInfo.hint,
          },
        ].map((c) => (
          <div key={c.key} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
            {c.sub && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginTop: 6,
                  lineHeight: 1.35,
                }}
              >
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        role="tablist"
        aria-label="Other lots or completed lots"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
          padding: 4,
          background: 'var(--surface-2, #f8fafc)',
          borderRadius: 10,
          border: '1px solid var(--border-subtle, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            {
              id: 'other',
              label: 'Other lots',
              count: otherLotsTabCount,
            },
            {
              id: 'completed',
              label: 'Completed lots',
              count: completedLotsTabCount,
            },
          ].map((t) => {
            const active = ledgerLotsTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLedgerLotsTab(t.id)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: active ? '1px solid #15803d' : '1px solid transparent',
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#15803d' : 'var(--text-secondary, #64748b)',
                  fontWeight: active ? 700 : 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {t.label}
                {t.count != null && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      opacity: 0.9,
                    }}
                  >
                    ({t.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View Switcher: Table View vs Tile View */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>View:</span>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('table')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            Table
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'tile' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('tile')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            Tiles
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`toolbar pl-toolbar${isParty ? ' pl-toolbar--party-user' : ''}`}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search lot no., design..." />
        {isAdmin && (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--workspace"
            value={workspaceFilter}
            onChange={(e) => setWorkspaceFilter(e.target.value)}
            aria-label="Filter by workspace"
            title="Business / workspace filter"
          >
            <option value="All">All workspaces</option>
            {businessOwners.map((o) => (
              <option key={o.id || o._id} value={String(o.id || o._id)}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {!isParty && (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--party"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
          >
            <option value="All">All parties</option>
            {parties.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        )}
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
        {ledgerLotsTab === 'other' && (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
            <option value="In Progress">{partyFacingStatusLabel('In Progress', isParty)}</option>
            <option value="Pending review">
              {partyFacingStatusLabel('Pending review', isParty)}
            </option>
            <option value="Rejected">{partyFacingStatusLabel('Rejected', isParty)}</option>
          </select>
        )}
      </div>

      {ledgerLotsTab === 'other' && statusFilter !== 'All' && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            fontSize: 13,
            color: '#1e40af',
            lineHeight: 1.4,
          }}
        >
          Table filtered by status: <strong>{partyFacingStatusLabel(statusFilter, isParty)}</strong>
          . Summary cards above stay overall (Status does not change them).
        </div>
      )}

      {/* Table vs Tile View */}
      {viewMode === 'table' ? (
        <div className="table-wrapper desktop-only-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Lot No</th>
                  <th>Design No</th>
                  <th>Description</th>
                  <th>Fabric</th>
                  <th>Colors</th>
                  <th>Pieces</th>
                  <th>Allot Date</th>
                  <th>Complete Date</th>
                  {showPartyNameCol ? <th>Party Name</th> : null}
                  {showWorkspaceCol && (
                    <th style={{ minWidth: 120 }} title="Business workspace">
                      {isParty ? 'Business' : 'Workspace'}
                    </th>
                  )}
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>
                    {isParty ? 'Your ledger (₨)' : 'Bill Amount'}
                  </th>
                  <th>Receipt</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={ledgerTableColSpan}>
                      <EmptyState message={isParty ? 'No lots found' : 'No assigned lots found'} />
                    </td>
                  </tr>
                ) : (
                  paginatedLots.map((l) => {
                    // console.log(l, 'l');
                    const pe = ledgerPartyEdits[l.id] || {};
                    const displayStatus = getDisplayStatus(l);
                    const partyBillOnly = getPartyLedgerBillDisplay(pe);
                    const displayComplete = getDisplayCompleteDate(l, pe);
                    return (
                      <tr
                        key={l.id}
                        id={`pl-lot-row-${l.id}`}
                        style={
                          String(highlightLotId) === String(l.id)
                            ? { background: '#FEF3C7', outline: '2px solid #F59E0B' }
                            : undefined
                        }
                      >
                        <td style={{ fontWeight: 700, color: '#1e40af' }}>
                          {l.lotNo || l.lotNumber}
                        </td>
                        <td style={{ fontWeight: 600 }}>{l.designNo}</td>
                        <td>{l.description}</td>
                        <td>
                          <span
                            style={{
                              background: '#F0F9FF',
                              color: '#0369a1',
                              border: '1px solid #BAE6FD',
                              borderRadius: 6,
                              padding: '2px 8px',
                              fontSize: 12,
                            }}
                          >
                            {l.fabric || l.itemType}
                          </span>
                        </td>
                        <td>{l.colors}</td>
                        <td>{l.pieces}</td>
                        <td>{formatDisplayDate(l.allotDate)}</td>
                        <td style={{ fontWeight: 500 }}>
                          {displayComplete ? (
                            formatDisplayDate(displayComplete)
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        {showPartyNameCol ? (
                          <td>{getPartyNameLocal(l.partyId, l.partyName)}</td>
                        ) : null}
                        {showWorkspaceCol && (
                          <td
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {workspaceNameForLot(l)}
                          </td>
                        )}
                        <td>
                          {displayStatus === 'Completed' ? (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'green',
                                marginTop: 3,
                                fontWeight: '500',
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#DCFCE7',
                                border: '1px solid #DCFCE7',
                              }}
                            >
                              Completed
                            </span>
                          ) : displayStatus === 'Pending review' ? (
                            <span
                              style={{
                                fontSize: 12,
                                color: '#92400e',
                                marginTop: 3,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#FEF3C7',
                                border: '1px solid #FCD34D',
                              }}
                            >
                              {partyFacingStatusLabel('Pending review', isParty)}
                            </span>
                          ) : displayStatus === 'Pending' && isParty ? (
                            <span
                              style={{
                                fontSize: 12,
                                color: '#b45309',
                                marginTop: 3,
                                fontWeight: 600,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: '#FEF3C7',
                                border: '1px solid #FCD34D',
                              }}
                            >
                              {partyFacingStatusLabel('Pending', isParty)}
                            </span>
                          ) : (
                            <select
                              className="form-select"
                              style={{
                                width: 150,
                                minWidth: 150,
                                fontSize: 12,
                                padding: '5px 8px',
                              }}
                              value={displayStatus === 'Rejected' ? 'Rejected' : displayStatus}
                              onChange={(e) => handleRowStatusChange(l, e.target.value)}
                            >
                              {displayStatus === 'Rejected' && (
                                <option
                                  value="Rejected"
                                  disabled
                                  style={{ fontWeight: 600, color: '#b91c1c' }}
                                >
                                  {partyFacingStatusLabel('Rejected', isParty)}
                                </option>
                              )}
                              {!(isParty && displayStatus === 'In Progress') ? (
                                <option value="Pending">
                                  {partyFacingStatusLabel('Pending', isParty)}
                                </option>
                              ) : null}
                              {isParty &&
                              adminLotNotDispatched(l) &&
                              displayStatus === 'In Progress' ? (
                                <option value="In Progress">
                                  {partyFacingStatusLabel('In Progress', isParty)}
                                </option>
                              ) : null}
                              {!(isParty && adminLotNotDispatched(l)) ? (
                                <option value="In Progress">
                                  {partyFacingStatusLabel('In Progress', isParty)}
                                </option>
                              ) : null}
                              <option value="Completed">
                                {isParty ? 'Submit for review' : 'Completed'}
                              </option>
                            </select>
                          )}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: '#1e40af',
                          }}
                        >
                          {partyBillOnly == null ? (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>—</span>
                          ) : (
                            `₨${partyBillOnly.toLocaleString()}`
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                              minWidth: 132,
                              maxWidth: 200,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                flexWrap: 'wrap',
                              }}
                            >
                              <LazyReceiptThumb
                                lotId={l.id}
                                receipt={pe.receipt}
                                hasReceipt={pe.hasReceipt}
                                businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                                lotLabel={l.lotNo || l.lotNumber}
                                onOpen={setReceiptPreview}
                                emptyLabel="No bill"
                              />
                              {pe.receipt && receiptPreviewKind(pe.receipt) === 'filename' && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--text-secondary)',
                                    maxWidth: 120,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={pe.receipt}
                                >
                                  {pe.receipt}
                                </span>
                              )}
                              {isAdmin || (isParty && displayStatus !== 'Completed') ? (
                                <>
                                  <input
                                    id={`pl-bill-${l.id}`}
                                    type="file"
                                    accept="image/*,.pdf,application/pdf"
                                    style={{ display: 'none' }}
                                    disabled={billPicSavingLotId === l.id}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      e.target.value = '';
                                      if (f) void savePartyLotReceiptFromFile(l, f);
                                    }}
                                  />
                                  <label
                                    htmlFor={`pl-bill-${l.id}`}
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: billPicSavingLotId === l.id ? 'wait' : 'pointer',
                                      color: '#0369a1',
                                      textDecoration: 'underline',
                                      textUnderlineOffset: 2,
                                    }}
                                  >
                                    {billPicSavingLotId === l.id
                                      ? 'Saving…'
                                      : pe.receipt
                                        ? 'Change'
                                        : 'Add bill'}
                                  </label>
                                  {pe.receipt ? (
                                    <button
                                      type="button"
                                      onClick={() => removePartyLotReceipt(l)}
                                      disabled={billPicSavingLotId === l.id}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#b91c1c',
                                        cursor: billPicSavingLotId === l.id ? 'wait' : 'pointer',
                                        padding: '2px 4px',
                                      }}
                                    >
                                      Delete
                                    </button>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                            {(() => {
                              const picsMax = lotPicturesMax(l);
                              const hydrated =
                                Array.isArray(pe.lotImages) && pe.lotImages.length > 0
                                  ? pe.lotImages.length
                                  : null;
                              const counted = Number(pe.lotImagesCount);
                              const picsCount =
                                hydrated != null
                                  ? hydrated
                                  : Number.isFinite(counted) && counted >= 0
                                    ? counted
                                    : pe.hasLotImages
                                      ? null
                                      : 0;
                              return (
                                <button
                                  type="button"
                                  onClick={() => void openLotPictures(l)}
                                  title={`Lot pictures (max ${picsMax} — one per color)`}
                                  style={{
                                    alignSelf: 'flex-start',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    border: '1px solid #E0E7FF',
                                    background: 'linear-gradient(180deg, #F8FAFF 0%, #EEF2FF 100%)',
                                    color: '#3730a3',
                                    cursor: 'pointer',
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                  <span>Pictures</span>
                                  <span
                                    style={{
                                      background:
                                        picsCount == null || picsCount > 0 ? '#4f46e5' : '#c7d2fe',
                                      color: picsCount == null || picsCount > 0 ? '#fff' : '#4338ca',
                                      borderRadius: 999,
                                      padding: '1px 7px',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {picsCount != null ? `${picsCount}/${picsMax}` : `•/${picsMax}`}
                                  </span>
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                        <td>
                          {pe.notes}
                          {displayStatus === 'Rejected' && l.rejectionNote ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#b91c1c',
                                marginTop: 6,
                                fontWeight: 600,
                                lineHeight: 1.4,
                              }}
                            >
                              {isParty ? 'Business: ' : 'Admin: '}
                              {l.rejectionNote}
                            </div>
                          ) : null}
                          {pe.amountChangeNote && (
                            <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>
                              Amount changed: ₨
                              {Number(pe.amountChangeNote.previousAmount || 0).toLocaleString()} to ₨
                              {Number(pe.amountChangeNote.updatedAmount || 0).toLocaleString()}
                            </div>
                          )}
                          {isAdmin && pendingRevisionIsReal(pe) && (
                            <div
                              style={{
                                fontSize: 11,
                                color: '#0369a1',
                                marginTop: 4,
                                fontWeight: 600,
                              }}
                            >
                              Party revised bill: ₨
                              {Number(pe.pendingRevision.fromAmount || 0).toLocaleString()} → ₨
                              {Number(pe.pendingRevision.toAmount || 0).toLocaleString()} (settle on
                              approval)
                            </div>
                          )}
                          {pe.billRevisionRequest &&
                            String(pe.billRevisionRequest.status || '').toLowerCase() ===
                              'pending' && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: '#92400e',
                                  marginTop: 4,
                                  fontWeight: 600,
                                }}
                              >
                                Bill change request: ₨
                                {Number(pe.billRevisionRequest.fromAmount || 0).toLocaleString()} → ₨
                                {Number(pe.billRevisionRequest.toAmount || 0).toLocaleString()}
                                {pe.billRevisionRequest.reason
                                  ? ` — ${pe.billRevisionRequest.reason}`
                                  : ''}
                              </div>
                            )}
                          {pe.billRevisionRequest &&
                            String(pe.billRevisionRequest.status || '').toLowerCase() ===
                              'rejected' && (
                              <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>
                                Bill change request rejected
                                {pe.billRevisionRequest.rejectionNote
                                  ? `: ${pe.billRevisionRequest.rejectionNote}`
                                  : ''}
                              </div>
                            )}
                        </td>
                        <td>
                          {displayStatus === 'Completed' && isParty ? (
                            (() => {
                              const req = pe.billRevisionRequest;
                              const st = String(req?.status || '').toLowerCase();
                              if (st === 'pending') {
                                return (
                                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                                    Change requested
                                  </span>
                                );
                              }
                              return (
                                <button
                                  onClick={() =>
                                    setRevisionRequest({
                                      lot: l,
                                      newAmount: String(getPartyLedgerBillNumeric(pe) ?? ''),
                                      reason: '',
                                    })
                                  }
                                  style={{
                                    padding: '4px 12px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    background: '#FFF7ED',
                                    color: '#c2410c',
                                    border: '1px solid #FED7AA',
                                    fontFamily: 'Inter, sans-serif',
                                  }}
                                >
                                  {st === 'rejected' ? 'Request again' : 'Request bill change'}
                                </button>
                              );
                            })()
                          ) : displayStatus === 'Pending' && isParty ? (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap',
                                alignItems: 'center',
                              }}
                            >
                              {isAdmin &&
                                pe.billRevisionRequest &&
                                String(pe.billRevisionRequest.status || '').toLowerCase() ===
                                  'pending' && (
                                  <button
                                    onClick={() =>
                                      setRevisionReview({
                                        lot: l,
                                        updateOwnerBill: true,
                                        useCustomOwner: false,
                                        customOwnerAmount: '',
                                        rejectionNote: '',
                                      })
                                    }
                                    style={{
                                      padding: '4px 12px',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      borderRadius: 6,
                                      cursor: 'pointer',
                                      background: '#f59e0b',
                                      color: '#fff',
                                      border: 'none',
                                      fontFamily: 'Inter, sans-serif',
                                    }}
                                  >
                                    Review request
                                  </button>
                                )}
                              <button
                                onClick={() => openEdit(l)}
                                style={{
                                  padding: '4px 12px',
                                  fontSize: 12,
                                  fontWeight: 500,
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  background: '#EFF6FF',
                                  color: '#1e40af',
                                  border: '1px solid #BFDBFE',
                                  fontFamily: 'Inter, sans-serif',
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Tile / Grid View for Desktop & Mobile */
        <div className="tiles-grid">
          {filtered.length === 0 ? (
            <EmptyState message={isParty ? 'No lots found' : 'No assigned lots found'} />
          ) : (
            paginatedLots.map((l) => {
              const pe = ledgerPartyEdits[l.id] || {};
              const displayStatus = getDisplayStatus(l);
              const partyBillOnly = getPartyLedgerBillDisplay(pe);
              const displayComplete = getDisplayCompleteDate(l, pe);

              return (
                <div key={`pl-tile-${l.id}`} className="lot-tile-card">
                  <div className="lot-tile-header">
                    <div>
                      <div className="lot-tile-number">Lot #{l.lotNo || l.lotNumber}</div>
                      {l.designNo ? <div className="lot-tile-design">Design #{l.designNo}</div> : null}
                    </div>
                    <div>
                      {displayStatus === 'Completed' ? (
                        <span className="badge-completed">Completed</span>
                      ) : displayStatus === 'Pending review' ? (
                        <span className="badge-review">{partyFacingStatusLabel('Pending review', isParty)}</span>
                      ) : (
                        <span className="badge-status">{partyFacingStatusLabel(displayStatus, isParty)}</span>
                      )}
                    </div>
                  </div>

                  <div className="lot-tile-body">
                    <div className="lot-tile-chips">
                      <span className="fabric-chip">{l.fabric || l.itemType || 'Lawn'}</span>
                      <span className="info-chip">Colors: {l.colors || 0}</span>
                      <span className="info-chip">Pieces: {l.pieces || 0}</span>
                    </div>

                    <div className="lot-tile-info">
                      {showPartyNameCol && <div>Party: <strong>{getPartyNameLocal(l.partyId, l.partyName)}</strong></div>}
                      {showWorkspaceCol && <div>Workspace: <strong>{workspaceNameForLot(l)}</strong></div>}
                      <div>Allot Date: {formatDisplayDate(l.allotDate)}</div>
                      <div>Complete Date: {displayComplete ? formatDisplayDate(displayComplete) : '—'}</div>
                      {l.description && <div>Note: {l.description}</div>}
                    </div>

                    <div className="lot-tile-bill">
                      <span style={{ fontSize: 13, color: '#64748b' }}>{isParty ? 'Your ledger:' : 'Bill Amount:'}</span>
                      <strong style={{ fontSize: 16, color: '#1e40af' }}>
                        {partyBillOnly == null ? '—' : `₨${partyBillOnly.toLocaleString()}`}
                      </strong>
                    </div>
                  </div>

                  <div className="lot-tile-footer">
                    <LazyReceiptThumb
                      lotId={l.id}
                      receipt={pe.receipt}
                      hasReceipt={pe.hasReceipt}
                      businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                      lotLabel={l.lotNo || l.lotNumber}
                      onOpen={setReceiptPreview}
                      emptyLabel="No bill"
                    />

                    {displayStatus !== 'Completed' && !(displayStatus === 'Pending' && isParty) && (
                      <select
                        className="form-select"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, width: 'auto' }}
                        value={displayStatus === 'Rejected' ? 'Rejected' : displayStatus}
                        onChange={(e) => handleRowStatusChange(l, e.target.value)}
                      >
                        <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
                        <option value="In Progress">{partyFacingStatusLabel('In Progress', isParty)}</option>
                        <option value="Completed">{isParty ? 'Submit for review' : 'Completed'}</option>
                      </select>
                    )}

                    {displayStatus !== 'Completed' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(l, displayStatus)}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Mobile Card List for Party Ledger (shown only in Table View mode) */}
      {viewMode === 'table' && (
        <div className="mobile-only-party-ledger-cards">
          {filtered.length === 0 ? (
            <EmptyState message={isParty ? 'No lots found' : 'No assigned lots found'} />
          ) : (
            paginatedLots.map((l) => {
              const pe = ledgerPartyEdits[l.id] || {};
              const displayStatus = getDisplayStatus(l);
              const partyBillOnly = getPartyLedgerBillDisplay(pe);
              const displayComplete = getDisplayCompleteDate(l, pe);

              return (
                <div key={`pl-mob-${l.id}`} className="party-ledger-mobile-card">
                  <div className="pl-mob-header">
                    <div>
                      <span className="pl-mob-lot-no">Lot #{l.lotNo || l.lotNumber}</span>
                      {l.designNo ? <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}> · Design #{l.designNo}</span> : null}
                    </div>
                    <div>
                      {displayStatus === 'Completed' ? (
                        <span className="badge-completed">Completed</span>
                      ) : displayStatus === 'Pending review' ? (
                        <span className="badge-review">{partyFacingStatusLabel('Pending review', isParty)}</span>
                      ) : (
                        <span className="badge-status">{partyFacingStatusLabel(displayStatus, isParty)}</span>
                      )}
                    </div>
                  </div>

                  <div className="pl-mob-body">
                    <div className="pl-mob-chips">
                      <span className="fabric-chip">{l.fabric || l.itemType || 'Lawn'}</span>
                      <span className="info-chip">Colors: {l.colors || 0}</span>
                      <span className="info-chip">Pieces: {l.pieces || 0}</span>
                    </div>

                    <div className="pl-mob-info">
                      {showPartyNameCol && <div>Party: <strong>{getPartyNameLocal(l.partyId, l.partyName)}</strong></div>}
                      {showWorkspaceCol && <div>Workspace: <strong>{workspaceNameForLot(l)}</strong></div>}
                      <div>Allot Date: {formatDisplayDate(l.allotDate)}</div>
                      <div>Complete Date: {displayComplete ? formatDisplayDate(displayComplete) : '—'}</div>
                      {l.description && <div>Note: {l.description}</div>}
                    </div>

                    <div className="pl-mob-bill-row">
                      <span style={{ fontSize: 13, color: '#64748b' }}>{isParty ? 'Your ledger:' : 'Bill Amount:'}</span>
                      <strong style={{ fontSize: 15, color: '#1e40af' }}>
                        {partyBillOnly == null ? '—' : `₨${partyBillOnly.toLocaleString()}`}
                      </strong>
                    </div>
                  </div>

                  <div className="pl-mob-footer">
                    <LazyReceiptThumb
                      lotId={l.id}
                      receipt={pe.receipt}
                      hasReceipt={pe.hasReceipt}
                      businessOwnerId={normalizedBusinessOwnerId(l.businessOwnerId)}
                      lotLabel={l.lotNo || l.lotNumber}
                      onOpen={setReceiptPreview}
                      emptyLabel="No bill"
                    />

                    {displayStatus !== 'Completed' && !(displayStatus === 'Pending' && isParty) && (
                      <select
                        className="form-select"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, width: 'auto' }}
                        value={displayStatus === 'Rejected' ? 'Rejected' : displayStatus}
                        onChange={(e) => handleRowStatusChange(l, e.target.value)}
                      >
                        <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
                        <option value="In Progress">{partyFacingStatusLabel('In Progress', isParty)}</option>
                        <option value="Completed">{isParty ? 'Submit for review' : 'Completed'}</option>
                      </select>
                    )}

                    {displayStatus !== 'Completed' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEdit(l, displayStatus)}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
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

      {/* Edit Modal */}
      {editingId && editingLot && (
        <Modal
          title={`Edit — ${editingLot.lotNo || editingLot.lotNumber} / ${editingLot.designNo}`}
          onClose={() => {
            if (!ledgerSaving) {
              setEditingId(null);
              setLedgerEditKind(null);
              setLedgerFormErrors({});
            }
          }}
          onFormSubmit={() => {
            void handleSave();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditingId(null);
                  setLedgerEditKind(null);
                  setLedgerFormErrors({});
                }}
                disabled={ledgerSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={ledgerSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {ledgerSaving ? (
                  <>
                    <Loader /> Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </>
          }
        >
          {/* Read-only info */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Lot Info (read-only)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '6px 16px',
                fontSize: 13,
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Description: </span>
                {editingLot.description}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Fabric: </span>
                {editingLot.fabric || editingLot.itemType}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Colors: </span>
                {editingLot.colors}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Pieces: </span>
                {editingLot.pieces}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>
                  {isParty ? 'Business order status: ' : 'Ghausia Status: '}
                </span>
                <StatusBadge
                  status={toTitleCase(editingLot.status)}
                  label={isParty ? partyFacingLotStatusLabel(editingLot.status) : undefined}
                />
              </div>
            </div>
          </div>

          <div className="grid-2">
            {!isParty && (
              <FormGroup
                label={
                  ledgerEditKind === 'pendingReview' || editForm.status === 'Completed'
                    ? 'Party Name *'
                    : 'Party Name'
                }
              >
                <select
                  className="form-select"
                  value={editForm.partyId}
                  onChange={(e) => {
                    const sel = parties.find((p) => samePartyId(p.id, e.target.value));
                    setEditForm((f) => ({
                      ...f,
                      partyId: e.target.value,
                      partyName: sel?.name || '',
                    }));
                    if (ledgerFormErrors.partyId)
                      setLedgerFormErrors((e2) => ({ ...e2, partyId: '' }));
                  }}
                >
                  <option value="">— Select Party —</option>
                  {parties.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {ledgerFormErrors.partyId && (
                  <span style={{ color: '#dc2626', fontSize: 11 }}>{ledgerFormErrors.partyId}</span>
                )}
              </FormGroup>
            )}
            <FormGroup label="Allot Date">
              <input
                className="form-input"
                type="date"
                value={editForm.allotDate}
                onChange={(e) => setEditForm((f) => ({ ...f, allotDate: e.target.value }))}
              />
            </FormGroup>
            <FormGroup label="Status">
              {ledgerEditKind === 'pendingReview' ? (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#92400e',
                    padding: '8px 10px',
                    background: '#FEF3C7',
                    borderRadius: 8,
                    border: '1px solid #FCD34D',
                  }}
                >
                  Pending business review — you can update bill, receipt, and dates; the lot stays
                  under review until approved.
                </div>
              ) : (
                <select
                  className="form-select"
                  value={editForm.status}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEditForm((f) => ({
                      ...f,
                      status: next,
                      ...(next !== 'Completed' ? { completeDate: '' } : {}),
                    }));
                    setLedgerFormErrors({});
                  }}
                >
                  {!(isParty && editingLot && getDisplayStatus(editingLot) === 'In Progress') ? (
                    <option value="Pending">{partyFacingStatusLabel('Pending', isParty)}</option>
                  ) : null}
                  {isParty &&
                  editingLot &&
                  adminLotNotDispatched(editingLot) &&
                  editForm.status === 'In Progress' ? (
                    <option value="In Progress">
                      {partyFacingStatusLabel('In Progress', isParty)}
                    </option>
                  ) : null}
                  {!(isParty && editingLot && adminLotNotDispatched(editingLot)) ? (
                    <option value="In Progress">
                      {partyFacingStatusLabel('In Progress', isParty)}
                    </option>
                  ) : null}
                  <option value="Completed">{isParty ? 'Submit for review' : 'Completed'}</option>
                </select>
              )}
            </FormGroup>
            {(editForm.status === 'Completed' || ledgerEditKind === 'pendingReview') && (
              <FormGroup label="Complete Date *">
                <input
                  className="form-input"
                  type="date"
                  value={editForm.completeDate}
                  onChange={(e) => {
                    setEditForm((f) => ({
                      ...f,
                      completeDate: e.target.value,
                    }));
                    if (ledgerFormErrors.completeDate)
                      setLedgerFormErrors((e2) => ({
                        ...e2,
                        completeDate: '',
                      }));
                  }}
                />
                {ledgerFormErrors.completeDate && (
                  <span style={{ color: '#dc2626', fontSize: 11 }}>
                    {ledgerFormErrors.completeDate}
                  </span>
                )}
              </FormGroup>
            )}
            <FormGroup label={isParty ? 'Your ledger amount (₨)' : 'Bill Amount (₨)'}>
              <input
                className="form-input"
                type="number"
                value={editForm.billAmount}
                onChange={(e) => setEditForm((f) => ({ ...f, billAmount: e.target.value }))}
                placeholder="0"
              />
            </FormGroup>
          </div>

          <FormGroup label="Upload Bill Receipt (image or PDF)">
            <input
              className="form-input"
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) {
                  setEditForm((f) => ({ ...f, receipt: '' }));
                  return;
                }
                try {
                  const stored = await readReceiptAsStoredValue(file);
                  const cropped = await finalizeLedgerReceiptStoredValue(stored);
                  setEditForm((f) => ({ ...f, receipt: cropped }));
                } catch (err) {
                  await Swal.fire({
                    icon: 'error',
                    title: 'Could not process file',
                    text: err?.message || 'Try a smaller JPG/PNG. PDFs must be under a few MB.',
                  });
                  setEditForm((f) => ({ ...f, receipt: '' }));
                }
              }}
            />
            {editForm.receipt && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                {receiptPreviewKind(editForm.receipt) === 'image' && (
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                      lineHeight: 0,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: 0, border: 'none' }}
                      onClick={() =>
                        setReceiptPreview({
                          kind: 'image',
                          src: editForm.receipt,
                          title: editingLot?.lotNo || editingLot?.lotNumber,
                        })
                      }
                    >
                      <img
                        src={editForm.receipt}
                        alt=""
                        style={{
                          width: 56,
                          height: 56,
                          objectFit: 'cover',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          display: 'block',
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label="Remove receipt"
                      title="Remove receipt"
                      onClick={() => setEditForm((f) => ({ ...f, receipt: '' }))}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 24,
                        height: 24,
                        minWidth: 24,
                        minHeight: 24,
                        padding: 0,
                        borderRadius: '50%',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        lineHeight: 1,
                        boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {receiptPreviewKind(editForm.receipt) === 'pdf' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        setReceiptPreview({
                          kind: 'pdf',
                          src: editForm.receipt,
                          title: editingLot?.lotNo || editingLot?.lotNumber,
                        })
                      }
                    >
                      Preview PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label="Remove receipt"
                      title="Remove receipt"
                      onClick={() => setEditForm((f) => ({ ...f, receipt: '' }))}
                      style={{
                        width: 28,
                        height: 28,
                        minWidth: 28,
                        padding: 0,
                        borderRadius: '50%',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: 18,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                <span style={{ fontSize: 12, color: '#15803d' }}>
                  {receiptPreviewKind(editForm.receipt) === 'filename'
                    ? `📎 ${editForm.receipt}`
                    : receiptPreviewKind(editForm.receipt) === 'pdf'
                      ? 'PDF attached — preview or remove beside'
                      : 'Receipt attached — click thumbnail to enlarge'}
                </span>
                {receiptPreviewKind(editForm.receipt) === 'filename' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Remove receipt"
                    title="Remove receipt"
                    onClick={() => setEditForm((f) => ({ ...f, receipt: '' }))}
                    style={{
                      width: 28,
                      height: 28,
                      minWidth: 28,
                      padding: 0,
                      borderRadius: '50%',
                      border: '1px solid #e2e8f0',
                      color: '#64748b',
                      fontSize: 18,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}
          </FormGroup>
          <FormGroup label="Notes">
            <textarea
              className="form-textarea"
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes..."
              style={{ resize: 'vertical' }}
            />
          </FormGroup>

          {ledgerEditKind === 'pendingReview' && (
            <div className="alert alert-warning">
              <strong>Note:</strong>{' '}
              {isParty
                ? 'Saving updates your submission while it is still under business review. If you change your ledger amount, the business will see the old and new figures when they reconcile.'
                : 'Saving updates this submission while it is under review. If you change the bill amount, the admin will see the old and new figures and can choose how the owner business bill should follow when they approve.'}
            </div>
          )}
          {editForm.status === 'Completed' && ledgerEditKind !== 'pendingReview' && (
            <div className="alert alert-warning">
              <strong>Note:</strong>{' '}
              {isParty
                ? 'Submitting completes your ledger entry and sends this lot for business review. Once approved it shows as Delivered. If rejected, you will see the business feedback on this row.'
                : "Submitting completes the ledger entry and sends this lot to the admin for approval. Once approved it becomes billable to the owner (Received back). If rejected, you will see the admin's feedback on this row."}
            </div>
          )}
        </Modal>
      )}

      {picsLot && (
        <Modal
          title={`Pictures — ${picsLot.lotNo || picsLot.lotNumber}${picsLot.designNo ? ` / ${picsLot.designNo}` : ''}`}
          onClose={() => {
            if (!picsSaving) {
              setPicsLot(null);
              setPicsImages([]);
            }
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPicsLot(null);
                  setPicsImages([]);
                }}
                disabled={picsSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void saveLotPictures()}
                disabled={picsSaving || picsLoading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {picsSaving ? (
                  <>
                    <Loader /> Saving…
                  </>
                ) : (
                  'Save Pictures'
                )}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
            This lot has <strong>{lotPicturesMax(picsLot)}</strong> color
            {lotPicturesMax(picsLot) === 1 ? '' : 's'} — add up to{' '}
            <strong>{lotPicturesMax(picsLot)}</strong> picture
            {lotPicturesMax(picsLot) === 1 ? '' : 's'} (one per color). You and the business can add
            or remove pictures here.
          </p>
          {picsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
              <Loader /> Loading pictures…
            </div>
          ) : (
            <ImageUploader
              value={picsImages}
              onChange={setPicsImages}
              max={lotPicturesMax(picsLot)}
              disabled={picsSaving}
              addLabel="Add picture"
              thumbSize={80}
            />
          )}
        </Modal>
      )}

      {receiptPreview && (
        <Modal
          title={receiptPreview.title ? `Receipt — ${receiptPreview.title}` : 'Receipt'}
          wide
          onClose={() => setReceiptPreview(null)}
        >
          {receiptPreview.kind === 'image' && (
            <img
              src={receiptPreview.src}
              alt="Receipt"
              style={{
                maxWidth: '100%',
                maxHeight: '78vh',
                width: 'auto',
                height: 'auto',
                display: 'block',
                margin: '0 auto',
                borderRadius: 8,
              }}
            />
          )}
          {receiptPreview.kind === 'pdf' && (
            <iframe
              title="Receipt PDF"
              src={receiptPreview.src}
              style={{
                width: '100%',
                height: '78vh',
                border: 'none',
                borderRadius: 8,
                background: '#f9fafb',
              }}
            />
          )}
          {receiptPreview.kind === 'url' && (
            <img
              src={receiptPreview.src}
              alt="Receipt"
              style={{
                maxWidth: '100%',
                maxHeight: '78vh',
                display: 'block',
                margin: '0 auto',
                borderRadius: 8,
              }}
            />
          )}
          {receiptPreview.kind === 'filename' && (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: 14,
              }}
            >
              <p style={{ margin: '0 0 12px' }}>No image preview for filename-only receipts.</p>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {receiptPreview.name}
              </p>
              <p style={{ margin: '16px 0 0', fontSize: 13 }}>
                Edit this lot and upload an image or PDF again to store a preview.
              </p>
            </div>
          )}
        </Modal>
      )}

      {/* Party: request a bill change on a completed lot */}
      {revisionRequest && (
        <Modal
          title={`Request bill change — ${revisionRequest.lot.lotNo || revisionRequest.lot.lotNumber}`}
          onClose={() => {
            if (!revisionSaving) setRevisionRequest(null);
          }}
          onFormSubmit={() => {
            void submitRevisionRequest();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={revisionSaving}
                onClick={() => setRevisionRequest(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={revisionSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {revisionSaving ? (
                  <>
                    <Loader /> Sending…
                  </>
                ) : (
                  'Send request'
                )}
              </button>
            </>
          }
        >
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            This lot is complete. You are requesting a new bill amount from the business — the
            amount updates <strong>only when approved</strong>.
          </div>
          <FormGroup label="Current ledger amount (₨)">
            <input
              className="form-input"
              value={`₨${Number(
                getPartyLedgerBillNumeric(ledgerPartyEdits[revisionRequest.lot.id] || {}) || 0
              ).toLocaleString()}`}
              disabled
            />
          </FormGroup>
          <FormGroup label="New amount (₨) *">
            <input
              className="form-input"
              type="number"
              value={revisionRequest.newAmount}
              onChange={(e) => setRevisionRequest((r) => ({ ...r, newAmount: e.target.value }))}
              placeholder="0"
            />
          </FormGroup>
          <FormGroup label="Reason *">
            <textarea
              className="form-textarea"
              rows={3}
              value={revisionRequest.reason}
              onChange={(e) => setRevisionRequest((r) => ({ ...r, reason: e.target.value }))}
              placeholder="Reason for bill change..."
              style={{ resize: 'vertical' }}
            />
          </FormGroup>
        </Modal>
      )}

      {/* Admin: review + approve/reject a party's bill change request */}
      {revisionReview &&
        (() => {
          const lot = revisionReview.lot;
          const pe = ledgerPartyEdits[lot.id] || {};
          const req = pe.billRevisionRequest || {};
          const fromA = Number(req.fromAmount) || 0;
          const toA = Number(req.toAmount) || 0;
          const ownerBill = Number(lot.billAmount) || 0;
          const settled = ownerSettlementForLot(lot).length > 0;
          const newOwner = revisionReview.updateOwnerBill
            ? revisionReview.useCustomOwner && revisionReview.customOwnerAmount !== ''
              ? Number(revisionReview.customOwnerAmount) || 0
              : toA
            : ownerBill;
          const delta = newOwner - ownerBill;
          return (
            <Modal
              title={`Bill change request — ${lot.lotNo || lot.lotNumber}`}
              onClose={() => {
                if (!revisionReviewSaving) setRevisionReview(null);
              }}
              footer={
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                    disabled={revisionReviewSaving}
                    onClick={() => void rejectRevision()}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={revisionReviewSaving}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    onClick={() => void approveRevision()}
                  >
                    {revisionReviewSaving ? (
                      <>
                        <Loader /> Saving…
                      </>
                    ) : (
                      'Approve & apply'
                    )}
                  </button>
                </>
              }
            >
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  marginBottom: 16,
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Party: </span>
                  {getPartyNameLocal(lot.partyId, lot.partyName)}
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Party ledger change: </span>
                  <strong>
                    ₨{fromA.toLocaleString()} → ₨{toA.toLocaleString()}
                  </strong>{' '}
                  <span
                    style={{
                      color: delta === 0 ? '#64748b' : toA - fromA >= 0 ? '#0f766e' : '#dc2626',
                    }}
                  >
                    ({toA - fromA >= 0 ? '+' : '−'}₨{Math.abs(toA - fromA).toLocaleString()})
                  </span>
                </div>
                {req.reason ? (
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Reason: </span>
                    {req.reason}
                  </div>
                ) : null}
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Current owner (Ghausia) bill: </span>
                  ₨{ownerBill.toLocaleString()}
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Settlement: </span>
                  {settled ? (
                    <span style={{ color: '#92400e', fontWeight: 600 }}>
                      Payment settled for this lot
                    </span>
                  ) : (
                    <span style={{ color: '#64748b' }}>No settlement payment</span>
                  )}
                </div>
              </div>

              <FormGroup label="Owner bill handling">
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 13,
                    marginBottom: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={revisionReview.updateOwnerBill}
                    onChange={(e) =>
                      setRevisionReview((r) => ({ ...r, updateOwnerBill: e.target.checked }))
                    }
                  />
                  Also update owner bill
                </label>
                {revisionReview.updateOwnerBill && (
                  <>
                    <label
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        fontSize: 13,
                        marginBottom: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={revisionReview.useCustomOwner}
                        onChange={(e) =>
                          setRevisionReview((r) => ({ ...r, useCustomOwner: e.target.checked }))
                        }
                      />
                      Use custom owner amount (otherwise party amount applies)
                    </label>
                    {revisionReview.useCustomOwner && (
                      <input
                        className="form-input"
                        type="number"
                        value={revisionReview.customOwnerAmount}
                        onChange={(e) =>
                          setRevisionReview((r) => ({ ...r, customOwnerAmount: e.target.value }))
                        }
                        placeholder="Custom owner bill (₨)"
                      />
                    )}
                  </>
                )}
              </FormGroup>

              <div
                style={{
                  background: revisionReview.updateOwnerBill ? '#eff6ff' : '#f8fafc',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  fontSize: 12.5,
                  color: '#334155',
                  lineHeight: 1.6,
                }}
              >
                <div>
                  New owner bill: <strong>₨{Number(newOwner).toLocaleString()}</strong>
                  {revisionReview.updateOwnerBill ? (
                    <span
                      style={{ color: delta === 0 ? '#64748b' : delta > 0 ? '#0f766e' : '#dc2626' }}
                    >
                      {' '}
                      ({delta >= 0 ? '+' : '−'}₨{Math.abs(delta).toLocaleString()})
                    </span>
                  ) : (
                    <span style={{ color: '#64748b' }}> (unchanged)</span>
                  )}
                </div>
                {revisionReview.updateOwnerBill && settled && delta !== 0 && (
                  <div style={{ marginTop: 6, color: '#92400e', fontWeight: 600 }}>
                    {delta > 0
                      ? `Adjustment: extra Paid → Owner payment of ₨${delta.toLocaleString()} will be recorded.`
                      : `Adjustment: reversing Received ← Owner payment of ₨${Math.abs(delta).toLocaleString()} will be recorded.`}
                  </div>
                )}
              </div>

              <FormGroup label="Rejection reason (Reject only)">
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={revisionReview.rejectionNote}
                  onChange={(e) =>
                    setRevisionReview((r) => ({ ...r, rejectionNote: e.target.value }))
                  }
                  placeholder="Enter reason if rejecting..."
                  style={{ resize: 'vertical' }}
                />
              </FormGroup>
            </Modal>
          );
        })()}
    </div>
  );
}
