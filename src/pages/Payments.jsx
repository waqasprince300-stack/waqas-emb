import React, { useState, useMemo, useEffect } from 'react';
import Swal from 'sweetalert2';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, EmptyState, SearchBar } from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import ImageUploader from '../components/ImageUploader';
import apiService from '../services/api';
import { receiptPreviewKind } from '../components/receipt/ReceiptThumb';
import {
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
  formatDisplayDate,
} from '../utils/dateFilters';
import { getAdminLedgerOrBusinessBill, getPartyLedgerBillNumeric } from '../utils/partyBillPrivacy';
import {
  adminPaymentPartyLabel,
  adminPaymentTypeLabel,
  isOwnerBillSettlement,
} from '../utils/paymentDisplay';

function normalizeLotKey(linkedLot) {
  return String(linkedLot || '')
    .trim()
    .toLowerCase();
}

function lotDisplayRef(l) {
  return String(l.lotNumber ?? l.lotNo ?? '').trim();
}

/** Admin-approved / billable lot for party statement (mirrors Party Ledger “completed” side). */
function isLotPartyBillableStatus(status) {
  const s = String(status || '')
    .toLowerCase()
    .trim();
  return s === 'received back' || s === 'completed';
}

function partyRecordMatchesUser(partyIdOnRow, partyNameOnRow, userPartyId, userPartyName) {
  const pid = String(userPartyId || '').trim();
  const pname = String(userPartyName || '').trim();
  if (partyIdOnRow != null && String(partyIdOnRow).trim() !== '') {
    return String(partyIdOnRow) === pid;
  }
  return String(partyNameOnRow || '').trim() === pname;
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

function findLotByLinkedValue(reportingLots, linkedLotValue) {
  if (!linkedLotValue || !reportingLots?.length) return undefined;
  const key = normalizeLotKey(linkedLotValue);
  return reportingLots.find((l) => normalizeLotKey(lotDisplayRef(l)) === key);
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
  if (!linked) return { lotLabel: '', designLabel: '' };
  if (payment._synthetic && payment.linkedDesignNo) {
    return { lotLabel: linked, designLabel: String(payment.linkedDesignNo).trim() };
  }
  const lot = findLotByLinkedValue(lotsPool, linked);
  const design = lot?.designNo != null ? String(lot.designNo).trim() : '';
  return { lotLabel: linked, designLabel: design };
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

/** Lazy slip viewer for a payment row. List payloads omit the base64 blob, so we fetch on click. */
function PaymentSlipCell({ payment, isParty }) {
  const [loaded, setLoaded] = useState(String(payment.receipt || ''));
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);

  const hasSlip = Boolean(payment.receipt) || payment.hasReceipt === true;
  if (payment._synthetic || !hasSlip) {
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  }

  const open = async () => {
    let src = loaded;
    if (!src) {
      setLoading(true);
      try {
        const full = await apiService.getPayment(payment.id ?? payment._id, {
          skipTenantHeader: isParty,
          businessOwnerId: isParty
            ? undefined
            : String(payment.businessOwnerId?._id ?? payment.businessOwnerId ?? '').trim() ||
              undefined,
        });
        src = String(full?.receipt || '');
        setLoaded(src);
      } catch (err) {
        src = '';
        await Swal.fire({
          icon: 'error',
          title: 'Could not load slip',
          text: err?.message || 'Please try again.',
        });
      } finally {
        setLoading(false);
      }
    }
    if (src) setPreview({ kind: receiptPreviewKind(src), src });
  };

  return (
    <>
      <button
        type="button"
        className="btn-icon"
        onClick={open}
        title="View slip"
        disabled={loading}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {loading ? (
          <Loader />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1e40af"
            strokeWidth="2"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        )}
      </button>
      {preview && (
        <Modal title="Payment Slip" onClose={() => setPreview(null)}>
          {preview.kind === 'pdf' ? (
            <iframe
              src={preview.src}
              title="Slip PDF"
              style={{
                width: '100%',
                height: '70vh',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            />
          ) : (
            <img
              src={preview.src}
              alt=""
              style={{ maxWidth: '100%', borderRadius: 8, display: 'block', margin: '0 auto' }}
            />
          )}
        </Modal>
      )}
    </>
  );
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
  } = useApp();
  const { isAdmin, isParty, user } = useAuth();
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [ownerNameFilter, setOwnerNameFilter] = useState('All');
  const [search, setSearch] = useState('');
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

  const visibleDbPayments = useMemo(() => {
    if (!isParty) return reportingPayments;
    const pool = partyCrossPayments.length ? partyCrossPayments : payments;
    const pid = String(user?.partyId || '').trim();
    const pname = String(user?.partyName || '').trim();
    return pool.filter((p) => partyRecordMatchesUser(p.partyId, p.party, pid, pname));
  }, [isParty, reportingPayments, partyCrossPayments, payments, user?.partyId, user?.partyName]);

  const syntheticPartyBills = useMemo(() => {
    if (!isParty) return [];
    const pid = String(user?.partyId || '').trim();
    const pname = String(user?.partyName || '').trim();
    const lotsPool = partyCrossLots.length ? partyCrossLots : ghausiaLots;
    const linkedLotKeys = new Set(
      visibleDbPayments
        .filter(
          (p) =>
            p.type === 'Paid' &&
            p.linkedLot &&
            String(p.party || '')
              .toLowerCase()
              .trim() !== 'owner'
        )
        .map((p) => normalizeLotKey(p.linkedLot))
    );
    const rows = [];
    for (const l of lotsPool) {
      const match = String(l.partyId || '') === pid || String(l.partyName || '').trim() === pname;
      if (!match) continue;
      if (!isLotPartyBillableStatus(l.status)) continue;
      const ref = lotDisplayRef(l);
      if (ref && linkedLotKeys.has(normalizeLotKey(ref))) continue;

      const pe = partyCrossPartyEdits[l.id] || {};
      const amt = getPartyLedgerBillNumeric(pe);
      if (amt <= 0) continue;

      const when =
        latestDateFrom(l, [
          'updatedAt',
          'createdAt',
          'receivedBackDate',
          'dispatchDate',
          'allotDate',
          'receivedDate',
        ]) || parseDateFlexible(l.allotDate || l.receivedDate);
      rows.push({
        id: `__bill__${l.id}`,
        _synthetic: true,
        type: 'Bill',
        amount: amt,
        party: pname || 'Party',
        date: when instanceof Date ? when.toISOString().slice(0, 10) : String(l.allotDate || ''),
        updatedAt: when instanceof Date ? when.toISOString() : undefined,
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
    visibleDbPayments,
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

  const searchTerm = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      combinedRows.filter((p) => {
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
        if (searchTerm) {
          const { lotLabel, designLabel } = resolveLinkedLotDesignDisplay(p, lotsLookupForLinks);
          const haystack = [
            p.party,
            p.note,
            lotLabel,
            designLabel,
            pt,
            p.type,
            String(p.amount ?? ''),
            p.date,
            formatDisplayDate(p.date, ''),
          ]
            .map((v) => String(v || '').toLowerCase())
            .join(' ');
          if (!haystack.includes(searchTerm)) return false;
        }
        return true;
      }),
    [combinedRows, typeFilter, ownerNameFilter, isAdmin, isParty, searchTerm, lotsLookupForLinks]
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
    setCurrentPage(1);
  }, [typeFilter, ownerNameFilter, searchTerm]);

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
          .map((p) => normalizeLotKey(p.linkedLot))
      ),
    [reportingPayments]
  );

  const usedPaidLotKeys = useMemo(
    () =>
      new Set(
        reportingPayments
          .filter((p) => p.type === 'Paid' && p.linkedLot)
          .map((p) => normalizeLotKey(p.linkedLot))
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
          l.status !== 'completed' && !usedReceivedLotKeys.has(normalizeLotKey(lotDisplayRef(l)))
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
      if (usedPaidLotKeys.has(normalizeLotKey(lotDisplayRef(l)))) return false;
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

  /** Payments included in admin summary cards (respects Owner / workspace filter). */
  const adminSummaryPaymentsPool = useMemo(() => {
    if (!isAdmin) return reportingPayments;
    if (ownerNameFilter === 'All') return reportingPayments;
    const wid = String(ownerNameFilter).trim();
    return reportingPayments.filter((p) => paymentBusinessOwnerId(p) === wid);
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
    if (!form.amount) newErrors.amount = 'Amount is required';
    if (!form.date) newErrors.date = 'Date is required';
    if (form.type === 'Paid' && !form.party) newErrors.party = 'Please select a party';
    // Business / collection is required ONLY when money is received from the Owner (capital in).
    // For money received from another party, or any Paid entry, it is optional.
    if (isAdmin && businessCollectionRequired && !String(form.ownerWorkspaceId || '').trim()) {
      newErrors.ownerWorkspaceId =
        'Select which business / collection this owner payment belongs to.';
    }
    if (form.linkedLot) {
      const key = normalizeLotKey(form.linkedLot);
      const dup = reportingPayments.some(
        (p) => p.type === form.type && p.linkedLot && normalizeLotKey(p.linkedLot) === key
      );
      if (dup) {
        newErrors.linkedLot =
          form.type === 'Received'
            ? 'An owner payment is already linked to this lot. Each lot can only be used once.'
            : 'A party payment is already linked to this lot. Each lot can only be paid once.';
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
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
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
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{isParty ? 'My Payments' : 'Payments'}</div>
          <div className="page-subtitle">
            {isParty
              ? 'Your completed work bills, and payments sent to you by the business'
              : 'Track all money received from owner and paid to parties'}
          </div>
        </div>
        {isAdmin && (
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
        )}
      </div>

      {/* Summary */}
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
                label: 'Work billed (completed lots)',
                value: partyStatementSummary.billed,
                color: '#dc2626',
                icon: '↑',
              },
              {
                label: 'Received from business',
                value: partyStatementSummary.paidFromAdmin,
                color: '#15803d',
                icon: '↓',
                note: 'Payments the business recorded to you',
              },
              {
                label: 'Paid to business',
                value: partyStatementSummary.paidToBusiness,
                color: '#b91c1c',
                icon: '↑',
                note: 'Amounts you paid to the business',
              },
              {
                label: 'Net due (bill − in + out)',
                value: Math.abs(partyStatementSummary.due),
                color:
                  partyStatementSummary.due > 0
                    ? '#b91c1c'
                    : partyStatementSummary.due < 0
                      ? '#047857'
                      : '#64748b',
                icon:
                  partyStatementSummary.due > 0 ? '!' : partyStatementSummary.due < 0 ? '✓' : '=',
                note:
                  partyStatementSummary.due > 0
                    ? 'Net amount business still owes you (billed − received from biz + paid to biz)'
                    : partyStatementSummary.due < 0
                      ? 'You are ahead on this netting (equal in/out cancels)'
                      : 'Balanced net',
              },
              {
                label: 'Total rows',
                value: combinedRows.length,
                color: '#1e40af',
                isCount: true,
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  background: '#fff',
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {c.icon && !c.isCount && (
                    <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.icon}</span>
                  )}
                  <span style={{ fontSize: 22, fontWeight: 700, color: c.color }}>
                    {c.isCount ? c.value : `₨${Number(c.value).toLocaleString()}`}
                  </span>
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
                color: '#15803d',
                icon: '↓',
              },
              {
                label: 'Received from parties',
                value: receivedFromParties,
                color: '#059669',
                icon: '↓',
                note: 'Party → business',
              },
              {
                label: 'Paid to Parties',
                value: paidToNonOwnerParties,
                color: '#dc2626',
                icon: '↑',
              },
              {
                label: 'Net Balance',
                value: Math.abs(balance),
                color: balance >= 0 ? '#15803d' : '#dc2626',
                icon: balance >= 0 ? '+' : '-',
                note:
                  balance >= 0
                    ? 'Credit (owner + parties in − paid out)'
                    : 'Debit (owner + parties in − paid out)',
              },
              {
                label: 'Total Transactions',
                value: adminSummaryTransactionCount,
                color: '#1e40af',
                isCount: true,
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  background: '#fff',
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {c.icon && !c.isCount && (
                    <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.icon}</span>
                  )}
                  <span style={{ fontSize: 22, fontWeight: 700, color: c.color }}>
                    {c.isCount ? c.value : `₨${c.value.toLocaleString()}`}
                  </span>
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
                  width: `${ownerIn > 0 ? Math.min((_partyOut / ownerIn) * 100, 100) : 0}%`,
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
              ₨{_partyOut.toLocaleString()}
            </div>
          </div>
        </div>
      )} */}

      {/* Filter */}
      <div className={`toolbar pl-toolbar${isParty ? ' pl-toolbar--party-user' : ''}`}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={isParty ? 'Search lot, design, note…' : 'Search party, lot, design, note…'}
        />
        <select
          className="form-select pl-toolbar-filter pl-toolbar-filter--type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="All">All Types</option>
          <option>Received</option>
          <option>Paid</option>
          <option value="Bill">{isParty ? 'Work bill' : 'Bill'}</option>
        </select>
        {isAdmin && businessOwners.length > 0 && (
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
        )}
        <span className="pl-toolbar-meta" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {filtered.length} records
        </span>
      </div>

      {/* Table for Desktop & Tablet */}
      <div className="table-wrapper desktop-only-table">
        <div className="table-scroll">
          <table>
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
                <th>Slip</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8 + (isParty ? 0 : 1) + (isAdmin ? 1 : 0)}>
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
                    ? pt === 'Bill'
                      ? 'Work bill'
                      : pt
                    : adminPaymentTypeLabel(p);

                  const partyLabel = isParty
                    ? String(p.party || '—')
                    : adminPaymentPartyLabel(p, businessOwners);

                  const amt = Number(p.amount ?? 0);
                  const showPlus = isParty ? pt === 'Received' || pt === 'Bill' : p.type !== 'Paid';
                  const amtColor = partyWorkBill
                    ? '#dc2626'
                    : partyReceived
                      ? '#15803d'
                      : showPlus
                        ? '#15803d'
                        : '#dc2626';

                  const { lotLabel, designLabel } = resolveLinkedLotDesignDisplay(
                    p,
                    lotsLookupForLinks
                  );

                  return (
                    <tr key={`${String(p.id)}-${p._synthetic ? 'b' : 'p'}`}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                        {filtered.length - (pageStart + i)}
                      </td>
                      <td>{formatDisplayDate(p.date)}</td>
                      <td>
                        <span
                          style={{
                            background: ownerBill ? '#FFFBEB' : badgeGreen ? '#F0FDF4' : '#FEF2F2',
                            color: ownerBill ? '#92400E' : badgeGreen ? '#166534' : '#991B1B',
                            border: `1px solid ${
                              ownerBill ? '#FCD34D' : badgeGreen ? '#BBF7D0' : '#FECACA'
                            }`,
                            borderRadius: 20,
                            padding: '3px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      {!isParty && <td style={{ fontWeight: 500 }}>{partyLabel}</td>}
                      {isAdmin && (
                        <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                          {p._synthetic ? '—' : paymentOwnerColumn(p)}
                        </td>
                      )}
                      <td>
                        {lotLabel ? (
                          <div
                            style={{
                              background: '#EFF6FF',
                              color: '#1e40af',
                              border: '1px solid #BFDBFE',
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
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {p.note || '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 700,
                          fontSize: 14,
                          color: amtColor,
                        }}
                      >
                        {showPlus ? '+' : '-'}₨{amt.toLocaleString()}
                      </td>
                      <td>
                        <PaymentSlipCell payment={p} isParty={isParty} />
                      </td>
                      <td>
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
              ? pt === 'Bill'
                ? 'Work bill'
                : pt
              : adminPaymentTypeLabel(p);

            const partyLabel = isParty
              ? String(p.party || '—')
              : adminPaymentPartyLabel(p, businessOwners);

            const amt = Number(p.amount ?? 0);
            const showPlus = isParty ? pt === 'Received' || pt === 'Bill' : p.type !== 'Paid';
            const amtColor = partyWorkBill
              ? '#dc2626'
              : partyReceived
                ? '#15803d'
                : showPlus
                  ? '#15803d'
                  : '#dc2626';

            const { lotLabel, designLabel } = resolveLinkedLotDesignDisplay(
              p,
              lotsLookupForLinks
            );

            return (
              <div
                key={`mob-${String(p.id)}-${p._synthetic ? 'b' : 'p'}`}
                className="payment-card-mobile"
              >
                <div className="pmc-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: ownerBill ? '#FFFBEB' : badgeGreen ? '#F0FDF4' : '#FEF2F2',
                        color: ownerBill ? '#92400E' : badgeGreen ? '#166534' : '#991B1B',
                        border: `1px solid ${
                          ownerBill ? '#FCD34D' : badgeGreen ? '#BBF7D0' : '#FECACA'
                        }`,
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {typeLabel}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDisplayDate(p.date)}
                    </span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: amtColor }}>
                    {showPlus ? '+' : '-'}₨{amt.toLocaleString()}
                  </span>
                </div>

                <div className="pmc-body">
                  {!isParty && (
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                      Party: {partyLabel}
                    </div>
                  )}
                  {isAdmin && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Owner: {p._synthetic ? '—' : paymentOwnerColumn(p)}
                    </div>
                  )}
                  {lotLabel && (
                    <div
                      style={{
                        marginTop: 6,
                        background: '#EFF6FF',
                        color: '#1e40af',
                        border: '1px solid #BFDBFE',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'inline-block',
                      }}
                    >
                      Lot #{lotLabel} {designLabel ? `· Design: ${designLabel}` : ''}
                    </div>
                  )}
                  {p.note && (
                    <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>
                      Note: {p.note}
                    </div>
                  )}
                </div>

                <div className="pmc-footer">
                  <PaymentSlipCell payment={p} isParty={isParty} />
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
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
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
                        color: '#dc2626',
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
                      color: '#dc2626',
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
                  (isAdmin && !String(form.ownerWorkspaceId || '').trim())
                }
              >
                <option value="">None</option>
                {linkedLotOptions.map((l) => (
                  <option key={l.id} value={l.lotNo || l.lotNumber}>
                    {l.lotNo || l.lotNumber} / {l.designNo}
                    {form.type === 'Received' ? ` — ${l.status}` : ''}
                  </option>
                ))}
              </select>
              {errors.linkedLot && (
                <span
                  style={{
                    color: '#dc2626',
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
                    ? 'Default is the Party Ledger bill for this lot (not the Ghausia/owner figure) — you can change it before saving.'
                    : 'Default is the bill amount on the lot — you can change it before saving.'}
                </span>
              )}
              {errors.amount && (
                <span
                  style={{
                    color: '#dc2626',
                    fontSize: 11,
                    marginTop: 3,
                    display: 'block',
                  }}
                >
                  {errors.amount}
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
                    const today = new Date().toISOString().slice(0, 10);
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
                    color: '#1e40af',
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
                    color: '#dc2626',
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
    </div>
  );
}
