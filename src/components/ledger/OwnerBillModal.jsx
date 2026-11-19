import React, { useState, useEffect, useMemo, useRef } from 'react';
import Swal from 'sweetalert2';
import apiService from '../../services/api';
import Loader from '../Loader';
import { Modal } from '../UI';
import { formatDisplayDate } from '../../utils/dateFilters';
import { formatLakhCrore } from '../../utils/numberToWords';

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

const formatShortWasooliNote = (note) => {
  if (!note) return '';
  const s = String(note).trim();
  if (s.toLowerCase().includes('bill revision adjustment')) return 'Adjustment';
  if (s.length > 20) return s.slice(0, 18) + '…';
  return s;
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
  const [printLayout, setPrintLayout] = useState('2-up'); // Default: '2-up' (2 Bills on A4 Landscape in 1 pass) | '1-up-landscape' (Single Bill) | '1-up-portrait' (Pre-Cut Slip)
  const [badgeType, setBadgeType] = useState('both-original'); // 'both-original' | 'party-office'
  const [showCutLine, setShowCutLine] = useState(true); // Toggle center cutting dashed line
  const [loadingDefaults, setLoadingDefaults] = useState(!isEditing);
  const [saving, setSaving] = useState(false);
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [settledPaymentIds, setSettledPaymentIds] = useState(new Set());

  // Bill Headers
  const [bookNo, setBookNo] = useState(existingBill?.bookNo || 1);
  const [billNo, setBillNo] = useState(existingBill?.billNo || 1);
  const [billDate, setBillDate] = useState(
    existingBill?.date || new Date().toISOString().slice(0, 10)
  );

  // 1. Lots in this Bill (Only the chosen ones, default 5-8 max)
  const [lots, setLots] = useState([]);

  // 2. Pichla Unsettled Bill (Optional, e.g. Bill #71 = Rs 1,642,416)
  const [prevBillNo, setPrevBillNo] = useState(
    existingBill?.unpaidPreviousBills?.[0]?.billNo || ''
  );
  const [prevBillAmount, setPrevBillAmount] = useState(
    existingBill?.unpaidPreviousBills?.[0]?.amount || 0
  );

  // 3. Sabqa Baqaya (Previous Balance brought forward)
  const [sabqaBaqaya, setSabqaBaqaya] = useState(
    existingBill?.sabqaBaqaya != null
      ? Number(existingBill.sabqaBaqaya)
      : Number(initialPreviousBalance || 0)
  );
  const [lastBillInfo, setLastBillInfo] = useState('');

  // 4. Multiple Online / Cash Payments Received (Wasooli)
  const [paymentsList, setPaymentsList] = useState(() => {
    if (existingBill?.paymentsReceived && existingBill.paymentsReceived.length > 0) {
      return existingBill.paymentsReceived.map((p) => ({
        paymentId: String(p.paymentId || p.id || p._id || ''),
        date: p.date ? String(p.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
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

  // Load Defaults & Previous Bill Balance
  useEffect(() => {
    if (isEditing) {
      setLoadingDefaults(false);
      return;
    }

    if (defaultsLoadedRef.current) {
      setLoadingDefaults(false);
      return;
    }

    let isMounted = true;
    async function loadDefaults() {
      setLoadingDefaults(true);
      try {
        const res = await apiService.getOwnerBills(ownerId);
        if (!isMounted) return;
        defaultsLoadedRef.current = true;

        const next = res?.nextDefaults || {};
        if (next.nextBookNo) setBookNo(next.nextBookNo);
        if (next.nextBillNo) setBillNo(next.nextBillNo);
        if (res?.bills && res.bills.length > 0) {
          if (next.lastSabqaBaqaya !== undefined) {
            setSabqaBaqaya(Number(next.lastSabqaBaqaya || 0));
          }
        } else if (initialPreviousBalance > 0) {
          setSabqaBaqaya(initialPreviousBalance);
        }
        if (next.lastBillDate) {
          setLastBillInfo(`Pichla bill ${formatDisplayDate(next.lastBillDate)} ko finalize hua tha.`);
        }

        // Save settledPaymentIds so picker can mark them as settled
        const billedIds = new Set(next?.billedPaymentIds || []);
        setSettledPaymentIds(billedIds);

        // Only start with up to standard 15 billable lots (Standard physical bill book size)
        const currentCandidateLots = candidateLotsRef.current || [];
        const unbilledLots = currentCandidateLots.filter((l) => !l.ownerBillId && !l.billedInBillNo);
        const initialSlice = unbilledLots.slice(0, STANDARD_BILL_LOTS_LIMIT).map((l) => {
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
            quantity: qty,
            rate: rate,
            amount: finalAmt,
            note: String(l.itemDescription || l.description || ''),
            selected: true,
          };
        });
        setLots(initialSlice);

        // New bills start clean with 0 payments
        setPaymentsList([]);
      } catch (err) {
        console.warn('Could not load bill defaults:', err.message);
      } finally {
        setLoadingDefaults(false);
      }
    }

    loadDefaults();

    // Safety timeout: Never stay stuck in loading more than 2.5s even if network delays
    const safetyTimer = setTimeout(() => {
      setLoadingDefaults(false);
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [isEditing, ownerId, initialPreviousBalance]);

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

  // Total Wasooli from multiple payments
  const totalWasooli = useMemo(
    () => paymentsList.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    [paymentsList]
  );

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

  // Add lots from Inventory picker (capped at standard 15 lots)
  const handleAddLotsFromInventory = (selectedCandidateLots) => {
    const existingManualLots = lots.filter((l) => !l.lotId);
    const availableSlotsForPicked = Math.max(0, STANDARD_BILL_LOTS_LIMIT - existingManualLots.length);
    const formatted = selectedCandidateLots.slice(0, availableSlotsForPicked).map((l) => {
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

  // Add multiple payments from Payment Picker Modal
  const handleAddPaymentsFromPicker = (selectedPayments) => {
    const formatted = selectedPayments.map((p) => ({
      paymentId: String(p.id || p._id || ''),
      date: p.date ? String(p.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      amount: Number(p.amount || 0),
      note: String(p.note || (p.paymentMethod ? `${p.paymentMethod} transfer` : 'Online transfer')).trim(),
    }));
    const existingManuals = paymentsList.filter((p) => !p.paymentId);
    setPaymentsList([...formatted, ...existingManuals]);
    setShowPaymentPicker(false);
  };

  // 100-Bill Book Transition prompt
  const handleBillNoChange = (val) => {
    const num = Number(val || 0);
    setBillNo(num);
    if (num > 100) {
      Swal.fire({
        title: 'Bill #100 Mukammal!',
        text: `1 bill book mein 100 bills hote hain. Kya aap Book ${Number(bookNo) + 1} shuru karke Bill #1 banana chahte hain?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: `Haan, Book ${Number(bookNo) + 1} shuru karein`,
        cancelButtonText: 'Nahi, yahi serial chalne dein',
      }).then((res) => {
        if (res.isConfirmed) {
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

      const remainingCount = Math.max(0, candidateLots.length - lots.length);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Bill #${billNo} kamiyabi se save ho gaya!`,
        text: remainingCount > 0 && !isEditing
          ? `${lots.length} lots settle ho gayi hain. Baqi ${remainingCount} lots ka agla bill banayein.`
          : `${lots.length} lots completed status mein shift ho gayi hain.`,
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

    const validPayments = paymentsList.filter((p) => Number(p.amount || 0) > 0);
    if (validPayments.length > 0) {
      text += `*− Payments Received:*\n`;
      validPayments.forEach((p) => {
        const shortNote = formatShortWasooliNote(p.note);
        text += `  • ${formatDisplayDate(p.date)}: −Rs ${Number(p.amount).toLocaleString()}${shortNote ? ` (${shortNote})` : ''}\n`;
      });
      if (validPayments.length > 1) {
        text += `  *Total Received:* −Rs ${totalWasooli.toLocaleString()}\n`;
      }
      text += `\n`;
    }

    if (totalKatoti > 0) {
      text += `*− Deductions (${katotiTitle}):* −Rs ${totalKatoti.toLocaleString()}\n`;
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
    text += `Authorized Signature: Waqas`;
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
        const iframe = document.createElement('iframe');
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
                  height: ${isLandscape ? '192mm' : '100%'} !important;
                  max-height: ${isLandscape ? '194mm' : 'none'} !important;
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
                  display: flex !important;
                  box-sizing: border-box !important;
                  padding: 0 3mm !important;
                }
                .official-bill-container {
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
                  padding: 8px 10px !important;
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

        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
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
      {/* Top Section: Header + 12-Row Standard Table */}
      <div>
        {/* Header */}
        <div style={{ borderBottom: '2px solid #000000', paddingBottom: 5, marginBottom: 5 }}>
          {/* Top Row: Owner Name, Copy Badge, Phone */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 800, color: '#000000', marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 900 }}>Mian Waqas</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                textTransform: 'uppercase',
                color: '#000000',
                background: '#f8fafc',
                border: '1.5px solid #000000',
                padding: '1px 6px',
                borderRadius: 3,
                letterSpacing: '0.04em',
              }}
            >
              {copyBadge}
            </span>
            <span>Mob: 0300-0840719</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: 18.5, fontWeight: 900, letterSpacing: '0.05em', color: '#000000', textTransform: 'uppercase', lineHeight: 1.15, marginTop: 1 }}>
            RS EMBROIDERY
          </div>
          <div style={{ textAlign: 'center', fontSize: 9.5, color: '#334155', fontWeight: 700, letterSpacing: '0.01em', marginTop: 1 }}>
            Address: Kot Hanif Sheikhupura Road 4 Km Muridke
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontWeight: 800, marginTop: 4, color: '#000000', borderTop: '1px dashed #cbd5e1', paddingTop: 3 }}>
            <div>Date: <u style={{ fontWeight: 900 }}>{formatDisplayDate(billDate)}</u></div>
            <div>Book#: <u style={{ fontWeight: 900 }}>{bookNo}</u> &nbsp;&nbsp; Bill#: <u style={{ fontWeight: 900 }}>{billNo}</u></div>
          </div>
          <div style={{ textAlign: 'left', fontSize: 11.5, fontWeight: 900, marginTop: 3, color: '#000000' }}>
            <span>Bill To: </span>
            <u style={{ fontWeight: 900 }}>{ownerName || '—'}</u>
          </div>
        </div>

        {/* Standard Fixed 15-Row Table (Physical Bill Book Format) */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 10,
            color: '#000000',
            marginBottom: 2,
          }}
        >
          <thead>
            <tr style={{ background: '#0f172a', color: '#ffffff' }}>
              <th style={{ padding: '3px 2px', width: 26, textAlign: 'center', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>SR#</th>
              <th style={{ padding: '3px 4px', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>LOT#</th>
              <th style={{ padding: '3px 4px', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>DESIGN#</th>
              <th style={{ padding: '3px 4px', width: 40, textAlign: 'right', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>QTY</th>
              <th style={{ padding: '3px 4px', width: 44, textAlign: 'right', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>RATE</th>
              <th style={{ padding: '3px 4px', width: 84, textAlign: 'right', border: '1px solid #000000', color: '#ffffff', fontWeight: 800 }}>AMOUNT (RS)</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 ? (
              <>
                <tr style={{ height: 18.5, background: '#ffffff' }}>
                  <td style={{ padding: '2px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#94a3b8', fontWeight: 600 }}>1</td>
                  <td colSpan={5} style={{ padding: '2px 6px', color: '#64748b', fontStyle: 'italic', border: '1px solid #cbd5e1', fontSize: 9.5 }}>
                    No lots added to this bill.
                  </td>
                </tr>
                {Array.from({ length: STANDARD_BILL_ROWS - 1 }).map((_, emptyIdx) => (
                  <tr key={`empty-${emptyIdx}`} style={{ height: 18.5, background: emptyIdx % 2 !== 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '2px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#94a3b8', fontWeight: 600, fontSize: 9.5 }}>{emptyIdx + 2}</td>
                    <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                  </tr>
                ))}
              </>
            ) : (
              <>
                {lots.map((l, idx) => (
                  <tr key={idx} style={{ height: 18.5, background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '2px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '2px 4px', fontWeight: 800, border: '1px solid #cbd5e1', color: '#000000', fontSize: 10 }}>
                      {formatBillLotNo(l)}
                      {l.note ? <span style={{ fontSize: 8, color: '#334155', display: 'block', fontWeight: 600, lineHeight: 1 }}>{l.note}</span> : null}
                    </td>
                    <td style={{ padding: '2px 4px', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10 }}>
                      {l.designNo}
                    </td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10 }}>
                      {l.quantity}
                    </td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #cbd5e1', color: '#000000', fontWeight: 700, fontSize: 10 }}>
                      {l.rate}
                    </td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', fontWeight: 800, border: '1px solid #cbd5e1', color: '#000000', fontSize: 10 }}>
                      Rs {Number(l.amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, STANDARD_BILL_ROWS - lots.length) }).map((_, emptyIdx) => {
                  const rowNum = lots.length + emptyIdx + 1;
                  const isEven = (lots.length + emptyIdx) % 2 !== 0;
                  return (
                    <tr key={`empty-${emptyIdx}`} style={{ height: 18.5, background: isEven ? '#f8fafc' : '#ffffff' }}>
                      <td style={{ padding: '2px 2px', textAlign: 'center', border: '1px solid #cbd5e1', color: '#94a3b8', fontWeight: 600, fontSize: 9.5 }}>
                        {rowNum}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>&nbsp;</td>
                    </tr>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Section: Calculations Breakdown + Signature */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
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

          {/* Row 4: Gross Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: 900, fontSize: 12.5, borderTop: '1.5px solid #000000', borderBottom: '1.5px solid #000000', margin: '3px 0', color: '#000000' }}>
            <span>= Gross Total:</span>
            <span>Rs {grossTotal.toLocaleString()}</span>
          </div>

          {/* Row 5: Payments Received */}
          {paymentsList.length > 0 && (
            <div
              style={{
                padding: '3px 0',
                borderTop: '1px dashed #cbd5e1',
                borderBottom: '1px dashed #cbd5e1',
                margin: '3px 0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#000000' }}>
                  − Payments Received ({paymentsList.length === 1 ? formatDisplayDate(paymentsList[0].date) : `${paymentsList.length} Payments`}):
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#000000' }}>
                  −Rs {totalWasooli.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: '#475569',
                  fontWeight: 600,
                  marginTop: 2,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '2px 8px',
                  lineHeight: 1.3,
                }}
              >
                {paymentsList.map((p, pIdx) => {
                  const shortNote = formatShortWasooliNote(p.note);
                  return (
                    <span key={pIdx}>
                      • {formatDisplayDate(p.date)}: Rs {Number(p.amount).toLocaleString()}
                      {shortNote ? ` (${shortNote})` : ''}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Row 6: Deductions */}
          {totalKatoti > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#000000', fontSize: 11.5 }}>
              <span>− Deductions ({katotiTitle}):</span>
              <span style={{ fontWeight: 800 }}>-Rs {totalKatoti.toLocaleString()}</span>
            </div>
          )}

          {/* Row 7: Net Payable / Advance */}
          <div
            className="bill-total-highlight"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '5px 10px',
              fontSize: 13.5,
              fontWeight: 900,
              background: '#0f172a',
              color: '#ffffff',
              borderRadius: 4,
              marginTop: 4,
            }}
          >
            <span style={{ color: '#ffffff', fontWeight: 900 }}>
              {grandTotalBaqaya < 0 ? '👉 ADVANCE SURPLUS (PARTY ADVANCE):' : '👉 NET PAYABLE:'}
            </span>
            <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 900 }}>
              Rs {Math.abs(grandTotalBaqaya).toLocaleString()}
            </span>
          </div>

          {formatLakhCrore(grandTotalBaqaya) && (
            <div style={{ textAlign: 'right', fontSize: 10.5, color: '#334155', fontStyle: 'italic', marginTop: 3, fontWeight: 700 }}>
              ({formatLakhCrore(Math.abs(grandTotalBaqaya))} {grandTotalBaqaya < 0 ? 'Advance' : ''})
            </div>
          )}
        </div>

        {/* Signature Area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10, paddingTop: 4, color: '#000000' }}>
          <div style={{ fontSize: 11, color: '#000000', fontWeight: 700 }}>
            <div>Prepared By: ____________</div>
          </div>
          <div style={{ textAlign: 'center', color: '#000000' }}>
            <div style={{ fontSize: 16, fontFamily: 'cursive', fontWeight: 900, letterSpacing: 1.5, marginBottom: 2, color: '#000000' }}>
              Waqas
            </div>
            <div style={{ borderTop: '1.5px solid #000000', paddingTop: 3, fontSize: 10, fontWeight: 700, color: '#000000' }}>
              Authorized Signature
            </div>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
              Bill To: {ownerName || 'Party'} — Bill #{billNo} (Book {bookNo})
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginRight: 24 }} className="hide-print">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid ' + (activeTab === 'form' ? '#3b82f6' : 'rgba(255,255,255,0.12)'),
                background: activeTab === 'form' ? '#1e40af' : 'rgba(255,255,255,0.04)',
                color: activeTab === 'form' ? '#ffffff' : '#94a3b8',
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
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid ' + (activeTab === 'preview' ? '#3b82f6' : 'rgba(255,255,255,0.12)'),
                background: activeTab === 'preview' ? '#1e40af' : 'rgba(255,255,255,0.04)',
                color: activeTab === 'preview' ? '#ffffff' : '#94a3b8',
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
      {loadingDefaults ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Loader />
          <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>
            Bill book aur Sabqa Baqaya load ho raha hai...
          </div>
        </div>
      ) : activeTab === 'form' ? (
        /* ========================================================================= */
        /* SLEEK, MODERN 1-SCREEN BILL MAKER (Linear / Stripe Quality)              */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header Row: Compact Sticky Info Bar */}
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Book#</span>
                <input
                  type="number"
                  min="1"
                  value={bookNo}
                  onChange={(e) => setBookNo(Number(e.target.value) || 1)}
                  style={{
                    width: 55,
                    padding: '4px 6px',
                    borderRadius: 6,
                    fontWeight: 800,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Bill#</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={billNo}
                  onChange={(e) => handleBillNoChange(e.target.value)}
                  style={{
                    width: 65,
                    padding: '4px 6px',
                    borderRadius: 6,
                    fontWeight: 900,
                    textAlign: 'center',
                    background: 'rgba(37, 99, 235, 0.2)',
                    border: '1.5px solid #3b82f6',
                    color: '#60a5fa',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Date</span>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12.5,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#ffffff',
                  }}
                />
              </div>
            </div>

            {/* Sabqa Baqaya / Advance Surplus Highlight Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: Number(sabqaBaqaya || 0) < 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.1)',
                padding: '4px 12px',
                borderRadius: 8,
                border: Number(sabqaBaqaya || 0) < 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, color: Number(sabqaBaqaya || 0) < 0 ? '#34d399' : '#f59e0b', textTransform: 'uppercase' }}>
                {Number(sabqaBaqaya || 0) < 0 ? 'Advance Surplus:' : 'Previous Balance:'}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Rs</span>
              <input
                type="number"
                value={sabqaBaqaya}
                onChange={(e) => setSabqaBaqaya(Number(e.target.value) || 0)}
                placeholder="0"
                style={{
                  width: 110,
                  padding: '3px 0',
                  borderRadius: 4,
                  fontWeight: 900,
                  fontSize: 14,
                  background: 'transparent',
                  border: 'none',
                  color: Number(sabqaBaqaya || 0) < 0 ? '#34d399' : '#fbbf24',
                  textAlign: 'right',
                }}
              />
            </div>
          </div>

          {lastBillInfo && (
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: -6, paddingLeft: 4 }}>
              💡 {lastBillInfo} Previous balance carried forward from last finalized bill.
            </div>
          )}

          {/* Section 1: Clean, Elegant Lots Table */}
          <div
            style={{
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#181210',
            }}
          >
            {/* Multi-Bill Info Banner if lots > 8 */}
            {candidateLots.length > STANDARD_BILL_LOTS_LIMIT && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderBottom: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 12,
                  color: '#93c5fd',
                }}
              >
                <div>
                  <strong style={{ color: '#ffffff' }}>ℹ️ Standard Bill Book Size ({STANDARD_BILL_LOTS_LIMIT} Lots / Page):</strong> Total {candidateLots.length} billable lots. First {STANDARD_BILL_LOTS_LIMIT} lots in Bill #{billNo}, remaining in next bill.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowLotPicker(true)}
                  style={{ whiteSpace: 'nowrap', fontWeight: 700, color: '#38bdf8' }}
                >
                  ⚡ Select Lots
                </button>
              </div>
            )}

            {/* Table Toolbar */}
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: '#f8fafc' }}>
                  1. Current Work (Lots)
                </span>
                <span
                  style={{
                    background: 'rgba(37, 99, 235, 0.18)',
                    color: '#60a5fa',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '3px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                  }}
                >
                  {lots.length} / {STANDARD_BILL_LOTS_LIMIT} Lots — Rs {currentBillTotal.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowLotPicker(true)}
                  style={{ fontWeight: 700, color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)' }}
                >
                  📦 Pick Lots ({candidateLots.length} available)
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
                    style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Table Body */}
            <div style={{ overflowX: 'auto', maxHeight: '340px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 0 }}>
                <thead>
                  <tr style={{ background: '#120d0b', color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <th style={{ width: 36, textAlign: 'center', padding: '8px 4px', fontWeight: 700 }}>#</th>
                    <th style={{ width: 95, padding: '8px 6px', fontWeight: 700 }}>Lot#</th>
                    <th style={{ width: 100, padding: '8px 6px', fontWeight: 700 }}>Design#</th>
                    <th style={{ width: 85, textAlign: 'center', padding: '8px 6px', fontWeight: 700 }}>Qty</th>
                    <th style={{ width: 95, textAlign: 'center', padding: '8px 6px', fontWeight: 700 }}>Rate</th>
                    <th style={{ width: 120, textAlign: 'right', padding: '8px 8px', fontWeight: 700 }}>Amount (Rs)</th>
                    <th style={{ padding: '8px 6px', fontWeight: 700 }}>Note / Suit Bazo</th>
                    <th style={{ width: 35, textAlign: 'center', padding: '8px 4px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '28px 14px' }}>
                        {candidateLots.length === 0 ? (
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
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                        }}
                      >
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 600, color: '#64748b' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={l.lotNo || ''}
                            onChange={(e) => updateLotRow(idx, 'lotNo', e.target.value)}
                            placeholder="Lot#"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12.5,
                              fontWeight: 700,
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#f8fafc',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={l.designNo || ''}
                            onChange={(e) => updateLotRow(idx, 'designNo', e.target.value)}
                            placeholder="Design#"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12,
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#cbd5e1',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            value={l.quantity || ''}
                            onChange={(e) => updateLotRow(idx, 'quantity', e.target.value)}
                            placeholder="Qty"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12.5,
                              textAlign: 'center',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#f8fafc',
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
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12.5,
                              textAlign: 'center',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#f8fafc',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            value={l.amount || ''}
                            onChange={(e) => updateLotRow(idx, 'amount', e.target.value)}
                            placeholder="Amount"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 13,
                              fontWeight: 800,
                              textAlign: 'right',
                              borderRadius: 6,
                              background: 'rgba(37, 99, 235, 0.08)',
                              border: '1px solid rgba(59, 130, 246, 0.25)',
                              color: '#60a5fa',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            value={l.note || ''}
                            onChange={(e) => updateLotRow(idx, 'note', e.target.value)}
                            placeholder="e.g. 2 suit bazo"
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: 12,
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: '#94a3b8',
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
                              color: '#f87171',
                              cursor: 'pointer',
                              fontSize: 16,
                              padding: '3px 6px',
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
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            {/* Wasooli Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  − Payments Received (Cash & Online)
                </span>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  {paymentsList.length} Payments — Rs {totalWasooli.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setShowPaymentPicker(true)}
                  style={{ fontWeight: 700, color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)' }}
                >
                  🔍 Select Payments ({candidatePayments.filter((p) => p.type === 'Received' && (!settledPaymentIds || !settledPaymentIds.has(String(p.id || p._id))) && !p.isLegacySettled && (!p.billedInBillNo || p.billedInBillNo === 'none')).length} available)
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
                    style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Payments List (Multiple Rows) */}
            {paymentsList.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                No payments added yet. Click &quot;🔍 Select Payments&quot; above to include received payments or click &quot;+ Add Cash / Manual&quot;.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {paymentsList.map((p, pIdx) => (
                  <div
                    key={pIdx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'rgba(255, 255, 255, 0.02)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <input
                      type="date"
                      value={p.date}
                      onChange={(e) => updatePaymentRow(pIdx, 'date', e.target.value)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: 6,
                        fontSize: 12,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f8fafc',
                        width: 125,
                        minWidth: 0,
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Note / Payment details"
                      value={p.note}
                      onChange={(e) => updatePaymentRow(pIdx, 'note', e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '5px 8px',
                        fontSize: 12,
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#cbd5e1',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: 135,
                        minWidth: 0,
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: 6,
                        padding: '0 8px',
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: '#10b981', marginRight: 4 }}>Rs</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={p.amount || ''}
                        onChange={(e) => updatePaymentRow(pIdx, 'amount', Number(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          minWidth: 0,
                          padding: '5px 0',
                          fontSize: 13,
                          fontWeight: 800,
                          background: 'transparent',
                          border: 'none',
                          color: '#34d399',
                          textAlign: 'right',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePaymentRow(pIdx)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: 15,
                        padding: '2px 6px',
                      }}
                      title="Remove payment"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Clean Grid (Pichla Bill, Katoti, Remarks) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {/* Box 1: Pichla Bill */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                + Pichla Bill (Optional)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Bill #71"
                  value={prevBillNo}
                  onChange={(e) => setPrevBillNo(e.target.value)}
                  style={{
                    width: 90,
                    minWidth: 0,
                    padding: '6px 8px',
                    fontSize: 12.5,
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#ffffff',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    padding: '0 8px',
                  }}
                >
                  <span style={{ fontSize: 11.5, color: '#64748b', marginRight: 4 }}>Rs</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={prevBillAmount || ''}
                    onChange={(e) => setPrevBillAmount(Number(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '6px 0',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      color: '#ffffff',
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5, lineHeight: 1.3 }}>
                ℹ️ Sirf tab daalein agar pichle bill ka amount ooper &quot;Previous Balance&quot; mein shamil na ho.
              </div>
            </div>

            {/* Box 2: Katoti */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#f87171', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                − Katoti (Dhaga / Kapra / Discount)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Dhaga Katoti"
                  value={katotiTitle}
                  onChange={(e) => setKatotiTitle(e.target.value)}
                  style={{
                    width: 120,
                    minWidth: 0,
                    padding: '6px 8px',
                    fontSize: 12,
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#ffffff',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 6,
                    padding: '0 8px',
                  }}
                >
                  <span style={{ fontSize: 11.5, color: '#f87171', marginRight: 4 }}>Rs</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={katotiAmount || ''}
                    onChange={(e) => setKatotiAmount(Number(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '6px 0',
                      fontSize: 13,
                      fontWeight: 700,
                      background: 'transparent',
                      border: 'none',
                      color: '#f87171',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Box 3: Special Remarks / Note */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Special Remarks / Note
              </div>
              <input
                type="text"
                placeholder="e.g. Rate adjusted for design #2521"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  minWidth: 0,
                  padding: '6px 8px',
                  fontSize: 12.5,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#cbd5e1',
                }}
              />
            </div>
          </div>

          {/* Section 4: High-Contrast Premium Final Summary Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #101626 0%, #172033 100%)',
              border: '1.5px solid rgba(59, 130, 246, 0.35)',
              borderRadius: 14,
              padding: '14px 18px',
              boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.45)',
            }}
          >
            {/* Top Row: Mini pills of components */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Current Work</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', marginTop: 2 }}>Rs {currentBillTotal.toLocaleString()}</div>
              </div>

              {prevBillTotal > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>+ Previous Bill</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>+Rs {prevBillTotal.toLocaleString()}</div>
                </div>
              )}

              <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>+ Previous Balance</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fbbf24', marginTop: 2 }}>+Rs {Number(sabqaBaqaya || 0).toLocaleString()}</div>
              </div>

              <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>− Received ({paymentsList.length})</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#34d399', marginTop: 2 }}>−Rs {totalWasooli.toLocaleString()}</div>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <div style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>− Deductions</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f87171', marginTop: 2 }}>−Rs {totalKatoti.toLocaleString()}</div>
              </div>
            </div>

            {/* Big Grand Total Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#090d16',
                border: '1.5px solid #2563eb',
                borderRadius: 10,
                padding: '12px 18px',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  👉 NET PAYABLE (GRAND TOTAL):
                </div>
                {formatLakhCrore(grandTotalBaqaya) && (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>
                    ({formatLakhCrore(grandTotalBaqaya)})
                  </div>
                )}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em' }}>
                Rs {grandTotalBaqaya.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 4,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                style={{ fontWeight: 700, color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.35)' }}
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
            <div style={{ display: 'flex', gap: 10 }}>
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
                  background: '#2563eb',
                  borderColor: '#1d4ed8',
                  color: '#ffffff',
                  padding: '8px 22px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
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
            className="hide-print"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('form')}
              style={{ fontWeight: 600 }}
            >
              ← Edit Bill Details
            </button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Layout Switcher (A4 2 Bills vs A4 1 Bill vs Pre-Cut Slip) */}
              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 6, padding: 2, border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setPrintLayout('2-up')}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: printLayout === '2-up' ? '#2563eb' : 'transparent',
                    color: printLayout === '2-up' ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                  title="A4 page par aik hi click mein 2 bills (1 single cutting line ke saath) print karein — No double feed!"
                >
                  📄 A4 (2 Bills - Ek Sath)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('1-up-landscape')}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: printLayout === '1-up-landscape' ? '#2563eb' : 'transparent',
                    color: printLayout === '1-up-landscape' ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                  title="Print 1 bill on half A4 horizontally, saving the other half"
                >
                  📄 A4 (1 Bill / Half-Sheet)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('1-up-portrait')}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: 'none',
                    background: printLayout === '1-up-portrait' ? '#2563eb' : 'transparent',
                    color: printLayout === '1-up-portrait' ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                  title="Print 1 bill directly on pre-cut 14.8 cm x 21 cm slip"
                >
                  📄 Pre-Cut 14.8×21cm Slip
                </button>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: showCutLine ? '#60a5fa' : '#94a3b8',
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--border)',
                  }}
                  title="A4 sheet ke darmiyan mein 1 single dashed cutting line print karni hai ya nahi"
                >
                  <input
                    type="checkbox"
                    checked={showCutLine}
                    onChange={(e) => setShowCutLine(e.target.checked)}
                    style={{ accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  ✂ Center Cut Line
                </label>
              </div>

              {printLayout === '2-up' && (
                <button
                  type="button"
                  onClick={() => setBadgeType((prev) => (prev === 'both-original' ? 'party-office' : 'both-original'))}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 5,
                    border: '1px solid var(--border)',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#38bdf8',
                    cursor: 'pointer',
                  }}
                  title="Click to toggle badges between 'Dono ORIGINAL' ya 'PARTY COPY + OFFICE COPY'"
                >
                  🏷️ {badgeType === 'both-original' ? 'Badge: Dono ORIGINAL' : 'Badge: Party + Office'}
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={copyWhatsAppText}
                style={{ fontWeight: 600 }}
              >
                📋 Copy WhatsApp
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={shareDirectWhatsApp}
                style={{ fontWeight: 700, color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.35)' }}
                title="Direct WhatsApp khol kar summary send karein"
              >
                📲 WhatsApp Share
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePrint}
                style={{ fontWeight: 700 }}
              >
                🖨️ Print Bill / PDF
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveBill}
                disabled={saving}
                style={{
                  fontWeight: 800,
                  background: '#2563eb',
                  borderColor: '#1d4ed8',
                  color: '#ffffff',
                }}
              >
                {saving ? 'Saving...' : `💾 Save Bill #${billNo}`}
              </button>
            </div>
          </div>

          {/* Printable Hard-Form Bill Pad Area */}
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
                  {renderBillSlip(badgeType === 'both-original' ? 'ORIGINAL' : 'PARTY COPY')}
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
                  {renderBillSlip(badgeType === 'both-original' ? 'ORIGINAL' : 'OFFICE COPY')}
                </div>
              </>
            )}

            {printLayout === '1-up-landscape' && (
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
                    border: '1.5px dashed rgba(255, 255, 255, 0.2)',
                    borderRadius: 4,
                    background: 'rgba(255, 255, 255, 0.02)',
                    color: '#94a3b8',
                    padding: 20,
                    textAlign: 'center',
                    margin: '0 4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: 28, marginBottom: 8 }}>📄</span>
                  <strong style={{ fontSize: 13, color: '#e2e8f0' }}>Blank Half-Sheet</strong>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, maxWidth: 220 }}>
                    Cut along the center dashed line (50%) to keep this half-sheet for your next bill.
                  </span>
                </div>
              </>
            )}

            {printLayout === '1-up-portrait' && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', width: '100%', maxWidth: '490px' }}>
                {renderBillSlip('ORIGINAL')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: PICK LOTS FROM INVENTORY */}
      {showLotPicker && (
        <LotPickerModal
          availableLots={candidateLots}
          currentlySelectedLotIds={lots.map((l) => l.lotId).filter(Boolean)}
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
function LotPickerModal({ availableLots, currentlySelectedLotIds, currentBillNo = 1, onClose, onConfirm }) {
  const [selectedIds, setSelectedIds] = useState(new Set(currentlySelectedLotIds));
  const [search, setSearch] = useState('');

  const unbilledLots = useMemo(() => {
    const selectedSet = new Set(currentlySelectedLotIds || []);
    return (availableLots || []).filter((l) => {
      const id = String(l.id || l._id);
      if (selectedSet.has(id)) return true;
      return !l.ownerBillId && !l.billedInBillNo;
    });
  }, [availableLots, currentlySelectedLotIds]);

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
        if (next.size >= STANDARD_BILL_LOTS_LIMIT) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: `Standard Bill Capacity: Maximum ${STANDARD_BILL_LOTS_LIMIT} lots!`,
            text: `Ek standard physical bill par ${STANDARD_BILL_LOTS_LIMIT} lots aati hain. Baqi lots ka agla bill banayein.`,
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
    const first = filtered.slice(0, STANDARD_BILL_LOTS_LIMIT).map((l) => String(l.id || l._id));
    setSelectedIds(new Set(first));
  };

  const selectNextBatch = () => {
    const next = filtered.slice(STANDARD_BILL_LOTS_LIMIT, STANDARD_BILL_LOTS_LIMIT * 2).map((l) => String(l.id || l._id));
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
        {availableLots.length > STANDARD_BILL_LOTS_LIMIT && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12,
              color: '#93c5fd',
              lineHeight: 1.4,
            }}
          >
            ℹ️ <strong>Standard Bill Book Size ({STANDARD_BILL_LOTS_LIMIT} Lots/Page):</strong> Total {availableLots.length} billable lots hain. Pehle {STANDARD_BILL_LOTS_LIMIT} lots ka Bill #{currentBillNo || 1} banayein, baqi lots agle bill mein jayeingi.
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
              style={{ fontWeight: 700, color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.35)' }}
            >
              ⚡ Pehle {STANDARD_BILL_LOTS_LIMIT} Lots (Bill #1)
            </button>
            {filtered.length > STANDARD_BILL_LOTS_LIMIT && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={selectNextBatch}
                style={{ fontWeight: 700, color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.35)' }}
              >
                ⚡ Agle Lots (Lots {STANDARD_BILL_LOTS_LIMIT + 1}-{Math.min(STANDARD_BILL_LOTS_LIMIT * 2, filtered.length)})
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-xs" onClick={clearAll}>
              Clear
            </button>
          </div>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
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
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    background: checked ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>
                        <span style={{ color: '#94a3b8', fontSize: 11, marginRight: 4 }}>#{lIdx + 1}</span>
                        Lot #{l.lotNumber || l.lotNo || '—'} &nbsp;
                        <span style={{ fontWeight: 400, color: '#94a3b8' }}>(Design: {l.designNo || '—'})</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {qty} pcs {rate > 0 ? `@ Rs ${rate}` : ''} {l.fabric ? `• ${l.fabric}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#60a5fa' }}>
                    Rs {amt.toLocaleString()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: selectedIds.size === STANDARD_BILL_LOTS_LIMIT ? '#34d399' : '#cbd5e1' }}>
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

        <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
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
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: isSettled ? 'not-allowed' : 'pointer',
                    opacity: isSettled ? 0.6 : 1,
                    background: checked ? 'rgba(16, 185, 129, 0.12)' : (isSettled ? 'rgba(239, 68, 68, 0.04)' : 'transparent'),
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSettled}
                      onChange={() => { }}
                      style={{ width: 17, height: 17, cursor: isSettled ? 'not-allowed' : 'pointer', accentColor: '#10b981' }}
                    />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: isSettled ? '#94a3b8' : '#34d399' }}>
                        Rs {amt.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>
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
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
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
                          background: checked ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.06)',
                          color: checked ? '#6ee7b7' : '#94a3b8',
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
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#f8fafc' }}>
              Selected: {selectedIds.size} Payments
            </span>
            {selectedTotal > 0 && (
              <span style={{ fontSize: 13, fontWeight: 800, color: '#34d399', marginLeft: 8 }}>
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
