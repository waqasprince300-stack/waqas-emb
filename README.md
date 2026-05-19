# Ghausia Textile Manager

A complete production management system for Ghausia Collection.

## Pages

- **Dashboard** — KPIs, financial overview, party performance, billable lots
- **Ghausia Collection** — Main lot management with payment tracking
- **Party Ledger** — View all assigned lots per party, edit completion details
- **Parties** — Manage party contacts (name, phone, address)
- **Payments** — Record and track all money in/out

## Setup & Run

### Requirements
- Node.js v16 or higher
- npm v7 or higher

### Steps

1. Extract the zip file
2. Open terminal in the extracted folder
3. Run:

```bash
npm install
npm start
```

4. The app opens at http://localhost:3000

### Personal Khata account (email or phone)

The screen at **Personal Khata → register / sign in** (`/personal-khata/account`) creates users with role `personal_khata` and signs them in with **either** email **or** phone plus password.

Your **API** (see companion backend repo) should:

- **Signup `POST /api/signup`** — Accept optional string field `phone` alongside `email`. For `role: "personal_khata"`, require at least one of `email` or `phone`, validate password, and either **auto-approve** (`status: "approved"`) or return a pending flow consistent with your product rules. Return JWT + user (same shape as other roles) when the user can sign in immediately.
- **Login `POST /api/login`** — Accept `{ "email", "password" }` **or** `{ "phone", "password" }` (normalize phone the same way as signup). Resolve the user and return the same token payload as existing logins.
- Include `role: "personal_khata"` on the user document and in JWT/session claims so the client can route to Personal Khata only.

**Data note:** The React app still stores Personal Khata ledgers in **per-browser `localStorage`**, keyed by user id when signed in (`personal_khata`). True multi-device sync requires a future `GET`/`PUT` khata API; registration ensures the correct bucket per account on each device once the user signs in.

### Build for Production

```bash
npm run build
```

## Features

- Add/edit/delete lots in Ghausia Collection
- Fabric dropdown (Lawn, Velvet, Cambric + custom)
- Colors dropdown (0–12)
- Status with date picker (Dispatched date, Received Back date)
- Party management with phone & address
- Party Ledger shows lots assigned from Ghausia — editable: allot date, complete date, status, bill amount, receipt upload
- When Party marks lot "Completed", Ghausia lot auto-updates to "Received Back"
- Payment management: record owner receipts & party payments
- Billable section highlights all "Received Back" lots
- Dashboard shows full financial summary
