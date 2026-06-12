import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { contactBalance, entriesForRunningBalance } from './personalKhataStorage';

/** Brand palette (RGB 0–255) */
const C = {
  indigo: [99, 102, 241],
  indigoDark: [67, 56, 202],
  violet: [139, 92, 246],
  fuchsia: [217, 70, 239],
  rose: [244, 63, 94],
  emerald: [16, 185, 129],
  amber: [245, 158, 11],
  slate: [51, 65, 85],
  slateLight: [241, 245, 249],
  white: [255, 255, 255],
};

function fmtRs(n) {
  const v = Number(n) || 0;
  return `Rs ${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function safeNameForFile(name) {
  return (
    String(name || 'khata')
      .replace(/[<>:"/\\|?*]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 48) || 'khata'
  );
}

/** Gradient-like header band */
function drawHeaderBand(doc, pageW, h, colors) {
  const seg = pageW / colors.length;
  colors.forEach((rgb, i) => {
    doc.setFillColor(...rgb);
    doc.rect(i * seg, 0, seg + 0.5, h, 'F');
  });
}

function drawSummaryStrip(doc, y, pageW, receivable, payable) {
  const stripH = 17;
  doc.setFillColor(...C.slateLight);
  doc.rect(0, y, pageW, stripH, 'F');
  doc.setDrawColor(...[226, 232, 240]);
  doc.setLineWidth(0.2);
  doc.line(0, y + stripH, pageW, y + stripH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.rose);
  doc.text(`Total receivable · ${fmtRs(receivable)}`, 14, y + 7);
  doc.setTextColor(...C.emerald);
  doc.text(`Total payable · ${fmtRs(payable)}`, pageW - 14, y + 7, { align: 'right' });
  doc.setTextColor(...C.slate);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Personal Khata · Ghausia', pageW / 2, y + 13, { align: 'center' });
}

function drawFooterStrip(pdf, tagline) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(...C.indigoDark);
  pdf.rect(0, pageH - 7, pageW, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.text(tagline, pageW / 2, pageH - 2.8, { align: 'center' });
}

/**
 * Build summary PDF (all contacts). Caller may .save() or preview.
 */
export function buildPersonalKhataSummaryPdf(contacts, entries) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  drawHeaderBand(doc, pageW, 22, [C.indigo, C.violet, C.fuchsia]);

  doc.setTextColor(...C.white);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text('Personal Khata', 14, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Full summary · ${fmtDt(new Date().toISOString())}`, 14, 19);

  let receivable = 0;
  let payable = 0;
  for (const c of contacts) {
    const { net } = contactBalance(c.id, entries);
    if (net > 0) receivable += net;
    else if (net < 0) payable += -net;
  }

  drawSummaryStrip(doc, 22, pageW, receivable, payable);

  const body = contacts.map((c) => {
    const { given, received, net } = contactBalance(c.id, entries);
    const bal =
      net === 0 ? '—' : net > 0 ? `${fmtRs(net)}  (receivable)` : `${fmtRs(-net)}  (payable)`;
    return [c.name, c.phone || '—', fmtRs(given), fmtRs(received), bal];
  });

  autoTable(doc, {
    startY: 40,
    head: [['Name', 'Phone', 'Paid out', 'Received', 'Balance']],
    body,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      overflow: 'linebreak',
      cellWidth: 'wrap',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: C.slate,
    },
    headStyles: {
      fillColor: C.indigoDark,
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 36, fontStyle: 'bold' },
      1: { cellWidth: 30 },
      2: { cellWidth: 28, halign: 'right', textColor: C.rose },
      3: { cellWidth: 28, halign: 'right', textColor: C.emerald },
      4: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 12, right: 12, bottom: 10 },
    didDrawPage: () => {
      drawFooterStrip(doc, 'Ghausia Textile Manager · Personal Khata');
    },
  });

  return doc;
}

/**
 * Build single-contact ledger PDF.
 */
export function buildContactLedgerPdf(contact, entries) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const { given, received, net } = contactBalance(contact.id, entries);

  drawHeaderBand(doc, pageW, 20, [C.fuchsia, C.violet, C.indigo]);

  doc.setTextColor(...C.white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(String(contact.name || 'Contact'), 14, 12);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const sub = contact.phone ? `${contact.phone}  ·  ` : '';
  doc.text(
    `${sub}Paid out ${fmtRs(given)}  ·  Received ${fmtRs(received)}  ·  Balance ${fmtRs(Math.abs(net))} ${net > 0 ? '(receivable)' : net < 0 ? '(payable)' : ''}`,
    14,
    17,
  );

  doc.setFillColor(...C.slateLight);
  doc.rect(0, 20, pageW, 8, 'F');

  const ordered = entriesForRunningBalance(entries, contact.id);
  let bal = 0;
  const body = [];
  for (const e of ordered) {
    const n = Number(e.amount) || 0;
    if (e.type === 'given') bal += n;
    else bal -= n;
    const descBase = String(e.description || '');
    const desc =
      e.billImage && String(e.billImage).startsWith('data:image/')
        ? `${descBase}${descBase ? ' ' : ''}[bill photo]`.slice(0, 85)
        : descBase.slice(0, 85);
    body.push([
      fmtDt(e.createdAt || e.updatedAt),
      desc,
      e.type === 'given' ? fmtRs(n) : '—',
      e.type === 'received' ? fmtRs(n) : '—',
      fmtRs(bal),
    ]);
  }
  if (body.length === 0) {
    body.push(['—', 'No entries yet', '—', '—', '—']);
  }

  autoTable(doc, {
    startY: 31,
    head: [['Time', 'Description', 'Out', 'In', 'Balance']],
    body,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 },
      overflow: 'linebreak',
      lineColor: [226, 232, 240],
      lineWidth: 0.12,
      textColor: C.slate,
    },
    headStyles: {
      fillColor: [192, 38, 211],
      textColor: C.white,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: [253, 242, 248] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 60 },
      2: { cellWidth: 24, halign: 'right', textColor: C.rose },
      3: { cellWidth: 24, halign: 'right', textColor: C.emerald },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: C.indigoDark },
    },
    margin: { left: 12, right: 12, bottom: 10 },
    didDrawPage: () => {
      drawFooterStrip(doc, `Ledger · ${String(contact.name || '').slice(0, 35)} · Ghausia`);
    },
  });

  return doc;
}

/**
 * Open PDF in a new tab. Many browsers block this unless it runs directly from a click handler.
 * Prefer an in-app iframe (see PersonalKhata `openPdfPreview`) for reliable preview.
 */
export function previewPdfDocument(doc) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error('Popup blocked — use Preview on this page.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export function previewPersonalKhataSummaryPdf(contacts, entries) {
  previewPdfDocument(buildPersonalKhataSummaryPdf(contacts, entries));
}

export function previewContactLedgerPdf(contact, entries) {
  previewPdfDocument(buildContactLedgerPdf(contact, entries));
}

export function downloadPersonalKhataSummaryPdf(contacts, entries) {
  const doc = buildPersonalKhataSummaryPdf(contacts, entries);
  doc.save(`Personal_Khata_summary_${Date.now()}.pdf`);
}

export function downloadContactLedgerPdf(contact, entries) {
  const doc = buildContactLedgerPdf(contact, entries);
  doc.save(`Khata_${safeNameForFile(contact.name)}_${Date.now()}.pdf`);
}
