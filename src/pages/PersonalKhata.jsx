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
  ContactRound,
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
  downloadContactLedgerPdf,
} from '../utils/personalKhataPdf';
import { buildKhataShareUrl } from '../utils/personalKhataShare';
import {
  extractPhoneFromText,
  isContactPickerSupported,
  pickDeviceContact,
  readPhoneFromClipboard,
} from '../utils/pickDeviceContact';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import './personalKhata.css';

/** Ensure a khata state from any source has a valid business list + active id. */
function normalizeKhataState(raw) {
  const businesses =
    Array.isArray(raw?.businesses) && raw.businesses.length
      ? raw.businesses
      : [{ id: newId(), name: 'Main business', createdAt: nowIso() }];
  let activeBusinessId = String(raw?.activeBusinessId || '').trim();
  if (!businesses.some((b) => b.id === activeBusinessId)) {
    activeBusinessId = businesses[0].id;
  }
  return {
    businesses,
    activeBusinessId,
    contacts: Array.isArray(raw?.contacts) ? raw.contacts : [],
    entries: Array.isArray(raw?.entries) ? raw.entries : [],
  };
}

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

const AVATAR_COLORS = ['#0d9488', '#6366f1', '#0891b2', '#7c3aed', '#ea580c', '#db2777'];

function avatarColor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * 17) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
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
  const { user, isAuthenticated } = useAuth();
  // Every logged-in account (admin / party / personal_khata) gets its own server-synced
  // khata, keyed by user id, so it shows the same data on any device. Anonymous = local only.
  const khataStorageScope =
    isAuthenticated && user?.status === 'approved'
      ? String(user.id || user._id || '').trim()
      : '';
  const khataEmbedded = isAuthenticated && !standalone;
  const { contactId } = useParams();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [activeBusinessId, setActiveBusinessId] = useState('');
  const [khataHydrated, setKhataHydrated] = useState(false);
  const khataHydrateGenRef = useRef(0);
  const khataScopeRef = useRef(khataStorageScope);
  khataScopeRef.current = khataStorageScope;
  const [bizModalOpen, setBizModalOpen] = useState(false);
  const [formBizName, setFormBizName] = useState('');
  const [search, setSearch] = useState('');


  const [entryModal, setEntryModal] = useState(null);
  const [contactModal, setContactModal] = useState(false);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [deviceContactSupported, setDeviceContactSupported] = useState(false);
  const [pickingDeviceContact, setPickingDeviceContact] = useState(false);
  const [pastingPhone, setPastingPhone] = useState(false);
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

  const openPdfPreview = useCallback((doc, title = 'View PDF') => {
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      if (pdfBlobRef.current) URL.revokeObjectURL(pdfBlobRef.current);
      pdfBlobRef.current = url;
      setPdfPreviewTitle(title);
      setPdfPreviewUrl(url);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'PDF error', text: String(e?.message || e) });
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
    let cancelled = false;
    const gen = ++khataHydrateGenRef.current;

    const applyState = (data) => {
      if (cancelled || gen !== khataHydrateGenRef.current) return;
      setBusinesses(data.businesses);
      setActiveBusinessId(data.activeBusinessId);
      setContacts(data.contacts);
      setEntries(data.entries);
      setKhataHydrated(true);
    };

    setKhataHydrated(false);

    // Anonymous device khata stays local-only.
    if (!khataStorageScope) {
      applyState(loadKhataState(undefined));
      return () => {
        cancelled = true;
      };
    }

    // Logged-in: show the cached ledger instantly (no blocking spinner), then reconcile with the
    // server in the background. Atlas latency no longer makes the page sit on "Loading…".
    const cached = loadKhataState(khataStorageScope);
    if (cached.contacts.length > 0 || cached.entries.length > 0) {
      applyState(cached);
    }

    // Logged-in Personal Khata: server is the source of truth so any device/browser sees the same data.
    (async () => {
      try {
        const remote = await apiService.getPersonalKhata();
        let state = normalizeKhataState(remote);
        const remoteEmpty = state.contacts.length === 0 && state.entries.length === 0;
        if (remoteEmpty) {
          // First sync on this account — push up any data this device had stored locally.
          let local = loadKhataState(khataStorageScope);
          // If nothing under this account locally, adopt the anonymous device khata so users
          // who started before signing in (or existing accounts) keep their data linked.
          if (local.contacts.length === 0 && local.entries.length === 0) {
            const anon = loadKhataState(undefined);
            if (anon.contacts.length > 0 || anon.entries.length > 0) {
              local = anon;
            }
          }
          if (local.contacts.length > 0 || local.entries.length > 0) {
            state = local;
            try {
              await apiService.savePersonalKhata(state);
            } catch {
              /* keep local copy; next change will retry */
            }
          }
        }
        // Mirror to localStorage as an offline cache.
        try {
          saveKhataState(state, khataStorageScope);
        } catch {
          /* ignore */
        }
        applyState(state);
      } catch {
        // Offline / server error — fall back to the local cache so the user is never blocked.
        applyState(loadKhataState(khataStorageScope));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [khataStorageScope]);

  useEffect(() => {
    if (!khataHydrated) return undefined;
    const scopeForRun = khataStorageScope;
    const payload = { businesses, activeBusinessId, contacts, entries };

    // Always keep a local cache (offline + fast reloads).
    saveKhataState(payload, scopeForRun || undefined);

    if (!scopeForRun) return undefined;

    // Debounce server writes so rapid edits don't spam the API.
    const t = setTimeout(() => {
      if (scopeForRun !== khataScopeRef.current) return;
      apiService.savePersonalKhata(payload).catch(() => {
        /* local cache already saved; will retry on next change */
      });
    }, 800);
    return () => clearTimeout(t);
  }, [khataHydrated, khataStorageScope, businesses, activeBusinessId, contacts, entries]);

  // Re-fetch from server when tab regains focus so another device’s changes appear.
  useEffect(() => {
    if (!khataStorageScope || !khataHydrated) return undefined;
    const refreshFromServer = () => {
      if (document.visibilityState !== 'visible') return;
      if (entryModal || contactModal || bizModalOpen) return;
      void (async () => {
        try {
          const remote = await apiService.getPersonalKhata();
          const state = normalizeKhataState(remote);
          saveKhataState(state, khataStorageScope);
          setBusinesses(state.businesses);
          setActiveBusinessId(state.activeBusinessId);
          setContacts(state.contacts);
          setEntries(state.entries);
        } catch {
          /* offline — keep local cache */
        }
      })();
    };
    document.addEventListener('visibilitychange', refreshFromServer);
    return () => document.removeEventListener('visibilitychange', refreshFromServer);
  }, [khataStorageScope, khataHydrated, entryModal, contactModal, bizModalOpen]);

  const scopedContacts = useMemo(() => {
    const bid = String(activeBusinessId || '').trim();
    if (!bid) return [];
    return contacts.filter((c) => String(c.businessId || bid) === bid);
  }, [contacts, activeBusinessId]);

  const scopedEntries = useMemo(() => {
    const ids = new Set(scopedContacts.map((c) => c.id));
    return entries.filter((e) => ids.has(e.contactId));
  }, [entries, scopedContacts]);

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

  const renderContactList = (activeId = null) => {
    if (sortedContactList.length === 0) {
      return (
        <div className="pk-empty">
          <div className="pk-empty-icon"><UserPlus size={24} /></div>
          <p>No contacts yet.<br />Tap Add to start your ledger.</p>
        </div>
      );
    }
    return sortedContactList.map((c) => {
      const { net } = contactBalance(c.id, entries);
      const accent = net > 0 ? 'pk-contact-accent--in' : net < 0 ? 'pk-contact-accent--out' : 'pk-contact-accent--zero';
      const amtClass = net > 0 ? 'pk-contact-amt-val--in' : net < 0 ? 'pk-contact-amt-val--out' : 'pk-contact-amt-val--zero';
      return (
        <Link
          key={c.id}
          to={`/personal-khata/contact/${c.id}`}
          className={`pk-contact${activeId === c.id ? ' pk-contact--active' : ''}`}
        >
          <span className={`pk-contact-accent ${accent}`} aria-hidden />
          <div className="pk-av" style={{ background: avatarColor(c.name) }}>
            {initials(c.name)}
          </div>
          <div className="pk-contact-body">
            <div className="pk-contact-name">{c.name}</div>
            {c.phone ? <div className="pk-contact-phone">{c.phone}</div> : null}
          </div>
          <div className="pk-contact-amt">
            <div className={`pk-contact-amt-val ${amtClass}`}>
              {net === 0 ? '₨0' : `${net > 0 ? '' : '−'}${fmtMoney(net)}`}
            </div>
            <div className="pk-contact-amt-tag">
              {net > 0 ? 'Get' : net < 0 ? 'Give' : 'Clear'}
            </div>
          </div>
          <button
            type="button"
            className="pk-contact-del"
            onClick={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              deleteContact(c.id);
            }}
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </Link>
      );
    });
  };

  const openAddContact = () => {
    setFormName('');
    setFormPhone('');
    setPickingDeviceContact(false);
    setPastingPhone(false);
    setDeviceContactSupported(isContactPickerSupported());
    setContactModal(true);
  };

  const pastePhoneFromClipboard = async () => {
    if (pastingPhone || pickingDeviceContact) return;
    setPastingPhone(true);
    try {
      const phone = await readPhoneFromClipboard();
      setFormPhone(phone);
    } catch (err) {
      if (err?.code === 'EMPTY') {
        await Swal.fire({
          icon: 'info',
          title: 'No number in clipboard',
          html: 'iPhone: <b>Contacts</b> → person → number pe <b>Copy</b> → yahan <b>Paste number</b>.',
        });
        return;
      }
      await Swal.fire({
        icon: 'info',
        title: 'Paste number',
        html: 'Phone field pe long-press → <b>Paste</b>, ya pehle Contacts se number copy karein.',
      });
    } finally {
      setPastingPhone(false);
    }
  };

  const pickFromPhoneContacts = async () => {
    if (pickingDeviceContact) return;
    if (!isContactPickerSupported()) {
      await Swal.fire({
        icon: 'info',
        title: 'Not available here',
        text: 'Phone contacts work on Chrome/Edge for Android (HTTPS or localhost). You can still type the number.',
      });
      return;
    }
    setPickingDeviceContact(true);
    try {
      const picked = await pickDeviceContact();
      if (!picked) return;

      let phone = picked.phones[0] || '';
      if (picked.phones.length > 1) {
        const inputOptions = Object.fromEntries(
          picked.phones.map((p) => [p, p]),
        );
        const choice = await Swal.fire({
          title: 'Select number',
          text: picked.name ? `${picked.name} has more than one number` : 'Choose which number to save',
          input: 'radio',
          inputOptions,
          inputValue: picked.phones[0],
          showCancelButton: true,
          confirmButtonText: 'Use this number',
          cancelButtonText: 'Cancel',
          customClass: { popup: 'pk-swal' },
        });
        if (!choice.isConfirmed || !choice.value) return;
        phone = String(choice.value);
      }

      if (picked.name) setFormName(picked.name);
      if (phone) setFormPhone(phone);

      if (!picked.name && !phone) {
        await Swal.fire({
          icon: 'info',
          title: 'No details shared',
          text: 'That contact had no name or phone to fill. Type them manually.',
          timer: 2200,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      if (err?.code === 'UNSUPPORTED') {
        setDeviceContactSupported(false);
        await Swal.fire({
          icon: 'info',
          title: 'Not available here',
          text: 'Phone contacts are not supported in this browser. Type the number instead.',
        });
        return;
      }
      await Swal.fire({
        icon: 'error',
        title: 'Could not open contacts',
        text: err?.message || 'Try again, or type the number manually.',
      });
    } finally {
      setPickingDeviceContact(false);
    }
  };

  const saveContact = () => {
    const name = formName.trim();
    if (!name) {
      Swal.fire({ icon: 'warning', title: 'Name required', text: 'Enter contact name.' });
      return;
    }
    const businessId = activeBusinessId || businesses[0]?.id;
    if (!businessId) {
      Swal.fire({ icon: 'info', title: 'Please wait', text: 'Your ledger is still loading. Try again in a moment.' });
      return;
    }
    const row = {
      id: newId(),
      name,
      phone: formPhone.trim() || '',
      businessId,
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
  };

  const saveEntry = () => {
    const type = entryModal;
    if (!type) return;
    const cid = formContactId;
    if (!cid || !contacts.some((c) => c.id === cid)) {
      Swal.fire({ icon: 'warning', title: 'Select contact', text: 'Choose a contact first.' });
      return;
    }
    const amount = Number(String(formAmount).replace(/,/g, ''));
    if (!amount || amount <= 0) {
      Swal.fire({ icon: 'warning', title: 'Amount', text: 'Enter a valid amount.' });
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
        title: 'Note required',
        text: 'Add a short note explaining this payment.',
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
      title: 'Delete entry?',
      showCancelButton: true,
      confirmButtonText: 'Haan',
      cancelButtonText: 'No',
    });
    if (!ok.isConfirmed) return;
    setEntries(entries.filter((e) => e.id !== eid));
  };

  const deleteContact = async (cid) => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Delete contact?',
      text: 'All entries for this contact will be removed.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });
    if (!ok.isConfirmed) return;
    setContacts(contacts.filter((c) => c.id !== cid));
    setEntries(entries.filter((e) => e.contactId !== cid));
    navigate('/personal-khata');
  };

  const deleteActiveBusiness = async () => {
    if (businesses.length <= 1) {
      await Swal.fire({
        icon: 'info',
        title: 'Cannot delete',
        text: 'At least one business must remain.',
      });
      return;
    }
    const biz = businesses.find((b) => b.id === activeBusinessId);
    if (!biz) return;
    const bid = String(activeBusinessId || '').trim();
    const bizContacts = contacts.filter((c) => String(c.businessId || bid) === bid);
    const contactIds = new Set(bizContacts.map((c) => c.id));
    const entryCount = entries.filter((e) => contactIds.has(e.contactId)).length;

    const ok = await Swal.fire({
      icon: 'warning',
      title: `Delete “${biz.name}”?`,
      html: `<p style="margin:0;font-size:14px;line-height:1.5">This removes <strong>${bizContacts.length}</strong> contact${bizContacts.length === 1 ? '' : 's'} and <strong>${entryCount}</strong> entr${entryCount === 1 ? 'y' : 'ies'} in this business.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Delete business',
      confirmButtonColor: '#dc2626',
      cancelButtonText: 'Cancel',
    });
    if (!ok.isConfirmed) return;

    const nextBiz = businesses.filter((b) => b.id !== activeBusinessId);
    setBusinesses(nextBiz);
    setContacts(contacts.filter((c) => String(c.businessId || bid) !== bid));
    setEntries(entries.filter((e) => !contactIds.has(e.contactId)));
    setActiveBusinessId(nextBiz[0]?.id || '');
    navigate('/personal-khata');
  };

  const saveNewBusiness = () => {
    const name = formBizName.trim();
    if (!name) {
      Swal.fire({
        icon: 'warning',
        title: 'Name required',
        text: 'Enter business or shop name.',
      });
      return;
    }
    const id = newId();
    const row = { id, name, createdAt: nowIso() };
    setBusinesses((prev) => [...prev, row]);
    setActiveBusinessId(id);
    setFormBizName('');
    setBizModalOpen(false);
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
              background: '#1e293b',
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
                <X size={18} aria-hidden /> Close
              </button>
            </div>
          </div>
          <iframe title={pdfPreviewTitle} src={pdfPreviewUrl} style={{ flex: 1, width: '100%', border: 'none', minHeight: 0 }} />
        </div>
      </div>
    ) : null;

  if (khataStorageScope && !khataHydrated) {
    return (
      <div className="pk-app">
        <p style={{ textAlign: 'center', padding: 48, color: '#64748b', fontWeight: 600 }}>
          Loading your ledger…
        </p>
      </div>
    );
  }

  if (contactId && active) {
    const { net } = contactBalance(active.id, entries);
    const chronological = entriesChronological(entries, active.id);
    const runMap = runningBalances(entries, active.id);

    return (
      <div className="pk-shell pk-shell--detail">
        <aside className="pk-shell-master" aria-label="Contacts">
          <div className="pk-shell-master-head">
            <Link to="/personal-khata" className="pk-shell-master-back">
              <ChevronLeft size={16} aria-hidden /> Ledger
            </Link>
            <span>Contacts ({sortedContactList.length})</span>
          </div>
          <div className="pk-shell-master-search">
            <Search size={16} aria-hidden />
            <input
              placeholder="Search name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search contacts"
            />
          </div>
          <div className="pk-shell-master-list">
            {renderContactList(active.id)}
          </div>
        </aside>
      <div className={`pk-wrap${standalone ? ' pk-standalone-view' : ' pk-wrap-embedded'}`}>
        <div className="pk-hero">
          <Link to="/personal-khata" className="pk-back">
            <ChevronLeft size={18} /> Back
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

          <div className="pk-balance-chip">
            <div>
              <div className={`pk-balance-amt ${net >= 0 ? 'pk-balance-amt--in' : 'pk-balance-amt--out'}`}>
                {fmtMoney(net)}
              </div>
              <div className="pk-balance-lbl">
                {net > 0 ? 'They owe you' : net < 0 ? 'You owe them' : 'Settled up'}
              </div>
            </div>
            <div style={{ color: net >= 0 ? '#dc2626' : '#059669' }}>
              {net >= 0 ? <ArrowDownLeft size={28} /> : <ArrowUpRight size={28} />}
            </div>
          </div>
        </div>

        <div className="pk-tx-card">
          <div className="pk-tx-head">
            <span>Time & note</span>
            <span className="pk-tx-head-out">Paid out</span>
            <span className="pk-tx-head-in">Received in</span>
          </div>
          {chronological.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
              No entries yet — add below
            </div>
          ) : (
            chronological.map((e) => (
              <div key={e.id} className="pk-tx-row">
                <div className="pk-tx-main">
                  <div className="pk-tx-time">{fmtWhen(e.updatedAt || e.createdAt)}</div>
                  <div className="pk-tx-desc">{e.description}</div>
                  <div className="pk-tx-row-actions">
                    <span className="pk-pill">Bal. {fmtMoney(runMap.get(e.id) ?? 0)}</span>
                    {e.billImage && /^data:image\//i.test(String(e.billImage)) ? (
                      <button
                        type="button"
                        onClick={() => setBillLightboxSrc(e.billImage)}
                        title="View bill"
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
                      aria-label="Delete entry"
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

        <div className={`pk-bottom${khataEmbedded ? ' pk-offset-sidebar' : ''}`}>
          <div className="pk-bottom-inner">
            <button
              type="button"
              className="pk-btn-give"
              onClick={() => openEntry('given', active.id)}
            >
              <ArrowUpRight size={18} aria-hidden /> Pay out
            </button>
            <button
              type="button"
              className="pk-btn-get"
              onClick={() => openEntry('received', active.id)}
            >
              <ArrowDownLeft size={18} aria-hidden /> Receive
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
              aria-label="Close"
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
      </div>
    );
  }

  if (contactId && !active) {
    return (
      <div style={{ padding: 24 }}>
        <p>Contact not found.</p>
        <Link to="/personal-khata">Ledger list</Link>
      </div>
    );
  }

  return (
    <div className="pk-shell">
    <div className={`pk-app${khataEmbedded ? ' pk-app-embedded' : ''}`}>
      <header className="pk-header">
        <div className="pk-header-row">
          <div>
            <h1 className="pk-header-title">Personal Khata</h1>
            {!khataStorageScope && (
              <p className="pk-header-sub">
                <Link to="/personal-khata/account">Sign in</Link> to sync on every device
              </p>
            )}
            {khataStorageScope && user?.role === 'personal_khata' && (
              <p className="pk-header-sub">
                Synced on every device · <Link to="/personal-khata/upgrade">Upgrade</Link>
              </p>
            )}
            {khataStorageScope && user?.role !== 'personal_khata' && (
              <p className="pk-header-sub">Synced on every device</p>
            )}
          </div>
          <div className="pk-biz-pill">
            <select
              id="pk-biz-picker"
              value={activeBusinessId}
              onChange={(e) => setActiveBusinessId(e.target.value)}
              aria-label="Business"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="pk-biz-pill-btn"
              aria-label="New business"
              title="Add business"
              onClick={() => {
                setFormBizName('');
                setBizModalOpen(true);
              }}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="pk-biz-pill-btn pk-biz-pill-btn--danger"
              aria-label="Delete business"
              title={businesses.length <= 1 ? 'At least one business required' : 'Delete this business'}
              disabled={businesses.length <= 1}
              onClick={() => void deleteActiveBusiness()}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="pk-stats">
          <div className="pk-stat">
            <span className="pk-stat-label">You will get</span>
            <span className="pk-stat-amt">{fmtMoney(totals.receivable)}</span>
          </div>
          <div className="pk-stat">
            <span className="pk-stat-label">You will give</span>
            <span className="pk-stat-amt">{fmtMoney(totals.payable)}</span>
          </div>
        </div>

        <div className="pk-search-wrap">
          <Search size={18} aria-hidden />
          <input
            placeholder="Search name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <section className="pk-panel">
        <div className="pk-panel-head">
          <span>Contacts ({sortedContactList.length})</span>
          <button type="button" className="pk-panel-add" onClick={openAddContact}>
            <UserPlus size={14} aria-hidden /> Add
          </button>
        </div>
        {renderContactList()}
      </section>

      <div className={`pk-home-bar${khataEmbedded ? ' pk-home-bar-sidebar' : ''}`}>
        <div className="pk-home-bar-inner">
          <button
            type="button"
            className="pk-bar-btn pk-bar-btn-out"
            onClick={() => (scopedContacts.length ? openEntry('given') : openAddContact())}
          >
            <ArrowUpRight size={18} aria-hidden />
            Paid out
          </button>
          <button
            type="button"
            className="pk-bar-btn pk-bar-btn-in"
            onClick={() => (scopedContacts.length ? openEntry('received') : openAddContact())}
          >
            <ArrowDownLeft size={18} aria-hidden />
            Received
          </button>
        </div>
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
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900 }}>New contact</h2>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13 }}>
              Name required — phone optional
            </p>

            {deviceContactSupported ? (
              <button
                type="button"
                className="pk-pick-contact-btn"
                disabled={pickingDeviceContact || pastingPhone}
                onClick={() => void pickFromPhoneContacts()}
              >
                <ContactRound size={18} aria-hidden />
                {pickingDeviceContact ? 'Opening contacts…' : 'Pick from phone contacts'}
              </button>
            ) : (
              <div className="pk-ios-contact-hint">
                <p>
                  iPhone / Safari contacts list open nahi kar sakte (Apple limit).
                  {' '}Asaan tariqa: <strong>Contacts</strong> → number <strong>Copy</strong> → neeche{' '}
                  <strong>Paste number</strong>.
                </p>
                <button
                  type="button"
                  className="pk-pick-contact-btn pk-pick-contact-btn--paste"
                  disabled={pickingDeviceContact || pastingPhone}
                  onClick={() => void pastePhoneFromClipboard()}
                >
                  {pastingPhone ? 'Pasting…' : 'Paste number from clipboard'}
                </button>
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
              Name
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 14, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Contact name"
              autoComplete="name"
              disabled={pickingDeviceContact || pastingPhone}
            />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
              Phone
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 20, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData?.getData('text') || '';
                const phone = extractPhoneFromText(text);
                if (!phone) return;
                e.preventDefault();
                setFormPhone(phone);
              }}
              placeholder="03xx..."
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              disabled={pickingDeviceContact || pastingPhone}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                disabled={pickingDeviceContact || pastingPhone}
                onClick={() => setContactModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={pickingDeviceContact || pastingPhone}
              >
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
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900 }}>New business</h2>
            <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 13 }}>
              Name for a separate shop or unit — entries stay in this ledger.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569' }}>
              Name
            </label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 18, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
              value={formBizName}
              onChange={(e) => setFormBizName(e.target.value)}
              placeholder="e.g. Cloth House Anarkali"
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
    <aside className="pk-shell-detail-empty" aria-label="Ledger detail">
      <div className="pk-shell-detail-empty-inner">
        <div className="pk-shell-detail-empty-icon" aria-hidden>
          <UserPlus size={28} />
        </div>
        <p className="pk-shell-detail-empty-title">Select a contact</p>
        <p className="pk-shell-detail-empty-sub">
          Open a person on the left to see balances and entries here.
        </p>
      </div>
    </aside>
    </div>
  );
}

const CAT_OPTIONS = ['Cash', 'Bank', 'JazzCash', 'EasyPaisa', 'Salary', 'Rent', 'Business', 'Personal', 'Other'];

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
  const title = type === 'given' ? 'Paid out — amount & note' : 'Received in — amount & note';
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
        Swal.fire({ icon: 'error', title: 'Image error', text: 'Please try again.' });
      }
    };
    reader.onerror = () => {
      Swal.fire({ icon: 'error', title: 'Could not read file', text: 'Please try again.' });
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
          In words, why this money was {type === 'given' ? 'paid out' : 'received'} — helps you remember later
          rahega.
        </p>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Contact
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
          <option value="">— Select —</option>
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
          <option value="">Optional</option>
          {CAT_OPTIONS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Amount (PKR)
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
          Note / reason
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
          placeholder="e.g. internet bill, JazzCash, commission, loan repayment..."
        />

        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#475569', marginBottom: 6 }}>
          Bill / receipt (optional)
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
              aria-label="Remove image"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <p style={{ margin: '0 0 16px', fontSize: 11.5, color: '#94a3b8', lineHeight: 1.4 }}>
            Attach a bill image, e.g. JazzCash screenshot or paper receipt.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Close
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
