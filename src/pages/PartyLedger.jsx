import React, { useState, useMemo, useEffect } from "react";
import Swal from "sweetalert2";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  Modal,
  FormGroup,
  StatusBadge,
  SearchBar,
  EmptyState,
} from "../components/UI";
import Loader from "../components/Loader";
import LoaderDashboard from "../components/LoaderDashboard";
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
} from "../utils/dateFilters";
import {
  getAdminLedgerOrBusinessBill,
  getPartyLedgerBillDisplay,
  getPartyLedgerBillNumeric,
} from "../utils/partyBillPrivacy";
import {
  normalizedBusinessOwnerId,
  workspaceLabelEmbeddedInLot,
  businessOwnerRegistryMap,
} from "../utils/businessWorkspace";

// From the party's perspective: dispatched = In Progress, received back = Completed
// If party name is unknown, status should be Pending
const toLedgerStatus = (status, partyName) => {
  if (!partyName || !String(partyName).trim()) return "Pending";
  if (!status) return "Pending";
  const s = String(status).trim().toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "completed" || s === "received back") return "Completed";
  return "In Progress";
};

const toTitleCase = (s) =>
  String(s || "")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Party UI label: admin "pending" lot = not yet received by party for work. */
function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  if (displayStatus === "Pending") return "Lot Not Received";
  return displayStatus;
}

function pendingRevisionIsReal(pe) {
  const pr = pe?.pendingRevision;
  if (!pr) return false;
  return Number(pr.fromAmount) !== Number(pr.toAmount);
}

function readReceiptAsStoredValue(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    if (file.type.startsWith("image/") || file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
      return;
    }
    resolve(file.name);
  });
}

/** Smaller JPEG for ledger storage (party bill snaps). */
const LEDGER_BILL_IMG_MAX_BYTES = 320 * 1024;

function approxBytesFromDataUrl(dataUrl) {
  const i = String(dataUrl || "").indexOf(",");
  if (i === -1) return 0;
  const b64 = dataUrl.slice(i + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - pad;
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = dataUrl;
  });
}

async function compressPartyLedgerBillImage(dataUrl, maxBytes = LEDGER_BILL_IMG_MAX_BYTES) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return dataUrl;
  if (approxBytesFromDataUrl(dataUrl) <= maxBytes) return dataUrl;

  let img;
  try {
    img = await dataUrlToImage(dataUrl);
  } catch {
    return dataUrl;
  }

  const mime = "image/jpeg";
  let maxEdge = Math.min(1600, Math.max(img.width, img.height));
  let quality = 0.86;

  const encode = (edge, q) => {
    const long = Math.max(img.width, img.height);
    const scale = Math.min(1, edge / long);
    const tw = Math.max(1, Math.round(img.width * scale));
    const th = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL(mime, q);
  };

  let out = encode(maxEdge, quality);
  for (let i = 0; i < 18 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
    if (quality > 0.35) {
      quality -= 0.06;
      out = encode(maxEdge, quality);
    } else {
      maxEdge = Math.round(maxEdge * 0.82);
      if (maxEdge < 220) break;
      quality = 0.82;
      out = encode(maxEdge, quality);
    }
  }
  return out;
}

async function finalizeLedgerReceiptStoredValue(stored) {
  if (!stored) return "";
  if (/^data:image\//i.test(String(stored))) return compressPartyLedgerBillImage(stored);
  return stored;
}
/** @returns {'image'|'pdf'|'url'|'filename'|'none'} */
function receiptPreviewKind(receipt) {
  const s = String(receipt || "").trim();
  if (!s) return "none";
  if (/^data:image\//i.test(s)) return "image";
  if (/^data:application\/pdf/i.test(s)) return "pdf";
  if (/^https?:\/\//i.test(s)) return "url";
  return "filename";
}

function ReceiptThumbButton({ receipt, lotLabel, onOpen }) {
  const kind = receiptPreviewKind(receipt);
  if (kind === "none") return null;

  const baseBtn = {
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 8,
    lineHeight: 0,
    display: "inline-block",
    verticalAlign: "middle",
  };

  if (kind === "image") {
    return (
      <button
        type="button"
        aria-label="View receipt image"
        title="View receipt"
        style={baseBtn}
        onClick={() => onOpen({ kind: "image", src: receipt, title: lotLabel })}
      >
        <img
          src={receipt}
          alt=""
          style={{
            width: 44,
            height: 44,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "block",
          }}
        />
      </button>
    );
  }

  if (kind === "pdf") {
    return (
      <button
        type="button"
        aria-label="View receipt PDF"
        title="View receipt PDF"
        style={{
          ...baseBtn,
          padding: 6,
          background: "#FEF2F2",
          border: "1px solid #FECACA",
        }}
        onClick={() => onOpen({ kind: "pdf", src: receipt, title: lotLabel })}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="#b91c1c"
            strokeWidth="1.5"
          />
          <polyline
            points="14 2 14 8 20 8"
            stroke="#b91c1c"
            strokeWidth="1.5"
          />
          <path
            d="M9 13h6M9 17h4"
            stroke="#b91c1c"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    );
  }

  if (kind === "url") {
    return (
      <button
        type="button"
        aria-label="View receipt"
        title="View receipt"
        style={baseBtn}
        onClick={() => onOpen({ kind: "url", src: receipt, title: lotLabel })}
      >
        <img
          src={receipt}
          alt=""
          style={{
            width: 44,
            height: 44,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid var(--border)",
            display: "block",
            background: "#f3f4f6",
          }}
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Receipt file (no preview)"
      title={receipt}
      style={{
        ...baseBtn,
        padding: "8px 10px",
        background: "#F0FDF4",
        border: "1px solid #BBF7D0",
        borderRadius: 8,
      }}
      onClick={() =>
        onOpen({ kind: "filename", name: receipt, title: lotLabel })
      }
    >
      <span style={{ fontSize: 20 }}>📄</span>
    </button>
  );
}

/** Admin/workspace lot still awaiting dispatch — party must not self-set "In Progress". */
function adminLotNotDispatched(lot) {
  return String(lot?.status || "").toLowerCase().trim() === "pending";
}

export default function PartyLedger() {
  const {
    reportingLots,
    reportingPayments,
    reportingPartyEdits,
    partyCrossLots,
    partyCrossPayments,
    partyCrossPartyEdits,
    updateLot,
    updatePartyEdit,
    parties,
    businessOwners,
    initialDataLoading,
  } = useApp();
  const { isAdmin, isParty, user } = useAuth();

  /** Admin: merged lots/edits/payments across all workspaces; party login: scoped cross-collection rows */
  const ledgerLots = isParty ? partyCrossLots : reportingLots;
  const ledgerPayments = isParty ? partyCrossPayments : reportingPayments;
  const ledgerPartyEdits = isParty ? partyCrossPartyEdits : reportingPartyEdits;
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("All");
  const [partyFilter, setPartyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRange, setDateRange] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [ledgerEditKind, setLedgerEditKind] = useState(null);
  /** null | 'pendingReview' | 'standard' — pending = awaiting admin, party may still edit */
  const [editForm, setEditForm] = useState({});
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerFormErrors, setLedgerFormErrors] = useState({});
  const [receiptPreview, setReceiptPreview] = useState(null);
  /** Party quick-upload bill snapshot to API row */
  const [billPicSavingLotId, setBillPicSavingLotId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  /** Split view: non-completed vs completed (same for admin & party) */
  const [ledgerLotsTab, setLedgerLotsTab] = useState("other");

  /** Business / workspace display label (embedded on lot beats AppContext registry) */
  const workspaceDisplayLookup = useMemo(() => {
    const embedded = new Map();
    for (const l of ledgerLots) {
      const id = normalizedBusinessOwnerId(l.businessOwnerId);
      if (!id || embedded.has(id)) continue;
      const label = workspaceLabelEmbeddedInLot(l);
      if (label) embedded.set(id, label);
    }
    const merged = new Map();
    embedded.forEach((v, k) => merged.set(k, v));
    businessOwnerRegistryMap(businessOwners).forEach((v, k) => {
      if (!merged.has(k)) merged.set(k, v);
    });
    return merged;
  }, [ledgerLots, businessOwners]);

  const workspaceNameForLot = (l) => {
    const id = normalizedBusinessOwnerId(l.businessOwnerId);
    if (!id) return "—";
    const direct = workspaceLabelEmbeddedInLot(l);
    if (direct) return direct;
    const mapped = workspaceDisplayLookup.get(id);
    if (mapped) return mapped;
    return `Workspace ${id.slice(-6)}`;
  };

  const samePartyId = (a, b) =>
    String(a ?? "").trim() === String(b ?? "").trim();

  const lotWorkspaceOpts = (lot) =>
    lot?.businessOwnerId ? { businessOwnerId: lot.businessOwnerId } : {};

  const assignedLots = useMemo(() => {
    const byWorkspace = (l) => {
      if (isParty || !isAdmin) return true;
      if (workspaceFilter === "All") return true;
      return String(l.businessOwnerId ?? "").trim() === String(workspaceFilter).trim();
    };

    return ledgerLots
      .filter(byWorkspace)
      .filter(
        (l) =>
          String(l.partyId || "").trim() || String(l.partyName || "").trim(),
      )
      .filter((lot) =>
        isWithinDateRange(
          latestDateFrom(lot, ["updatedAt", "createdAt", "receivedBackDate", "dispatchDate", "allotDate", "receivedDate"]),
          dateRange,
        ),
      );
  }, [ledgerLots, dateRange, isAdmin, isParty, workspaceFilter]);

  const formatYmd = (value) => {
    if (!value) return "";
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };

  /** Party ledger completion date: party edit override, else Ghausia lot received-back date (syncs to PartyLedger.completeDate on server). */
  const getDisplayCompleteDate = (l, pe) => {
    const ymd = formatYmd(pe.completeDate) || formatYmd(l.receivedBackDate);
    return ymd || null;
  };

  const getDisplayStatus = (l) => {
    const ls = String(l.status || "").trim().toLowerCase();
    if (ls === "pending approval") return "Pending review";
    if (ls === "rejected") return "Rejected";
    const pe = ledgerPartyEdits[l.id] || {};
    // If overrideStatus explicitly set to Completed, honour it
    if (pe.overrideStatus && pe.overrideStatus.toLowerCase() === "completed")
      return "Completed";
    // Otherwise derive from lot status, passing party name to check if known
    const partyNameDisplay = getPartyNameLocal(l.partyId, l.partyName);
    return toLedgerStatus(pe.overrideStatus || l.status, partyNameDisplay !== "—" ? partyNameDisplay : "");
  };

  const getPartyNameLocal = (partyId, fallback) =>
    parties.find((p) => samePartyId(p.id, partyId))?.name || fallback || "—";

  /** Amounts for totals & admin column: party login uses ledger-only; admin uses ledger-or-business. */
  const getLedgerAmountForTotals = (l) => {
    const pe = ledgerPartyEdits[l.id] || {};
    if (isParty) return getPartyLedgerBillNumeric(pe);
    return getAdminLedgerOrBusinessBill(l, pe);
  };

  const filtered = useMemo(() => {
    const list = assignedLots.filter((l) => {
      const q = search.toLowerCase();
      const lotLabel = (l.lotNo || l.lotNumber || "").toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        l.designNo.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q);
      const matchP =
        partyFilter === "All" || samePartyId(l.partyId, partyFilter);
      const displayStatus = getDisplayStatus(l);
      const matchTab =
        ledgerLotsTab === "completed"
          ? displayStatus === "Completed"
          : displayStatus !== "Completed";
      const matchS =
        matchTab &&
        (ledgerLotsTab === "completed" ||
          statusFilter === "All" ||
          displayStatus === statusFilter);
      return matchQ && matchP && matchS;
    });
    return [...list].sort((a, b) =>
      compareRowsByUpdatedNewestFirst(a, b, "lot"),
    );
  }, [
    assignedLots,
    search,
    partyFilter,
    ledgerLotsTab,
    statusFilter,
    ledgerPartyEdits,
  ]);

  /** Same filters as the table but ignoring Other vs Completed tab — summary cards always reflect all matching lots. */
  const lotsForSummaryStats = useMemo(() => {
    return assignedLots.filter((l) => {
      const q = search.toLowerCase();
      const lotLabel = (l.lotNo || l.lotNumber || "").toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        l.designNo.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q);
      const matchP =
        partyFilter === "All" || samePartyId(l.partyId, partyFilter);
      const displayStatus = getDisplayStatus(l);
      const matchS =
        statusFilter === "All" || displayStatus === statusFilter;
      return matchQ && matchP && matchS;
    });
  }, [
    assignedLots,
    search,
    partyFilter,
    statusFilter,
    ledgerPartyEdits,
  ]);

  const otherLotsTabCount = useMemo(
    () =>
      assignedLots.reduce(
        (n, l) => n + (getDisplayStatus(l) !== "Completed" ? 1 : 0),
        0,
      ),
    [assignedLots, ledgerPartyEdits],
  );
  const completedLotsTabCount = useMemo(
    () =>
      assignedLots.reduce(
        (n, l) => n + (getDisplayStatus(l) === "Completed" ? 1 : 0),
        0,
      ),
    [assignedLots, ledgerPartyEdits],
  );
  const showPartyNameCol = !isParty;
  const showWorkspaceCol = (isAdmin && workspaceFilter === "All") || isParty;
  const ledgerTableColSpan = 13 + (showPartyNameCol ? 1 : 0) + (showWorkspaceCol ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedLots = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const savePartyLotReceiptFromFile = async (lot, file) => {
    if (!file || !isParty) return;
    setBillPicSavingLotId(lot.id);
    try {
      const raw = await readReceiptAsStoredValue(file);
      const receipt = await finalizeLedgerReceiptStoredValue(raw);
      await updatePartyEdit(lot.id, { receipt }, lotWorkspaceOpts(lot));
    } catch (e) {
      const msg =
        e?.message ||
        (typeof e === "string" ? e : "Could not save bill photo. Try a smaller JPG.");
      await Swal.fire({
        icon: "error",
        title: "Upload failed",
        text: msg,
      });
    } finally {
      setBillPicSavingLotId(null);
    }
  };

  const removePartyLotReceipt = async (lot) => {
    if (!isParty) return;
    const ok = await Swal.fire({
      icon: "question",
      title: "Delete bill photo?",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });
    if (!ok.isConfirmed) return;
    setBillPicSavingLotId(lot.id);
    try {
      await updatePartyEdit(lot.id, { receipt: "" }, lotWorkspaceOpts(lot));
    } catch (e) {
      await Swal.fire({
        icon: "error",
        title: "Could not remove photo",
        text: e?.message || "Please try again.",
      });
    } finally {
      setBillPicSavingLotId(null);
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
    workspaceFilter,
  ]);

  useEffect(() => {
    if (ledgerLotsTab === "other" && statusFilter === "Completed") {
      setStatusFilter("All");
    }
  }, [ledgerLotsTab, statusFilter]);

  useEffect(() => {
    if (ledgerLotsTab === "completed") {
      setStatusFilter("All");
    }
  }, [ledgerLotsTab]);

  useEffect(() => {
    if (isParty) {
      setPartyFilter("All");
    }
  }, [isParty, user?.partyId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const openEdit = (lot, initialStatus) => {
    const pe = ledgerPartyEdits[lot.id] || {};
    const statusForForm = initialStatus || getDisplayStatus(lot);
    const rowDisplay = getDisplayStatus(lot);
    if (!isAdmin && rowDisplay === "Completed") return;
    const kind = rowDisplay === "Pending review" ? "pendingReview" : "standard";
    setLedgerEditKind(kind);
    const existingComplete =
      formatYmd(pe.completeDate) || formatYmd(lot.receivedBackDate) || "";
    setLedgerFormErrors({});
    const peOpen = ledgerPartyEdits[lot.id] || {};
    const initialBill = isParty
      ? peOpen.partyBillAmount != null && peOpen.partyBillAmount !== ""
        ? String(peOpen.partyBillAmount)
        : ""
      : String(getAdminLedgerOrBusinessBill(lot, peOpen) || "");

    setEditForm({
      allotDate: lot.allotDate || "",
      completeDate:
        existingComplete ||
        (statusForForm === "Completed"
          ? new Date().toISOString().slice(0, 10)
          : ""),
      status: statusForForm,
      billAmount: initialBill,
      receipt: pe.receipt || "",
      notes: pe.notes || "",
      partyId:
        lot.partyId != null && lot.partyId !== "" ? String(lot.partyId) : "",
      partyName: getPartyNameLocal(lot.partyId, lot.partyName),
    });
    setEditingId(lot.id);
  };

  const handleSave = async () => {
    const lot = ledgerLots.find((l) => l.id === editingId);
    if (!lot) return;

    if (ledgerEditKind === "pendingReview") {
      const err = {};
      if (!String(editForm.partyId || "").trim()) {
        err.partyId = "Party is required.";
      }
      if (!String(editForm.completeDate || "").trim()) {
        err.completeDate = "Complete date is required.";
      }
      if (Object.keys(err).length > 0) {
        setLedgerFormErrors(err);
        return;
      }
      setLedgerFormErrors({});
      setLedgerSaving(true);
      try {
        const partyChanged =
          String(editForm.partyId || "").trim() !== "" &&
          !samePartyId(editForm.partyId, lot.partyId);
        const prevPe = ledgerPartyEdits[lot.id] || {};
        const previousLedgerAmount = isParty
          ? getPartyLedgerBillNumeric(prevPe)
          : getAdminLedgerOrBusinessBill(lot, prevPe);
        const nextLedgerAmount = Number(editForm.billAmount) || 0;
        const ghausiaAmount = Number(lot.billAmount || 0);
        let pendingRevisionPayload = null;

        if (previousLedgerAmount !== nextLedgerAmount) {
          const diff = nextLedgerAmount - previousLedgerAmount;
          const businessLine = !isParty
            ? `<div><strong>Business / owner bill on lot:</strong> ₨${ghausiaAmount.toLocaleString()}</div>`
            : "";
          const footnote = isParty
            ? `<div style="margin-top:10px;color:#92400e">This lot stays <strong>under admin review</strong>. The admin reconciles your ledger with the business separately — you do not see the business-side bill.</div>`
            : `<div style="margin-top:10px;color:#92400e">This lot stays <strong>under admin review</strong>. If the owner was already billed for this lot, the admin will choose how to update the business bill when approving.</div>`;
          const result = await Swal.fire({
            title: "Party bill amount change",
            icon: "question",
            html: `
            <div style="text-align:left;font-size:14px;line-height:1.6">
              <div><strong>Party ledger (old):</strong> ₨${previousLedgerAmount.toLocaleString()}</div>
              <div><strong>Party ledger (new):</strong> ₨${nextLedgerAmount.toLocaleString()}</div>
              <div><strong>Difference:</strong> ₨${diff.toLocaleString()}</div>
              ${businessLine}
              ${footnote}
            </div>
          `,
            showCancelButton: true,
            confirmButtonText: "Save & keep in review",
            cancelButtonText: "Cancel",
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

        await updatePartyEdit(
          editingId,
          {
            completeDate:
              editForm.completeDate || new Date().toISOString().slice(0, 10),
            partyBillAmount: nextLedgerAmount,
            receipt: editForm.receipt,
            notes: editForm.notes,
            overrideStatus: "Pending Approval",
            pendingRevision: pendingRevisionPayload,
          },
          lotWorkspaceOpts(lot),
        );

        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          await updateLot(
            editingId,
            {
              partyId: editForm.partyId,
              partyName: sel?.name || editForm.partyName,
            },
            lotWorkspaceOpts(lot),
          );
        }

        setEditingId(null);
        setLedgerEditKind(null);
      } catch (e) {
        const msg =
          e?.message ||
          (typeof e === "string" ? e : "Save failed. Please try again.");
        await Swal.fire({
          icon: "error",
          title: "Could not save",
          text: msg,
        });
      } finally {
        setLedgerSaving(false);
      }
      return;
    }

    if (editForm.status === "Completed") {
      const err = {};
      if (!String(editForm.partyId || "").trim())
        err.partyId = "Party is required when status is Completed.";
      if (!String(editForm.completeDate || "").trim())
        err.completeDate =
          "Complete date is required when status is Completed.";
      if (Object.keys(err).length > 0) {
        setLedgerFormErrors(err);
        return;
      }
    }
    setLedgerFormErrors({});

    setLedgerSaving(true);
    try {
      const partyChanged =
        String(editForm.partyId || "").trim() !== "" &&
        !samePartyId(editForm.partyId, lot.partyId);

      const prevPeStd = ledgerPartyEdits[lot.id] || {};
      const previousLedgerAmount = getAdminLedgerOrBusinessBill(lot, prevPeStd);
      const nextLedgerAmount = Number(editForm.billAmount) || 0;
      const completedAmountChanged =
        getDisplayStatus(lot) === "Completed" &&
        previousLedgerAmount !== nextLedgerAmount;
      let amountChangeNote = null;

      if (completedAmountChanged) {
        if (!isAdmin) return;
        const ghausiaAmount = Number(lot.billAmount || 0);
        const difference = nextLedgerAmount - previousLedgerAmount;
        const result = await Swal.fire({
          title: "Confirm completed lot amount change",
          icon: "warning",
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
          confirmButtonText: "Save amount note",
          cancelButtonText: "Cancel",
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

      if (editForm.status === "Completed") {
        await updatePartyEdit(editingId, {
          completeDate:
            editForm.completeDate || new Date().toISOString().slice(0, 10),
          partyBillAmount: Number(editForm.billAmount) || 0,
          receipt: editForm.receipt,
          notes: editForm.notes,
          overrideStatus: "Pending Approval",
          ...(amountChangeNote ? { amountChangeNote } : {}),
        }, lotWorkspaceOpts(lot));
        const lotUpdates = {
          status: "pending approval",
          receivedBackDate:
            editForm.completeDate || new Date().toISOString().slice(0, 10),
        };
        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          lotUpdates.partyId = editForm.partyId;
          lotUpdates.partyName = sel?.name || editForm.partyName;
        }
        await updateLot(editingId, lotUpdates, lotWorkspaceOpts(lot));
      } else {
        if (
          isParty &&
          getDisplayStatus(lot) === "In Progress" &&
          editForm.status === "Pending"
        ) {
          await Swal.fire({
            icon: "info",
            title: "Not available",
            text: "From In Progress you can only submit for admin approval. You cannot save as not received.",
          });
          return;
        }
        if (isParty && adminLotNotDispatched(lot) && editForm.status === "In Progress") {
          await Swal.fire({
            icon: "info",
            title: "Not available",
            text: "You cannot save In Progress until the business has dispatched this lot.",
          });
          return;
        }
        const nextOverrideStatus = editForm.status === "Pending" ? "Pending" : "In Progress";
        await updatePartyEdit(editingId, {
          completeDate: editForm.completeDate || null,
          partyBillAmount: Number(editForm.billAmount) || 0,
          receipt: editForm.receipt,
          notes: editForm.notes,
          overrideStatus: nextOverrideStatus,
        }, lotWorkspaceOpts(lot));
        const lotUpdates = {};
        const lowerStatus = (lot.status || "").toLowerCase();
        if (editForm.status === "Pending") {
          if (lowerStatus !== "pending") {
            lotUpdates.status = "pending";
            lotUpdates.dispatchDate = "";
          }
        } else if (lowerStatus !== "dispatched") {
            lotUpdates.status = "dispatched";
            lotUpdates.dispatchDate =
              lot.dispatchDate || new Date().toISOString().slice(0, 10);
        }
        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          lotUpdates.partyId = editForm.partyId;
          lotUpdates.partyName = sel?.name || editForm.partyName;
        }
        if (Object.keys(lotUpdates).length > 0) {
          await updateLot(editingId, lotUpdates, lotWorkspaceOpts(lot));
        }
      }

      setEditingId(null);
      setLedgerEditKind(null);
    } catch (e) {
      const msg =
        e?.message ||
        (typeof e === "string" ? e : "Save failed. Please try again.");
      await Swal.fire({
        icon: "error",
        title: "Could not save",
        text: msg,
      });
    } finally {
      setLedgerSaving(false);
    }
  };

  const totals = useMemo(() => {
    let completedAmount = 0;
    let inProgressAmount = 0;

    lotsForSummaryStats.forEach((l) => {
      const status = getDisplayStatus(l);
      const bill = getLedgerAmountForTotals(l);

      if (status === "Completed") {
        completedAmount += bill;
      } else if (status === "Pending") {
        inProgressAmount += 0;
      } else {
        inProgressAmount += bill;
      }
    });

    return {
      lots: lotsForSummaryStats.length,
      billTotal: lotsForSummaryStats.reduce((s, l) => s + getLedgerAmountForTotals(l), 0),
      completed: lotsForSummaryStats.filter((l) => getDisplayStatus(l) === "Completed")
        .length,
      pending: lotsForSummaryStats.filter((l) => getDisplayStatus(l) === "Pending")
        .length,
      inProgress: lotsForSummaryStats.filter((l) => getDisplayStatus(l) === "In Progress")
        .length,
      completedAmount,
      inProgressAmount,
      withReceipt: lotsForSummaryStats.filter((l) => ledgerPartyEdits[l.id]?.receipt).length,
    };
  }, [lotsForSummaryStats, ledgerPartyEdits, isParty]);

  const partyBalanceInfo = useMemo(() => {
    const withinWorkspace = (p) => {
      if (!isAdmin || workspaceFilter === "All") return true;
      return String(p.businessOwnerId ?? "").trim() === String(workspaceFilter).trim();
    };
    const paysDateScoped = ledgerPayments.filter(
      (p) => p.type === "Paid" && isWithinDateRange(p.updatedAt || p.date, dateRange),
    );
    const pays = paysDateScoped.filter(withinWorkspace);
    const receivedDateScoped = ledgerPayments.filter(
      (p) => p.type === "Received" && isWithinDateRange(p.updatedAt || p.date, dateRange),
    );
    const receiveds = receivedDateScoped.filter(withinWorkspace);

    if (partyFilter === "All") {
      const names = [
        ...new Set(
          lotsForSummaryStats
            .map((l) => getPartyNameLocal(l.partyId, l.partyName).trim())
            .filter((n) => n && n !== "—"),
        ),
      ];

      let balance = 0;
      let receivedFromBusiness = 0;
      let paidToBusiness = 0;

      names.forEach((name) => {
        const billSum = lotsForSummaryStats
          .filter(
            (l) => getPartyNameLocal(l.partyId, l.partyName).trim() === name,
          )
          .reduce((s, l) => s + getLedgerAmountForTotals(l), 0);

        const partyIn = pays
          .filter((p) => String(p.party || "").trim() === name)
          .reduce((s, p) => s + Number(p.amount || 0), 0);
        const partyOut = receiveds
          .filter((p) => String(p.party || "").trim() === name)
          .reduce((s, p) => s + Number(p.amount || 0), 0);

        receivedFromBusiness += partyIn;
        paidToBusiness += partyOut;
        balance += billSum - partyIn + partyOut;
      });

      return {
        balance,
        receivedFromBusiness,
        paidToBusiness,
        completedNet:
          totals.completedAmount - receivedFromBusiness + paidToBusiness,
        hint:
          workspaceFilter === "All"
            ? (isParty
              ? "All lots in scope (all tabs) — amounts you agreed on the ledger."
              : "Totals for all parties in the filtered workspaces.")
            : (isParty
              ? "All lots in this workspace (all tabs)."
              : "Totals for all parties in this workspace."),
      };
    }

    const party = parties.find((p) => samePartyId(p.id, partyFilter));
    const pname = (party?.name || "").trim();

    const receivedFromBusiness = pays
      .filter((p) => String(p.party || "").trim() === pname)
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const paidToBusiness = receiveds
      .filter((p) => String(p.party || "").trim() === pname)
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    return {
      balance: totals.billTotal - receivedFromBusiness + paidToBusiness,
      receivedFromBusiness,
      paidToBusiness,
      completedNet:
        totals.completedAmount - receivedFromBusiness + paidToBusiness,
      hint: pname
        ? (isParty
          ? `${pname} — ledger balance (all lots in this view, all tabs).`
          : `${pname}'s balance (bill − paid to party + received from party)`)
        : "Bill value minus paid to party plus received from party",
    };
  }, [
    partyFilter,
    lotsForSummaryStats,
    ledgerPayments,
    parties,
    totals.billTotal,
    totals.completedAmount,
    dateRange,
    isAdmin,
    workspaceFilter,
    isParty,
  ]);
  const handleRowStatusChange = async (lot, newStatus) => {
    if (newStatus === "Completed") {
      openEdit(lot, "Completed");
      return;
    }
    if (isParty && getDisplayStatus(lot) === "In Progress") {
      if (newStatus === "In Progress") return;
      await Swal.fire({
        icon: "info",
        title: "Not available",
        text: "From In Progress you can only submit this lot for admin approval. You cannot move it back to not received.",
      });
      return;
    }
    if (isParty && adminLotNotDispatched(lot) && newStatus === "In Progress") {
      await Swal.fire({
        icon: "info",
        title: "Not available",
        text: "You cannot set this to In Progress until the business dispatches the lot to you. Your status will move forward when dispatch happens on the business side.",
      });
      return;
    }
    if (newStatus === "Pending") {
      await updatePartyEdit(lot.id, { overrideStatus: "Pending", completeDate: "" }, lotWorkspaceOpts(lot));
      if ((lot.status || "").toLowerCase() !== "pending") {
        await updateLot(lot.id, { status: "pending", dispatchDate: "" }, lotWorkspaceOpts(lot));
      }
      return;
    }
    await updatePartyEdit(lot.id, { overrideStatus: "In Progress" }, lotWorkspaceOpts(lot));
    const lowerStatus = (lot.status || "").toLowerCase();
    if (lowerStatus !== "dispatched") {
      await updateLot(lot.id, {
        status: "dispatched",
        dispatchDate: new Date().toISOString().slice(0, 10),
      }, lotWorkspaceOpts(lot));
    }
  };

  const editingLot = ledgerLots.find((l) => l.id === editingId);

  if (initialDataLoading) {
    return (
      <div
        style={{
          textAlign: "center",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
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
          <div className="page-title">Party Ledger</div>
          <div className="page-subtitle">
            {isAdmin
              ? "All workspaces by default — filter by party, workspace, dates, and status"
              : "All lots assigned to parties — editable completion details"}
          </div>
        </div>
      </div>
      {/* {console.log(totals, 'totals')} */}

      {/* Summary */}
      <div className="pl-grid">
        {[
          {
            key: "assigned",
            label: "Assigned Lots",
            value: totals.lots,
            color: "#1e40af",
          },
          {
            key: "bill",
            label: isParty ? "Your ledger total" : "Total Bill Value",
            value: `₨${totals.billTotal.toLocaleString()}`,
            color: "#7c3aed",
          },
          {
            key: "completed",
            label: (
              <>
                Completed{" "}
                <strong style={{ fontSize: 14, color: "#15803d" }}>
                  ({totals.completed})
                </strong>
              </>
            ),
            value: `₨${totals.completedAmount.toLocaleString()}`,
            color: "#15803d",
          },
          {
            key: "pending",
            label: (
              <>
                {isParty ? "Lot not received" : "Pending"}{" "}
                <strong style={{ fontSize: 14, color: "#d97706" }}>
                  ({totals.pending})
                </strong>
              </>
            ),
            value: isParty ? "Business has not dispatched to you" : "Awaiting dispatch",
            color: "#d97706",
          },
          {
            key: "inprogress",
            label: (
              <>
                In Progress{" "}
                <strong style={{ fontSize: 14, color: "#d97706" }}>
                  ({totals.inProgress})
                </strong>
              </>
            ),
            value: `₨${totals.inProgressAmount.toLocaleString()}`,
            color: "#d97706",
          },
          {
            key: "completed-lots-balance",
            label: `Completed lots ${partyBalanceInfo.completedNet >= 0 ? `balance (${isParty ? "receivable" : "payable"})` : "(advance)"}`,
            value: `₨${partyBalanceInfo.completedNet.toLocaleString()}`,
            color: `${partyBalanceInfo.completedNet >= 0 ? "#0f766e" : "#dc2626"}`,
            sub: partyBalanceInfo.hint,
          },
          {
            key: "balance",
            label: `Total Balance ${partyBalanceInfo.balance >= 0 ? `(${isParty ? "receivable" : "payable"})` : "(advance)"}`,
            value: `₨${partyBalanceInfo.balance.toLocaleString()}`,
            color: partyBalanceInfo.balance >= 0 ? "#0f766e" : "#dc2626",
            sub: partyBalanceInfo.hint,
          },
        ].map((c) => (
          <div key={c.key} className="stat-card">
            <div className="stat-label">{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>
              {c.value}
            </div>
            {c.sub && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
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
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          padding: 4,
          background: "var(--surface-2, #f8fafc)",
          borderRadius: 10,
          border: "1px solid var(--border-subtle, #e2e8f0)",
        }}
      >
        {[
          {
            id: "other",
            label: "Other lots",
            count: otherLotsTabCount,
          },
          {
            id: "completed",
            label: "Completed lots",
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
                padding: "10px 16px",
                borderRadius: 8,
                border: active
                  ? "1px solid #15803d"
                  : "1px solid transparent",
                background: active ? "#fff" : "transparent",
                color: active ? "#15803d" : "var(--text-secondary, #64748b)",
                fontWeight: active ? 700 : 600,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
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

      {/* Toolbar */}
      <div className="toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search lot no., design..."
        />
        {isAdmin && (
          <select
            className="form-select"
            style={{ width: 200 }}
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
        <select
          className="form-select"
          style={{ width: 190 }}
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
          disabled={isParty}
        >
          {!isParty && <option value="All">All parties</option>}
          {isParty && <option value="All">All collections</option>}
          {!isParty &&
            parties.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
        </select>
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
        {ledgerLotsTab === "other" && (
          <select
            className="form-select"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Pending">{partyFacingStatusLabel("Pending", isParty)}</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending review">Pending review</option>
            <option value="Rejected">Rejected</option>
          </select>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper">
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
                    {isParty ? "Business" : "Workspace"}
                  </th>
                )}
                <th>Status</th>
                <th style={{ textAlign: "right" }}>
                  {isParty ? "Your ledger (₨)" : "Bill Amount"}
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
                    <EmptyState message="No assigned lots found" />
                  </td>
                </tr>
              ) : (
                paginatedLots.map((l) => {
                  // console.log(l, 'l');
                  const pe = ledgerPartyEdits[l.id] || {};
                  const displayStatus = getDisplayStatus(l);
                  const partyBillOnly = getPartyLedgerBillDisplay(pe);
                  const adminBillDisplay = getAdminLedgerOrBusinessBill(l, pe);
                  const displayComplete = getDisplayCompleteDate(l, pe);
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 700, color: "#1e40af" }}>
                        {l.lotNo || l.lotNumber}
                      </td>
                      <td style={{ fontWeight: 600 }}>{l.designNo}</td>
                      <td>{l.description}</td>
                      <td>
                        <span
                          style={{
                            background: "#F0F9FF",
                            color: "#0369a1",
                            border: "1px solid #BAE6FD",
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 12,
                          }}
                        >
                          {l.fabric || l.itemType}
                        </span>
                      </td>
                      <td>{l.colors}</td>
                      <td>{l.pieces}</td>
                      <td>{l.allotDate}</td>
                      <td style={{ fontWeight: 500 }}>
                        {displayComplete || (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
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
                            color: "var(--text-secondary)",
                          }}
                        >
                          {workspaceNameForLot(l)}
                        </td>
                      )}
                      <td>
                        {displayStatus === "Completed" ? (
                          <span
                            style={{
                              fontSize: 12,
                              color: "green",
                              marginTop: 3,
                              fontWeight: "500",
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "#DCFCE7",
                              border: "1px solid #DCFCE7",
                            }}
                          >
                            Completed
                          </span>
                        ) : displayStatus === "Pending review" ? (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#92400e",
                              marginTop: 3,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "#FEF3C7",
                              border: "1px solid #FCD34D",
                            }}
                          >
                            Pending review
                          </span>
                        ) : displayStatus === "Pending" && isParty ? (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#b45309",
                              marginTop: 3,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "#FEF3C7",
                              border: "1px solid #FCD34D",
                            }}
                          >
                            {partyFacingStatusLabel("Pending", isParty)}
                          </span>
                        ) : (
                          <select
                            className="form-select"
                            style={{
                              width: 150,
                              minWidth: 150,
                              fontSize: 12,
                              padding: "5px 8px",
                            }}
                            value={displayStatus === "Rejected" ? "Rejected" : displayStatus}
                            onChange={(e) =>
                              handleRowStatusChange(l, e.target.value)
                            }
                          >
                            {displayStatus === "Rejected" && (
                              <option
                                value="Rejected"
                                disabled
                                style={{ fontWeight: 600, color: "#b91c1c" }}
                              >
                                Rejected
                              </option>
                            )}
                            {!(isParty && displayStatus === "In Progress") ? (
                              <option value="Pending">{partyFacingStatusLabel("Pending", isParty)}</option>
                            ) : null}
                            {isParty && adminLotNotDispatched(l) && displayStatus === "In Progress" ? (
                              <option value="In Progress">In Progress</option>
                            ) : null}
                            {!(isParty && adminLotNotDispatched(l)) ? (
                              <option value="In Progress">In Progress</option>
                            ) : null}
                            <option value="Completed">
                              {isParty ? "Submit for admin approval" : "Completed"}
                            </option>
                          </select>
                        )}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontWeight: 700,
                          color: "#1e40af",
                        }}
                      >
                        {isParty && partyBillOnly == null ? (
                          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>—</span>
                        ) : (
                          `₨${(isParty ? partyBillOnly : adminBillDisplay).toLocaleString()}`
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                            maxWidth: 220,
                          }}
                        >
                          {pe.receipt ? (
                            <>
                              <ReceiptThumbButton
                                receipt={pe.receipt}
                                lotLabel={l.lotNo || l.lotNumber}
                                onOpen={setReceiptPreview}
                              />
                              {receiptPreviewKind(pe.receipt) === "filename" && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-secondary)",
                                    maxWidth: 120,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={pe.receipt}
                                >
                                  {pe.receipt}
                                </span>
                              )}
                            </>
                          ) : (
                            <span
                              style={{ color: "var(--text-muted)", fontSize: 12 }}
                            >
                              No bill
                            </span>
                          )}
                          {isParty ? (
                            <>
                              <input
                                id={`pl-bill-${l.id}`}
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                style={{ display: "none" }}
                                disabled={billPicSavingLotId === l.id}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  if (f) void savePartyLotReceiptFromFile(l, f);
                                }}
                              />
                              <label
                                htmlFor={`pl-bill-${l.id}`}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor:
                                    billPicSavingLotId === l.id ? "wait" : "pointer",
                                  color: "#0369a1",
                                  textDecoration: "underline",
                                  textUnderlineOffset: 2,
                                }}
                              >
                                {billPicSavingLotId === l.id
                                  ? "Saving…"
                                  : pe.receipt
                                    ? "Change"
                                    : "Add bill"}
                              </label>
                              {pe.receipt ? (
                                <button
                                  type="button"
                                  onClick={() => removePartyLotReceipt(l)}
                                  disabled={billPicSavingLotId === l.id}
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    border: "none",
                                    background: "transparent",
                                    color: "#b91c1c",
                                    cursor:
                                      billPicSavingLotId === l.id ? "wait" : "pointer",
                                    padding: "2px 4px",
                                  }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {pe.notes}
                        {displayStatus === "Rejected" && l.rejectionNote ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "#b91c1c",
                              marginTop: 6,
                              fontWeight: 600,
                              lineHeight: 1.4,
                            }}
                          >
                            Admin: {l.rejectionNote}
                          </div>
                        ) : null}
                        {pe.amountChangeNote && (
                          <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>
                            Amount changed: ₨{Number(pe.amountChangeNote.previousAmount || 0).toLocaleString()} to ₨{Number(pe.amountChangeNote.updatedAmount || 0).toLocaleString()}
                          </div>
                        )}
                        {isAdmin && pendingRevisionIsReal(pe) && (
                          <div style={{ fontSize: 11, color: "#0369a1", marginTop: 4, fontWeight: 600 }}>
                            Party revised bill: ₨{Number(pe.pendingRevision.fromAmount || 0).toLocaleString()} → ₨{Number(pe.pendingRevision.toAmount || 0).toLocaleString()} (settle on approval)
                          </div>
                        )}
                      </td>
                      <td>
                        {displayStatus === "Completed" && !isAdmin ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Admin only</span>
                        ) : displayStatus === "Pending" && isParty ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                        ) : (
                          <button
                            onClick={() => openEdit(l)}
                            style={{
                              padding: "4px 12px",
                              fontSize: 12,
                              fontWeight: 500,
                              borderRadius: 6,
                              cursor: "pointer",
                              background: "#EFF6FF",
                              color: "#1e40af",
                              border: "1px solid #BFDBFE",
                              fontFamily: "Inter, sans-serif",
                            }}
                          >
                            Edit
                          </button>
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
      {filtered.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Showing {pageStart + 1}-
            {Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
            >
              Prev
            </button>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
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
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {ledgerSaving ? (
                  <>
                    <Loader /> Saving…
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </>
          }
        >
          {/* Read-only info */}
          <div
            style={{
              background: "#F8FAFC",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Lot Info (read-only)
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "6px 16px",
                fontSize: 13,
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>
                  Description:{" "}
                </span>
                {editingLot.description}
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Fabric: </span>
                {editingLot.fabric || editingLot.itemType}
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Colors: </span>
                {editingLot.colors}
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Pieces: </span>
                {editingLot.pieces}
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>
                  {isParty ? "Business order status: " : "Ghausia Status: "}
                </span>
                <StatusBadge status={toTitleCase(editingLot.status)} />
              </div>
            </div>
          </div>

          <div className="grid-2">
            {!isParty && (
            <FormGroup
              label={
                ledgerEditKind === "pendingReview" || editForm.status === "Completed"
                  ? "Party Name *"
                  : "Party Name"
              }
            >
              <select
                className="form-select"
                value={editForm.partyId}
                onChange={(e) => {
                  const sel = parties.find((p) =>
                    samePartyId(p.id, e.target.value),
                  );
                  setEditForm((f) => ({
                    ...f,
                    partyId: e.target.value,
                    partyName: sel?.name || "",
                  }));
                  if (ledgerFormErrors.partyId)
                    setLedgerFormErrors((e2) => ({ ...e2, partyId: "" }));
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
                <span style={{ color: "#dc2626", fontSize: 11 }}>
                  {ledgerFormErrors.partyId}
                </span>
              )}
            </FormGroup>
            )}
            <FormGroup label="Allot Date">
              <input
                className="form-input"
                type="date"
                value={editForm.allotDate}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, allotDate: e.target.value }))
                }
              />
            </FormGroup>
            <FormGroup label="Status">
              {ledgerEditKind === "pendingReview" ? (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#92400e",
                    padding: "8px 10px",
                    background: "#FEF3C7",
                    borderRadius: 8,
                    border: "1px solid #FCD34D",
                  }}
                >
                  Pending admin review — you can update bill, receipt, and dates; the lot stays with the admin until approved.
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
                      ...(next !== "Completed" ? { completeDate: "" } : {}),
                    }));
                    setLedgerFormErrors({});
                  }}
                >
                  {!(
                    isParty &&
                    editingLot &&
                    getDisplayStatus(editingLot) === "In Progress"
                  ) ? (
                    <option value="Pending">{partyFacingStatusLabel("Pending", isParty)}</option>
                  ) : null}
                  {isParty && editingLot && adminLotNotDispatched(editingLot) && editForm.status === "In Progress" ? (
                    <option value="In Progress">In Progress</option>
                  ) : null}
                  {!(isParty && editingLot && adminLotNotDispatched(editingLot)) ? (
                    <option value="In Progress">In Progress</option>
                  ) : null}
                  <option value="Completed">
                    {isParty ? "Submit for admin approval" : "Completed"}
                  </option>
                </select>
              )}
            </FormGroup>
            {(editForm.status === "Completed" ||
              ledgerEditKind === "pendingReview") && (
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
                        completeDate: "",
                      }));
                  }}
                />
                {ledgerFormErrors.completeDate && (
                  <span style={{ color: "#dc2626", fontSize: 11 }}>
                    {ledgerFormErrors.completeDate}
                  </span>
                )}
              </FormGroup>
            )}
            <FormGroup label={isParty ? "Your ledger amount (₨)" : "Bill Amount (₨)"}>
              <input
                className="form-input"
                type="number"
                value={editForm.billAmount}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, billAmount: e.target.value }))
                }
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
                e.target.value = "";
                if (!file) {
                  setEditForm((f) => ({ ...f, receipt: "" }));
                  return;
                }
                try {
                  const stored = await readReceiptAsStoredValue(file);
                  const cropped = await finalizeLedgerReceiptStoredValue(stored);
                  setEditForm((f) => ({ ...f, receipt: cropped }));
                } catch {
                  setEditForm((f) => ({ ...f, receipt: file.name }));
                }
              }}
            />
            {editForm.receipt && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {receiptPreviewKind(editForm.receipt) === "image" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: 0, border: "none" }}
                    onClick={() =>
                      setReceiptPreview({
                        kind: "image",
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
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                      }}
                    />
                  </button>
                )}
                {receiptPreviewKind(editForm.receipt) === "pdf" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setReceiptPreview({
                        kind: "pdf",
                        src: editForm.receipt,
                        title: editingLot?.lotNo || editingLot?.lotNumber,
                      })
                    }
                  >
                    Preview PDF
                  </button>
                )}
                <span style={{ fontSize: 12, color: "#15803d" }}>
                  {receiptPreviewKind(editForm.receipt) === "filename"
                    ? `📎 ${editForm.receipt}`
                    : "Receipt attached — click thumbnail to enlarge"}
                </span>
              </div>
            )}
          </FormGroup>
          <FormGroup label="Notes">
            <textarea
              className="form-textarea"
              rows={2}
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Optional notes..."
              style={{ resize: "vertical" }}
            />
          </FormGroup>

          {ledgerEditKind === "pendingReview" && (
            <div className="alert alert-warning">
              <strong>Note:</strong>{" "}
              {isParty
                ? "Saving updates your submission while it is still with the admin. If you change your ledger amount, the admin will see the old and new figures and reconciles them with the business."
                : "Saving updates this submission while it is under review. If you change the bill amount, the admin will see the old and new figures and can choose how the owner business bill should follow when they approve."}
            </div>
          )}
          {editForm.status === "Completed" && ledgerEditKind !== "pendingReview" && (
            <div className="alert alert-warning">
            <strong>Note:</strong> Submitting completes the ledger entry and sends this lot to the admin for approval. Once approved it becomes billable to the owner (<strong>Received back</strong>). If rejected, you will see the admin&apos;s feedback on this row.
          </div>
          )}
        </Modal>
      )}

      {receiptPreview && (
        <Modal
          title={
            receiptPreview.title
              ? `Receipt — ${receiptPreview.title}`
              : "Receipt"
          }
          wide
          onClose={() => setReceiptPreview(null)}
        >
          {receiptPreview.kind === "image" && (
            <img
              src={receiptPreview.src}
              alt="Receipt"
              style={{
                maxWidth: "100%",
                maxHeight: "78vh",
                width: "auto",
                height: "auto",
                display: "block",
                margin: "0 auto",
                borderRadius: 8,
              }}
            />
          )}
          {receiptPreview.kind === "pdf" && (
            <iframe
              title="Receipt PDF"
              src={receiptPreview.src}
              style={{
                width: "100%",
                height: "78vh",
                border: "none",
                borderRadius: 8,
                background: "#f9fafb",
              }}
            />
          )}
          {receiptPreview.kind === "url" && (
            <img
              src={receiptPreview.src}
              alt="Receipt"
              style={{
                maxWidth: "100%",
                maxHeight: "78vh",
                display: "block",
                margin: "0 auto",
                borderRadius: 8,
              }}
            />
          )}
          {receiptPreview.kind === "filename" && (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: 14,
              }}
            >
              <p style={{ margin: "0 0 12px" }}>
                No image preview for filename-only receipts.
              </p>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {receiptPreview.name}
              </p>
              <p style={{ margin: "16px 0 0", fontSize: 13 }}>
                Edit this lot and upload an image or PDF again to store a
                preview.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
