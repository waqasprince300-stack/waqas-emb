import React from 'react';
import { Link } from 'react-router-dom';

export default function AuthCard({ title, subtitle, children, footer, sideTitle, sideText }) {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-brand-panel">
          <div className="auth-brand-mark">G</div>
          <div>
            <div className="auth-kicker">Ghausia Textile Manager</div>
            <h1>{sideTitle || 'Production, parties, and payments in one place.'}</h1>
            <p>{sideText || 'Secure access for managing embroidery work, ledgers, and financial activity.'}</p>
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
          <Link className="auth-home-link" to="/login">Ghausia</Link>
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
