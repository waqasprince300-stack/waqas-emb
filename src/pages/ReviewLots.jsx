import React, { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import LazyReceiptThumb from "../components/receipt/LazyReceiptThumb";
import Swal from "sweetalert2";
import { useApp } from "../context/AppContext";
import { Modal, FormGroup, EmptyState, SearchBar } from "../components/UI";
import Loader from "../components/Loader";
import LoaderDashboard from "../components/LoaderDashboard";
import { compareRowsByUpdatedNewestFirst } from "../utils/dateFilters";
import { getAdminLedgerOrBusinessBill } from "../utils/partyBillPrivacy";

function normalizeLotKey(linkedLot) {
  return String(linkedLot || "").trim().toLowerCase();
}

function lotKeyFromLot(l) {
  return String(l.lotNumber ?? l.lotNo ?? "").trim();
}

function hasOwnerReceivedForLot(lot, payments) {
  const k = normalizeLotKey(lotKeyFromLot(lot));
  if (!k || !Array.isArray(payments)) return false;
  return payments.some(
    (p) =>
      p.type === "Received" &&
      normalizeLotKey(p.linkedLot) === k,
  );
}

function pendingRevisionIsReal(pe) {
  const pr = pe?.pendingRevision;
  if (!pr) return false;
  return Number(pr.fromAmount) !== Number(pr.toAmount);
}

/** Party submit moment for Review Lots (date + time). */
function formatReviewSubmittedAt(lot, pe) {
  const raw =
    lot?.pendingReviewSubmittedAt ||
    pe?.updatedAt ||
    lot?.updatedAt ||
    "";
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function needsOwnerBillingChoice(lot, pe, payments) {
  return hasOwnerReceivedForLot(lot, payments) || pendingRevisionIsReal(pe);
}

/** Positive party ledger increase during pending review (for delta-only owner billing). */
function partyRevisionPositiveDelta(pe) {
  const pr = pe?.pendingRevision;
  if (!pr || !pendingRevisionIsReal(pe)) return 0;
  return Math.max(0, Number(pr.toAmount) - Number(pr.fromAmount));
}

/**
 * A 400 on approve almost always means our cached row is stale: the lot was already
 * approved/rejected/changed on the server, so it is no longer "pending approval".
 * We key off the 400 status (not the exact backend wording, which may change) and only
 * treat clearly unrelated client errors as real failures.
 */
function isStaleLotApprovalError(e) {
  const status = Number(e?.status);
  if (status !== 400) return false;
  const msg = String(e?.message || e || "").toLowerCase();
  // Wording-tolerant: anything about the lot's approval/status counts as "already updated".
  // Genuine input problems (amount/validation) keep the normal error message.
  const looksLikeValidationError =
    msg.includes("amount") ||
    msg.includes("required") ||
    msg.includes("invalid amount");
  return !looksLikeValidationError;
}

export default function ReviewLots() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppliedRef = useRef("");
  const [highlightLotId, setHighlightLotId] = useState(null);
  const {
    reportingLots,
    reportingPartyEdits,
    reportingPayments,
    parties,
    businessOwners,
    approveLotCompletion,
    rejectLotCompletion,
    refreshData,
    initialDataLoading,
  } = useApp();

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [approveBillingModal, setApproveBillingModal] = useState(null);
  const [ownerBillingChoice, setOwnerBillingChoice] = useState("sync_party");
  const [customOwnerBillInput, setCustomOwnerBillInput] = useState("");

  const businessName = (bizId) =>
    businessOwners.find((b) => String(b.id ?? b._id) === String(bizId || ""))
      ?.name || "—";

  const partyName = (pid, fallback) =>
    parties.find((p) => String(p.id) === String(pid || ""))?.name ||
    fallback ||
    "—";

  const pendingLots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = reportingLots.filter((l) => {
      if (String(l.status || "").toLowerCase().trim() !== "pending approval")
        return false;
      if (!q) return true;
      const label = `${l.lotNo || ""} ${l.lotNumber || ""} ${l.designNo || ""} ${l.partyName || ""}`.toLowerCase();
      return label.includes(q);
    });
    return [...list].sort((a, b) =>
      compareRowsByUpdatedNewestFirst(a, b, "lot"),
    );
  }, [reportingLots, search]);

  /** Deep link: /review-lots?lotId=… → focus that pending lot. */
  useEffect(() => {
    const lotId = String(searchParams.get("lotId") || "").trim();
    if (!lotId || initialDataLoading) return;
    if (deepLinkAppliedRef.current === lotId) return;

    const lot = reportingLots.find((l) => String(l.id) === lotId);
    if (!lot) return;
    if (String(lot.status || "").toLowerCase().trim() !== "pending approval") return;

    deepLinkAppliedRef.current = lotId;
    setSearch(String(lot.lotNo || lot.lotNumber || "").trim());
    setHighlightLotId(lotId);

    const next = new URLSearchParams(searchParams);
    next.delete("lotId");
    setSearchParams(next, { replace: true });

    const t = setTimeout(() => {
      const el = document.getElementById(`rl-lot-row-${lotId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    const clearHl = setTimeout(() => setHighlightLotId(null), 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(clearHl);
    };
  }, [searchParams, setSearchParams, reportingLots, initialDataLoading]);

  const peBill = (lotId, lot) => {
    const pe = reportingPartyEdits[lotId] || {};
    return getAdminLedgerOrBusinessBill(lot, pe);
  };

  const handleApprove = async (lot) => {
    const pe = reportingPartyEdits[lot.id] || {};
    const needsChoice = needsOwnerBillingChoice(lot, pe, reportingPayments);
    const showDelta = pendingRevisionIsReal(pe);

    if (!needsChoice) {
      const ok = await Swal.fire({
        title: "Approve completion?",
        text: `${lot.lotNo || lot.lotNumber} will become billable to owner (received back).`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Approve",
        cancelButtonText: "Cancel",
      });
      if (!ok.isConfirmed) return;
      setBusyId(lot.id);
      try {
        await approveLotCompletion(lot.id, {
          businessOwnerId: lot.businessOwnerId,
        });
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Lot approved",
          showConfirmButton: false,
          timer: 2200,
          timerProgressBar: true,
        });
      } catch (e) {
        if (isStaleLotApprovalError(e)) {
          refreshData?.({ force: true });
          Swal.fire({
            icon: "info",
            title: "Lot already updated",
            text: "This lot is no longer awaiting approval (it was already approved, rejected, or changed). The list has been refreshed.",
          });
        } else {
          Swal.fire({
            icon: "error",
            title: "Could not approve",
            text: String(e?.message || e || ""),
          });
        }
      } finally {
        setBusyId(null);
      }
      return;
    }

    setOwnerBillingChoice(showDelta ? "sync_party" : "keep_ghausia");
    const ownerSettledForLot = hasOwnerReceivedForLot(lot, reportingPayments);
    const revisionIncrease = partyRevisionPositiveDelta(pe);
    const allowDeltaOnlyOption =
      showDelta && ownerSettledForLot && revisionIncrease > 0;
    const partyBillNow = peBill(lot.id, lot);
    const ghausiaNow = Number(lot.billAmount || 0);
    setCustomOwnerBillInput(
      String(showDelta ? partyBillNow : ghausiaNow),
    );
    setApproveBillingModal({
      lot,
      pe,
      showDelta,
      allowDeltaOnlyOption,
      revisionIncrease,
    });
  };

  const submitApproveWithBilling = async () => {
    if (!approveBillingModal) return;
    const { lot, allowDeltaOnlyOption, revisionIncrease } = approveBillingModal;
    if (ownerBillingChoice === "delta_only" && !allowDeltaOnlyOption) {
      await Swal.fire({
        icon: "warning",
        title: "Pick another option",
        text: "“Owner billed for party increase only” is only available when a Received payment from the owner is already linked to this lot and the party increased the ledger.",
      });
      return;
    }
    let ownerBillAmount;
    if (ownerBillingChoice === "custom_ghausia") {
      const raw = String(customOwnerBillInput ?? "").replace(/,/g, "").trim();
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        await Swal.fire({
          icon: "warning",
          title: "Enter a valid amount",
          text: "Set the Ghausia / owner bill amount (0 or greater).",
        });
        return;
      }
      ownerBillAmount = n;
    }

    let resolvedBusinessBill;
    if (ownerBillingChoice === "sync_party") {
      resolvedBusinessBill = peBill(lot.id, lot);
    } else if (ownerBillingChoice === "custom_ghausia") {
      resolvedBusinessBill = ownerBillAmount;
    } else if (ownerBillingChoice === "delta_only") {
      resolvedBusinessBill = revisionIncrease;
    }

    setBusyId(lot.id);
    try {
      await approveLotCompletion(lot.id, {
        businessOwnerId: lot.businessOwnerId,
        ownerBillingChoice,
        ...(ownerBillAmount != null ? { ownerBillAmount } : {}),
        ...(resolvedBusinessBill != null && Number.isFinite(resolvedBusinessBill)
          ? { resolvedBusinessBill }
          : {}),
      });
      setApproveBillingModal(null);
      setCustomOwnerBillInput("");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Lot approved",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (e) {
      if (isStaleLotApprovalError(e)) {
        setApproveBillingModal(null);
        setCustomOwnerBillInput("");
        refreshData?.({ force: true });
        Swal.fire({
          icon: "info",
          title: "Lot already updated",
          text: "This lot is no longer awaiting approval (it was already approved, rejected, or changed). The list has been refreshed.",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Could not approve",
          text: String(e?.message || e || ""),
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (lot) => {
    setRejectReason("");
    setRejectModal(lot);
  };

  const submitReject = async () => {
    if (!rejectModal) return;
    const note = String(rejectReason || "").trim();
    if (!note) {
      Swal.fire({ icon: "warning", title: "Enter a rejection message" });
      return;
    }
    setBusyId(rejectModal.id);
    try {
      await rejectLotCompletion(rejectModal.id, note, {
        businessOwnerId: rejectModal.businessOwnerId,
      });
      setRejectModal(null);
      setRejectReason("");
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Lot rejected",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Could not reject",
        text: String(e?.message || e || ""),
      });
    } finally {
      setBusyId(null);
    }
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
          <div className="page-title">Review lots</div>
          <div className="page-subtitle">
            Party-submitted completions wait here. Approve to make lots billable
            to owner, or reject with a note the party will see.
          </div>
        </div>
      </div>

      <div className="toolbar pl-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search lot, design, party…"
        />
        <span className="pl-toolbar-meta" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {pendingLots.length} awaiting review
        </span>
      </div>

      <div className="table-wrapper">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Lot</th>
                <th>Design</th>
                <th>Party</th>
                <th>Collection</th>
                <th>Submitted</th>
                <th style={{ textAlign: "right" }}>Amount (₨)</th>
                <th>Receipt</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingLots.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState message="No lots are waiting for review" />
                  </td>
                </tr>
              ) : (
                pendingLots.map((l) => {
                  const pe = reportingPartyEdits[l.id] || {};
                  const submittedLabel = formatReviewSubmittedAt(l, pe);
                  return (
                    <tr
                      key={l.id}
                      id={`rl-lot-row-${l.id}`}
                      style={
                        String(highlightLotId) === String(l.id)
                          ? { background: "#FEF3C7", outline: "2px solid #F59E0B" }
                          : undefined
                      }
                    >
                      <td style={{ fontWeight: 700 }}>{l.lotNo || l.lotNumber}</td>
                      <td>{l.designNo}</td>
                      <td>{partyName(l.partyId, l.partyName)}</td>
                      <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {businessName(l.businessOwnerId)}
                      </td>
                      <td
                        style={{ fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}
                        title="When the party submitted this lot for review"
                      >
                        {submittedLabel || "—"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        ₨{peBill(l.id, l).toLocaleString()}
                      </td>
                      <td>
                        <LazyReceiptThumb
                          lotId={l.id}
                          receipt={pe.receipt}
                          hasReceipt={pe.hasReceipt}
                          businessOwnerId={l.businessOwnerId}
                          lotLabel={l.lotNo || l.lotNumber}
                          onOpen={setReceiptPreview}
                          emptyLabel="—"
                        />
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 220 }}>
                        <div>{pe.notes || "—"}</div>
                        {pendingRevisionIsReal(pe) ? (
                          <div style={{ fontSize: 11, color: "#92400e", marginTop: 6, lineHeight: 1.35 }}>
                            Party revised bill: ₨
                            {Number(pe.pendingRevision.fromAmount).toLocaleString()} → ₨
                            {Number(pe.pendingRevision.toAmount).toLocaleString()}
                            {hasOwnerReceivedForLot(l, reportingPayments) ? (
                              <span> · Owner payment exists for this lot</span>
                            ) : null}
                          </div>
                        ) : hasOwnerReceivedForLot(l, reportingPayments) ? (
                          <div style={{ fontSize: 11, color: "#0369a1", marginTop: 6 }}>
                            Owner payment is linked to this lot — choose how Ghausia bill should follow.
                          </div>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          style={{ marginRight: 6 }}
                          disabled={busyId === l.id}
                          onClick={() => handleApprove(l)}
                        >
                          {busyId === l.id ? (
                            <>
                              <Loader /> …
                            </>
                          ) : (
                            "Approve"
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                          disabled={busyId === l.id}
                          onClick={() => openReject(l)}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {approveBillingModal && (
        <Modal
          wide
          title={`Approve — owner bill (${approveBillingModal.lot.lotNo || approveBillingModal.lot.lotNumber})`}
          onClose={() => {
            if (busyId) return;
            setApproveBillingModal(null);
            setCustomOwnerBillInput("");
          }}
          onFormSubmit={() => {
            void submitApproveWithBilling();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId}
                onClick={() => {
                  setApproveBillingModal(null);
                  setCustomOwnerBillInput("");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-success" disabled={busyId}>
                {busyId ? (
                  <>
                    <Loader /> Approving…
                  </>
                ) : (
                  "Approve with this billing option"
                )}
              </button>
            </>
          }
        >
          {(() => {
            const {
              lot,
              pe,
              showDelta,
              allowDeltaOnlyOption,
              revisionIncrease,
            } = approveBillingModal;
            const partyBill = peBill(lot.id, lot);
            const ghausia = Number(lot.billAmount || 0);
            const pr = pe.pendingRevision;
            return (
              <>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                  This lot needs a billing choice for the <strong>owner / Ghausia</strong> side
                  {showDelta ? " because the party changed the ledger amount while awaiting review" : ""}
                  {hasOwnerReceivedForLot(lot, reportingPayments)
                    ? ", and there is already a Received payment recorded against this lot number."
                    : "."}
                </p>
                <div
                  style={{
                    fontSize: 13,
                    marginBottom: 16,
                    padding: "12px 14px",
                    background: "#F8FAFC",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <strong>Party ledger (approved submission):</strong> ₨
                    {partyBill.toLocaleString()}
                  </div>
                  <div>
                    <strong>Current Ghausia bill on lot:</strong> ₨{ghausia.toLocaleString()}
                  </div>
                  {showDelta && pr ? (
                    <div style={{ marginTop: 6 }}>
                      <strong>Party revision:</strong> ₨
                      {Number(pr.fromAmount).toLocaleString()} → ₨
                      {Number(pr.toAmount).toLocaleString()} (positive difference ₨
                      {revisionIncrease.toLocaleString()})
                    </div>
                  ) : null}
                </div>
                {showDelta && !allowDeltaOnlyOption ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginBottom: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>Note:</strong> “Owner billed for party increase only” is shown only when a{" "}
                    <strong>Received</strong> payment from the owner is already linked to this lot (business
                    already settled for this lot number) and the party increased the ledger. Otherwise use
                    match, keep, or <strong>set custom Ghausia bill</strong>.
                  </p>
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="radio"
                      name="ownerBilling"
                      checked={ownerBillingChoice === "sync_party"}
                      onChange={() => setOwnerBillingChoice("sync_party")}
                    />
                    <span>
                      <strong>Match Ghausia bill to party ledger</strong> — set the lot&apos;s bill
                      to ₨{partyBill.toLocaleString()} (full party amount drives owner billing).
                    </span>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="radio"
                      name="ownerBilling"
                      checked={ownerBillingChoice === "keep_ghausia"}
                      onChange={() => setOwnerBillingChoice("keep_ghausia")}
                    />
                    <span>
                      <strong>Keep current Ghausia bill</strong> — leave the lot bill at ₨
                      {ghausia.toLocaleString()} (party ledger still stores the party figure).
                    </span>
                  </label>
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      background:
                        ownerBillingChoice === "custom_ghausia"
                          ? "#EFF6FF"
                          : "#FAFAFA",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        cursor: "pointer",
                        fontSize: 14,
                        marginBottom:
                          ownerBillingChoice === "custom_ghausia" ? 10 : 0,
                      }}
                    >
                      <input
                        type="radio"
                        name="ownerBilling"
                        checked={ownerBillingChoice === "custom_ghausia"}
                        onChange={() => setOwnerBillingChoice("custom_ghausia")}
                      />
                      <span>
                        <strong>Set custom Ghausia / owner bill</strong> — choose any amount to bill
                        the business (owner) side. Use when the party changed their ledger and you need a
                        different owner figure than &quot;match party&quot; or &quot;keep current&quot;.
                      </span>
                    </label>
                    {ownerBillingChoice === "custom_ghausia" ? (
                      <div style={{ marginLeft: 28, maxWidth: 300 }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            marginBottom: 6,
                          }}
                        >
                          Owner / Ghausia bill (₨)
                        </span>
                        <input
                          type="number"
                          className="form-input"
                          min={0}
                          step={1}
                          value={customOwnerBillInput}
                          onChange={(e) =>
                            setCustomOwnerBillInput(e.target.value)
                          }
                          onFocus={() =>
                            setOwnerBillingChoice("custom_ghausia")
                          }
                        />
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginTop: 6,
                            lineHeight: 1.4,
                          }}
                        >
                          Reference: party ledger ₨{partyBill.toLocaleString()}
                          {" · "}
                          current lot bill ₨{ghausia.toLocaleString()}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {allowDeltaOnlyOption ? (
                    <label
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      <input
                        type="radio"
                        name="ownerBilling"
                        checked={ownerBillingChoice === "delta_only"}
                        onChange={() => setOwnerBillingChoice("delta_only")}
                      />
                      <span>
                        <strong>Owner billed for party increase only</strong> — set the Ghausia bill
                        to ₨{revisionIncrease.toLocaleString()} (only the positive change since the party&apos;s
                        previous figure). Use this when the owner was already billed for the earlier amount.
                      </span>
                    </label>
                  ) : null}
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {rejectModal && (
        <Modal
          title={`Reject completion — ${rejectModal.lotNo || rejectModal.lotNumber}`}
          onClose={() => !busyId && setRejectModal(null)}
          onFormSubmit={() => {
            void submitReject();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyId}
                onClick={() => setRejectModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                disabled={busyId}
              >
                {busyId ? (
                  <>
                    <Loader /> Rejecting…
                  </>
                ) : (
                  "Reject lot"
                )}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 14 }}>
            The party will see this message on their ledger when the lot is
            rejected. They should return the lot to{" "}
            <strong>In progress</strong> before resubmitting.
          </p>
          <FormGroup label="Rejection description *">
            <textarea
              className="form-textarea"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain what needs to be fixed or corrected…"
              style={{ resize: "vertical" }}
            />
          </FormGroup>
        </Modal>
      )}

      {receiptPreview?.kind === "image" && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ""}`}
          onClose={() => setReceiptPreview(null)}
          footer={<button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>Close</button>}
        >
          <img src={receiptPreview.src} alt="" style={{ maxWidth: "100%", borderRadius: 8 }} />
        </Modal>
      )}
      {receiptPreview?.kind === "pdf" && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ""}`}
          onClose={() => setReceiptPreview(null)}
          footer={<button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>Close</button>}
        >
          <iframe src={receiptPreview.src} title="PDF" style={{ width: "100%", height: "70vh", border: "1px solid var(--border)", borderRadius: 8 }} />
        </Modal>
      )}
      {receiptPreview?.kind === "url" && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ""}`}
          onClose={() => setReceiptPreview(null)}
          footer={
            <>
              <a className="btn btn-primary" href={receiptPreview.src} target="_blank" rel="noreferrer">Open</a>
              <button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>Close</button>
            </>
          }
        >
          <p style={{ fontSize: 14 }}>{receiptPreview.src}</p>
        </Modal>
      )}
      {receiptPreview?.kind === "filename" && (
        <Modal
          title={`Receipt — ${receiptPreview.title || ""}`}
          onClose={() => setReceiptPreview(null)}
          footer={<button type="button" className="btn btn-ghost" onClick={() => setReceiptPreview(null)}>Close</button>}
        >
          <p>{receiptPreview.name}</p>
        </Modal>
      )}
    </div>
  );
}
