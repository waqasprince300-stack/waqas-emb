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
import { DateRangeSelect, isWithinDateRange, latestDateFrom } from "../utils/dateFilters";

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

function lotRecencyTimestamp(l) {
  const keys = [
    l.updatedAt,
    l.createdAt,
    l.receivedBackDate,
    l.dispatchDate,
    l.allotDate,
  ];
  let max = 0;
  for (const v of keys) {
    const t = v ? new Date(v).getTime() : NaN;
    if (!Number.isNaN(t) && t > max) max = t;
  }
  if (max === 0) {
    const id = String(l.id || "");
    if (id.length === 24 && /^[a-f0-9]{24}$/i.test(id)) {
      max = parseInt(id.slice(0, 8), 16) * 1000;
    }
  }
  return max;
}

function compareLotsNewestFirst(a, b) {
  const d = lotRecencyTimestamp(b) - lotRecencyTimestamp(a);
  if (d !== 0) return d;
  return String(b.id || "").localeCompare(String(a.id || ""));
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

export default function PartyLedger() {
  const {
    ghausiaLots,
    payments,
    partyEdits,
    partyCrossLots,
    partyCrossPayments,
    partyCrossPartyEdits,
    updateLot,
    updatePartyEdit,
    parties,
    initialDataLoading,
  } = useApp();
  const { isAdmin, isParty, user } = useAuth();

  const ledgerLots = isParty ? partyCrossLots : ghausiaLots;
  const ledgerPayments = isParty ? partyCrossPayments : payments;
  const ledgerPartyEdits = isParty ? partyCrossPartyEdits : partyEdits;
  const PAGE_SIZE = 10;
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateRange, setDateRange] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerFormErrors, setLedgerFormErrors] = useState({});
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const samePartyId = (a, b) =>
    String(a ?? "").trim() === String(b ?? "").trim();

  const lotWorkspaceOpts = (lot) =>
    lot?.businessOwnerId ? { businessOwnerId: lot.businessOwnerId } : {};

  const assignedLots = useMemo(
    () =>
      ledgerLots
        .filter(
          (l) =>
            String(l.partyId || "").trim() || String(l.partyName || "").trim(),
        )
        .filter((lot) =>
          isWithinDateRange(
            latestDateFrom(lot, ["updatedAt", "createdAt", "receivedBackDate", "dispatchDate", "allotDate", "receivedDate"]),
            dateRange,
          ),
        ),
    [ledgerLots, dateRange],
  );

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

  // Bill amount: prefer explicit partyBillAmount (> 0), else use lot's billAmount
  // let arry = [];
  const getDisplayBill = (l) => {
    const pe = ledgerPartyEdits[l.id] || {};
    if (pe.partyBillAmount != null && Number(pe.partyBillAmount) > 0) {
      return Number(pe.partyBillAmount);
    }
    return Number(l.billAmount || 0);
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
      const matchS = statusFilter === "All" || displayStatus === statusFilter;
      return matchQ && matchP && matchS;
    });
    return [...list].sort(compareLotsNewestFirst);
  }, [assignedLots, search, partyFilter, statusFilter, ledgerPartyEdits]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedLots = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, partyFilter, statusFilter, dateRange]);

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
    if (statusForForm === "Completed" && !isAdmin) return;
    const existingComplete =
      formatYmd(pe.completeDate) || formatYmd(lot.receivedBackDate) || "";
    setLedgerFormErrors({});
    setEditForm({
      allotDate: lot.allotDate || "",
      completeDate:
        existingComplete ||
        (statusForForm === "Completed"
          ? new Date().toISOString().slice(0, 10)
          : ""),
      status: statusForForm,
      billAmount: getDisplayBill(lot) || "",
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

      const previousLedgerAmount = getDisplayBill(lot);
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
              <div style="margin-top:10px;color:#92400e">No payment transaction will be created automatically.</div>
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
          overrideStatus: "Completed",
          ...(amountChangeNote ? { amountChangeNote } : {}),
        }, lotWorkspaceOpts(lot));
        const lotUpdates = {
          status: "received back",
          receivedBackDate:
            editForm.completeDate || new Date().toISOString().slice(0, 10),
        };
        if (amountChangeNote) {
          lotUpdates.billAmount = nextLedgerAmount;
        }
        if (partyChanged) {
          const sel = parties.find((p) => samePartyId(p.id, editForm.partyId));
          lotUpdates.partyId = editForm.partyId;
          lotUpdates.partyName = sel?.name || editForm.partyName;
        }
        await updateLot(editingId, lotUpdates, lotWorkspaceOpts(lot));
      } else {
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
    } finally {
      setLedgerSaving(false);
    }
  };

  const totals = useMemo(() => {
    let completedAmount = 0;
    let inProgressAmount = 0;

    filtered.forEach((l) => {
      const status = getDisplayStatus(l);
      const bill = getDisplayBill(l);

      if (status === "Completed") {
        completedAmount += bill;
      } else if (status === "Pending") {
        inProgressAmount += 0;
      } else {
        inProgressAmount += bill;
      }
    });

    return {
      lots: filtered.length,
      billTotal: filtered.reduce((s, l) => s + getDisplayBill(l), 0),
      completed: filtered.filter((l) => getDisplayStatus(l) === "Completed")
        .length,
      pending: filtered.filter((l) => getDisplayStatus(l) === "Pending")
        .length,
      inProgress: filtered.filter((l) => getDisplayStatus(l) === "In Progress")
        .length,
      completedAmount,
      inProgressAmount,
      withReceipt: filtered.filter((l) => ledgerPartyEdits[l.id]?.receipt).length,
    };
  }, [filtered, ledgerPartyEdits]);

  const partyBalanceInfo = useMemo(() => {
    const pays = ledgerPayments.filter((p) => p.type === "Paid" && isWithinDateRange(p.updatedAt || p.date, dateRange));

  if (partyFilter === "All") {
    const names = [
      ...new Set(
        filtered
          .map((l) => getPartyNameLocal(l.partyId, l.partyName).trim())
          .filter((n) => n && n !== "—")
      ),
    ];

    let balance = 0;
    let paidSum = 0; // ✅ declare OUTSIDE

    names.forEach((name) => {
      const billSum = filtered
        .filter(
          (l) => getPartyNameLocal(l.partyId, l.partyName).trim() === name
        )
        .reduce((s, l) => s + getDisplayBill(l), 0);

      const partyPaid = pays
        .filter((p) => String(p.party || "").trim() === name)
        .reduce((s, p) => s + Number(p.amount || 0), 0);

      paidSum += partyPaid;      // ✅ accumulate
      balance += billSum - partyPaid;
    });

    return { balance, paidSum, hint: "Total balance for all the parties." };
  }

  const party = parties.find((p) => samePartyId(p.id, partyFilter));
  const pname = (party?.name || "").trim();

  const paidSum = pays
    .filter((p) => String(p.party || "").trim() === pname)
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  return {
    balance: totals.billTotal - paidSum,
    paidSum,
    hint: pname
      ? `${pname}'s balance`
      : "Total bill value minus paid to party",
  };
}, [partyFilter, filtered, ledgerPayments, parties, ledgerPartyEdits, totals.billTotal, dateRange]);
  const handleRowStatusChange = async (lot, newStatus) => {
    if (newStatus === "Completed") {
      openEdit(lot, "Completed");
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
            All lots assigned to parties — editable completion details
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
            label: "Total Bill Value",
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
                Pending{" "}
                <strong style={{ fontSize: 14, color: "#d97706" }}>
                  ({totals.pending})
                </strong>
              </>
            ),
            value: "Awaiting dispatch",
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
            label: `Completed Los't ${totals.completedAmount - partyBalanceInfo.paidSum >= 0 ? "balance (payable)" : "(advance)"}`,
            value: `₨${totals.completedAmount - partyBalanceInfo.paidSum}`,
            color: `${totals.completedAmount - partyBalanceInfo.paidSum >= 0 ? "#0f766e" : "#dc2626"}`,
            sub: partyBalanceInfo.hint,
          },
          {
            key: "balance",
            label: `Total Balance ${partyBalanceInfo.balance >= 0 ? "(payable)" : "(advance)"}`,
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

      {/* Toolbar */}
      <div className="toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search lot no., design..."
        />
        <select
          className="form-select"
          style={{ width: 190 }}
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
          disabled={isParty}
        >
          {!isParty && <option value="All">All Parties</option>}
          {isParty && <option value="All">All collections</option>}
          {!isParty && parties.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <DateRangeSelect value={dateRange} onChange={setDateRange} />
        <select
          className="form-select"
          style={{ width: 160 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>
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
                <th>Party Name</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Bill Amount</th>
                <th>Receipt</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14}>
                    <EmptyState message="No assigned lots found" />
                  </td>
                </tr>
              ) : (
                paginatedLots.map((l) => {
                  // console.log(l, 'l');
                  const pe = ledgerPartyEdits[l.id] || {};
                  const displayStatus = getDisplayStatus(l);
                  const displayBill = getDisplayBill(l);
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
                      <td>{getPartyNameLocal(l.partyId, l.partyName)}</td>
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
                        ) : (
                          <select
                            className="form-select"
                            style={{
                              width: 140,
                              minWidth: 140,
                              fontSize: 12,
                              padding: "5px 8px",
                            }}
                            value={displayStatus}
                            onChange={(e) =>
                              handleRowStatusChange(l, e.target.value)
                            }
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
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
                        ₨{displayBill.toLocaleString()}
                      </td>
                      <td>
                        {pe.receipt ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
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
                          </div>
                        ) : (
                          <span
                            style={{ color: "var(--text-muted)", fontSize: 12 }}
                          >
                            No receipt
                          </span>
                        )}
                      </td>
                      <td>
                        {pe.notes}
                        {pe.amountChangeNote && (
                          <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>
                            Amount changed: ₨{Number(pe.amountChangeNote.previousAmount || 0).toLocaleString()} to ₨{Number(pe.amountChangeNote.updatedAmount || 0).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td>
                        {displayStatus === "Completed" && !isAdmin ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Admin only</span>
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
              setLedgerFormErrors({});
            }
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setEditingId(null);
                  setLedgerFormErrors({});
                }}
                disabled={ledgerSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
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
                  Ghausia Status:{" "}
                </span>
                <StatusBadge status={toTitleCase(editingLot.status)} />
              </div>
            </div>
          </div>

          <div className="grid-2">
            <FormGroup
              label={
                editForm.status === "Completed" ? "Party Name *" : "Party Name"
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
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </FormGroup>
            {editForm.status === "Completed" && (
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
            <FormGroup label="Bill Amount (₨)">
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
                  setEditForm((f) => ({ ...f, receipt: stored }));
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

          {editForm.status === "Completed" && (
            <div className="alert alert-warning">
              <strong>Note:</strong> Marking as Completed will update the
              Ghausia lot status to "Received Back".
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
