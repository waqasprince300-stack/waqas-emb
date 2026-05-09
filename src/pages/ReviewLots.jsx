import React, { useMemo, useState } from "react";
import Swal from "sweetalert2";
import { useApp } from "../context/AppContext";
import { Modal, FormGroup, EmptyState, SearchBar } from "../components/UI";
import Loader from "../components/Loader";
import LoaderDashboard from "../components/LoaderDashboard";

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
        aria-label="View receipt"
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
        className="btn btn-ghost btn-sm"
        style={{ padding: 6 }}
        onClick={() => onOpen({ kind: "pdf", src: receipt, title: lotLabel })}
      >
        PDF
      </button>
    );
  }
  if (kind === "url") {
    return (
      <button
        type="button"
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
      className="btn btn-ghost btn-sm"
      onClick={() => onOpen({ kind: "filename", name: receipt, title: lotLabel })}
    >
      File
    </button>
  );
}

export default function ReviewLots() {
  const {
    reportingLots,
    reportingPartyEdits,
    parties,
    businessOwners,
    approveLotCompletion,
    rejectLotCompletion,
    initialDataLoading,
  } = useApp();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [receiptPreview, setReceiptPreview] = useState(null);

  const businessName = (bizId) =>
    businessOwners.find((b) => String(b.id ?? b._id) === String(bizId || ""))
      ?.name || "—";

  const partyName = (pid, fallback) =>
    parties.find((p) => String(p.id) === String(pid || ""))?.name ||
    fallback ||
    "—";

  const pendingLots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reportingLots.filter((l) => {
      if (String(l.status || "").toLowerCase().trim() !== "pending approval")
        return false;
      if (!q) return true;
      const label = `${l.lotNo || ""} ${l.lotNumber || ""} ${l.designNo || ""} ${l.partyName || ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [reportingLots, search]);

  const peBill = (lotId, lot) => {
    const pe = reportingPartyEdits[lotId] || {};
    if (pe.partyBillAmount != null && Number(pe.partyBillAmount) > 0) {
      return Number(pe.partyBillAmount);
    }
    return Number(lot.billAmount || 0);
  };

  const handleApprove = async (lot) => {
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
      Swal.fire({
        icon: "error",
        title: "Could not approve",
        text: String(e?.message || e || ""),
      });
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

      <div className="toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search lot, design, party…"
        />
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
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
                <th>Complete date</th>
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
                  const completeYmd =
                    pe.completeDate
                      ? String(pe.completeDate).slice(0, 10)
                      : l.receivedBackDate
                        ? String(l.receivedBackDate).slice(0, 10)
                        : "—";
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 700 }}>{l.lotNo || l.lotNumber}</td>
                      <td>{l.designNo}</td>
                      <td>{partyName(l.partyId, l.partyName)}</td>
                      <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {businessName(l.businessOwnerId)}
                      </td>
                      <td>{completeYmd}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        ₨{peBill(l.id, l).toLocaleString()}
                      </td>
                      <td>
                        {pe.receipt &&
                        receiptPreviewKind(pe.receipt) !== "none" ? (
                          <ReceiptThumbButton
                            receipt={pe.receipt}
                            lotLabel={l.lotNo || l.lotNumber}
                            onOpen={setReceiptPreview}
                          />
                        ) : (
                          <span
                            style={{ color: "var(--text-muted)", fontSize: 12 }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 220 }}>
                        {pe.notes || "—"}
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

      {rejectModal && (
        <Modal
          title={`Reject completion — ${rejectModal.lotNo || rejectModal.lotNumber}`}
          onClose={() => !busyId && setRejectModal(null)}
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
                type="button"
                className="btn btn-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                disabled={busyId}
                onClick={submitReject}
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
