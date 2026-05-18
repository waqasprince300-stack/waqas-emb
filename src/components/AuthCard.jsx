import React from 'react';
import { Link } from 'react-router-dom';

const DEFAULT_SIDE_TITLE = 'Production, parties, and payments in one place.';
const DEFAULT_SIDE_TEXT =
  'Secure access for managing embroidery work, ledgers, and financial activity.';

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
  sideTitle,
  sideText,
  brandLogoSrc,
  brandKicker,
  brandHomeAriaLabel,
  brandMarkLetter = 'G',
}) {
  const kicker = brandKicker ?? 'Ghausia Textile Manager';

  return (
    <div className={`auth-page${brandLogoSrc ? ' auth-page--seam-grace' : ''}`}>
      <div className={`auth-shell${brandLogoSrc ? ' auth-shell--seam-grace' : ''}`}>
        <section className="auth-brand-panel">
          {brandLogoSrc ? (
            <div className="auth-brand-logo-shell">
              <img className="auth-brand-logo-img" src={brandLogoSrc} alt="" decoding="async" />
            </div>
          ) : (
            <div className="auth-brand-mark">{brandMarkLetter}</div>
          )}
          <div>
            <div className="auth-kicker">{kicker}</div>
            <h1>{sideTitle || DEFAULT_SIDE_TITLE}</h1>
            <p>{sideText || DEFAULT_SIDE_TEXT}</p>
          </div>
          <div className="auth-brand-grid">
            <div>
              <strong>Lots</strong>
              <span>Track every job</span>
            </div>
            <div>
              <strong>Ledger</strong>
              <span>Clear balances</span>
            </div>
            <div>
              <strong>Payments</strong>
              <span>Owner and party flow</span>
            </div>
          </div>
        </section>

        <section className="auth-card">
          {brandLogoSrc ? (
            <Link
              className="auth-home-link auth-home-link--logo"
              to="/login"
              aria-label={brandHomeAriaLabel || 'Seam & Grace Embroidery home'}
            >
              <img src={brandLogoSrc} alt="" decoding="async" />
            </Link>
          ) : (
            <Link className="auth-home-link" to="/login">
              Ghausia
            </Link>
          )}
          <div className="auth-card-header">
            <div className="auth-card-badge">Secure access</div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </section>
      </div>
    </div>
  );
}
