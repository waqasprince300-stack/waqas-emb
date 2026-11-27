# Super Admin & Public SaaS Roadmap

This document records what is **already implemented (Phase 1)** for Super Admin and User Lifecycle Management, and what is **planned for future phases (Phase 2 & Phase 3)** when scaling or launching publicly.

---

## Phase 1 — Completed & Live (Done)

Implemented across backend (`routes/superAdmin.js`, `routes/users.js`, `utils/userLifecycle.js`, `utils/realtime.js`) and frontend (`src/pages/SuperAdminApprovals.jsx`, `src/pages/UserApprovals.jsx`, `src/components/DeletePartyLoginModal.jsx`, `src/utils/userStatusBadges.js`):

- **Organization Admin Lifecycle:**
  - List all organization admins (`GET /api/super-admin/organization-admins`) with organization stats (workspaces, parties, lots).
  - Approve, Reject, Disable, Re-enable, and Delete organization admin accounts (`PATCH /admins/:id/approve|reject|disable|enable`, `DELETE /admins/:id`).
  - Automatic Socket.IO disconnection (`disconnectUserSockets`) when an admin is disabled or deleted.
- **Party User Lifecycle:**
  - List party user logins (`GET /api/super-admin/party-users`).
  - Disable, Re-enable, and safely Delete party login accounts (`PATCH /party-users/:id/disable|enable`, `DELETE /party-users/:id`) without deleting operational business data (lots, ledgers, payments, bills).

---

## Phase 2 — Pending: Operational Controls & Observability (Before Public Beta)

1. **Search, Filter & Pagination in Super Admin Console**
   - Filter organization admins and party users by status (`pending`, `approved`, `rejected`, `disabled`), search by name/email/phone, and sort by activity or lot volume.
2. **Super Admin Audit Log (`SuperAdminAuditLog`)**
   - Record every Super Admin action (approve, reject, disable, enable, delete, plan change) with actor, target, timestamp, and optional reason note.
3. **Device / Session & Support Tools**
   - View `knownDevices` count/summary per user, force-revoke devices / active sessions (`disconnectUserSockets`), and trigger password reset links for locked-out users.
4. **Usage & Storage Monitoring per Organization**
   - Track per-tenant metrics: total lots, voice note count/MB, receipt image count/MB, and active party logins so heavy media usage stays predictable.
5. **Global Super Admin Announcements**
   - Send maintenance notices or feature announcements across all organizations from the Super Admin panel.
6. **Safe Organization Data Export & Purge**
   - One-click JSON/CSV backup export for an organization, plus a separate strict-confirmation full-tenant purge (distinct from simple login deletion).

---

## Phase 3 — Pending: Public SaaS Launch & Monetization

### Business Model Recommendation: Subscriptions (Not Intrusive Ads)
- **Why Subscriptions over Ads:** Since this is a financial ledger & embroidery factory management app, banner/pop-up ads inside billing or khata screens reduce user trust. Tiered subscriptions (plus optional non-intrusive partner/supplier directory later if desired) fit B2B SaaS cleanly.

### Planned Capabilities
1. **Plans & Feature Gating (`Plan` / `Subscription` Model)**
   - **Starter / Trial:** e.g. 14–30 day free trial or limited workspaces/lots so new factories can test risk-free.
   - **Business / Pro (Monthly & Yearly):** Unlimited workspaces, full voice notes & receipt storage, multi-device / multi-staff usage.
   - Organization `planStatus` states: `trial`, `active`, `grace`, `expired`.
   - **Grace & Read-Only Mode:** Expired accounts enter a grace/read-only state (can view/export existing khata, cannot add new lots/bills until renewed).
2. **Payment Collection (Pakistan-Friendly First, Automated Later)**
   - **Stage A (Manual Verification):** User uploads JazzCash / EasyPaisa / Bank Transfer screenshot + reference; Super Admin approves & extends subscription validity.
   - **Stage B (Automated Gateway):** Integrate local/global payment gateway webhooks (e.g., Safepay / PayFast / Stripe) for automatic renewal.
3. **Promo Codes, Referrals & Self-Serve Onboarding**
   - Coupon/discount codes managed by Super Admin, trial extension button per organization, and automated onboarding email/WhatsApp reminders before trial/plan expiry.
