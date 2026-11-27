import React, { useState, useEffect, useMemo, useRef } from 'react';
import Swal from 'sweetalert2';
import apiService from '../../services/api';
import Loader from '../Loader';
import { Modal } from '../UI';
import { formatDisplayDate } from '../../utils/dateFilters';
import { formatLakhCrore } from '../../utils/numberToWords';
import { clearOwnerBillsSessionCache } from '../../utils/ownerBillCache';

/**
 * OwnerBillModal (Sleek, High-Contrast & Professional Design)
 * Matches Waqas's physical 100-page bill book (Bill #70 & #72 Muridke):
 * - Multi-select payments (Online transfers & Cash received)
 * - Clean layout without clunky borders or overflowing inputs
 * - Deep navy & charcoal palette with vibrant contrast (no washed-out peach)
 * - 1-Click "Pick Lots" modal showing ONLY billable lots
 * - Automatic 2-way sync: Qty * Rate = Amount; Amount / Qty = Rate
 * - 1-Page Physical Bill Pad Layout (fits neatly on 1 page for Print / PDF)
 * - 1-Click WhatsApp Roman Urdu Summary
 */

const STANDARD_BILL_ROWS = 15;
const STANDARD_BILL_LOTS_LIMIT = 15;

const localTodayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatShortWasooliNote = (note) => {
  if (!note) return '';
  const s = String(note).trim();
  if (s.toLowerCase().includes('bill revision adjustment')) return 'Adjustment';
  if (s.length > 20) return s.slice(0, 18) + '…';
  return s;
};

const formatShortDateYY = (dateVal) => {
  if (!dateVal) return '—';
  const str = String(dateVal).trim();
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(str)) {
    const parts = str.split(/[/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const yy = parts[2].slice(-2);
    return `${day}-${month}-${yy}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split('-');
    const yy = parts[0].slice(-2);
    return `${parts[2]}-${parts[1]}-${yy}`;
  }
  const d = new Date(dateVal);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${yy}`;
  }
  return str;
};

const toStandardDateIso = (dateVal) => {
  if (!dateVal) return '9999-99-99';
  const str = String(dateVal).trim();
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(str)) {
    const parts = str.split(/[/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}$/.test(str)) {
    const parts = str.split(/[/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = `20${parts[2]}`;
    return `${year}-${month}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const d = new Date(dateVal);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return str;
};

const getPaymentSortScore = (p, originalIdx = 0) => {
  if (!p) return 0;
  // 1. Check createdAt timestamp (ms)
  if (p.createdAt) {
    const t = new Date(p.createdAt).getTime();
    if (!Number.isNaN(t) && t > 0) return t;
  }
  // 2. Check MongoDB ObjectId (first 8 hex chars encode Unix seconds → convert to ms for consistent scale)
  const idStr = String(p.paymentId || p.id || p._id || '').trim();
  if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
    return parseInt(idStr.slice(0, 8), 16) * 1000;
  }
  // 3. Fallback ordinal installment at start of note (e.g. "1st", "2nd", "14th")
  const noteMatch = String(p.note || '').trim().match(/^(\d+)(?:st|nd|rd|th)?\b/i);
  if (noteMatch) {
    return parseInt(noteMatch[1], 10);
  }
  return originalIdx;
};

const formatBillLotNo = (l) => {
  if (!l) return '';
  let no = String(l.lotNo || l.lotNumber || '').trim();
  if (l.suitComponent === 'dupatta' && no && !no.endsWith('-D') && !no.endsWith('(D)')) {
    no = `${no}-D`;
  }
  return no;
};

const fallbackCopyText = (str) => {
  try {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (_) {
    // ignore clipboard error
  }
};

export default function OwnerBillModal({
  ownerId,
  ownerName,
  candidateLots = [],
  candidatePayments = [],
  existingBill = null,
  initialPreviousBalance = 0,
  onClose,
  onSaved,
}) {
  const isEditing = Boolean(existingBill);
  const [activeTab, setActiveTab] = useState(isEditing ? 'preview' : 'form'); // 'form' | 'preview'
  const [printLayout, setPrintLayout] = useState('1-up-landscape'); // Default: '1-up-landscape' (Single Bill on A4 Half-Sheet) | '2-up' (Double Bill: 1 Original + 1 Factory Copy) | '1-up-portrait' (Pre-Cut Slip)
  const [doubleBadgeType, setDoubleBadgeType] = useState('original-factory'); // 'original-factory' (1 Original + 1 Factory Copy) | 'both-original' (Dono Original)
  const [singleBadge, setSingleBadge] = useState('ORIGINAL'); // 'ORIGINAL' | 'FACTORY COPY'
  const [showCutLine, setShowCutLine] = useState(true); // Toggle center cutting dashed line
  const [saving, setSaving] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [settledPaymentIds, setSettledPaymentIds] = useState(new Set());

  // Bill Headers
  const [bookNo, setBookNo] = useState(existingBill?.bookNo || 1);
  const [billNo, setBillNo] = useState(existingBill?.billNo || 1);
  const [billDate, setBillDate] = useState(
    existingBill?.date || localTodayISO()
  );

  // 1. Lots in this Bill (Initialized immediately from existingBill or candidateLots — 0ms wait!)
  const [lots, setLots] = useState(() => {
    if (existingBill?.lots && existingBill.lots.length > 0) {
      return existingBill.lots.map((l) => ({
        lotId: String(l.lotId || l.id || l._id || ''),
        lotNo: String(l.lotNo || l.lotNumber || ''),
        designNo: String(l.designNo || ''),
        suitComponent: String(l.suitComponent || 'main'),
        quantity: Number(l.quantity || 0),
        rate: Number(l.rate || 0),
        amount: Number(l.amount || 0),
        note: String(l.note || l.itemDescription || l.description || ''),
        selected: true,
      }));
    }
    const currentCandidateLots = candidateLots || [];
    const unbilledLots = currentCandidateLots.filter((l) => {
      if (!((l.status === 'received back' || !l.status) && !l.ownerBillId && !l.billedInBillNo)) {
        return false;
      }
      // Exclude Rs 0 combined dupatta lots from auto-prefill so they don't consume 15-lot slots
      const amtVal = Number(l.businessBillAmount ?? l.billAmount ?? 0);
      const isCombDup = l.suitComponent === 'dupatta' && (l.ownerBillingChoice === 'combined' || amtVal === 0);
      return !isCombDup;
    });
    return unbilledLots.slice(0, STANDARD_BILL_LOTS_LIMIT).map((l) => {
      const qty = Number(l.suitQuantity || l.pieces || l.quantity || 0);
      const amt = Number(l.businessBillAmount || l.billAmount || 0);
      let rate = Number(l.ownerRate || l.rate || 0);
      if (!rate && qty > 0 && amt > 0) {
        const rawRate = amt / qty;
        rate = rawRate % 1 === 0 ? rawRate : Math.round(rawRate * 100) / 100;
      }
      const finalAmt = amt || (qty && rate ? Math.round(qty * rate) : 0);

      return {
        lotId: String(l.id || l._id || ''),
        lotNo: String(l.lotNo || l.lotNumber || ''),
        designNo: String(l.designNo || ''),
        suitComponent: String(l.suitComponent || 'main'),
        isRework: Boolean(l.isRework),
        quantity: qty,
        rate: rate,
        amount: finalAmt,
        note: String(l.itemDescription || l.description || ''),
        selected: true,
      };
    });
  });

  // 2. Pichla Unsettled Bill (Optional, e.g. Bill #71 = Rs 1,642,416)
  const [prevBillNo, setPrevBillNo] = useState(
    existingBill?.unpaidPreviousBills?.[0]?.billNo || ''
  );
  const [prevBillAmount, setPrevBillAmount] = useState(
    existingBill?.unpaidPreviousBills?.[0]?.amount || 0
  );

  // 3. Sabqa Baqaya (Previous Balance brought forward — supports negative Advance Surplus via string input)
  const [sabqaInput, setSabqaInput] = useState(() => {
    const initial =
      existingBill?.sabqaBaqaya != null
        ? Number(existingBill.sabqaBaqaya)
        : Number(initialPreviousBalance || 0);
    return Number.isFinite(initial) ? String(initial) : '0';
  });
  const sabqaBaqaya = useMemo(() => {
    const s = String(sabqaInput || '').trim();
    if (!s || s === '-') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }, [sabqaInput]);
  const [lastBillInfo, setLastBillInfo] = useState('');

  // 4. Multiple Online / Cash Payments Received (Wasooli)
  const [paymentsList, setPaymentsList] = useState(() => {
    if (existingBill?.paymentsReceived && existingBill.paymentsReceived.length > 0) {
      return existingBill.paymentsReceived.map((p) => ({
        paymentId: String(p.paymentId || p.id || p._id || ''),
        date: p.date ? String(p.date).slice(0, 10) : localTodayISO(),
        amount: Number(p.amount || 0),
        note: String(p.note || 'Online / Cash received'),
      }));
    }
    return [];
  });

  // 5. Katoti (Deductions: Dhaga / Kapra / Discount)
  const [katotiTitle, setKatotiTitle] = useState(
    existingBill?.deductions?.[0]?.title || 'Dhaga Katoti'
  );
  const [katotiAmount, setKatotiAmount] = useState(
    existingBill?.deductions?.[0]?.amount || 0
  );

  const [notes, setNotes] = useState(existingBill?.notes || '');
  const printAreaRef = useRef(null);
  const candidateLotsRef = useRef(candidateLots);
  candidateLotsRef.current = candidateLots;
  const defaultsLoadedRef = useRef(false);
  const dismissedRolloverRef = useRef(false);
  const userEditedBookOrBillRef = useRef(false);
  const userEditedSabqaRef = useRef(false);

  // Background Defaults & Settled Payments Sync (Runs cleanly for both new and edit mode)
  useEffect(() => {
    if (defaultsLoadedRef.current) return;

    let isMounted = true;
    async function loadDefaults() {
      try {
        const res = await apiService.getOwnerBills(ownerId);
        if (!isMounted) return;
        defaultsLoadedRef.current = true;

        // Save settledPaymentIds so picker marks payments already used in OTHER bills
        const next = res?.nextDefaults || {};
        const currentBillPayIds = new Set(
          (existingBill?.paymentsReceived || [])
            .map((p) => String(p.paymentId || p.id || p._id || '').trim())
            .filter(Boolean)
        );
        const billedIds = new Set(
          (next?.billedPaymentIds || []).filter((id) => !currentBillPayIds.has(String(id)))
        );
        setSettledPaymentIds(billedIds);

        if (isEditing) return;

        if (!userEditedBookOrBillRef.current) {
          if (next.nextBookNo) setBookNo(next.nextBookNo);
          if (next.nextBillNo) setBillNo(next.nextBillNo);
        }
        if (!userEditedSabqaRef.current) {
          const finalizedList = (res?.bills || []).filter((b) => b.status !== 'draft');
          if (finalizedList.length > 0) {
            if (next.lastSabqaBaqaya !== undefined) {
              setSabqaInput(String(Number(next.lastSabqaBaqaya || 0)));
            }
          } else if (Number.isFinite(Number(initialPreviousBalance)) && Number(initialPreviousBalance) !== 0) {
            setSabqaInput(String(Number(initialPreviousBalance)));
          }
        }
        if (next.lastBillDate) {
          setLastBillInfo(`Pichla bill ${formatDisplayDate(next.lastBillDate)} ko finalize hua tha.`);
        }
      } catch (err) {
        console.warn('Could not load bill defaults in background:', err.message);
      }
    }

    loadDefaults();
    return () => {
      isMounted = false;
    };
  }, [isEditing, existingBill, ownerId, initialPreviousBalance]);

  // Unbilled payments available for this owner (Online & Cash)
  const unbilledAvailablePayments = useMemo(() => {
    return (candidatePayments || []).filter(
      (p) =>
        p.type === 'Received' &&
        (!settledPaymentIds || !settledPaymentIds.has(String(p.id || p._id))) &&
        !p.isLegacySettled &&
        (!p.billedInBillNo || p.billedInBillNo === 'none')
    );
  }, [candidatePayments, settledPaymentIds]);

  const totalUnbilledAvailablePayments = useMemo(() => {
    return unbilledAvailablePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [unbilledAvailablePayments]);

  // Available billable candidate lots count (only received back / unbilled)
  const billableCandidateCount = useMemo(() => {
    return (candidateLots || []).filter(
      (l) => (l.status === 'received back' || !l.status) && !l.ownerBillId && !l.billedInBillNo
    ).length;
  }, [candidateLots]);

  // Calculations matching Waqas's physical bill formula exactly:
  const currentBillTotal = useMemo(
    () => lots.reduce((sum, l) => sum + Number(l.amount || 0), 0),
    [lots]
  );

  const prevBillTotal = useMemo(
    () => Number(prevBillAmount || 0),
    [prevBillAmount]
  );

  const kulKaamTotal = useMemo(
    () => currentBillTotal + prevBillTotal,
    [currentBillTotal, prevBillTotal]
  );

  const grossTotal = useMemo(
    () => kulKaamTotal + Number(sabqaBaqaya || 0),
    [kulKaamTotal, sabqaBaqaya]
  );

  const validPayments = useMemo(
    () => paymentsList.filter((p) => p && Number(p.amount || 0) > 0),
    [paymentsList]
  );

  // Total Wasooli from multiple payments
  const totalWasooli = useMemo(
    () => validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [validPayments]
  );

  // Group payments by date (format: DD-MM-YY, e.g. 20-11-26), sorted chronologically (earliest date on top, earliest payments first)
  const groupedPaymentsByDate = useMemo(() => {
    const map = new Map();
    paymentsList.forEach((p, originalIdx) => {
      if (!p || Number(p.amount || 0) <= 0) return;
      const dateKey = formatShortDateYY(p.date);
      const isoKey = toStandardDateIso(p.date);
      if (!map.has(dateKey)) {
        map.set(dateKey, { isoKey, items: [] });
      }
      map.get(dateKey).items.push({ p, originalIdx });
    });

    const entries = Array.from(map.entries()).map(([dateKey, group]) => {
      // Sort items inside this date group chronologically (earliest payment first)
      const sortedItems = group.items
        .slice()
        .sort((a, b) => getPaymentSortScore(a.p, a.originalIdx) - getPaymentSortScore(b.p, b.originalIdx))
        .map((item) => item.p);
      return { dateKey, isoKey: group.isoKey, items: sortedItems };
    });

    // Sort date groups chronologically (earliest date on top, later date below)
    entries.sort((a, b) => a.isoKey.localeCompare(b.isoKey));

    return entries.map((e) => [e.dateKey, e.items]);
  }, [paymentsList]);

  const subTotalAfterWasooli = useMemo(
    () => grossTotal - totalWasooli,
    [grossTotal, totalWasooli]
  );

  const totalKatoti = useMemo(
    () => Number(katotiAmount || 0),
    [katotiAmount]
  );

  const grandTotalBaqaya = useMemo(
    () => subTotalAfterWasooli - totalKatoti,
    [subTotalAfterWasooli, totalKatoti]
  );

  // Lots table row editing with 2-way sync
  const updateLotRow = (index, field, value) => {
    setLots((arr) =>
      arr.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'quantity') {
          const q = Number(value || 0);
          const r = Number(item.rate || 0);
          const a = Number(item.amount || 0);
          if (r > 0) {
            updated.amount = Math.round(q * r);
          } else if (a > 0 && q > 0) {
            const rawRate = a / q;
            updated.rate = rawRate % 1 === 0 ? rawRate : Math.round(rawRate * 100) / 100;
          } else {
            updated.amount = 0;
          }
        } else if (field === 'rate') {
          const q = Number(item.quantity || 0);
          const r = Number(value || 0);
          updated.amount = Math.round(q * r);
        } else if (field === 'amount') {
          const a = Number(value || 0);
          const q = Number(item.quantity || 0);
          if (q > 0) {
            const rawRate = a / q;
            updated.rate = rawRate % 1 === 0 ? rawRate : Math.round(rawRate * 100) / 100;
          } else {
            updated.rate = 0;
          }
        }
        return updated;
      })
    );
  };

  const addManualLotRow = () => {
    if (lots.length >= STANDARD_BILL_LOTS_LIMIT) {
      Swal.fire({
        icon: 'info',
        title: `Standard Bill Limit (${STANDARD_BILL_LOTS_LIMIT} Lots)`,
        text: `Ek standard physical bill par maximum ${STANDARD_BILL_LOTS_LIMIT} lots aati hain taake bill pad ka standard size barabar rahe. Baqi lots ka agla bill banayein.`,
      });
      return;
    }
    setLots((arr) => [
      ...arr,
      {
        lotId: '',
        lotNo: '',
        designNo: '',
        suitComponent: 'main',
        quantity: 0,
        rate: 0,
        amount: 0,
        note: '',
      },
    ]);
  };

  const removeLotRow = (index) => {
    setLots((arr) => arr.filter((_, idx) => idx !== index));
  };

  // Add lots from Inventory picker (capped at standard 15 lots; preserves manual edits on already-picked lots)
  const handleAddLotsFromInventory = (selectedCandidateLots) => {
    const existingManualLots = lots.filter((l) => !l.lotId);
    const existingById = new Map(
      lots.filter((l) => l.lotId).map((l) => [String(l.lotId), l])
    );
    const availableSlotsForPicked = Math.max(0, STANDARD_BILL_LOTS_LIMIT - existingManualLots.length);
    const formatted = selectedCandidateLots.slice(0, availableSlotsForPicked).map((l) => {
      const idKey = String(l.id || l._id || '');
      if (idKey && existingById.has(idKey)) {
        return existingById.get(idKey);
      }
      const qty = Number(l.suitQuantity || l.pieces || l.quantity || 0);
      const amt = Number(l.businessBillAmount || l.billAmount || 0);
      let rate = Number(l.ownerRate || l.rate || 0);
      if (!rate && qty > 0 && amt > 0) {
        const rawRate = amt / qty;
        rate = rawRate % 1 === 0 ? rawRate : Math.round(rawRate * 100) / 100;
      }
      const finalAmt = amt || (qty && rate ? Math.round(qty * rate) : 0);

      return {
        lotId: idKey,
        lotNo: String(l.lotNo || l.lotNumber || ''),
        designNo: String(l.designNo || ''),
        suitComponent: String(l.suitComponent || 'main'),
        quantity: qty,
        rate: rate,
        amount: finalAmt,
        note: String(l.itemDescription || l.description || ''),
      };
    });

    setLots([...formatted, ...existingManualLots]);
    setShowLotPicker(false);
  };

  // Payment row editing
  const updatePaymentRow = (index, field, value) => {
    setPaymentsList((arr) =>
      arr.map((p, idx) => (idx === index ? { ...p, [field]: value } : p))
    );
  };

  const addManualPaymentRow = () => {
    setPaymentsList((arr) => [
      ...arr,
      {
        paymentId: '',
        date: billDate,
        amount: 0,
        note: 'Cash payment',
      },
    ]);
  };

  const removePaymentRow = (index) => {
    setPaymentsList((arr) => arr.filter((_, idx) => idx !== index));
  };

  // Add multiple payments from Payment Picker Modal (preserves edits made to already-included payments)
  const handleAddPaymentsFromPicker = (selectedPayments) => {
    const existingById = new Map(
      paymentsList.filter((p) => p.paymentId).map((p) => [String(p.paymentId), p])
    );
    const formatted = selectedPayments.map((p) => {
      const pid = String(p.id || p._id || '');
      if (pid && existingById.has(pid)) {
        return existingById.get(pid);
      }
      return {
        paymentId: pid,
        date: p.date ? String(p.date).slice(0, 10) : localTodayISO(),
        amount: Number(p.amount || 0),
        note: String(p.note || (p.paymentMethod ? `${p.paymentMethod} transfer` : 'Online transfer')).trim(),
      };
    });
    const existingManuals = paymentsList.filter((p) => !p.paymentId);
    setPaymentsList([...formatted, ...existingManuals]);
    setShowPaymentPicker(false);
  };

  // 100-Bill Book Transition prompt
  const handleBillNoChange = (val) => {
    userEditedBookOrBillRef.current = true;
    const num = Number(val || 0);
    setBillNo(num);
    if (num <= 100) {
      dismissedRolloverRef.current = false;
      return;
    }
    if (num > 100 && !dismissedRolloverRef.current) {
      dismissedRolloverRef.current = true;
      Swal.fire({
        title: 'Bill #100 Mukammal!',
        text: `1 bill book mein 100 bills hote hain. Kya aap Book ${Number(bookNo) + 1} shuru karke Bill #1 banana chahte hain?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: `Haan, Book ${Number(bookNo) + 1} shuru karein`,
        cancelButtonText: 'Nahi, yahi serial chalne dein',
      }).then((res) => {
        if (res.isConfirmed) {
          dismissedRolloverRef.current = false;
          setBookNo((b) => Number(b) + 1);
          setBillNo(1);
        }
      });
    }
  };

  // Save Bill to Server
  const handleSaveBill = async () => {
    if (!billNo) {
      Swal.fire({ icon: 'warning', title: 'Bill number zaroori hai' });
      return;
    }

    setSaving(true);
    try {
      const validLots = lots.filter(
        (l) => (l.lotNo && String(l.lotNo).trim()) || Number(l.amount || 0) > 0 || Number(l.quantity || 0) > 0
      );
      if (validLots.length === 0 && !prevBillAmount && Number(sabqaBaqaya || 0) === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Khali Bill Save Nahi Ho Sakta',
          text: 'Kam az kam 1 lot add karein ya koi pichla hisab shamil karein.',
        });
        setSaving(false);
        return;
      }

      const lotsPayload = validLots.map((l) => ({
        ...l,
        lotId: String(l.lotId || l.id || l._id || ''),
        quantity: Number(l.quantity || 0),
        rate: Number(l.rate || 0),
        amount: Number(l.amount || 0),
      }));

      const unpaidPreviousBills = prevBillAmount
        ? [{ billNo: String(prevBillNo || 'Pichla Bill'), amount: Number(prevBillAmount || 0) }]
        : [];

      const paymentsReceived = paymentsList
        .filter((p) => Number(p.amount || 0) > 0)
        .map((p) => ({
          paymentId: p.paymentId || '',
          date: p.date || billDate,
          amount: Number(p.amount || 0),
          note: p.note || 'Online / Cash received',
        }));

      const deductions = katotiAmount
        ? [{ title: katotiTitle || 'Katoti', amount: Number(katotiAmount || 0) }]
        : [];

      const payload = {
        bookNo: Number(bookNo || 1),
        billNo: Number(billNo || 1),
        date: billDate,
        ownerName: ownerName || 'Owner',
        businessOwnerId: ownerId,
        lots: lotsPayload,
        currentBillTotal,
        unpaidPreviousBills,
        unpaidPreviousBillsTotal: prevBillTotal,
        sabqaBaqaya: Number(sabqaBaqaya || 0),
        grossTotal,
        paymentsReceived,
        totalPaymentsReceived: totalWasooli,
        subTotalAfterPayments: subTotalAfterWasooli,
        deductions,
        totalDeductions: totalKatoti,
        grandTotalBaqaya,
        notes,
        status: 'finalized',
      };

      let savedResult;
      if (isEditing) {
        savedResult = await apiService.updateOwnerBill(existingBill.id || existingBill._id, payload, ownerId);
      } else {
        savedResult = await apiService.createOwnerBill(payload, ownerId);
      }
      clearOwnerBillsSessionCache(ownerId);

      const billedCandidateLotsCount = validLots.filter((l) => Boolean(l.lotId)).length;
      const remainingCount = Math.max(0, billableCandidateCount - billedCandidateLotsCount);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Bill #${billNo} kamiyabi se save ho gaya!`,
        text: isEditing
          ? `${validLots.length} lots aur hisab update ho gaya hai.`
          : remainingCount > 0
            ? `${billedCandidateLotsCount} lots settle ho gayi hain. Baqi ${remainingCount} lots ka agla bill banayein.`
            : validLots.length > 0
              ? `${validLots.length} lots completed status mein shift ho gayi hain.`
              : 'Hisab aur wasooli record save ho gayi hai.',
        showConfirmButton: false,
        timer: 3200,
      });

      onSaved?.(savedResult || { ...payload, billNo, bookNo });
      onClose();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Bill save nahi ho saka',
        text: err?.response?.data?.message || err?.message || 'Inputs check karein.',
      });
    } finally {
      setSaving(false);
    }
  };

  // WhatsApp Summary Generator (Clean, professional, multi-payment & dupatta suffix support)
  const generateWhatsAppText = () => {
    let text = `*RS EMBROIDERY*\n`;
    text += `*Mian Waqas:* 0300-0840719\n`;
    text += `Address: Kot Hanif Sheikhupura Road 4 Km Muridke\n`;
    text += `*Bill #${billNo} (Book ${bookNo})* | *Bill To:* ${ownerName || 'Ghausia Collection'}\n`;
    text += `*Date:* ${formatDisplayDate(billDate)}\n\n`;

    const validLots = lots.filter(
      (l) => (l.lotNo && String(l.lotNo).trim()) || Number(l.amount || 0) > 0 || Number(l.quantity || 0) > 0
    );

    if (validLots.length > 0) {
      text += `*1. CURRENT LOTS:*\n`;
      validLots.forEach((l, idx) => {
        text += `  ${idx + 1}. Lot ${formatBillLotNo(l) || '-'} (D# ${l.designNo || '-'}): ${l.quantity} suit @ Rs ${l.rate} = Rs ${Number(l.amount).toLocaleString()}${l.note ? ` (${l.note})` : ''}\n`;
      });
      text += `  *Current Lots Total:* Rs ${currentBillTotal.toLocaleString()}\n\n`;
    }

    if (prevBillTotal > 0) {
      text += `*+ Previous Bill (${prevBillNo || 'Previous'}):* +Rs ${prevBillTotal.toLocaleString()}\n`;
      text += `  *Total Work:* Rs ${kulKaamTotal.toLocaleString()}\n\n`;
    }

    if (Number(sabqaBaqaya || 0) < 0) {
      text += `*− Previous Advance Surplus:* −Rs ${Math.abs(Number(sabqaBaqaya)).toLocaleString()}\n`;
    } else if (Number(sabqaBaqaya || 0) > 0) {
      text += `*+ Previous Balance:* +Rs ${Number(sabqaBaqaya).toLocaleString()}\n`;
    }
    text += `*Gross Total:* Rs ${grossTotal.toLocaleString()}\n\n`;

    if (validPayments.length > 0) {
      text += `*− Payments Received:*\n`;
      groupedPaymentsByDate.forEach(([dateKey, items]) => {
        const line = items
          .map((p) => {
            const shortNote = formatShortWasooliNote(p.note);
            return `${Number(p.amount).toLocaleString()}${shortNote ? ` (${shortNote})` : ''}`;
          })
          .join(' | ');
        text += `  • *${dateKey}:* ${line}\n`;
      });
      if (validPayments.length > 1) {
        text += `  *Total Received:* −Rs ${totalWasooli.toLocaleString()}\n`;
      }
      text += `\n`;
    }

    if (totalKatoti > 0) {
      text += `*− Deductions (${katotiTitle}):* −Rs ${totalKatoti.toLocaleString()}\n`;
    }

    if (notes && String(notes).trim()) {
      text += `*📝 Note:* ${String(notes).trim()}\n`;
    }

    text += `\n=============================\n`;
    if (grandTotalBaqaya < 0) {
      text += `*👉 ADVANCE SURPLUS (PARTY ADVANCE):* Rs ${Math.abs(grandTotalBaqaya).toLocaleString()}\n`;
      if (formatLakhCrore(Math.abs(grandTotalBaqaya))) {
        text += `(${formatLakhCrore(Math.abs(grandTotalBaqaya))} Advance)\n`;
      }
    } else {
      text += `*👉 NET PAYABLE:* Rs ${grandTotalBaqaya.toLocaleString()}\n`;
      if (formatLakhCrore(grandTotalBaqaya)) {
        text += `(${formatLakhCrore(grandTotalBaqaya)})\n`;
      }
    }
    text += `=============================\n`;
    text += `Prepared By: Waqas`;
    return text;
  };

  const copyWhatsAppText = () => {
    const text = generateWhatsAppText();
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'WhatsApp summary copy ho gaya!',
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const shareDirectWhatsApp = () => {
    const text = generateWhatsAppText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-official-bill');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-official-bill');
    };
  }, []);

  const executePrint = () => {
    const printEl = printAreaRef.current;
    if (printEl) {
      try {
        document.querySelectorAll('iframe[data-owner-bill-print="1"]').forEach((el) => el.remove());
        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-owner-bill-print', '1');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);

        const isLandscape = printLayout === '1-up-landscape' || printLayout === '2-up';
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Bill #${billNo} - Mian Waqas (RS EMBROIDERY)</title>
              <style>
                @page {
                  size: ${isLandscape ? 'A4 landscape' : '148mm 210mm portrait'};
                  margin: ${isLandscape ? '4mm 5mm' : '4mm 4mm'};
                }
                * {
                  box-sizing: border-box !important;
                }
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  width: 100% !important;
                  height: 100% !important;
                  background: #ffffff !important;
                  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  text-rendering: geometricPrecision !important;
                  -webkit-font-smoothing: antialiased !important;
                }
                .official-bill-landscape-sheet {
                  display: flex !important;
                  flex-direction: row !important;
                  justify-content: ${printLayout === '1-up-portrait' ? 'center' : 'space-between'} !important;
                  align-items: stretch !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  height: ${isLandscape ? '194mm' : '100%'} !important;
                  max-height: ${isLandscape ? '196mm' : 'none'} !important;
                  overflow: ${isLandscape ? 'hidden' : 'visible'} !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  box-sizing: border-box !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  position: relative !important;
                }
                .official-bill-half-pane {
                  flex: 0 0 50% !important;
                  width: 50% !important;
                  max-width: 50% !important;
                  min-width: 50% !important;
                  height: 100% !important;
                  display: flex !important;
                  box-sizing: border-box !important;
                  padding: 0 3mm !important;
                }
                .official-bill-container {
                  display: flex !important;
                  flex-direction: column !important;
                  justify-content: space-between !important;
                  box-shadow: none !important;
                  border: 1.5px solid #000000 !important;
                  border-radius: 2px !important;
                  box-sizing: border-box !important;
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                  background: #ffffff !important;
                  color: #000000 !important;
                  width: 100% !important;
                  height: 100% !important;
                  padding: 7px 9px !important;
                }
                .official-bill-top-section {
                  display: flex !important;
                  flex-direction: column !important;
                  flex: 1 1 auto !important;
                  min-height: 0 !important;
                }
                .official-bill-table {
                  flex: 1 1 auto !important;
                  height: 100% !important;
                  width: 100% !important;
                  border-collapse: collapse !important;
                  table-layout: fixed !important;
                }
                .official-bill-table tbody {
                  height: 100% !important;
                }
                .official-bill-table tbody tr,
                .official-bill-table tbody tr td {
                  padding: 2px 5px !important;
                  line-height: 1.15 !important;
                  vertical-align: middle !important;
                }
                .official-bill-bottom-section {
                  flex-shrink: 0 !important;
                  margin-top: auto !important;
                }
                .blank-half-sheet-print {
                  display: ${printLayout === '1-up-landscape' ? 'flex' : 'none'} !important;
                  border: none !important;
                  background: transparent !important;
                }
                .blank-half-sheet-print * {
                  display: none !important;
                }
                .cut-divider {
                  display: ${printLayout === '1-up-portrait' || !showCutLine ? 'none' : 'block'} !important;
                  position: absolute !important;
                  top: 0 !important;
                  bottom: 0 !important;
                  left: 50% !important;
                  width: 0 !important;
                  border-left: 1px dashed #64748b !important;
                  z-index: 10 !important;
                  pointer-events: none !important;
                }
                .cut-scissors-top {
                  position: absolute !important;
                  top: 2mm !important;
                  left: -6px !important;
                  font-size: 11px !important;
                  line-height: 1 !important;
                  background: #ffffff !important;
                  padding: 1px 0 !important;
                  color: #000000 !important;
                }
                .cut-scissors-bottom {
                  position: absolute !important;
                  bottom: 2mm !important;
                  left: -6px !important;
                  font-size: 11px !important;
                  line-height: 1 !important;
                  background: #ffffff !important;
                  padding: 1px 0 !important;
                  color: #000000 !important;
                }
                .bill-total-highlight,
                .bill-total-highlight * {
                  background: #000000 !important;
                  color: #ffffff !important;
                }
                table thead tr, table thead th {
                  background: #000000 !important;
                  color: #ffffff !important;
                }
              </style>
            </head>
            <body>
              ${printEl.outerHTML}
            </body>
          </html>
        `);
        doc.close();

        const removeIframe = () => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        };

        setTimeout(() => {
          iframe.contentWindow.onafterprint = removeIframe;
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(removeIframe, 60000);
        }, 250);
        return;
      } catch (err) {
        console.warn('Iframe print failed, falling back to window.print', err);
      }
    }
    // Fallback if iframe is blocked or printEl not found
    document.body.classList.add('printing-official-bill');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handlePrint = () => {
    if (activeTab !== 'preview') {
      setActiveTab('preview');
      setTimeout(() => {
        executePrint();
      }, 300);
    } else {
      executePrint();
    }
  };

  const validSlipLots = useMemo(
    () =>
      lots.filter(
        (l) =>
          (l.lotNo && String(l.lotNo).trim()) ||
          Number(l.amount || 0) > 0 ||
          Number(l.quantity || 0) > 0
      ),
    [lots]
  );

  const renderBillSlip = (copyBadge = 'PARTY COPY') => (
    <div
      className="official-bill-container"
      style={{
        background: '#FFFFFF',
        color: '#000000',
        padding: '8px 10px',
        border: '1.5px solid #000000',
        borderRadius: 2,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        width: '100%',
        height: '100%',
        minHeight: printLayout === '1-up-portrait' ? '660px' : '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Section: Header + 15-Row Standard Table */}
      <div
        className="official-bill-top-section"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: '2px solid #000000', paddingBottom: 5, marginBottom: 4, flexShrink: 0 }}>
          {/* Top Row: Owner Name, Copy Badge, Phone */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 800, color: '#000000', marginBottom: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Mian Waqas</span>
            <span
              className={`bill-badge-premium ${copyBadge === 'ORIGINAL' ? 'bill-badge-premium--original' : 'bill-badge-premium--factory'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                fontSize: 10,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: '2.5px 12px',
                borderRadius: 3,
                lineHeight: 1.2,
                ...(copyBadge === 'ORIGINAL'
                  ? {
                      background: '#000000',
                      color: '#ffffff',
                      border: '1.5px solid #000000',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
                    }
                  : {
                      background: '#ffffff',
                      color: '#000000',
                      border: '1.5px dashed #000000',
                    }),
              }}
            >
              {copyBadge === 'ORIGINAL' ? (
                <>
                  <span style={{ fontSize: 9, opacity: 0.85 }}>★</span>
                  <span>ORIGINAL</span>
                  <span style={{ fontSize: 9, opacity: 0.85 }}>★</span>
                </>
              ) : (
                <span>{copyBadge}</span>
              )}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 800 }}>Mob: 0300-0840719</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: 18.5, fontWeight: 900, letterSpacing: '0.05em', color: '#000000', textTransform: 'uppercase', lineHeight: 1.15, marginTop: 1 }}>
            RS EMBROIDERY
          </div>
          <div style={{ textAlign: 'center', fontSize: 9.5, color: '#334155', fontWeight: 700, letterSpacing: '0.01em', marginTop: 1 }}>
            Address: Kot Hanif Sheikhupura Road 4 Km Muridke
          </div>
          {/* Bill Meta Row: Bill To on the left, Date & Book#/Bill# on the right — Perfectly Balanced & Opposed */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: '#000000',
              borderTop: '1.5px solid #000000',
              marginTop: 4,
              paddingTop: 4,
              paddingBottom: 2,
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.03em', color: '#0f172a' }}>Bill To:</span>
              <span style={{ fontWeight: 900, fontSize: 12, borderBottom: '1.5px solid #000000', paddingBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ownerName || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, fontSize: 10.5, fontWeight: 800 }}>
              <div>
                <span>Date: </span>
                <span style={{ fontWeight: 900, borderBottom: '1px solid #000000', paddingBottom: 1 }}>{formatDisplayDate(billDate)}</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f8fafc', padding: '1.5px 7px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
                <span>Book#: <strong style={{ fontWeight: 900, color: '#000000' }}>{bookNo}</strong></span>
                <span style={{ color: '#94a3b8' }}>|</span>
                <span>Bill#: <strong style={{ fontWeight: 900, color: '#000000' }}>{billNo}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Standard Fixed 15-Row Table (Physical Bill Book Format) */}
        <table
          className="official-bill-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 10,
            color: '#000000',
            marginBottom: 0,
            flex: '1 1 auto',
            height: '100%',
            tableLayout: 'fixed',
          }}
        >
          <thead style={{ flexShrink: 0 }}>
            <tr style={{ background: '#0f172a', color: '#ffffff', height: 22 }}>
              <th style={{ padding: '3px 2px', width: 26, textAlign: 'center', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>SR#</th>
              <th style={{ padding: '3px 4px', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>LOT#</th>
              <th style={{ padding: '3px 4px', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>DESIGN#</th>
              <th style={{ padding: '3px 2px', width: 38, textAlign: 'right', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>QTY</th>
              <th style={{ padding: '3px 2px', width: 44, textAlign: 'right', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>RATE</th>
              <th style={{ padding: '3px 8px 3px 4px', width: 104, textAlign: 'right', border: '1px solid #000000', color: '#ffffff', fontWeight: 800, whiteSpace: 'nowrap' }}>AMOUNT (RS)</th>
            </tr>
          </thead>
          <tbody style={{ height: '100%' }}>
            {validSlipLots.length === 0 ? (
              <>
                <tr style={{ height: 'calc((100% - 22px) / 15)', minHeight: 24, background: '#ffffff' }}>
                  <td style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#94a3b8', fontWeight: 600, verticalAlign: 'middle' }}>1</td>
                  <td colSpan={5} style={{ padding: '3px 6px', color: '#64748b', fontStyle: 'italic', border: '1px solid #cbd5e1', fontSize: 9.5, verticalAlign: 'middle' }}>
                    No lots added to this bill.
                  </td>
                </tr>
                {Array.from({ length: STANDARD_BILL_ROWS - 1 }).map((_, emptyIdx) => (
                  <tr key={`empty-${emptyIdx}`} style={{ height: 'calc((100% - 22px) / 15)', minHeight: 24, background: emptyIdx % 2 !== 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#94a3b8', fontWeight: 600, fontSize: 9.5, verticalAlign: 'middle' }}>{emptyIdx + 2}</td>
                    <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                  </tr>
                ))}
              </>
            ) : (
              <>
                {validSlipLots.map((l, idx) => (
                  <tr key={idx} style={{ height: 'calc((100% - 22px) / 15)', minHeight: 24, background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10, verticalAlign: 'middle' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '3px 4px', fontWeight: 800, border: '1px solid #cbd5e1', color: '#000000', fontSize: 10, verticalAlign: 'middle' }}>
                      {formatBillLotNo(l)}
                      {l.note ? <span style={{ fontSize: 8, color: '#334155', display: 'block', fontWeight: 600, lineHeight: 1.1 }}>{l.note}</span> : null}
                    </td>
                    <td style={{ padding: '3px 4px', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10, verticalAlign: 'middle' }}>
                      {l.designNo}
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10, verticalAlign: 'middle' }}>
                      {l.quantity}
                    </td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10, verticalAlign: 'middle' }}>
                      {l.rate}
                    </td>
                    <td style={{ padding: '3px 8px 3px 4px', textAlign: 'right', fontWeight: 800, border: '1px solid #cbd5e1', color: '#000000', fontSize: 10, verticalAlign: 'middle' }}>
                      Rs {Number(l.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, STANDARD_BILL_ROWS - validSlipLots.length) }).map((_, emptyIdx) => {
                  const rowNum = validSlipLots.length + emptyIdx + 1;
                  const isEven = (validSlipLots.length + emptyIdx) % 2 !== 0;
                  return (
                    <tr key={`empty-${emptyIdx}`} style={{ height: 'calc((100% - 22px) / 15)', minHeight: 24, background: isEven ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#94a3b8', fontWeight: 600, fontSize: 9.5, verticalAlign: 'middle' }}>
                        {rowNum}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1', verticalAlign: 'middle' }}>&nbsp;</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Section: Calculations Breakdown + Signature */}
      <div className="official-bill-bottom-section" style={{ marginTop: 'auto', paddingTop: 4, flexShrink: 0 }}>
        {/* Calculations Breakdown */}
        <div style={{ borderTop: '2px solid #000000', paddingTop: 4, fontSize: 11.5, color: '#000000' }}>
          {/* Row 1: Current Work */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 700, color: '#000000', fontSize: 12 }}>
            <span>Current Work (Lots Total):</span>
            <span style={{ fontWeight: 800 }}>Rs {currentBillTotal.toLocaleString()}</span>
          </div>

          {/* Row 2: Previous Unpaid Bill */}
          {prevBillTotal > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#000000', fontSize: 11.5 }}>
                <span>+ Previous Unpaid Bill ({prevBillNo || 'Previous'}):</span>
                <span style={{ fontWeight: 700 }}>+Rs {prevBillTotal.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2.5px 0', fontWeight: 700, borderTop: '1px dashed #64748b', color: '#000000', fontSize: 11.5 }}>
                <span>= Total Work (Current + Previous):</span>
                <span style={{ fontWeight: 800 }}>Rs {kulKaamTotal.toLocaleString()}</span>
              </div>
            </>
          )}

          {/* Row 3: Previous Balance / Advance Surplus */}
          {Number(sabqaBaqaya || 0) < 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 700, color: '#059669', fontSize: 12 }}>
              <span>− Advance Surplus (Pichla Advance):</span>
              <span style={{ fontWeight: 800 }}>−Rs {Math.abs(Number(sabqaBaqaya)).toLocaleString()}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 700, color: '#000000', fontSize: 12 }}>
              <span>+ Previous Balance:</span>
              <span style={{ fontWeight: 800 }}>+Rs {Number(sabqaBaqaya || 0).toLocaleString()}</span>
            </div>
          )}

          {/* Row 4: Gross Total (or Net Advance when negative with no payments/katoti) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '3px 0',
              fontWeight: 900,
              fontSize: 12.5,
              borderTop: '1.5px solid #000000',
              borderBottom: '1.5px solid #000000',
              margin: '3px 0',
              color: '#000000',
            }}
          >
            <span>
              {grossTotal < 0 && validPayments.length === 0 && totalKatoti === 0
                ? '= Net Advance:'
                : '= Gross Total:'}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
              {formatLakhCrore(Math.abs(grossTotal)) && (
                <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', fontWeight: 700 }}>
                  ({formatLakhCrore(Math.abs(grossTotal))}
                  {grossTotal < 0 ? ' Advance' : ''})
                </span>
              )}
              <span>
                {grossTotal < 0 && (validPayments.length > 0 || totalKatoti > 0) ? '−' : ''}Rs{' '}
                {Math.abs(grossTotal).toLocaleString()}
              </span>
            </span>
          </div>

          {/* Row 5: Payments Received (if any) */}
          {validPayments.length > 0 && (
            <div
              style={{
                padding: '3px 0',
                borderBottom: '1px dashed #cbd5e1',
                margin: '2px 0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#000000' }}>
                  − Payments Received ({validPayments.length === 1 ? formatShortDateYY(validPayments[0].date) : `${validPayments.length} Payments`}):
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#000000' }}>
                  −Rs {totalWasooli.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: '#1e293b',
                  marginTop: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  lineHeight: 1.35,
                }}
              >
                {groupedPaymentsByDate.map(([dateKey, items], gIdx) => (
                  <div key={gIdx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '1px 4px' }}>
                    <strong style={{ color: '#000000', fontWeight: 800, whiteSpace: 'nowrap' }}>• {dateKey}:</strong>
                    {items.map((p, pIdx) => {
                      const shortNote = formatShortWasooliNote(p.note);
                      return (
                        <span key={pIdx} style={{ fontWeight: 600 }}>
                          {Number(p.amount).toLocaleString()}
                          {shortNote ? <span style={{ fontSize: 8, color: '#64748b', marginLeft: 2 }}>({shortNote})</span> : null}
                          {pIdx < items.length - 1 ? <span style={{ color: '#94a3b8', margin: '0 4px' }}>|</span> : null}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 6: Deductions (if any) */}
          {totalKatoti > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#000000', fontSize: 11.5 }}>
              <span>− Deductions ({katotiTitle}):</span>
              <span style={{ fontWeight: 800 }}>-Rs {totalKatoti.toLocaleString()}</span>
            </div>
          )}

          {/* Row 7: Net Total (shown cleanly when deductions or wasooli exist) */}
          {(validPayments.length > 0 || totalKatoti > 0) && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 0',
                fontWeight: 900,
                fontSize: 12.5,
                borderTop: '1.5px solid #000000',
                borderBottom: '1.5px solid #000000',
                margin: '3px 0',
                color: '#000000',
              }}
            >
              <span>{grandTotalBaqaya < 0 ? '= Net Advance:' : '= Net Total:'}</span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                {formatLakhCrore(Math.abs(grandTotalBaqaya)) && (
                  <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', fontWeight: 700 }}>
                    ({formatLakhCrore(Math.abs(grandTotalBaqaya))}{grandTotalBaqaya < 0 ? ' Advance' : ''})
                  </span>
                )}
                <span>Rs {Math.abs(grandTotalBaqaya).toLocaleString()}</span>
              </span>
            </div>
          )}

          {notes && String(notes).trim() && (
            <div style={{ fontSize: 9.5, color: '#1e293b', paddingTop: 2, fontWeight: 600 }}>
              <strong>Note:</strong> {String(notes).trim()}
            </div>
          )}
        </div>

        {/* Footer Area: Prepared By (Left) + Write-able Lines for Manual Calculation (Right) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, paddingTop: 4, color: '#000000' }}>
          <div style={{ fontSize: 11, color: '#000000', fontWeight: 700, paddingBottom: 2 }}>
            <div>Prepared By: ____________</div>
          </div>
          <div style={{ width: 180, display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 2 }}>
            <div style={{ borderBottom: '1.5px solid #000000', height: 16 }}></div>
            <div style={{ borderBottom: '1.5px solid #000000', height: 16 }}></div>
            <div style={{ borderBottom: '1.5px solid #000000', height: 16 }}></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      wide
      overlayClassName="owner-bill-modal-overlay"
      title={
        <div className="owner-bill-modal-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
              Bill To: {ownerName || 'Party'} — Bill #{billNo} (Book {bookNo})
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginRight: 20 }} className="hide-print owner-bill-modal-tabs">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 20,
                border: activeTab === 'form' ? '1.5px solid var(--primary-light, #3b82f6)' : '1px solid var(--border)',
                background: activeTab === 'form' ? 'var(--primary, #1e40af)' : 'var(--card-bg)',
                color: activeTab === 'form' ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              📝 Simple Entry Form
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 20,
                border: activeTab === 'preview' ? '1.5px solid var(--primary-light, #3b82f6)' : '1px solid var(--border)',
                background: activeTab === 'preview' ? 'var(--primary, #1e40af)' : 'var(--card-bg)',
                color: activeTab === 'preview' ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              📄 Bill Pad (1-Page Print)
            </button>
          </div>
        </div>
      }
      onClose={onClose}
    >
      {activeTab === 'form' ? (
        /* ========================================================================= */
        /* SLEEK, MODERN 1-SCREEN BILL MAKER (Responsive & Theme-Adaptive)           */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header Row: Compact Sticky Info Bar */}
          <div
            className="owner-bill-info-bar"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div className="owner-bill-info-inputs-group" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Book#</span>
                <input
                  type="number"
                  min="1"
                  value={bookNo}
                  onChange={(e) => {
                    userEditedBookOrBillRef.current = true;
                    const v = e.target.value;
                    setBookNo(v === '' ? '' : Math.max(1, Number(v) || 1));
                  }}
                  onBlur={() => {
                    if (!bookNo || Number(bookNo) < 1) setBookNo(1);
                  }}
                  className="owner-bill-input"
                  style={{
                    width: 55,
                    padding: '5px 6px',
                    borderRadius: 6,
                    fontWeight: 800,
                    textAlign: 'center',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Bill#</span>
                <input
                  type="number"
                  min="1"
                  value={billNo}
                  onChange={(e) => handleBillNoChange(e.target.value)}
                  className="owner-bill-input"
                  style={{
                    width: 65,
                    padding: '5px 6px',
                    borderRadius: 6,
                    fontWeight: 900,
                    textAlign: 'center',
                    background: 'var(--primary-bg, #eff6ff)',
                    borderColor: 'var(--primary-light, #3b82f6)',
                    color: 'var(--primary, #1e40af)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Date</span>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="owner-bill-input"
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                />
              </div>
            </div>

            {/* Sabqa Baqaya / Advance Surplus Highlight Box */}
            <div
              className="owner-bill-sabqa-box"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: Number(sabqaBaqaya || 0) < 0 ? 'var(--success-bg, #f0fdf4)' : 'var(--warning-bg, #fffbeb)',
                padding: '6px 14px',
                borderRadius: 8,
                border: Number(sabqaBaqaya || 0) < 0 ? '1px solid var(--success, #15803d)' : '1px solid var(--warning-border, #fde68a)',
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 800, color: Number(sabqaBaqaya || 0) < 0 ? 'var(--success, #15803d)' : 'var(--warning-text, #92600a)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {Number(sabqaBaqaya || 0) < 0 ? 'Advance Surplus:' : 'Previous Balance:'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Rs</span>
              <input
                type="text"
                inputMode="numeric"
                value={sabqaInput}
                onChange={(e) => {
                  userEditedSabqaRef.current = true;
                  const cleaned = e.target.value.replace(/[^0-9.-]/g, '');
                  setSabqaInput(cleaned);
                }}
                onBlur={() => {
                  if (sabqaInput === '' || sabqaInput === '-') setSabqaInput('0');
                }}
                placeholder="0 (or -5000 advance)"
                style={{
                  width: 120,
                  padding: '2px 0',
                  borderRadius: 4,
                  fontWeight: 900,
                  fontSize: 15,
                  background: 'transparent',
                  border: 'none',
                  color: Number(sabqaBaqaya || 0) < 0 ? 'var(--success, #15803d)' : 'var(--warning-text, #92600a)',
                  textAlign: 'right',
                }}
              />
            </div>
          </div>

          {lastBillInfo && (
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: -6, paddingLeft: 4 }}>
              💡 {lastBillInfo} Previous balance carried forward from last finalized bill.
            </div>
          )}

          {/* Section 1: Clean, Elegant Lots Table */}
          <div
            className="owner-bill-surface"
            style={{
              overflow: 'hidden',
            }}
          >
            {/* Multi-Bill Info Banner if lots > 15 */}
            {billableCandidateCount > STANDARD_BILL_LOTS_LIMIT && (
              <div
                style={{
                  background: 'var(--primary-bg, #eff6ff)',
                  borderBottom: '1px solid var(--border)',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12,
                  color: 'var(--primary, #1e40af)',
                }}
              >
                <div>
                  <strong>ℹ️ Standard Bill Book Size ({STANDARD_BILL_LOTS_LIMIT} Lots / Page):</strong> Total {billableCandidateCount} billable lots. First {STANDARD_BILL_LOTS_LIMIT} lots in Bill #{billNo}, remaining in next bill.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowLotPicker(true)}
                  style={{ whiteSpace: 'nowrap', fontWeight: 700 }}
                >
                  ⚡ Select Lots
                </button>
              </div>
            )}

            {/* Table Toolbar */}
            <div
              className="owner-bill-lots-toolbar"
              style={{
                padding: '10px 14px',
                background: 'var(--body-bg, #f8fafc)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div className="owner-bill-lots-header-info" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text-primary)' }}>
                  1. Current Work (Lots)
                </span>
                <span
                  style={{
                    background: 'var(--primary-bg, #eff6ff)',
                    color: 'var(--primary, #1e40af)',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}
                >
                  {lots.length} / {STANDARD_BILL_LOTS_LIMIT} Lots — Rs {currentBillTotal.toLocaleString()}
                </span>
              </div>
              <div className="owner-bill-lots-btns" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowLotPicker(true)}
                  style={{ fontWeight: 700 }}
                >
                  📦 Pick Lots ({billableCandidateCount} available)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={addManualLotRow}
                  style={{ fontWeight: 600 }}
                >
                  + Add Row
                </button>
                {lots.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => setLots([])}
                    style={{ color: 'var(--danger, #dc2626)', borderColor: 'var(--border)' }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Mobile swipe hint */}
            <div className="owner-bill-mobile-hint">
              👉 Table ko daayein/baayein scroll karein (Swipe left/right)
            </div>

            {/* Table Body */}
            <div className="owner-bill-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: '380px' }}>
              <table style={{ width: '100%', minWidth: '660px', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--body-bg, #f8fafc)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ width: 36, textAlign: 'center', padding: '8px 4px', fontWeight: 700 }}>#</th>
                    <th style={{ width: 100, padding: '8px 6px', fontWeight: 700 }}>Lot#</th>
                    <th style={{ width: 110, padding: '8px 6px', fontWeight: 700 }}>Design#</th>
                    <th style={{ width: 85, textAlign: 'center', padding: '8px 6px', fontWeight: 700 }}>Qty</th>
                    <th style={{ width: 95, textAlign: 'center', padding: '8px 6px', fontWeight: 700 }}>Rate</th>
                    <th style={{ width: 125, textAlign: 'right', padding: '8px 8px', fontWeight: 700 }}>Amount (Rs)</th>
                    <th style={{ minWidth: 120, padding: '8px 6px', fontWeight: 700 }}>Note / Suit Bazo</th>
                    <th style={{ width: 35, textAlign: 'center', padding: '8px 4px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '28px 14px' }}>
                        {billableCandidateCount === 0 ? (
                          <span>Is waqt koi nayi billable lot maujood nahi hai. Nayi row add karne ke liye &quot;+ Add Row&quot; karein.</span>
                        ) : (
                          <span>Click &quot;📦 Pick Lots&quot; above to select billable lots or click &quot;+ Add Row&quot;.</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    lots.map((l, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 === 0 ? 'transparent' : 'var(--body-bg, rgba(0, 0, 0, 0.02))',
                        }}
                      >
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={l.lotNo || ''}
                            onChange={(e) => updateLotRow(idx, 'lotNo', e.target.value)}
                            placeholder="Lot#"
                            className="owner-bill-input"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12.5,
                              fontWeight: 700,
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={l.designNo || ''}
                            onChange={(e) => updateLotRow(idx, 'designNo', e.target.value)}
                            placeholder="Design#"
                            className="owner-bill-input"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12,
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            value={l.quantity || ''}
                            onChange={(e) => updateLotRow(idx, 'quantity', e.target.value)}
                            placeholder="Qty"
                            className="owner-bill-input"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12.5,
                              textAlign: 'center',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            step="any"
                            value={l.rate || ''}
                            onChange={(e) => updateLotRow(idx, 'rate', e.target.value)}
                            placeholder="Rate"
                            className="owner-bill-input"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12.5,
                              textAlign: 'center',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            value={l.amount || ''}
                            onChange={(e) => updateLotRow(idx, 'amount', e.target.value)}
                            placeholder="Amount"
                            className="owner-bill-input"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 13,
                              fontWeight: 800,
                              textAlign: 'right',
                              background: 'var(--primary-bg, #eff6ff)',
                              color: 'var(--primary, #1e40af)',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={l.note || ''}
                            onChange={(e) => updateLotRow(idx, 'note', e.target.value)}
                            placeholder="e.g. 2 suit bazo"
                            className="owner-bill-input"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12,
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '6px 2px' }}>
                          <button
                            type="button"
                            onClick={() => removeLotRow(idx)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--danger, #dc2626)',
                              cursor: 'pointer',
                              fontSize: 18,
                              padding: '2px 6px',
                              borderRadius: 4,
                            }}
                            title="Remove row"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Multi-Payment Wasooli Card (Supports multiple online & cash payments) */}
          <div
            className="owner-bill-surface"
            style={{
              padding: '12px 16px',
            }}
          >
            {/* Wasooli Header */}
            <div
              className="owner-bill-payments-toolbar"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div className="owner-bill-payments-header-info" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--success, #15803d)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  − Payments Received (Cash & Online)
                </span>
                <span
                  style={{
                    background: 'var(--success-bg, #f0fdf4)',
                    color: 'var(--success, #15803d)',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}
                >
                  {validPayments.length} Payments — Rs {totalWasooli.toLocaleString()}
                </span>
              </div>
              <div className="owner-bill-payments-btns" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {unbilledAvailablePayments.length > 0 && paymentsList.length === 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs owner-bill-payments-shamil-btn"
                    onClick={() => handleAddPaymentsFromPicker(unbilledAvailablePayments)}
                    style={{
                      fontWeight: 700,
                      color: 'var(--success, #15803d)',
                      background: 'var(--success-bg, #f0fdf4)',
                      borderColor: 'var(--border)',
                    }}
                    title="Shamil karein tamam unbilled online payments is bill ki wasooli mein"
                  >
                    ⚡ Shamil Karein ({unbilledAvailablePayments.length} Online — Rs {totalUnbilledAvailablePayments.toLocaleString()})
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowPaymentPicker(true)}
                  style={{ fontWeight: 700, color: 'var(--primary, #1e40af)', borderColor: 'var(--border)' }}
                >
                  🔍 Select Payments ({unbilledAvailablePayments.length} available)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={addManualPaymentRow}
                  style={{ fontWeight: 600 }}
                >
                  + Add Cash / Manual
                </button>
                {paymentsList.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => setPaymentsList([])}
                    style={{ color: 'var(--danger, #dc2626)', borderColor: 'var(--border)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Payments List (Multiple Rows) */}
            {paymentsList.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '6px 0' }}>
                No payments added yet. Click &quot;⚡ Shamil Karein&quot; or &quot;🔍 Select Payments&quot; above to include received payments or click &quot;+ Add Cash / Manual&quot;.
              </div>
            ) : (
              <div
                className="owner-bill-payments-list-container"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: '340px',
                  overflowY: 'auto',
                  paddingRight: 2,
                }}
              >
                {paymentsList.map((p, pIdx) => (
                  <div
                    key={pIdx}
                    className="owner-bill-payment-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--body-bg, rgba(0, 0, 0, 0.02))',
                      padding: '5px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="owner-bill-payment-col-date">
                      <input
                        type="date"
                        value={p.date}
                        onChange={(e) => updatePaymentRow(pIdx, 'date', e.target.value)}
                        className="owner-bill-input owner-bill-payment-date"
                        style={{
                          padding: '4px 6px',
                          fontSize: 12,
                          width: 120,
                          height: 30,
                        }}
                      />
                    </div>
                    <div className="owner-bill-payment-col-note" style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={p.note}
                        onChange={(e) => updatePaymentRow(pIdx, 'note', e.target.value)}
                        className="owner-bill-input owner-bill-payment-note"
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          fontSize: 12,
                          height: 30,
                        }}
                      />
                    </div>
                    <div className="owner-bill-payment-col-amount" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div
                        className="owner-bill-payment-amount"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: 125,
                          minWidth: 100,
                          height: 30,
                          background: 'var(--success-bg, #f0fdf4)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          padding: '0 6px',
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--success, #15803d)', marginRight: 3, fontWeight: 700 }}>Rs</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={p.amount || ''}
                          onChange={(e) => updatePaymentRow(pIdx, 'amount', Math.max(0, Number(e.target.value) || 0))}
                          style={{
                            width: '100%',
                            minWidth: 0,
                            padding: '2px 0',
                            fontSize: 12.5,
                            fontWeight: 800,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--success, #15803d)',
                            textAlign: 'right',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePaymentRow(pIdx)}
                        className="owner-bill-payment-del-btn"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--danger, #dc2626)',
                          cursor: 'pointer',
                          fontSize: 17,
                          lineHeight: 1,
                          padding: '2px 5px',
                          fontWeight: 800,
                        }}
                        title="Remove payment"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Clean Grid (Pichla Bill, Katoti, Remarks) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {/* Box 1: Pichla Bill */}
            <div
              className="owner-bill-surface"
              style={{
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                + Pichla Bill (Optional)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Bill #71"
                  value={prevBillNo}
                  onChange={(e) => setPrevBillNo(e.target.value)}
                  className="owner-bill-input"
                  style={{
                    width: 90,
                    minWidth: 0,
                    padding: '6px 8px',
                    fontSize: 12.5,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0,
                    background: 'var(--body-bg, #f8fafc)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '0 8px',
                  }}
                >
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginRight: 4 }}>Rs</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={prevBillAmount || ''}
                    onChange={(e) => setPrevBillAmount(Math.max(0, Number(e.target.value) || 0))}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '6px 0',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.3 }}>
                ℹ️ Sirf tab daalein agar pichle bill ka amount ooper &quot;Previous Balance&quot; mein shamil na ho.
              </div>
            </div>

            {/* Box 2: Katoti */}
            <div
              className="owner-bill-surface"
              style={{
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger, #dc2626)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                − Katoti (Dhaga / Kapra / Discount)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Dhaga Katoti"
                  value={katotiTitle}
                  onChange={(e) => setKatotiTitle(e.target.value)}
                  className="owner-bill-input"
                  style={{
                    width: 120,
                    minWidth: 0,
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0,
                    background: 'var(--danger-bg, #fef2f2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '0 8px',
                  }}
                >
                  <span style={{ fontSize: 11.5, color: 'var(--danger, #dc2626)', marginRight: 4, fontWeight: 700 }}>Rs</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={katotiAmount || ''}
                    onChange={(e) => setKatotiAmount(Math.max(0, Number(e.target.value) || 0))}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '6px 0',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--danger, #dc2626)',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Box 3: Special Remarks / Note */}
            <div
              className="owner-bill-surface"
              style={{
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Special Remarks / Note
              </div>
              <input
                type="text"
                placeholder="e.g. Rate adjusted for design #2521"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="owner-bill-input"
                style={{
                  width: '100%',
                  minWidth: 0,
                  padding: '6px 8px',
                  fontSize: 12.5,
                }}
              />
            </div>
          </div>

          {/* Section 4: High-Contrast Premium Final Summary Card */}
          <div
            className="owner-bill-summary-card"
            style={{
              background: 'var(--card-bg)',
              border: '1.5px solid var(--border)',
              borderRadius: 14,
              padding: '14px 18px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Top Row: Mini pills of components */}
            <div className="owner-bill-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'var(--body-bg, #f8fafc)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Current Work</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>Rs {currentBillTotal.toLocaleString()}</div>
              </div>

              {prevBillTotal > 0 && (
                <div style={{ background: 'var(--body-bg, #f8fafc)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>+ Previous Bill</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary, #1e40af)', marginTop: 2 }}>+Rs {prevBillTotal.toLocaleString()}</div>
                </div>
              )}

              {Number(sabqaBaqaya || 0) < 0 ? (
                <div style={{ background: 'var(--success-bg, #f0fdf4)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--success, #15803d)' }}>
                  <div style={{ fontSize: 11, color: 'var(--success, #15803d)', fontWeight: 600 }}>− Advance Surplus</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success, #15803d)', marginTop: 2 }}>−Rs {Math.abs(Number(sabqaBaqaya || 0)).toLocaleString()}</div>
                </div>
              ) : (
                <div style={{ background: 'var(--warning-bg, #fffbeb)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--warning-border, #fde68a)' }}>
                  <div style={{ fontSize: 11, color: 'var(--warning-text, #92600a)', fontWeight: 600 }}>+ Previous Balance</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--warning-text, #92600a)', marginTop: 2 }}>+Rs {Number(sabqaBaqaya || 0).toLocaleString()}</div>
                </div>
              )}

              <div style={{ background: 'var(--success-bg, #f0fdf4)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--success, #15803d)', fontWeight: 600 }}>− Received ({validPayments.length})</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--success, #15803d)', marginTop: 2 }}>−Rs {totalWasooli.toLocaleString()}</div>
              </div>

              <div style={{ background: 'var(--danger-bg, #fef2f2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--danger, #dc2626)', fontWeight: 600 }}>− Deductions</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--danger, #dc2626)', marginTop: 2 }}>−Rs {totalKatoti.toLocaleString()}</div>
              </div>
            </div>

            {/* Big Grand Total Banner */}
            <div
              className="owner-bill-grand-total-banner"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: grandTotalBaqaya < 0 ? 'var(--success, #15803d)' : 'var(--primary, #1e40af)',
                border: '1.5px solid var(--border)',
                borderRadius: 10,
                padding: '12px 18px',
                flexWrap: 'wrap',
                gap: 10,
                color: '#ffffff',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {grandTotalBaqaya < 0 ? '👉 ADVANCE SURPLUS (PARTY ADVANCE):' : '👉 NET PAYABLE (GRAND TOTAL):'}
                </div>
                {formatLakhCrore(Math.abs(grandTotalBaqaya)) && (
                  <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.85)', fontStyle: 'italic', marginTop: 2 }}>
                    ({formatLakhCrore(Math.abs(grandTotalBaqaya))} {grandTotalBaqaya < 0 ? 'Advance' : ''})
                  </div>
                )}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em' }}>
                Rs {Math.abs(grandTotalBaqaya).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div
            className="owner-bill-bottom-actions"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 4,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} className="owner-bill-utility-btns">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={copyWhatsAppText}
                style={{ fontWeight: 700 }}
              >
                📋 Copy WhatsApp
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={shareDirectWhatsApp}
                style={{ fontWeight: 700, color: 'var(--success, #15803d)', borderColor: 'var(--border)' }}
                title="Direct WhatsApp khol kar summary send karein"
              >
                📲 WhatsApp Share
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveTab('preview')}
                style={{ fontWeight: 700 }}
              >
                👁️ Bill Pad Preview
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10 }} className="owner-bill-primary-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving} style={{ fontWeight: 600 }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveBill}
                disabled={saving || !billNo}
                style={{
                  fontWeight: 800,
                  padding: '8px 22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {saving ? <Loader /> : null}
                {saving ? 'Saving...' : `💾 Save & Finalize Bill #${billNo}`}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* EXACT 1-PAGE PHYSICAL BILL PAD (Matches Waqas's Muridke Paper Pad 100%)    */
        /* 100% Roman Urdu, Ultra-High Contrast Jet Black Text on Pure White Paper   */
        /* ========================================================================= */
        <div>
          {/* Action Toolbar on Top (Hidden during Print) */}
          <div
            className="hide-print owner-bill-preview-toolbar"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 14,
              background: 'var(--card-bg)',
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* Tier 1: Navigation (Left) + View / Print Mode Controls (Right) */}
            <div
              className="owner-bill-toolbar-tier1"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm owner-bill-back-btn"
                onClick={() => setActiveTab('form')}
                style={{
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 12.5,
                }}
              >
                <span>←</span>
                <span>Edit Bill Details</span>
              </button>

              {/* View / Print Controls Group (Clean Segmented Pill + Options) */}
              <div
                className="owner-bill-preview-controls-group"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  className="owner-bill-layout-switcher"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'var(--body-bg, #f1f5f9)',
                    borderRadius: 7,
                    padding: 3,
                    border: '1px solid var(--border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPrintLayout('1-up-landscape')}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '5px 12px',
                      borderRadius: 5,
                      border: 'none',
                      background: printLayout === '1-up-landscape' ? 'var(--primary, #1e40af)' : 'transparent',
                      color: printLayout === '1-up-landscape' ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="A4 page par 1 single bill horizontally print karein"
                  >
                    📄 Single Bill (A4 Half-Sheet)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintLayout('2-up')}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '5px 12px',
                      borderRadius: 5,
                      border: 'none',
                      background: printLayout === '2-up' ? 'var(--primary, #1e40af)' : 'transparent',
                      color: printLayout === '2-up' ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="A4 page par aik sath 2 bills print karein"
                  >
                    📑 Double Bill (1 Original + 1 Copy)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintLayout('1-up-portrait')}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '5px 12px',
                      borderRadius: 5,
                      border: 'none',
                      background: printLayout === '1-up-portrait' ? 'var(--primary, #1e40af)' : 'transparent',
                      color: printLayout === '1-up-portrait' ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="Pehle se kati hui 14.8×21cm slip par print karein"
                  >
                    🏷️ Pre-Cut Slip (14.8×21cm)
                  </button>
                </div>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: showCutLine ? 'var(--primary, #1e40af)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    background: 'var(--card-bg)',
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    height: 32,
                    boxSizing: 'border-box',
                  }}
                  title="Center cut line show karein ya nahi"
                >
                  <input
                    type="checkbox"
                    checked={showCutLine}
                    onChange={(e) => setShowCutLine(e.target.checked)}
                    style={{ accentColor: 'var(--primary, #1e40af)', cursor: 'pointer' }}
                  />
                  ✂ Center Cut Line
                </label>

                {printLayout === '2-up' ? (
                  <button
                    type="button"
                    className="owner-bill-badge-toggle"
                    onClick={() => setDoubleBadgeType((prev) => (prev === 'original-factory' ? 'both-original' : 'original-factory'))}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card-bg)',
                      color: 'var(--primary, #1e40af)',
                      cursor: 'pointer',
                      height: 32,
                    }}
                    title="Toggle: 1 Original + 1 Copy ya Dono Original"
                  >
                    🏷️ {doubleBadgeType === 'both-original' ? 'Badge: Dono ORIGINAL' : 'Badge: 1 Original + 1 Copy'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="owner-bill-badge-toggle"
                    onClick={() => setSingleBadge((prev) => (prev === 'ORIGINAL' ? 'FACTORY COPY' : 'ORIGINAL'))}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card-bg)',
                      color: 'var(--primary, #1e40af)',
                      cursor: 'pointer',
                      height: 32,
                    }}
                    title="Toggle: ORIGINAL ya FACTORY COPY"
                  >
                    🏷️ Badge: {singleBadge}
                  </button>
                )}
              </div>
            </div>

            {/* Tier 2: Action Bar (Full Width, Perfectly Balanced Edge to Edge) */}
            <div
              className="owner-bill-toolbar-tier2"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                borderTop: '1px solid var(--border)',
                paddingTop: 10,
                flexWrap: 'wrap',
              }}
            >
              {/* Left: WhatsApp Sharing Suite */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={copyWhatsAppText}
                  style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px' }}
                >
                  <span>📋</span>
                  <span>Copy WhatsApp</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={shareDirectWhatsApp}
                  style={{
                    fontWeight: 700,
                    color: 'var(--success, #15803d)',
                    borderColor: 'var(--border)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 14px',
                  }}
                  title="Direct WhatsApp khol kar summary send karein"
                >
                  <span>📲</span>
                  <span>WhatsApp Share</span>
                </button>
              </div>

              {/* Right: Print & Finalize Save */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm btn-print-action"
                  onClick={handlePrint}
                  style={{
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 18px',
                    fontSize: 12.5,
                    borderColor: 'var(--border)',
                  }}
                >
                  <span>🖨️</span>
                  <span>Print Bill / PDF</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-save-action"
                  onClick={handleSaveBill}
                  disabled={saving}
                  style={{
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 22px',
                    fontSize: 13,
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  {saving ? <Loader /> : <span>💾</span>}
                  <span>{saving ? 'Saving...' : `Save Bill #${billNo}`}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile-Only Indicator */}
          <div
            className="owner-bill-mobile-preview-note"
            style={{
              display: 'none',
              background: 'var(--primary-bg, #eff6ff)',
              color: 'var(--primary, #1e40af)',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 700,
              marginBottom: 10,
              textAlign: 'center',
              border: '1px solid var(--border)',
            }}
          >
            📱 Mobile Fit View (Full Width) — Print par A4 Half-Sheet aayega
          </div>

          {/* Printable Hard-Form Bill Pad Area (Mobile Horizontally Scrollable) */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', paddingBottom: 10 }}>
            <div
              ref={printAreaRef}
              className="official-bill-landscape-sheet"
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: printLayout === '1-up-portrait' ? 'center' : 'space-between',
                alignItems: 'stretch',
                width: '100%',
                maxWidth: printLayout === '1-up-portrait' ? '490px' : '1020px',
                minHeight: printLayout === '1-up-portrait' ? '680px' : '710px',
                margin: '0 auto',
                boxSizing: 'border-box',
                position: 'relative',
              }}
            >
            {printLayout === '2-up' && (
              <>
                <div className="official-bill-half-pane" style={{ flex: '0 0 50%', width: '50%', minWidth: 0, display: 'flex', padding: '0 4px', boxSizing: 'border-box', height: '100%' }}>
                  {renderBillSlip('ORIGINAL')}
                </div>
                {showCutLine && (
                  <div
                    className="cut-divider"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: '50%',
                      width: 0,
                      borderLeft: '1px dashed #64748b',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    <span className="cut-scissors-top" style={{ position: 'absolute', top: 6, left: -6, fontSize: 11, background: '#ffffff', color: '#000000', lineHeight: 1 }}>✂</span>
                    <span className="cut-scissors-bottom" style={{ position: 'absolute', bottom: 6, left: -6, fontSize: 11, background: '#ffffff', color: '#000000', lineHeight: 1 }}>✂</span>
                  </div>
                )}
                <div className="official-bill-half-pane" style={{ flex: '0 0 50%', width: '50%', minWidth: 0, display: 'flex', padding: '0 4px', boxSizing: 'border-box', height: '100%' }}>
                  {renderBillSlip(doubleBadgeType === 'both-original' ? 'ORIGINAL' : 'FACTORY COPY')}
                </div>
              </>
            )}

            {printLayout === '1-up-landscape' && (
              <>
                <div className="official-bill-half-pane" style={{ flex: '0 0 50%', width: '50%', minWidth: 0, display: 'flex', padding: '0 4px', boxSizing: 'border-box', height: '100%' }}>
                  {renderBillSlip(singleBadge)}
                </div>
                {showCutLine && (
                  <div
                    className="cut-divider"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: '50%',
                      width: 0,
                      borderLeft: '1px dashed #64748b',
                      zIndex: 10,
                      pointerEvents: 'none',
                    }}
                  >
                    <span className="cut-scissors-top" style={{ position: 'absolute', top: 6, left: -6, fontSize: 11, background: '#ffffff', color: '#000000', lineHeight: 1 }}>✂</span>
                    <span className="cut-scissors-bottom" style={{ position: 'absolute', bottom: 6, left: -6, fontSize: 11, background: '#ffffff', color: '#000000', lineHeight: 1 }}>✂</span>
                  </div>
                )}
                <div
                  className="official-bill-half-pane blank-half-sheet-print"
                  style={{
                    flex: '0 0 50%',
                    width: '50%',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1.5px dashed var(--border, #cbd5e1)',
                    borderRadius: 4,
                    background: 'var(--body-bg, rgba(0, 0, 0, 0.02))',
                    color: 'var(--text-secondary, #64748b)',
                    padding: 20,
                    textAlign: 'center',
                    margin: '0 4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: 28, marginBottom: 8 }}>📄</span>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary, #0f172a)' }}>Blank Half-Sheet (Saaf Kaghaz)</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', marginTop: 4, maxWidth: 220 }}>
                    Center dashed line se cut karke ye aadhi sheet agle bill ke liye istemal kar sakte hain.
                  </span>
                </div>
              </>
            )}

            {printLayout === '1-up-portrait' && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', width: '100%', maxWidth: '490px' }}>
                {renderBillSlip(singleBadge)}
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* MODAL 1: PICK LOTS FROM INVENTORY */}
      {showLotPicker && (
        <LotPickerModal
          availableLots={candidateLots}
          currentlySelectedLotIds={lots.map((l) => l.lotId).filter(Boolean)}
          existingBillId={existingBill?.id || existingBill?._id || ''}
          manualLotsCount={lots.filter((l) => !l.lotId).length}
          currentBillNo={billNo}
          onClose={() => setShowLotPicker(false)}
          onConfirm={handleAddLotsFromInventory}
        />
      )}

      {/* MODAL 2: PICK MULTIPLE PAYMENTS FROM RECENT PAYMENTS */}
      {showPaymentPicker && (
        <PaymentPickerModal
          payments={candidatePayments.filter((p) => p.type === 'Received')}
          currentlySelectedPaymentIds={paymentsList.map((p) => p.paymentId).filter(Boolean)}
          settledPaymentIds={settledPaymentIds}
          onClose={() => setShowPaymentPicker(false)}
          onConfirm={handleAddPaymentsFromPicker}
        />
      )}
    </Modal>
  );
}

/**
 * Clean & Simple Lot Picker Modal
 * Lets user select up to standard 12 lots (Standard physical bill book size)
 */
function LotPickerModal({
  availableLots,
  currentlySelectedLotIds,
  existingBillId = '',
  manualLotsCount = 0,
  currentBillNo = 1,
  onClose,
  onConfirm,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set(currentlySelectedLotIds));
  const [search, setSearch] = useState('');
  const maxSelectable = Math.max(0, STANDARD_BILL_LOTS_LIMIT - Number(manualLotsCount || 0));

  const unbilledLots = useMemo(() => {
    const selectedSet = new Set(currentlySelectedLotIds || []);
    return (availableLots || []).filter((l) => {
      const id = String(l.id || l._id);
      if (selectedSet.has(id)) return true;
      if (existingBillId && String(l.ownerBillId || '') === String(existingBillId)) return true;
      const isReceivedBack = l.status === 'received back' || !l.status;
      return isReceivedBack && !l.ownerBillId && !l.billedInBillNo;
    });
  }, [availableLots, currentlySelectedLotIds, existingBillId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return unbilledLots;
    const q = search.toLowerCase();
    return unbilledLots.filter((l) =>
      String(l.lotNumber || l.lotNo || '').toLowerCase().includes(q) ||
      String(l.designNo || '').toLowerCase().includes(q)
    );
  }, [unbilledLots, search]);

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= maxSelectable) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: `Standard Bill Capacity: Maximum ${STANDARD_BILL_LOTS_LIMIT} lots!`,
            text:
              manualLotsCount > 0
                ? `${manualLotsCount} manual row pehle se add hai, is liye ${maxSelectable} inventory lots select ho sakti hain.`
                : `Ek standard physical bill par ${STANDARD_BILL_LOTS_LIMIT} lots aati hain. Baqi lots ka agla bill banayein.`,
            timer: 3200,
            showConfirmButton: false,
          });
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const selectFirstBatch = () => {
    const first = filtered.slice(0, maxSelectable).map((l) => String(l.id || l._id));
    setSelectedIds(new Set(first));
  };

  const selectNextBatch = () => {
    const next = filtered.slice(maxSelectable, maxSelectable * 2).map((l) => String(l.id || l._id));
    setSelectedIds(new Set(next));
  };

  const clearAll = () => setSelectedIds(new Set());

  const handleApply = () => {
    const chosen = availableLots.filter((l) => selectedIds.has(String(l.id || l._id)));
    onConfirm(chosen);
  };

  return (
    <Modal title={`📦 Select Lots from Inventory (Standard Bill: ${STANDARD_BILL_LOTS_LIMIT} Lots)`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {unbilledLots.length > STANDARD_BILL_LOTS_LIMIT && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12,
              color: 'var(--primary, #1d4ed8)',
              lineHeight: 1.4,
            }}
          >
            ℹ️ <strong>Standard Bill Book Size ({STANDARD_BILL_LOTS_LIMIT} Lots/Page):</strong> Total {unbilledLots.length} billable lots hain. Pehle {STANDARD_BILL_LOTS_LIMIT} lots ka Bill #{currentBillNo || 1} banayein, baqi lots agle bill mein jayeingi.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search Lot# ya Design#..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ flex: 1, minWidth: 160, padding: '6px 10px', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={selectFirstBatch}
              style={{ fontWeight: 700, color: 'var(--primary, #1d4ed8)', borderColor: 'var(--border)' }}
            >
              ⚡ Pehle {maxSelectable} Lots (Bill #{currentBillNo || 1})
            </button>
            {filtered.length > maxSelectable && maxSelectable > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={selectNextBatch}
                style={{ fontWeight: 700, color: 'var(--purple, #7c3aed)', borderColor: 'var(--border)' }}
              >
                ⚡ Agle Lots (Lots {maxSelectable + 1}-{Math.min(maxSelectable * 2, filtered.length)})
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-xs" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Koi lot nahi mili.
            </div>
          ) : (
            filtered.map((l, lIdx) => {
              const id = String(l.id || l._id);
              const checked = selectedIds.has(id);
              const qty = Number(l.suitQuantity || l.pieces || l.quantity || 0);
              const amt = Number(l.businessBillAmount || l.billAmount || 0);
              let rate = Number(l.ownerRate || l.rate || 0);
              if (!rate && qty > 0 && amt > 0) {
                const rawRate = amt / qty;
                rate = rawRate % 1 === 0 ? rawRate : Math.round(rawRate * 100) / 100;
              }

              return (
                <div
                  key={id}
                  onClick={() => toggle(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: checked ? 'var(--primary-bg, #eff6ff)' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => { }}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginRight: 4 }}>#{lIdx + 1}</span>
                        Lot #{l.lotNumber || l.lotNo || '—'} &nbsp;
                        <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(Design: {l.designNo || '—'})</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {qty} pcs {rate > 0 ? `@ Rs ${rate}` : ''} {l.fabric ? `• ${l.fabric}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--primary, #1e40af)' }}>
                    Rs {amt.toLocaleString()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: selectedIds.size === STANDARD_BILL_LOTS_LIMIT ? 'var(--success, #15803d)' : 'var(--text-primary)' }}>
            Selected: {selectedIds.size} / {STANDARD_BILL_LOTS_LIMIT} Lots {selectedIds.size === STANDARD_BILL_LOTS_LIMIT ? ' (Standard Bill Full)' : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              disabled={selectedIds.size === 0}
            >
              Bill mein Shamil Karein ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Clean & Powerful Multi-Select Payment Picker Modal
 * Lets user tick multiple received payments (Cash + Online transfers)
 */
function PaymentPickerModal({ payments, currentlySelectedPaymentIds, settledPaymentIds, onClose, onConfirm }) {
  const [selectedIds, setSelectedIds] = useState(new Set(currentlySelectedPaymentIds));
  const [search, setSearch] = useState('');

  const unbilledPayments = useMemo(() => {
    const selectedSet = new Set(currentlySelectedPaymentIds || []);
    return payments.filter((p) => {
      const id = String(p.id || p._id);
      if (selectedSet.has(id)) return true;
      if (settledPaymentIds && settledPaymentIds.has(id)) return false;
      if (p.isLegacySettled) return false;
      if (p.billedInBillNo != null && p.billedInBillNo !== '' && p.billedInBillNo !== 'none') return false;
      return true;
    });
  }, [payments, settledPaymentIds, currentlySelectedPaymentIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return unbilledPayments;
    const q = search.toLowerCase();
    return unbilledPayments.filter((p) => {
      const note = String(p.note || '').toLowerCase();
      const amt = String(p.amount || '');
      const date = String(p.date || '');
      return note.includes(q) || amt.includes(q) || date.includes(q);
    });
  }, [unbilledPayments, search]);

  const toggle = (id) => {
    if (settledPaymentIds && settledPaymentIds.has(id) && !selectedIds.has(id)) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Already Settled',
        text: 'Yeh payment pehle hi kisi aur finalized bill mein adjust ho chuki hai.',
        timer: 3000,
      });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const unbilled = filtered.filter((p) => {
      const id = String(p.id || p._id);
      return !settledPaymentIds || !settledPaymentIds.has(id) || selectedIds.has(id);
    });
    setSelectedIds(new Set(unbilled.map((p) => String(p.id || p._id))));
  };
  const clearAll = () => setSelectedIds(new Set());

  const selectedTotal = useMemo(() => {
    return payments
      .filter((p) => selectedIds.has(String(p.id || p._id)))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [payments, selectedIds]);

  const handleApply = () => {
    const chosen = payments.filter((p) => selectedIds.has(String(p.id || p._id)));
    onConfirm(chosen);
  };

  return (
    <Modal title="💳 Select Payments Received (Multi-Select)" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <input
            type="text"
            placeholder="Search amount, date, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-xs" onClick={selectAll}>
              Select Fresh
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card-bg)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Abhi koi nayi unbilled payment moojood nahi hai. Nayi payment record hone par yahan show hogi.
            </div>
          ) : (
            filtered.map((p) => {
              const id = String(p.id || p._id);
              const isSettled = settledPaymentIds && settledPaymentIds.has(id) && !selectedIds.has(id);
              const checked = selectedIds.has(id);
              const amt = Number(p.amount || 0);

              return (
                <div
                  key={id}
                  onClick={() => !isSettled && toggle(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border)',
                    cursor: isSettled ? 'not-allowed' : 'pointer',
                    opacity: isSettled ? 0.6 : 1,
                    background: checked ? 'var(--success-bg, #f0fdf4)' : (isSettled ? 'var(--danger-bg, #fef2f2)' : 'transparent'),
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSettled}
                      onChange={() => { }}
                      style={{ width: 17, height: 17, cursor: isSettled ? 'not-allowed' : 'pointer', accentColor: 'var(--success, #15803d)' }}
                    />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: isSettled ? 'var(--text-muted)' : 'var(--success, #15803d)' }}>
                        Rs {amt.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>
                        {formatDisplayDate(p.date)} {p.note ? `• ${p.note}` : ''}
                      </div>
                    </div>
                  </div>
                  <div>
                    {isSettled ? (
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 12,
                          background: 'var(--danger-bg, #fef2f2)',
                          color: 'var(--danger, #dc2626)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        Settled in Bill
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 12,
                          background: checked ? 'var(--success-bg, #f0fdf4)' : 'var(--body-bg, #f8fafc)',
                          color: checked ? 'var(--success, #15803d)' : 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {checked ? '✓ Selected' : 'Tap to pick'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Summary */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              Selected: {selectedIds.size} Payments
            </span>
            {selectedTotal > 0 && (
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--success, #15803d)', marginLeft: 8 }}>
                (Total: Rs {selectedTotal.toLocaleString()})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              style={{
                fontWeight: 800,
                background: '#059669',
                borderColor: '#047857',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.35)',
              }}
            >
              Bill mein Shamil Karein ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
