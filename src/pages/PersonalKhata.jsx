import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
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
  buildContactShareSnapshot,
} from '../utils/personalKhataStorage';
import {
  buildContactLedgerPdf,
  buildPersonalKhataSummaryPdf,
  downloadContactLedgerPdf,
  downloadPersonalKhataSummaryPdf,
} from '../utils/personalKhataPdf';
import { buildKhataShareUrl } from '../utils/personalKhataShare';
import { useAuth } from '../context/AuthContext';

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
  const { user } = useAuth();
  const khataStorageScope =
    user?.role === 'personal_khata' ? String(user.id || user._id || '').trim() : '';
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
    setKhataHydrated(false);
    const data = loadKhataState(khataStorageScope || undefined);
    setBusinesses(data.businesses);
    setActiveBusinessId(data.activeBusinessId);
    setContacts(data.contacts);
    setEntries(data.entries);
    setKhataHydrated(true);
  }, [khataStorageScope]);

  useEffect(() => {
    if (!khataHydrated) return;
    saveKhataState(
      { businesses, activeBusinessId, contacts, entries },
      khataStorageScope || undefined,
    );
  }, [khataHydrated, khataStorageScope, businesses, activeBusinessId, contacts, entries]);

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

  const copyContactShareLink = useCallback(
    async (contactId) => {
      const snap = buildContactShareSnapshot(
        { businesses, activeBusinessId, contacts, entries },
        contactId,
      );
      if (!snap) {
        await Swal.fire({
          icon: 'error',
          title: 'Could not create link',
          text: 'Please try again.',
        });
        return;
      }
      const { url, warning } = buildKhataShareUrl(snap);
      if (!url) {
        await Swal.fire({
          icon: 'warning',
          title: 'Too much data',
          text: 'This ledger has very large images. Try removing some bill photos, or send a PDF instead.',
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        const extra =
          warning === 'long_url'
            ? ' The URL is long — test on WhatsApp or desktop if needed.'
            : '';
        await Swal.fire({
          toast: true,
          icon: 'success',
          title: `Share link copied${extra}`,
          position: 'top-end',
          timer: 3200,
          showConfirmButton: false,
        });
      } catch {
        await Swal.fire({
          icon: 'info',
          title: 'Copy manually',
          input: 'textarea',
          inputValue: url,
        });
      }
    },
    [businesses, activeBusinessId, contacts, entries],
  );

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
            grid-template-columns: 1.35fr 1fr 1fr;
            gap: 0;
            padding: 0;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.04em;
            border-bottom: 1px solid #e2e8f0;
            overflow: hidden;
            border-radius: 16px 16px 0 0;
          }
          .pk-tx-head > span {
            padding: 12px 12px;
          }
          .pk-tx-head > span:first-child {
            color: #475569;
            text-transform: uppercase;
            background: #f8fafc;
          }
          .pk-tx-head-out {
            text-align: center;
            color: #991b1b;
            background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%);
            border-left: 1px solid #fecaca;
          }
          .pk-tx-head-in {
            text-align: center;
            color: #14532d;
            background: linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%);
            border-left: 1px solid #bbf7d0;
          }
          .pk-tx-row {
            display: grid;
            grid-template-columns: 1.35fr 1fr 1fr;
            gap: 0;
            padding: 0;
            border-bottom: 1px solid #eef2f7;
            align-items: stretch;
          }
          .pk-tx-row:nth-child(even) .pk-tx-main { background: #fbfcfe; }
          .pk-tx-main {
            padding: 14px 14px 12px;
            min-width: 0;
          }
          .pk-tx-desc {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
            overflow: hidden;
            word-break: break-word;
          }
          .pk-tx-row-actions {
            margin-top: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          .pk-tx-out, .pk-tx-in {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px 10px;
            font-weight: 800;
            font-size: 15px;
            border-left: 1px solid #eef2f7;
          }
          .pk-tx-out { background: #fff5f5; color: #b91c1c; }
          .pk-tx-in { background: #f0fdf4; color: #047857; }
          .pk-tx-out.pk-tx-empty, .pk-tx-in.pk-tx-empty {
            color: #cbd5e1;
            font-weight: 600;
            font-size: 20px;
          }
          .pk-tx-amt-pill {
            padding: 8px 12px;
            border-radius: 12px;
            font-weight: 800;
            font-size: 14px;
            line-height: 1.2;
          }
          .pk-tx-amt-pill-out {
            background: #fee2e2;
            color: #991b1b;
            border: 1px solid #fecaca;
          }
          .pk-tx-amt-pill-in {
            background: #dcfce7;
            color: #14532d;
            border: 1px solid #bbf7d0;
          }
          .pk-pill {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
            background: #f1f5f9;
            color: #334155;
            border: 1px solid #e2e8f0;
          }
          @media (max-width: 620px) {
            .pk-tx-head { font-size: 10px; }
            .pk-tx-head > span { padding: 10px 8px; }
            .pk-tx-head {
              grid-template-columns: 1fr 1fr;
              grid-template-areas:
                "hmain hmain"
                "hout hin";
            }
            .pk-tx-head > span:first-child {
              grid-area: hmain;
              text-align: center;
              border-bottom: 1px solid #e2e8f0;
            }
            .pk-tx-head-out { grid-area: hout; border-left: none; }
            .pk-tx-head-in { grid-area: hin; }
            .pk-tx-row {
              grid-template-columns: 1fr 1fr;
              grid-template-areas:
                "main main"
                "out in";
            }
            .pk-tx-main { grid-area: main; border-bottom: 1px solid #eef2f7; }
            .pk-tx-out {
              grid-area: out;
              border-left: none;
              min-height: 56px;
            }
            .pk-tx-in {
              grid-area: in;
              border-left: 1px solid #eef2f7;
              min-height: 56px;
            }
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                aria-label="Copy share link for this contact"
                title="Read-only link for this person’s ledger"
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
                  void copyContactShareLink(active.id);
                }}
              >
                <Share2 size={22} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Preview PDF in browser"
                title="Preview in browser"
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
                aria-label="Download PDF"
                title="Download PDF"
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
                      title: 'PDF downloaded',
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

          <p
            style={{
              margin: '12px 0 0',
              fontSize: 12,
              opacity: 0.9,
              fontWeight: 500,
              lineHeight: 1.45,
              maxWidth: 520,
            }}
          >
            <strong>Share</strong> copies a read-only link for <strong>{active.name}</strong> only (not your whole list).
          </p>

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
            <span>Waqt & wazahat</span>
            <span className="pk-tx-head-out">Dena (diye)</span>
            <span className="pk-tx-head-in">Lena (liye)</span>
          </div>
          {chronological.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
              Abhi koi entry nahi — neeche se shamil karein
            </div>
          ) : (
            chronological.map((e) => (
              <div key={e.id} className="pk-tx-row">
                <div className="pk-tx-main">
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: '#64748b', letterSpacing: '0.02em' }}>
                    {fmtWhen(e.updatedAt || e.createdAt)}
                  </div>
                  <div className="pk-tx-desc" style={{ fontSize: 13.5, color: '#0f172a', marginTop: 6, lineHeight: 1.5 }}>
                    {e.description}
                  </div>
                  <div className="pk-tx-row-actions">
                    <span className="pk-pill">Baqi {fmtMoney(runMap.get(e.id) ?? 0)}</span>
                    {e.billImage && /^data:image\//i.test(String(e.billImage)) ? (
                      <button
                        type="button"
                        onClick={() => setBillLightboxSrc(e.billImage)}
                        title="Bill / receipt dekhein"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #c7d2fe',
                          background: '#eef2ff',
                          color: '#3730a3',
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        <ImageIcon size={13} strokeWidth={2.5} aria-hidden /> Bill
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Entry hata dein"
                      onClick={() => deleteEntry(e.id)}
                      style={{
                        marginLeft: 'auto',
                        border: 'none',
                        background: '#f8fafc',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 6,
                        borderRadius: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div
                  className={`pk-tx-out${e.type === 'given' ? '' : ' pk-tx-empty'}`}
                >
                  {e.type === 'given' ? (
                    <span className="pk-tx-amt-pill pk-tx-amt-pill-out">{fmtMoney(e.amount)}</span>
                  ) : (
                    '—'
                  )}
                </div>
                <div
                  className={`pk-tx-in${e.type === 'received' ? '' : ' pk-tx-empty'}`}
                >
                  {e.type === 'received' ? (
                    <span className="pk-tx-amt-pill pk-tx-amt-pill-in">{fmtMoney(e.amount)}</span>
                  ) : (
                    '—'
                  )}
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
              <ArrowUpRight size={18} aria-hidden /> Dene
            </button>
            <button
              type="button"
              className="pk-btn-get"
              onClick={() => openEntry('received', active.id)}
            >
              <ArrowDownLeft size={18} aria-hidden /> Lena
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
        .pk-biz-strip {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.28);
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
          gap: 8px;
        }
        .pk-sum-receive {
          background: linear-gradient(155deg, #ecfdf5 0%, #d1fae5 55%, #a7f3d0 100%);
          border: 2px solid #34d399;
          box-shadow: 0 10px 28px rgba(16, 185, 129, 0.25);
          color: #064e3b;
        }
        .pk-sum-pay {
          background: linear-gradient(155deg, #fff1f2 0%, #fecdd3 55%, #fda4af 100%);
          border: 2px solid #fb7185;
          box-shadow: 0 10px 28px rgba(244, 63, 94, 0.22);
          color: #881337;
        }
        .pk-sum-ribbon {
          align-self: flex-start;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.14em;
          padding: 4px 10px;
          border-radius: 8px;
          color: #fff;
        }
        .pk-sum-ribbon-in { background: #059669; }
        .pk-sum-ribbon-out { background: #dc2626; }
        .pk-sum-note {
          font-size: 12px;
          font-weight: 600;
          opacity: 0.88;
          margin-top: 2px;
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
          padding: 20px 18px 18px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 28px rgba(15,23,42,0.06);
          margin-bottom: 22px;
        }
        .pk-quick-title {
          font-size: 11px;
          font-weight: 900;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0 0 12px;
        }
        .pk-quick-title + .pk-quick-title {
          margin-top: 22px;
        }
        .pk-money-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .pk-money-tile {
          border: none;
          cursor: pointer;
          border-radius: 18px;
          padding: 18px 14px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          min-height: 108px;
          justify-content: center;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }
        .pk-money-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
        }
        .pk-money-tile-out {
          background: linear-gradient(180deg, #fef2f2 0%, #fee2e2 100%);
          border: 2px solid #f87171;
          color: #991b1b;
        }
        .pk-money-tile-in {
          background: linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%);
          border: 2px solid #34d399;
          color: #065f46;
        }
        .pk-money-tile-label {
          font-size: 16px;
          font-weight: 900;
          line-height: 1.2;
        }
        .pk-money-tile-hint {
          font-size: 11px;
          font-weight: 600;
          opacity: 0.9;
          line-height: 1.3;
        }
        .pk-person-tile {
          width: 100%;
          cursor: pointer;
          border-radius: 16px;
          padding: 16px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%);
          border: 2px solid #c4b5fd;
          color: #5b21b6;
          font-weight: 900;
          font-size: 15px;
          text-align: left;
          transition: transform 0.14s ease;
        }
        .pk-person-tile:hover {
          transform: translateY(-1px);
        }
        .pk-pdf-panel {
          border-radius: 16px;
          padding: 16px;
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #cbd5e1;
        }
        .pk-pdf-panel-top {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }
        .pk-pdf-panel-actions {
          display: flex;
          gap: 10px;
        }
        .pk-pdf-btn {
          flex: 1;
          border: none;
          cursor: pointer;
          border-radius: 12px;
          padding: 12px 10px;
          font-size: 12px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .pk-pdf-btn:hover { filter: brightness(1.05); }
        .pk-pdf-preview {
          background: linear-gradient(145deg, #818cf8, #6366f1);
          color: #fff;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }
        .pk-pdf-save {
          background: #fff;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }
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
              Dena (red) aur lena (green) alag — har entry wazahat ke sath likhein.
            </p>
            {(!user || user.role !== 'personal_khata') && (
              <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.45 }}>
                <Link to="/personal-khata/account" style={{ color: '#4f46e5', fontWeight: 700 }}>
                  Account banayen ya sign in karein (email ya mobile)
                </Link>
                <span style={{ color: '#64748b', fontWeight: 500 }}> — apna khata har device par</span>
              </p>
            )}
            {user?.role === 'personal_khata' && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#4338ca', fontWeight: 600 }}>
                Signed in — yeh khata is account ke naam par is browser me alag save hai.
              </p>
            )}
          </div>
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
          </div>
        </div>
        <div className="pk-sumgrid">
          <div className="pk-sum pk-sum-receive">
            <span className="pk-sum-ribbon pk-sum-ribbon-in">LENA</span>
            <span className="pk-sum-note">Jo aap ko milna hai</span>
            <span style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>{fmtMoney(totals.receivable)}</span>
          </div>
          <div className="pk-sum pk-sum-pay">
            <span className="pk-sum-ribbon pk-sum-ribbon-out">DENA</span>
            <span className="pk-sum-note">Jo aap ne dena hai</span>
            <span style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>{fmtMoney(totals.payable)}</span>
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
        <p className="pk-quick-title">Paisay</p>
        <div className="pk-money-row">
          <button
            type="button"
            className="pk-money-tile pk-money-tile-out"
            onClick={() => (scopedContacts.length ? openEntry('given') : openAddContact())}
          >
            <ArrowUpRight size={26} strokeWidth={2.25} aria-hidden />
            <span className="pk-money-tile-label">Dene (diye)</span>
            <span className="pk-money-tile-hint">Jo aap ne kisi ko diye</span>
          </button>
          <button
            type="button"
            className="pk-money-tile pk-money-tile-in"
            onClick={() => (scopedContacts.length ? openEntry('received') : openAddContact())}
          >
            <ArrowDownLeft size={26} strokeWidth={2.25} aria-hidden />
            <span className="pk-money-tile-label">Lene (liye)</span>
            <span className="pk-money-tile-hint">Jo aap ne kisi se liye</span>
          </button>
        </div>

        <p className="pk-quick-title">Shakhs</p>
        <button type="button" className="pk-person-tile" onClick={openAddContact}>
          <UserPlus size={22} strokeWidth={2.25} aria-hidden />
          <span>Naya shakhs joden</span>
        </button>

        <p className="pk-quick-title">PDF report</p>
        <div className="pk-pdf-panel">
          <div className="pk-pdf-panel-top">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#e2e8f0',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileDown size={22} strokeWidth={2.25} aria-hidden />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: '#0f172a' }}>Summary PDF</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>
                Poora hisaab — pehle dekhein ya seedha save
              </div>
            </div>
          </div>
          <div className="pk-pdf-panel-actions">
            <button type="button" className="pk-pdf-btn pk-pdf-preview" onClick={previewSummaryPdf}>
              <Eye size={16} strokeWidth={2.5} aria-hidden /> Dekhein
            </button>
            <button type="button" className="pk-pdf-btn pk-pdf-save" onClick={exportSummaryPdf}>
              <FileDown size={16} strokeWidth={2.5} aria-hidden /> Save
            </button>
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
