import React, { useState, useMemo, useEffect } from "react";
import Swal from "sweetalert2";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Modal, FormGroup, EmptyState } from "../components/UI";
import Loader from "../components/Loader";
import LoaderDashboard from "../components/LoaderDashboard";

function normalizeLotKey(linkedLot) {
  return String(linkedLot || "")
    .trim()
    .toLowerCase();
}

function lotDisplayRef(l) {
  return String(l.lotNumber ?? l.lotNo ?? "").trim();
}

function findLotByLinkedValue(ghausiaLots, linkedLotValue) {
  if (!linkedLotValue) return undefined;
  const key = normalizeLotKey(linkedLotValue);
  return ghausiaLots.find((l) => normalizeLotKey(lotDisplayRef(l)) === key);
}

const paymentToast = (icon, title) => {
  Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: icon === "success" ? 2800 : 4200,
    timerProgressBar: true,
  });
};

export default function Payments() {
  const {
    payments,
    addPayment,
    deletePayment,
    ghausiaLots,
    parties,
    initialDataLoading,
  } = useApp();
  const { isAdmin, isParty, user } = useAuth();
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState("All");
  const [form, setForm] = useState({
    type: "Received",
    amount: "",
    party: "Owner",
    date: "",
    note: "",
    linkedLot: "",
  });
  const [errors, setErrors] = useState({});
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const visiblePayments = useMemo(() => {
    if (!isParty) return payments;
    const partyName = String(user?.partyName || "").trim();
    return payments.filter((p) => String(p.party || "").trim() === partyName);
  }, [payments, isParty, user?.partyName]);

  const filtered = useMemo(
    () =>
      visiblePayments.filter((p) => {
        if (typeFilter === "All") return true;
        if (typeFilter === "Bill") {
          return p.type === "Paid" && String(p.party || "").toLowerCase() === "owner";
        }
        return p.type === typeFilter;
      }),
    [visiblePayments, typeFilter],
  );
  const sortedFiltered = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        // Sort by edit date (updatedAt) first if available, then by creation date
        const da = new Date((a.updatedAt || a.date || 0)).getTime();
        const db = new Date((b.updatedAt || b.date || 0)).getTime();
        if (db !== da) return db - da;
        return String(b.id || "").localeCompare(String(a.id || ""));
      }),
    [filtered],
  );
  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedPayments = sortedFiltered.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const usedReceivedLotKeys = useMemo(
    () =>
      new Set(
        visiblePayments
          .filter((p) => p.type === "Received" && p.linkedLot)
          .map((p) => normalizeLotKey(p.linkedLot)),
      ),
    [visiblePayments],
  );

  const usedPaidLotKeys = useMemo(
    () =>
      new Set(
        visiblePayments
          .filter((p) => p.type === "Paid" && p.linkedLot)
          .map((p) => normalizeLotKey(p.linkedLot)),
      ),
    [visiblePayments],
  );

  const linkedLotOptions = useMemo(() => {
    if (form.type === "Received") {
      return ghausiaLots.filter(
        (l) =>
          l.status !== "completed" &&
          !usedReceivedLotKeys.has(normalizeLotKey(lotDisplayRef(l))),
      );
    }
    if (form.type !== "Paid" || !form.party || form.party === "Other") {
      return [];
    }
    const party = parties.find((p) => p.name === form.party);
    if (!party) return [];
    return ghausiaLots.filter((l) => {
      if (l.status !== "completed") return false;
      const byId =
        party.id != null &&
        l.partyId != null &&
        String(l.partyId) === String(party.id);
      const byName =
        l.partyName && String(l.partyName).trim() === String(party.name).trim();
      if (!byId && !byName) return false;
      if (usedPaidLotKeys.has(normalizeLotKey(lotDisplayRef(l)))) return false;
      return true;
    });
  }, [
    form.type,
    form.party,
    ghausiaLots,
    parties,
    usedReceivedLotKeys,
    usedPaidLotKeys,
  ]);

  const paidToNonOwnerParties = useMemo(() => {
    const sum = visiblePayments
      .filter(
        (p) =>
          p.type === "Paid" && String(p.party || "").toLowerCase() !== "owner",
      )
      .reduce((s, p) => s + p.amount, 0);
    console.log("Sum of Paid payments to non-Owner parties:", sum);
    return sum;
  }, [visiblePayments]);
  const ownerIn = visiblePayments
    .filter((p) => p.type === "Received")
    .reduce((s, p) => s + p.amount, 0);
  const partyOut = visiblePayments
    .filter((p) => p.type === "Paid")
    .reduce((s, p) => s + p.amount, 0);
  const balance = ownerIn - paidToNonOwnerParties;

  const validateForm = () => {
    const newErrors = {};
    if (!form.amount) newErrors.amount = "Amount is required";
    if (!form.date) newErrors.date = "Date is required";
    if (form.type === "Paid" && !form.party)
      newErrors.party = "Please select a party";
    if (form.linkedLot) {
      const key = normalizeLotKey(form.linkedLot);
      const dup = visiblePayments.some(
        (p) =>
          p.type === form.type &&
          p.linkedLot &&
          normalizeLotKey(p.linkedLot) === key,
      );
      if (dup) {
        newErrors.linkedLot =
          form.type === "Received"
            ? "An owner payment is already linked to this lot. Each lot can only be used once."
            : "A party payment is already linked to this lot. Each lot can only be paid once.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setPaymentSaving(true);
    try {
      await addPayment(form);
      setForm({
        type: "Received",
        amount: "",
        party: "Owner",
        date: "",
        note: "",
        linkedLot: "",
      });
      setErrors({});
      setModal(false);
      paymentToast("success", "Payment saved successfully");
    } catch (err) {
      paymentToast("error", "Payment could not be saved. Please try again.");
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    const result = await Swal.fire({
      title: "Delete Payment?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, delete it",
    });
    if (result.isConfirmed) {
      await deletePayment(id).catch(console.error);
    }
  };

  const handleClose = () => {
    setModal(false);
    setErrors({});
    setForm({
      type: "Received",
      amount: "",
      party: "Owner",
      date: "",
      note: "",
      linkedLot: "",
    });
  };

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
          <div className="page-title">Payments</div>
          <div className="page-subtitle">
            Track all money received from owner and paid to parties
          </div>
        </div>
        {isAdmin && <button className="btn btn-success" onClick={() => setModal(true)}>
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
        </button>}
      </div>

      {/* Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "Received from Owner",
            value: ownerIn,
            color: "#15803d",
            icon: "↓",
          },
          {
            label: "Paid to Parties",
            value: paidToNonOwnerParties,
            color: "#dc2626",
            icon: "↑",
          },
          {
            label: "Net Balance",
            value: Math.abs(balance),
            color: balance >= 0 ? "#15803d" : "#dc2626",
            icon: balance >= 0 ? "+" : "-",
            note: balance >= 0 ? "Credit" : "Debit",
          },
          {
            label: "Total Transactions",
            value: visiblePayments.length,
            color: "#1e40af",
            isCount: true,
          },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "18px 20px",
              boxShadow: "var(--shadow)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 8,
              }}
            >
              {c.label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              {c.icon && !c.isCount && (
                <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>
                  {c.icon}
                </span>
              )}
              <span style={{ fontSize: 22, fontWeight: 700, color: c.color }}>
                {c.isCount ? c.value : `₨${c.value.toLocaleString()}`}
              </span>
            </div>
            {c.note && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 3,
                }}
              >
                {c.note}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Balance visual */}
      {/* {visiblePayments.length > 0 && (
        <div
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "18px 22px",
            marginBottom: 22,
            boxShadow: "var(--shadow)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 12,
            }}
          >
            Cash Flow Overview
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 120,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              Owner In
            </div>
            <div
              style={{
                flex: 1,
                background: "#F3F4F6",
                borderRadius: 6,
                height: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${ownerIn > 0 ? 100 : 0}%`,
                  background: "#15803d",
                  height: "100%",
                  borderRadius: 6,
                }}
              />
            </div>
            <div
              style={{
                fontWeight: 700,
                color: "#15803d",
                minWidth: 80,
                textAlign: "right",
              }}
            >
              ₨{ownerIn.toLocaleString()}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 120,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              Party Out
            </div>
            <div
              style={{
                flex: 1,
                background: "#F3F4F6",
                borderRadius: 6,
                height: 16,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${ownerIn > 0 ? Math.min((partyOut / ownerIn) * 100, 100) : 0}%`,
                  background: "#dc2626",
                  height: "100%",
                  borderRadius: 6,
                }}
              />
            </div>
            <div
              style={{
                fontWeight: 700,
                color: "#dc2626",
                minWidth: 80,
                textAlign: "right",
              }}
            >
              ₨{partyOut.toLocaleString()}
            </div>
          </div>
        </div>
      )} */}

      {/* Filter */}
      <div className="toolbar">
        <select
          className="form-select"
          style={{ width: 160 }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="All">All Types</option>
          <option>Received</option>
          <option>Paid</option>
          <option>Bill</option>
        </select>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {filtered.length} records
        </span>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Type</th>
                <th>Party / From</th>
                <th>Linked Lot</th>
                <th>Note</th>
                <th style={{ textAlign: "right" }}>Amount (₨)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState message="No payment records found" />
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                      {filtered.length - (pageStart + i)}
                    </td>
                    <td>{p.date}</td>
                    <td>
                      <span
                        style={{
                          background:
                            p.type === "Received" ? "#F0FDF4" : "#FEF2F2",
                          color: p.type === "Received" ? "#166534" : "#991B1B",
                          border: `1px solid ${p.type === "Received" ? "#BBF7D0" : "#FECACA"}`,
                          borderRadius: 20,
                          padding: "3px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {p.party.toLowerCase() === "owner" &&
                        p.type.toLowerCase() === "paid"
                          ? "Bill"
                          : p.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{p.party}</td>
                    <td>
                      {p.linkedLot ? (
                        <span
                          style={{
                            background: "#EFF6FF",
                            color: "#1e40af",
                            border: "1px solid #BFDBFE",
                            borderRadius: 6,
                            padding: "2px 8px",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {p.linkedLot}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td
                      style={{ color: "var(--text-secondary)", fontSize: 13 }}
                    >
                      {p.note || "—"}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 14,
                        color: p.type === "Received" ? "#15803d" : "#dc2626",
                      }}
                    >
                      {p.type === "Paid" ? "-" : "+"}₨
                      {p.amount.toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="btn-icon"
                        onClick={() => handleDelete(p.id)}
                        title="Delete payment"
                        disabled={!isAdmin}
                        style={!isAdmin ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#dc2626"
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
                  </tr>
                ))
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

      {/* Add Payment Modal */}
      {modal && (
        <Modal
          title="Record New Payment"
          onClose={() => {
            if (!paymentSaving) handleClose();
          }}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={handleClose}
                disabled={paymentSaving}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleSave}
                disabled={paymentSaving}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {paymentSaving ? (
                  <>
                    <Loader /> Saving…
                  </>
                ) : (
                  "Save Payment"
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
                    party: newType === "Received" ? "Owner" : "",
                    linkedLot: "",
                    amount: "",
                  }));
                  setErrors((prev) => ({ ...prev, party: undefined }));
                }}
              >
                <option>Received</option>
                <option>Paid</option>
              </select>
            </FormGroup>
            <FormGroup
              label={form.type === "Received" ? "Received From" : "Paid To *"}
            >
              {form.type === "Received" ? (
                <select
                  className="form-select"
                  value={form.party}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, party: e.target.value }))
                  }
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
                    className={`form-select${errors.party ? " input-error" : ""}`}
                    value={form.party}
                    onChange={(e) => {
                      setForm((f) => ({
                        ...f,
                        party: e.target.value,
                        linkedLot: "",
                        amount: "",
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
                        color: "#dc2626",
                        fontSize: 11,
                        marginTop: 3,
                        display: "block",
                      }}
                    >
                      {errors.party}
                    </span>
                  )}
                </>
              )}
            </FormGroup>
            <FormGroup label="Linked Lot (optional)">
              <select
                className={`form-select${errors.linkedLot ? " input-error" : ""}`}
                value={form.linkedLot}
                onChange={(e) => {
                  const v = e.target.value;
                  const lot = findLotByLinkedValue(ghausiaLots, v);
                  const bill = lot ? Number(lot.billAmount || 0) : 0;
                  setForm((f) => ({
                    ...f,
                    linkedLot: v,
                    amount: v && bill > 0 ? String(bill) : v ? "" : "",
                  }));
                  setErrors((p) => ({
                    ...p,
                    linkedLot: undefined,
                    amount: undefined,
                  }));
                }}
                disabled={form.type === "Paid" && !form.party}
              >
                <option value="">None</option>
                {linkedLotOptions.map((l) => (
                  <option key={l.id} value={l.lotNo || l.lotNumber}>
                    {l.lotNo || l.lotNumber} / {l.designNo}
                    {form.type === "Received" ? ` — ${l.status}` : ""}
                  </option>
                ))}
              </select>
              {errors.linkedLot && (
                <span
                  style={{
                    color: "#dc2626",
                    fontSize: 11,
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  {errors.linkedLot}
                </span>
              )}
              {form.type === "Received" && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  Lots that already have a linked Received payment are hidden.
                  Use None when the payment is not tied to a single lot.
                </span>
              )}
              {form.type === "Paid" && !form.party && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  Select a party to list completed lots for that party.
                </span>
              )}
              {form.type === "Paid" &&
                form.party &&
                form.party !== "Other" &&
                linkedLotOptions.length === 0 && (
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11,
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    No completed lots left for this party (remaining lots may
                    already have a Paid entry linked).
                  </span>
                )}
            </FormGroup>
            <FormGroup label="Amount (₨) *">
              <input
                className={`form-input${errors.amount ? " input-error" : ""}`}
                type="number"
                value={form.amount}
                onChange={(e) => {
                  setForm((f) => ({ ...f, amount: e.target.value }));
                  setErrors((p) => ({ ...p, amount: undefined }));
                }}
                placeholder={
                  form.linkedLot
                    ? "Filled from lot bill, or enter amount"
                    : "50000"
                }
              />
              {form.linkedLot && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  Default is the bill amount for this lot — you can change it
                  before saving.
                </span>
              )}
              {errors.amount && (
                <span
                  style={{
                    color: "#dc2626",
                    fontSize: 11,
                    marginTop: 3,
                    display: "block",
                  }}
                >
                  {errors.amount}
                </span>
              )}
            </FormGroup>
            <FormGroup label="Date *">
              <input
                className={`form-input${errors.date ? " input-error" : ""}`}
                type="date"
                value={form.date}
                onChange={(e) => {
                  setForm((f) => ({ ...f, date: e.target.value }));
                  setErrors((p) => ({ ...p, date: undefined }));
                }}
              />
              {errors.date && (
                <span
                  style={{
                    color: "#dc2626",
                    fontSize: 11,
                    marginTop: 3,
                    display: "block",
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                placeholder="Optional note"
              />
            </FormGroup>
          </div>
        </Modal>
      )}
    </div>
  );
}
