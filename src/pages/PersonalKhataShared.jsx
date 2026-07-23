import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { contactBalance, entriesChronological } from '../utils/personalKhataStorage';
import { parseKhataShareFromLocation } from '../utils/personalKhataShare';
import { formatDisplayDateTime } from '../utils/dateFilters';

const fmtMoney = (n) =>
  `₨${Math.abs(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtWhen = (iso) => formatDisplayDateTime(iso);

export default function PersonalKhataShared() {
  const location = useLocation();
  const snapshot = useMemo(
    () => parseKhataShareFromLocation(location),
    [location]
  );

  const [expanded, setExpanded] = useState({});

  if (!snapshot || !Array.isArray(snapshot.contacts) || !snapshot.readOnly) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: 24 }}>
        <div
          style={{
            maxWidth: 520,
            margin: '80px auto',
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            border: '1px solid #e2e8f0',
          }}
        >
          <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Invalid or expired link</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 }}>
            Copy the full URL, or ask for a new share link from Personal Khata.
          </p>
          <Link to="/personal-khata" style={{ color: '#6366f1', fontWeight: 700 }}>
            Open Personal Khata →
          </Link>
        </div>
      </div>
    );
  }

  const { business, contacts = [], entries = [] } = snapshot;
  const singleContact =
    snapshot.shareScope === 'contact' && contacts.length === 1 ? contacts[0] : null;
  let receivable = 0;
  let payable = 0;
  contacts.forEach((c) => {
    const { net } = contactBalance(c.id, entries);
    if (net > 0) receivable += net;
    else if (net < 0) payable += -net;
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f0f2f5',
        padding: '20px 16px 40px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div
          style={{
            background: 'linear-gradient(125deg,#0ea5e9,#6366f1,#a855f7)',
            borderRadius: 20,
            padding: '22px 20px',
            color: '#fff',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  margin: '0 0 8px',
                  letterSpacing: '-0.02em',
                }}
              >
                Shared khata (read-only)
              </h1>
              <div style={{ fontSize: 14, opacity: 0.93, fontWeight: 600 }}>
                {business?.name || 'Business'}
                {singleContact ? (
                  <>
                    {' '}
                    · <span style={{ fontWeight: 800 }}>{singleContact.name}</span>
                    <span style={{ opacity: 0.82, fontWeight: 500 }}> (one contact)</span>
                  </>
                ) : null}
                <span
                  style={{
                    display: 'block',
                    marginTop: 6,
                    opacity: 0.75,
                    fontWeight: 500,
                    fontSize: 13,
                  }}
                >
                  View only — changes are not saved here.
                </span>
              </div>
            </div>
            <BookOpen size={36} style={{ opacity: 0.4 }} aria-hidden />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(255,255,255,0.22)',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 800,
              }}
            >
              Receivable: {fmtMoney(receivable)}
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 12,
                padding: '10px 14px',
                fontWeight: 800,
              }}
            >
              Payable: {fmtMoney(payable)}
            </div>
          </div>
          <Link
            to="/personal-khata"
            style={{
              display: 'inline-block',
              marginTop: 16,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Open full Personal Khata (edit) →
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contacts.map((c) => {
            const { net } = contactBalance(c.id, entries);
            const open = !!expanded[c.id];
            const chron = entriesChronological(entries, c.id).slice(0, open ? 500 : 0);
            return (
              <div
                key={c.id}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [c.id]: !open }))}
                  style={{
                    width: '100%',
                    padding: '16px 18px',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{c.name}</div>
                    {c.phone ? (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{c.phone}</div>
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
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      {open ? 'Hide details' : 'Show details'}
                    </div>
                  </div>
                </button>

                {open && chron.length > 0 ? (
                  <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#334155' }}>
                    {chron.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          borderTop: '1px solid #f1f5f9',
                          padding: '12px 0',
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>
                            {fmtWhen(e.updatedAt || e.createdAt)}
                          </div>
                          <div style={{ lineHeight: 1.4 }}>{e.description}</div>
                          {e.billImage && String(e.billImage).startsWith('data:image/') ? (
                            <img
                              src={e.billImage}
                              alt=""
                              style={{
                                marginTop: 8,
                                maxWidth: '100%',
                                maxHeight: 120,
                                borderRadius: 8,
                              }}
                            />
                          ) : null}
                        </div>
                        <div
                          style={{
                            fontWeight: 800,
                            color: e.type === 'given' ? '#e11d48' : '#059669',
                          }}
                        >
                          {e.type === 'given' ? `−${fmtMoney(e.amount)}` : `+${fmtMoney(e.amount)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
