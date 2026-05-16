import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Camera,
  ChevronLeft,
  Eye,
  FileDown,
  Image as ImageIcon,
  Plus,
  Search,
  Share2,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import {
  loadKhataState,
  saveKhataState,
  newId,
  nowIso,
  contactBalance,
  entriesChronological,
  runningBalances,
  buildBusinessShareSnapshot,
} from '../utils/personalKhataStorage';
import {
  buildContactLedgerPdf,
  buildPersonalKhataSummaryPdf,
  downloadContactLedgerPdf,
  downloadPersonalKhataSummaryPdf,
} from '../utils/personalKhataPdf';
import { buildKhataShareUrl } from '../utils/personalKhataShare';

const fmtMoney = (n) =>
  `₨${Math.abs(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function initials(name) {
  const p = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

/** Target max stored size (~2.5MB binary); larger images are compressed with canvas */
const PK_IMAGE_TARGET_BYTES = 2.5 * 1024 * 1024;

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

/** Resize + JPEG encode until under maxBytes (for localStorage). */
async function compressImageDataUrl(dataUrl, maxBytes = PK_IMAGE_TARGET_BYTES) {
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return dataUrl;
  if (approxBytesFromDataUrl(dataUrl) <= maxBytes) return dataUrl;

  let img;
  try {
    img = await dataUrlToImage(dataUrl);
  } catch {
    return dataUrl;
  }

  const mime = 'image/jpeg';
  let maxEdge = Math.min(2048, Math.max(img.width, img.height));
  let quality = 0.9;

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
  for (let i = 0; i < 20 && approxBytesFromDataUrl(out) > maxBytes; i += 1) {
    if (quality > 0.38) {
      quality -= 0.06;
      out = encode(maxEdge, quality);
    } else {
      maxEdge = Math.round(maxEdge * 0.82);
      if (maxEdge < 280) break;
      quality = 0.85;
      out = encode(maxEdge, quality);
    }
  }
  return out;
}

export default function PersonalKhata({ standalone = false } = {}) {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState('');
  const [khataHydrated, setKhataHydrated] = useState(false);
  const [bizModalOpen, setBizModalOpen] = useState(false);
  const [formBizName, setFormBizName] = useState('');
  const [search, setSearch] = useState('');
  const [fabOpen, setFabOpen] = useState(false);

  const [entryModal, setEntryModal] = useState(null);
  const [contactModal, setContactModal] = useState(false);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formContactId, setFormContactId] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBillImage, setFormBillImage] = useState('');

  const [billLightboxSrc, setBillLightboxSrc] = useState(null);
  const pdfBlobRef = useRef(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('PDF');

  const closePdfPreview = useCallback(() => {
    if (pdfBlobRef.current) {
      URL.revokeObjectURL(pdfBlobRef.current);
      pdfBlobRef.current = null;
    }
    setPdfPreviewUrl(null);
    setPdfPreviewTitle('PDF');
  }, []);

  const openPdfPreview = useCallback((doc, title = 'PDF dekhein') => {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      if (pdfBlobRef.current) URL.revokeObjectURL(pdfBlobRef.current);
      pdfBlobRef.current = url;
      setPdfPreviewTitle(title);
      setPdfPreviewUrl(url);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'PDF masla', text: String(e?.message || e) });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pdfBlobRef.current) URL.revokeObjectURL(pdfBlobRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pdfPreviewUrl) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closePdfPreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdfPreviewUrl, closePdfPreview]);

  useEffect(() => {
    setBillLightboxSrc(null);
  }, [contactId]);

  useEffect(() => {
    if (!billLightboxSrc) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setBillLightboxSrc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [billLightboxSrc]);

  useEffect(() => {
    const data = loadKhataState();
    setBusinesses(data.businesses);
    setActiveBusinessId(data.activeBusinessId);
    setContacts(data.contacts);
    setEntries(data.entries);
    setKhataHydrated(true);
  }, []);

  useEffect(() => {
    if (!khataHydrated) return;
    saveKhataState({ businesses, activeBusinessId, contacts, entries });
  }, [khataHydrated, businesses, activeBusinessId, contacts, entries]);

  const scopedContacts = useMemo(() => {
    const bid = String(activeBusinessId || '').trim();
    if (!bid) return [];
    return contacts.filter((c) => String(c.businessId || bid) === bid);
  }, [contacts, activeBusinessId]);

  const scopedEntries = useMemo(() => {
    const ids = new Set(scopedContacts.map((c) => c.id));
    return entries.filter((e) => ids.has(e.contactId));
  }, [entries, scopedContacts]);

  const exportSummaryPdf = useCallback(() => {
    if (!scopedContacts.length) {
      Swal.fire({
        icon: 'info',
        title: 'Khata khaali',
        text: 'Is business me abhi koi shakhs nahi — pehle shamil karein.',
      });
      return;
    }
    try {
      downloadPersonalKhataSummaryPdf(scopedContacts, scopedEntries);
      Swal.fire({
        toast: true,
        icon: 'success',
        title: 'PDF download ho gayi',
        position: 'top-end',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'PDF masla', text: String(e?.message || e) });
    }
  }, [scopedContacts, scopedEntries]);

  const previewSummaryPdf = useCallback(() => {
    if (!scopedContacts.length) {
      Swal.fire({
        icon: 'info',
        title: 'Khata khaali',
        text: 'Is business ke liye waqai koi maaloomat nahi.',
      });
      return;
    }
    try {
      const doc = buildPersonalKhataSummaryPdf(scopedContacts, scopedEntries);
      openPdfPreview(doc, 'Personal Khata — summary');
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Preview masla', text: String(e?.message || e) });
    }
  }, [scopedContacts, scopedEntries, openPdfPreview]);

  const active = useMemo(
    () => contacts.find((c) => c.id === contactId) || null,
    [contacts, contactId],
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedContacts.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        String(c.phone || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [scopedContacts, search]);

  const sortedContactList = useMemo(() => {
    const latestTs = (c) => {
      let t = new Date(c.updatedAt || c.createdAt || 0).getTime();
      for (const e of scopedEntries) {
        if (e.contactId !== c.id) continue;
        const te = new Date(e.updatedAt || e.createdAt || 0).getTime();
        if (te > t) t = te;
      }
      return t;
    };
    return [...filteredContacts].sort((a, b) => {
      const d = latestTs(b) - latestTs(a);
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [filteredContacts, scopedEntries]);

  const totals = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    for (const c of scopedContacts) {
      const { net } = contactBalance(c.id, scopedEntries);
      if (net > 0) receivable += net;
      else if (net < 0) payable += -net;
    }
    return { receivable, payable };
  }, [scopedContacts, scopedEntries]);

  const openAddContact = () => {
    setFormName('');
    setFormPhone('');
    setContactModal(true);
    setFabOpen(false);
  };

  const saveContact = () => {
    const name = formName.trim();
    if (!name) {
      Swal.fire({ icon: 'warning', title: 'Naam zaroori hai', text: 'Shakhs ka naam likhein.' });
      return;
    }
    const row = {
      id: newId(),
      name,
      phone: formPhone.trim() || '',
      businessId: activeBusinessId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    setContacts([row, ...contacts]);
    setContactModal(false);
  };

  const openEntry = (type, preselectContactId = '') => {
    setEntryModal(type);
    setFormAmount('');
    setFormDesc('');
    setFormCategory('');
    setFormBillImage('');
    setFormContactId(preselectContactId || contactId || scopedContacts[0]?.id || '');
    setFabOpen(false);
  };

  const saveEntry = () => {
    const type = entryModal;
    if (!type) return;
    const cid = formContactId;
    if (!cid || !contacts.some((c) => c.id === cid)) {
      Swal.fire({ icon: 'warning', title: 'Shakhs chunein', text: 'Pehle khata / shakhs muntakhib karein.' });
      return;
    }
    const amount = Number(String(formAmount).replace(/,/g, ''));
    if (!amount || amount <= 0) {
      Swal.fire({ icon: 'warning', title: 'Raqam', text: 'Sahi raqam darj karein.' });
      return;
    }
    const description = [
      formCategory ? `[${formCategory}]` : '',
      formDesc.trim(),
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!description) {
      Swal.fire({
        icon: 'warning',
        title: 'Wazahat',
        text: 'Batayein ke yeh adaigi kis wajah se hai (detail).',
      });
      return;
    }
    const ts = nowIso();
    const row = {
      id: newId(),
      contactId: cid,
      type,
      amount,
      description,
      ...(formBillImage && String(formBillImage).startsWith('data:image/')
        ? { billImage: formBillImage }
        : {}),
      createdAt: ts,
      updatedAt: ts,
    };
    const nextContacts = contacts.map((c) =>
      c.id === cid ? { ...c, updatedAt: ts } : c,
    );
    setContacts(nextContacts);
    setEntries([row, ...entries]);
    setEntryModal(null);
  };

  const deleteEntry = async (eid) => {
    const ok = await Swal.fire({
      icon: 'question',
      title: 'Mahzv karein?',
      showCancelButton: true,
      confirmButtonText: 'Haan',
      cancelButtonText: 'Nahi',
    });
    if (!ok.isConfirmed) return;
    setEntries(entries.filter((e) => e.id !== eid));
  };

  const deleteContact = async (cid) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Shakhs hata dein?',
      text: 'Saari entries bhi mita di jayengi.',
      showCancelButton: true,
      confirmButtonText: 'Hata dein',
      cancelButtonText: 'Cancel',
    });
    if (!ok.isConfirmed) return;
    setContacts(contacts.filter((c) => c.id !== cid));
    setEntries(entries.filter((e) => e.contactId !== cid));
    navigate('/personal-khata');
  };

  const saveNewBusiness = () => {
    const name = formBizName.trim();
    if (!name) {
      Swal.fire({
        icon: 'warning',
        title: 'Naam zaroori',
        text: 'Karobar ya dukaan ka naam likhein.',
      });
      return;
    }
    const id = newId();
    const row = { id, name, createdAt: nowIso() };
    setBusinesses((prev) => [...prev, row]);
    setActiveBusinessId(id);
    setFormBizName('');
    setBizModalOpen(false);
    setFabOpen(false);
  };

  const copyKhataShareLink = useCallback(async () => {
    if (!scopedContacts.length) {
      await Swal.fire({
        icon: 'info',
        title: 'Khaali',
        text: 'Share karne se pehle is business main kam az kam ek shakhs hon.',
      });
      return;
    }
    const snap = buildBusinessShareSnapshot(
      { businesses, activeBusinessId, contacts, entries },
      activeBusinessId,
    );
    if (!snap) {
      await Swal.fire({
        icon: 'error',
        title: 'Link nahi bana',
        text: 'Dobara koshish karein.',
      });
      return;
    }
    const { url, warning } = buildKhataShareUrl(snap);
    if (!url) {
      await Swal.fire({
        icon: 'warning',
        title: 'Data bohot bara hai',
        text: 'Bohot tasveeren hon to link chhota nahin ho sakta. PDF bhejin ya tasveeren kam kar ke dubara banayein.',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      const extra =
        warning === 'long_url'
          ? ' URL lambi hai — WhatsApp/desktop par test kar lein.'
          : '';
      await Swal.fire({
        toast: true,
        icon: 'success',
        title: `Share link clipboard me${extra}`,
        position: 'top-end',
        timer: 3200,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        icon: 'info',
        title: 'Khud copy karein',
        input: 'textarea',
        inputValue: url,
      });
    }
  }, [
    scopedContacts.length,
    businesses,
    activeBusinessId,
    contacts,
    entries,
  ]);

  useEffect(() => {
    if (!contactId || !khataHydrated || !activeBusinessId) return;
    const row = contacts.find((c) => c.id === contactId);
    if (!row) return;
    if (String(row.businessId || activeBusinessId) !== String(activeBusinessId)) {
      navigate('/personal-khata', { replace: true });
    }
  }, [contactId, khataHydrated, activeBusinessId, contacts, navigate]);

  const pdfPreviewLayer =
    pdfPreviewUrl ? (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 250,
          background: 'rgba(15,23,42,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="PDF preview"
        onClick={closePdfPreview}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 920,
            height: 'min(92vh, 900px)',
            background: '#fff',
            borderRadius: 16,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 80px rgba(0,0,0,0.35)',
          }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              padding: '10px 14px',
              background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
              color: '#fff',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 14 }}>{pdfPreviewTitle}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => window.open(pdfPreviewUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  border: 'none',
                  background: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Nayi tab
              </button>
              <button
                type="button"
                onClick={closePdfPreview}
                style={{
                  border: 'none',
                  background: 'rgba(255,255,255,0.22)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '8px 14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <X size={18} aria-hidden /> Band karein
              </button>
            </div>
          </div>
          <iframe title={pdfPreviewTitle} src={pdfPreviewUrl} style={{ flex: 1, width: '100%', border: 'none', minHeight: 0 }} />
        </div>
      </div>
    ) : null;

  if (contactId && active) {
    const { net } = contactBalance(active.id, entries);
    const chronological = entriesChronological(entries, active.id);
    const runMap = runningBalances(entries, active.id);

    return (
      <div className={standalone ? 'pk-wrap pk-standalone-view' : 'pk-wrap'}>
        <style>{`
          .pk-wrap {
            --pk-coral: #f43f5e;
            --pk-mint: #10b981;
            --pk-violet: #8b5cf6;
            --pk-sky: #0ea5e9;
            --pk-amber: #f59e0b;
            --pk-surface: #f8fafc;
            --pk-card: #ffffff;
            --pk-text: #0f172a;
            --pk-muted: #64748b;
            max-width: 900px;
            margin: 0 auto;
            padding-bottom: 120px;
            font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          }
          .pk-hero {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 45%, #c026d3 100%);
            border-radius: 20px;
            padding: 20px 22px 22px;
            color: #fff;
            box-shadow: 0 18px 40px rgba(79, 70, 229, 0.28);
            margin-bottom: 20px;
          }
          .pk-back {
            display: inline-flex; align-items: center; gap: 8px;
            background: rgba(255,255,255,0.18);
            border: none; color: #fff; cursor: pointer;
            padding: 8px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
            margin-bottom: 16px; text-decoration: none;
          }
          .pk-headrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
          .pk-avatar {
            width: 48px; height: 48px; border-radius: 999px;
            background: rgba(255,255,255,0.25);
            display: flex; align-items: center; justify-content: center;
            font-weight: 800; font-size: 16px;
            border: 2px solid rgba(255,255,255,0.4);
          }
          .pk-balance-chip {
            margin-top: 14px;
            padding: 14px 16px;
            border-radius: 16px;
            background: rgba(255,255,255,0.95);
            display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
          }
          .pk-tx-card {
            background: var(--pk-card);
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(15,23,42,0.06);
            border: 1px solid rgba(148,163,184,0.18);
            overflow: hidden;
            margin-bottom: 18px;
          }
          .pk-tx-head {
            display: grid;
            grid-template-columns: 1.4fr 1fr 1fr;
            gap: 8px;
            padding: 12px 14px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--pk-muted);
            background: linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%);
            border-bottom: 1px solid #e2e8f0;
          }
          .pk-tx-row {
            display: grid;
            grid-template-columns: 1.4fr 1fr 1fr;
            gap: 8px;
            padding: 14px;
            border-bottom: 1px solid #f1f5f9;
            align-items: start;
          }
          .pk-tx-row:nth-child(even) { background: #fafbfc; }
          .pk-pill {
            display: inline-block;
            margin-top: 6px;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            background: #ffe4e6;
            color: #be123c;
          }
          .pk-bottom {
            position: fixed;
            left: 0; right: 0; bottom: 0;
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            background: linear-gradient(180deg, transparent, rgba(248,250,252,0.92) 25%, #f1f5f9);
            display: flex; gap: 10px; justify-content: center;
            z-index: 50;
          }
          .pk-bottom-inner {
            width: min(900px, 100%);
            display: flex; gap: 10px;
          }
          @media (min-width: 769px) {
            .pk-bottom.pk-offset-sidebar { left: 230px; }
          }
          .pk-btn-give {
            flex: 1;
            border: none;
            cursor: pointer;
            padding: 14px 12px;
            border-radius: 16px;
            font-weight: 800;
            font-size: 13px;
            letter-spacing: 0.04em;
            color: #fff;
            background: linear-gradient(145deg, #fb7185, #e11d48);
            box-shadow: 0 10px 28px rgba(225,29,72,0.35);
            display: flex; align-items: center; justify-content: center; gap: 8px;
          }
          .pk-btn-get {
            flex: 1;
            border: none;
            cursor: pointer;
            padding: 14px 12px;
            border-radius: 16px;
            font-weight: 800;
            font-size: 13px;
            letter-spacing: 0.04em;
            color: #fff;
            background: linear-gradient(145deg, #34d399, #059669);
            box-shadow: 0 10px 28px rgba(5,150,105,0.35);
            display: flex; align-items: center; justify-content: center; gap: 8px;
          }
        `}</style>

        <div className="pk-hero">
          <Link to="/personal-khata" className="pk-back">
            <ChevronLeft size={18} /> Wapas
          </Link>
          <div className="pk-headrow">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="pk-avatar">{initials(active.name)}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {active.name}
                </div>
                {active.phone ? (
                  <div style={{ opacity: 0.88, fontSize: 13, marginTop: 2 }}>{active.phone}</div>
                ) : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                aria-label="PDF dekhein — preview"
                title="Browser mein dekhein"
                style={{
                  background: 'rgba(255,255,255,0.22)',
                  border: 'none',
                  borderRadius: 12,
                  padding: 10,
                  cursor: 'pointer',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => {
                  try {
                    const doc = buildContactLedgerPdf(active, entries);
                    openPdfPreview(doc, `${active.name} — ledger`);
                  } catch (e) {
                    Swal.fire({ icon: 'error', text: String(e?.message || e) });
                  }
                }}
              >
                <Eye size={22} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                aria-label="PDF download"
                title="File save"
                style={{
                  background: 'rgba(255,255,255,0.22)',
                  border: 'none',
                  borderRadius: 12,
                  padding: 10,
                  cursor: 'pointer',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => {
                  try {
                    downloadContactLedgerPdf(active, entries);
                    Swal.fire({
                      toast: true,
                      icon: 'success',
                      title: 'PDF download',
                      position: 'top-end',
                      timer: 1800,
                      showConfirmButton: false,
                    });
                  } catch (e) {
                    Swal.fire({ icon: 'error', text: String(e?.message || e) });
                  }
                }}
              >
                <FileDown size={22} strokeWidth={2.25} />
              </button>
            </div>
          </div>

          <div className="pk-balance-chip">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: net >= 0 ? '#ffe4e6' : '#d1fae5',
                  color: net >= 0 ? '#be123c' : '#047857',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {net >= 0 ? <ArrowDownLeft size={22} /> : <ArrowUpRight size={22} />}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: net >= 0 ? '#be123c' : '#047857',
                  }}
                >
                  {fmtMoney(net)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                  {net >= 0 ? 'Total receivable (pending)' : 'Total payable (pending)'}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
              }}
            >
              Personal Khata
            </div>
          </div>
        </div>

        <div className="pk-tx-card">
          <div className="pk-tx-head">
            <span>Details & time</span>
            <span style={{ textAlign: 'center', color: '#e11d48' }}>Paid out</span>
            <span style={{ textAlign: 'center', color: '#059669' }}>Received</span>
          </div>
          {chronological.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
              Abhi koi entry nahi — neeche se shamil karein
            </div>
          ) : (
            chronological.map((e) => (
              <div key={e.id} className="pk-tx-row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                    {fmtWhen(e.updatedAt || e.createdAt)}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4, lineHeight: 1.45 }}>
                    {e.description}
                  </div>
                  {e.billImage && /^data:image\//i.test(String(e.billImage)) ? (
                    <button
                      type="button"
                      onClick={() => setBillLightboxSrc(e.billImage)}
                      title="Bill / receipt dekhein"
                      style={{
                        marginTop: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: '1px solid #c7d2fe',
                        background: '#eef2ff',
                        color: '#3730a3',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <ImageIcon size={14} strokeWidth={2.5} aria-hidden /> Bill dekhein
                    </button>
                  ) : null}
                  <span className="pk-pill">Bal. {fmtMoney(runMap.get(e.id) ?? 0)}</span>
                  <button
                    type="button"
                    onClick={() => deleteEntry(e.id)}
                    style={{
                      marginTop: 8,
                      border: 'none',
                      background: 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 800, color: '#e11d48' }}>
                  {e.type === 'given' ? fmtMoney(e.amount) : '—'}
                </div>
                <div style={{ textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                  {e.type === 'received' ? fmtMoney(e.amount) : '—'}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={`pk-bottom${standalone ? '' : ' pk-offset-sidebar'}`}>
          <div className="pk-bottom-inner">
            <button
              type="button"
              className="pk-btn-give"
              onClick={() => openEntry('given', active.id)}
            >
              <ArrowUpRight size={18} /> MAINE DIYE
            </button>
            <button
              type="button"
              className="pk-btn-get"
              onClick={() => openEntry('received', active.id)}
            >
              <ArrowDownLeft size={18} /> MAINE LIYE
            </button>
          </div>
        </div>

        {entryModal && (
          <EntryOverlay
            type={entryModal}
            contacts={scopedContacts}
            formContactId={formContactId}
            setFormContactId={setFormContactId}
            formAmount={formAmount}
            setFormAmount={setFormAmount}
            formDesc={formDesc}
            setFormDesc={setFormDesc}
            formCategory={formCategory}
            setFormCategory={setFormCategory}
            formBillImage={formBillImage}
            setFormBillImage={setFormBillImage}
            onClose={() => setEntryModal(null)}
            onSave={saveEntry}
          />
        )}

        {billLightboxSrc ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bill / receipt"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 280,
              background: 'rgba(15,23,42,0.78)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setBillLightboxSrc(null)}
          >
            <button
              type="button"
              aria-label="Band karein"
              onClick={() => setBillLightboxSrc(null)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 2,
                width: 44,
                height: 44,
                borderRadius: 999,
                border: 'none',
                background: 'rgba(255,255,255,0.95)',
                color: '#0f172a',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
            >
              <X size={22} />
            </button>
            <img
              src={billLightboxSrc}
              alt="Bill"
              style={{
                maxWidth: '100%',
                maxHeight: 'min(92vh, 900px)',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: 12,
                boxShadow: '0 12px 48px rgba(0,0,0,0.45)',
              }}
              onClick={(ev) => ev.stopPropagation()}
            />
          </div>
        ) : null}

        {pdfPreviewLayer}
      </div>
    );
  }

  if (contactId && !active) {
    return (
      <div style={{ padding: 24 }}>
        <p>Shakhs nahi mila.</p>
        <Link to="/personal-khata">Khata list</Link>
      </div>
    );
  }

  return (
    <div className="pk-home">
      <style>{`
        .pk-home {
          --pk-text: #0f172a;
          --pk-muted: #64748b;
          max-width: 980px;
          margin: 0 auto;
          padding-bottom: 100px;
          font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        }
        .pk-home-top {
          background: linear-gradient(125deg, #0ea5e9 0%, #6366f1 42%, #a855f7 100%);
          border-radius: 24px;
          padding: 24px 22px 26px;
          color: #fff;
          box-shadow: 0 20px 50px rgba(99, 102, 241, 0.28);
          margin-bottom: 22px;
        }
        .pk-home-title {
          font-size: 26px;
          font-weight: 900;
          letter-spacing: -0.03em;
          margin: 0 0 6px;
        }
        .pk-home-sub {
          opacity: 0.92;
          font-size: 14px;
          font-weight: 500;
          max-width: 520px;
          line-height: 1.45;
        }
        .pk-sumgrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 14px;
          margin-top: 20px;
        }
        .pk-sum {
          border-radius: 18px;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pk-sum-receive {
          background: linear-gradient(145deg, rgba(255,255,255,0.3), rgba(255,255,255,0.12));
          border: 1px solid rgba(255,255,255,0.35);
        }
        .pk-sum-pay {
          background: linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08));
          border: 1px solid rgba(255,255,255,0.28);
        }
        .pk-search {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          border-radius: 14px;
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 16px rgba(15,23,42,0.05);
          margin-bottom: 18px;
        }
        .pk-search input {
          flex: 1;
          border: none;
          font-size: 15px;
          outline: none;
        }
        .pk-quick-card {
          background: #fff;
          border-radius: 20px;
          padding: 18px 18px 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 28px rgba(15,23,42,0.06);
          margin-bottom: 20px;
        }
        .pk-quick-title {
          font-size: 12px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin: 0 0 14px;
        }
        .pk-quick-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        @media (min-width: 700px) {
          .pk-quick-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .pk-tile {
          border: none;
          cursor: pointer;
          border-radius: 16px;
          padding: 14px 12px 14px;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 102px;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
          box-shadow: 0 1px 2px rgba(15,23,42,0.05);
        }
        .pk-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(15,23,42,0.09);
        }
        .pk-tile:active { transform: translateY(0); }
        .pk-tile-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pk-tile-label { font-size: 14px; font-weight: 800; color: #0f172a; line-height: 1.25; }
        .pk-tile-hint { font-size: 11px; font-weight: 600; color: #64748b; line-height: 1.35; }
        .pk-tile-violet { background: linear-gradient(180deg, #faf5ff 0%, #ede9fe 100%); border: 1px solid #ddd6fe; }
        .pk-tile-rose { background: linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%); border: 1px solid #fecdd3; }
        .pk-tile-emerald { background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%); border: 1px solid #a7f3d0; }
        .pk-tile-slate { background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; }
        .pk-tile-static {
          cursor: default;
        }
        .pk-tile-static:hover {
          transform: none;
          box-shadow: 0 1px 2px rgba(15,23,42,0.05);
        }
        .pk-pdf-actions {
          display: flex;
          gap: 8px;
          margin-top: 6px;
        }
        .pk-pdf-btn {
          flex: 1;
          border: none;
          cursor: pointer;
          border-radius: 12px;
          padding: 9px 8px;
          font-size: 11px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          letter-spacing: 0.02em;
        }
        .pk-pdf-btn:hover { filter: brightness(1.05); }
        .pk-pdf-preview {
          background: linear-gradient(145deg, #818cf8, #6366f1);
          color: #fff;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }
        .pk-pdf-save {
          background: linear-gradient(145deg, #f472b6, #db2777);
          color: #fff;
          box-shadow: 0 4px 14px rgba(219, 39, 119, 0.3);
        }
        .pk-tile-pdf {
          min-height: auto;
          padding-bottom: 16px;
        }
        .pk-pdf-card-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          width: 100%;
        }
        .pk-pdf-card-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pk-pdf-card-title {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.35;
          letter-spacing: -0.01em;
          -webkit-font-smoothing: antialiased;
        }
        .pk-pdf-card-hint {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          line-height: 1.45;
        }
        .pk-section-label {
          font-size: 13px;
          font-weight: 800;
          color: #334155;
          margin: 6px 0 12px;
        }
        .pk-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pk-row {
          display: flex;
          align-items: center;
          gap: 14px;
          background: #fff;
          border-radius: 18px;
          padding: 14px 16px;
          border: 1px solid rgba(148,163,184,0.2);
          box-shadow: 0 6px 22px rgba(15,23,42,0.05);
          text-decoration: none;
          color: inherit;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .pk-row:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(15,23,42,0.08);
        }
        .pk-row-av {
          width: 48px; height: 48px;
          border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .pk-fab-wrap {
          position: fixed;
          right: 20px;
          bottom: 22px;
          z-index: 60;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
        }
        @media (min-width: 769px) {
          .pk-fab-wrap.pk-offset-sidebar { margin-right: calc((100vw - 980px - 230px) / 2); }
          .pk-fab-wrap.pk-standalone-margin { margin-right: calc((100vw - 980px) / 2); }
        }
        .pk-fab-menu {
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: pkpop 0.2s ease;
        }
        @keyframes pkpop {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pk-fab-item {
          border: none;
          cursor: pointer;
          padding: 12px 16px;
          border-radius: 14px;
          font-weight: 700;
          font-size: 13px;
          box-shadow: 0 10px 30px rgba(15,23,42,0.12);
          display: flex;
          align-items: center;
          gap: 10px;
          white-space: nowrap;
        }
        .pk-fab-main {
          width: 58px;
          height: 58px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          background: linear-gradient(145deg, #f472b6, #9333ea);
          color: #fff;
          box-shadow: 0 16px 40px rgba(147, 51, 234, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>

      <div className="pk-home-top">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 className="pk-home-title">Personal Khata</h1>
            <p className="pk-home-sub">
              Apne udhar / len den ka hisaab rakhain — diye aur liye dono alag rangon mein. Har entry ki wazahat
              zaroor likhein.
            </p>
          </div>
          <BookOpen size={40} style={{ opacity: 0.35 }} aria-hidden />
        </div>
        <div style={{ marginTop: 14, marginBottom: 6, flexWrap: 'wrap', gap: 10 }} className="pk-biz-strip">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <Briefcase size={18} aria-hidden style={{ opacity: 0.65 }} />
            <label style={{ fontSize: 12, fontWeight: 800 }} htmlFor="pk-biz-picker">
              Business
            </label>
            <select
              id="pk-biz-picker"
              value={activeBusinessId}
              onChange={(e) => setActiveBusinessId(e.target.value)}
              style={{
                flex: '1 1 200px',
                minWidth: 160,
                maxWidth: 360,
                borderRadius: 12,
                border: '2px solid rgba(255,255,255,0.45)',
                background: 'rgba(255,255,255,0.95)',
                padding: '10px 12px',
                fontWeight: 700,
                fontSize: 14,
                color: '#0f172a',
              }}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setFormBizName('');
                setBizModalOpen(true);
                setFabOpen(false);
              }}
              style={{
                border: 'none',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.95)',
                color: '#5b21b6',
                boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
              }}
            >
              + Naya business
            </button>
            <button
              type="button"
              onClick={() => {
                setFabOpen(false);
                void copyKhataShareLink();
              }}
              style={{
                border: 'none',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.28)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.55)',
              }}
            >
              <Share2 size={14} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Khata share
            </button>
          </div>
        </div>
        <div className="pk-sumgrid">
          <div className="pk-sum pk-sum-receive">
            <span style={{ fontSize: 12, fontWeight: 700 }}>Total receivable</span>
            <span style={{ fontSize: 24, fontWeight: 900 }}>{fmtMoney(totals.receivable)}</span>
            <span style={{ fontSize: 11, opacity: 0.9 }}>Owed to you</span>
          </div>
          <div className="pk-sum pk-sum-pay">
            <span style={{ fontSize: 12, fontWeight: 700 }}>Total payable</span>
            <span style={{ fontSize: 24, fontWeight: 900 }}>{fmtMoney(totals.payable)}</span>
            <span style={{ fontSize: 11, opacity: 0.9 }}>You owe</span>
          </div>
        </div>
      </div>

      <div className="pk-search">
        <Search size={20} color="#94a3b8" />
        <input
          placeholder="Shakhs dhoondhein — naam ya phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="pk-quick-card">
        <p className="pk-quick-title">Quick actions</p>
        <div className="pk-quick-grid">
          <button type="button" className="pk-tile pk-tile-violet" onClick={openAddContact}>
            <div className="pk-tile-icon" style={{ background: '#ddd6fe', color: '#5b21b6' }}>
              <UserPlus size={20} strokeWidth={2.25} />
            </div>
            <span className="pk-tile-label">Naya shakhs</span>
            <span className="pk-tile-hint">Naam aur phone shamil karein</span>
          </button>
          <button
            type="button"
            className="pk-tile pk-tile-rose"
            onClick={() => (scopedContacts.length ? openEntry('given') : openAddContact())}
          >
            <div className="pk-tile-icon" style={{ background: '#fecdd3', color: '#be123c' }}>
              <ArrowUpRight size={20} strokeWidth={2.25} />
            </div>
            <span className="pk-tile-label">Maine diye</span>
            <span className="pk-tile-hint">Jo paisay aap ne diye</span>
          </button>
          <button
            type="button"
            className="pk-tile pk-tile-emerald"
            onClick={() => (scopedContacts.length ? openEntry('received') : openAddContact())}
          >
            <div className="pk-tile-icon" style={{ background: '#a7f3d0', color: '#047857' }}>
              <ArrowDownLeft size={20} strokeWidth={2.25} />
            </div>
            <span className="pk-tile-label">Maine liye</span>
            <span className="pk-tile-hint">Jo paisay aap ne liye</span>
          </button>
          <div
            className="pk-tile pk-tile-slate pk-tile-static pk-tile-pdf"
            style={{ gridColumn: '1 / -1' }}
          >
            <div className="pk-pdf-card-row">
              <div className="pk-tile-icon" style={{ background: '#cbd5e1', color: '#0f172a' }}>
                <FileDown size={20} strokeWidth={2.25} />
              </div>
              <div className="pk-pdf-card-text">
                <div className="pk-pdf-card-title">PDF report</div>
                <div className="pk-pdf-card-hint">
                  Rangin hisaab · pehle yahin dekhein ya seedha save
                </div>
                <div className="pk-pdf-actions">
                  <button
                    type="button"
                    className="pk-pdf-btn pk-pdf-preview"
                    onClick={previewSummaryPdf}
                  >
                    <Eye size={15} strokeWidth={2.5} /> Dekhein
                  </button>
                  <button
                    type="button"
                    className="pk-pdf-btn pk-pdf-save"
                    onClick={exportSummaryPdf}
                  >
                    <FileDown size={15} strokeWidth={2.5} /> Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="pk-section-label">All contacts</p>

      <div className="pk-list">
        {sortedContactList.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              color: '#94a3b8',
              fontWeight: 600,
              background: '#fff',
              borderRadius: 18,
              border: '1px dashed #cbd5e1',
            }}
          >
            Khata khaali — &quot;Naya shakhs&quot; ya neeche + se shuru karein
          </div>
        ) : (
          sortedContactList.map((c, i) => {
            const { net } = contactBalance(c.id, entries);
            const grad = [
              'linear-gradient(145deg,#6366f1,#8b5cf6)',
              'linear-gradient(145deg,#ec4899,#f43f5e)',
              'linear-gradient(145deg,#06b6d4,#3b82f6)',
              'linear-gradient(145deg,#10b981,#14b8a6)',
            ][i % 4];
            return (
              <Link key={c.id} to={`/personal-khata/contact/${c.id}`} className="pk-row">
                <div className="pk-row-av" style={{ background: grad }}>
                  {initials(c.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{c.name}</div>
                  {c.phone ? (
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>{c.phone}</div>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 16,
                      color: net === 0 ? '#64748b' : net > 0 ? '#e11d48' : '#059669',
                    }}
                  >
                    {net === 0 ? '₨0' : `${net > 0 ? '' : '−'}${fmtMoney(net)}`}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {net > 0 ? 'Receivable' : net < 0 ? 'Payable' : 'Settled'}
                  </div>
                </div>
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 8,
                    color: '#cbd5e1',
                  }}
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    deleteContact(c.id);
                  }}
                  title="Hata dein"
                >
                  <Trash2 size={18} />
                </button>
              </Link>
            );
          })
        )}
      </div>

      <div className={`pk-fab-wrap ${standalone ? 'pk-standalone-margin' : 'pk-offset-sidebar'}`}>
        {fabOpen && (
          <div className="pk-fab-menu">
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#fffbeb', color: '#b45309' }}
              onClick={() => {
                setFabOpen(false);
                setFormBizName('');
                setBizModalOpen(true);
              }}
            >
              <Briefcase size={18} /> Naya business
            </button>
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#eef2ff', color: '#312e81' }}
              onClick={() => {
                setFabOpen(false);
                void copyKhataShareLink();
              }}
            >
              <Share2 size={18} /> Khata share link
            </button>
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#fff', color: '#5b21b6' }}
              onClick={openAddContact}
            >
              <UserPlus size={18} /> Naya shakhs
            </button>
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#fff1f2', color: '#be123c' }}
              onClick={() => openEntry('given')}
            >
              <ArrowUpRight size={18} /> Maine diye (entry)
            </button>
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#ecfdf5', color: '#047857' }}
              onClick={() => openEntry('received')}
            >
              <ArrowDownLeft size={18} /> Maine liye (entry)
            </button>
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#eef2ff', color: '#3730a3' }}
              onClick={() => {
                setFabOpen(false);
                previewSummaryPdf();
              }}
            >
              <Eye size={18} /> PDF dekhein
            </button>
            <button
              type="button"
              className="pk-fab-item"
              style={{ background: '#f1f5f9', color: '#0f172a' }}
              onClick={() => {
                setFabOpen(false);
                exportSummaryPdf();
              }}
            >
              <FileDown size={18} /> PDF save
            </button>
          </div>
        )}
        <button
          type="button"
          className="pk-fab-main"
          aria-label="Mazeed actions"
          onClick={() => setFabOpen((o) => !o)}
        >
          {fabOpen ? <span style={{ fontSize: 28, lineHeight: 1 }}>×</span> : <Plus size={28} />}
        </button>
      </div>

      {contactModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveContact();
            }}
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: 22,
              width: '100%',
              maxWidth: 420,
              maxHeight: 'min(90vh, 640px)',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
              margin: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900 }}>Naya shakhs</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13 }}>Naam zaroori — phone ikhtiyari</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
              Naam
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 14, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Jaise: Zeeshan, C Shafiq"
            />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
              Phone
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 20, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="03xx..."
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setContactModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {bizModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflowY: 'auto',
          }}
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveNewBusiness();
            }}
            style={{
              background: '#fff',
              borderRadius: 24,
              padding: 22,
              width: '100%',
              maxWidth: 420,
              maxHeight: 'min(90vh, 560px)',
              overflowY: 'auto',
              boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
              margin: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900 }}>Naya business</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13 }}>
              Alag dukaan / unit ka naam — khata shamil shamil rahay ga.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
              Naam
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 18, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
              value={formBizName}
              onChange={(e) => setFormBizName(e.target.value)}
              placeholder="Misaal: Cloth House Anarkali"
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setBizModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                Save business
              </button>
            </div>
          </form>
        </div>
      )}

      {entryModal && (
        <EntryOverlay
          type={entryModal}
          contacts={scopedContacts}
          formContactId={formContactId}
          setFormContactId={setFormContactId}
          formAmount={formAmount}
          setFormAmount={setFormAmount}
          formDesc={formDesc}
          setFormDesc={setFormDesc}
          formCategory={formCategory}
          setFormCategory={setFormCategory}
          formBillImage={formBillImage}
          setFormBillImage={setFormBillImage}
          onClose={() => setEntryModal(null)}
          onSave={saveEntry}
        />
      )}

      {pdfPreviewLayer}
    </div>
  );
}

const CAT_OPTIONS = ['Cash', 'Bank', 'JazzCash', 'EasyPaisa', 'Salary', 'Rent', 'Karobar', 'Personal', 'Other'];

function EntryOverlay({
  type,
  contacts,
  formContactId,
  setFormContactId,
  formAmount,
  setFormAmount,
  formDesc,
  setFormDesc,
  formCategory,
  setFormCategory,
  formBillImage,
  setFormBillImage,
  onClose,
  onSave,
}) {
  const title = type === 'given' ? 'Maine diye — raqam & wazahat' : 'Maine liye — raqam & wazahat';
  const accent = type === 'given' ? '#e11d48' : '#059669';

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let s = String(reader.result || '');
        const needsWork = approxBytesFromDataUrl(s) > PK_IMAGE_TARGET_BYTES;
        if (needsWork || s.length > 2_800_000) {
          s = await compressImageDataUrl(s, PK_IMAGE_TARGET_BYTES);
        }
        setFormBillImage(s);
      } catch {
        Swal.fire({ icon: 'error', title: 'Tasveer fit nahi hui', text: 'Dobara koshish karein.' });
      }
    };
    reader.onerror = () => {
      Swal.fire({ icon: 'error', title: 'Read nahi ho saki', text: 'Dobara koshish karein.' });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        style={{
          background: '#fff',
          borderRadius: 24,
          padding: 22,
          width: '100%',
          maxWidth: 440,
          maxHeight: 'min(90vh, 720px)',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
          borderTop: `4px solid ${accent}`,
          margin: 'auto',
        }}
      >
      <input
        id="pk-khata-camera"
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleImagePick}
      />
      <input
        id="pk-khata-gallery"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImagePick}
      />
        <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 900, color: '#0f172a' }}>{title}</h2>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#64748b' }}>
          Zaban mein likhein ke paisay kis bunyad par {type === 'given' ? 'diye' : 'liye'} — yeh baad mein bhi yaad
          rahega.
        </p>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Shakhs
        </label>
        <select
          className="form-select"
          style={{
            width: '100%',
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            fontSize: 14,
          }}
          value={formContactId}
          onChange={(e) => setFormContactId(e.target.value)}
        >
          <option value="">— Chunein —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Qism / channel
        </label>
        <select
          className="form-select"
          style={{
            width: '100%',
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            fontSize: 14,
          }}
          value={formCategory}
          onChange={(e) => setFormCategory(e.target.value)}
        >
          <option value="">Ikhtiyari</option>
          {CAT_OPTIONS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Raqam (PKR)
        </label>
        <input
          type="number"
          min="0"
          step="any"
          style={{
            width: '100%',
            marginBottom: 14,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            fontSize: 18,
            fontWeight: 800,
          }}
          value={formAmount}
          onChange={(e) => setFormAmount(e.target.value)}
          placeholder="0"
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Tafseel / wajah
        </label>
        <textarea
          style={{
            width: '100%',
            marginBottom: 18,
            padding: 12,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            minHeight: 88,
            resize: 'vertical',
            fontSize: 14,
            lineHeight: 1.45,
          }}
          value={formDesc}
          onChange={(e) => setFormDesc(e.target.value)}
          placeholder="Maslan: internet bill, jazz cash, commission, udhari wapis..."
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Bill / receipt (ikhtiyari)
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <label
            htmlFor="pk-khata-camera"
            style={{
              flex: 1,
              minWidth: 120,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              color: '#0369a1',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              margin: 0,
            }}
          >
            <Camera size={18} strokeWidth={2.25} aria-hidden /> Camera
          </label>
          <label
            htmlFor="pk-khata-gallery"
            style={{
              flex: 1,
              minWidth: 120,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #e9d5ff',
              background: '#faf5ff',
              color: '#6b21a8',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              margin: 0,
            }}
          >
            <ImageIcon size={18} strokeWidth={2.25} aria-hidden /> Gallery
          </label>
        </div>
        {formBillImage && /^data:image\//i.test(String(formBillImage)) ? (
          <div
            style={{
              position: 'relative',
              marginBottom: 16,
              borderRadius: 14,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              alignSelf: 'stretch',
            }}
          >
            <img
              src={formBillImage}
              alt="Bill preview"
              style={{ display: 'block', width: '100%', maxHeight: 160, objectFit: 'cover' }}
            />
            <button
              type="button"
              onClick={() => setFormBillImage('')}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 32,
                height: 32,
                borderRadius: 999,
                border: 'none',
                background: 'rgba(15,23,42,0.65)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Tasveer hata dein"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4 }}>
            Bill ki tasveer laga sakte hain — maslan JazzCash screenshot ya paper slip.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Band karein
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 1, background: accent, borderColor: accent }}
          >
            Save entry
          </button>
        </div>
      </form>
    </div>
  );
}
