# Seam & Grace — Pending Code Improvements (Saved from Audit 2026-08-25)

These are non-critical (medium + minor) improvements identified during a full code audit.
The **3 critical bugs** have already been fixed. These remain for future cleanup.

---

## 🟡 Medium Improvements (Dead Code & Potential Issues)

### 1. `LedgerFilterBar` is dead code — never imported anywhere
- **File:** `src/components/ledger/LedgerFilterBar.jsx`
- **Issue:** Component exported but never imported anywhere in the app
- **Also:** Props `statusFilter`, `setStatusFilter`, `isParty` are accepted but never used inside
- **Action:** Delete the file or properly integrate it into PartyLedger page

### 2. `GhausiaCollection.jsx` — 6 unused variables (dead code)
- **File:** `src/pages/GhausiaCollection.jsx`
- Line 1246: `effective` — computed but never read
- Line 1287: `existingPaidToOwner` — computed but never read
- Line 1290: `existingReceivedFromOwner` — computed but never read
- Line 1295: `expectedAmount` — computed but never read
- Line 1420: `recordOwnerBillableSettlementPayment` — function defined but never called
- Line 3255: `effective` (second instance) — computed but never read
- **Action:** Remove unused variables and the dead function

### 3. `ReviewLots.jsx` — 2 unused helper functions
- **File:** `src/pages/ReviewLots.jsx`
- Line 34: `needsOwnerBillingChoice` — defined but never called
- Line 39: `partyRevisionPositiveDelta` — defined but never called
- **Action:** Remove these functions

### 4. `App.jsx` — unused `user` variable in Layout
- **File:** `src/App.jsx` line 49
- `const { user, isAdmin } = useAuth();` — `user` is never used
- **Action:** Change to `const { isAdmin } = useAuth();`

### 5. Missing `--body-bg` CSS variable in `:root`
- **File:** `src/index.css` (`:root` section, around line 30-59)
- **Issue:** `--body-bg` is only defined in dark theme variants, not in `:root`
- Light mode relies on CSS fallback values; any `var(--body-bg)` without fallback gets nothing
- **Action:** Add `--body-bg: #f0f2f5;` to `:root`

### 6. `realtime.js` — `removeAllListeners()` removes internal socket.io listeners
- **File:** `src/services/realtime.js` lines 56-65
- **Issue:** `socket.removeAllListeners()` removes ALL listeners including socket.io internal ones
- **Action:** Replace with targeted `socket.off('data:changed')` before disconnect

### 7. `GhausiaCollection.jsx` — Meaningless if/else for `paymentType`
- **File:** `src/pages/GhausiaCollection.jsx` lines 1302-1309
- Both branches of the if/else set `paymentType = 'Paid'`
- **Action:** Simplify to `const paymentType = 'Paid';`

---

## 🟢 Minor Improvements

### 8. Console logs in service worker registration
- **File:** `src/index.js` lines 56-60
- `console.log('SW registered: ')` should be removed or wrapped in dev-only check

### 9. Blanket eslint-disable in PartyLedger.jsx
- **File:** `src/pages/PartyLedger.jsx` line 2
- `/* eslint-disable react-hooks/exhaustive-deps */` hides potential stale closure bugs
- **Action:** Replace with targeted `// eslint-disable-next-line` comments where needed

---

## Already Fixed (2026-08-25)

1. ✅ `LedgerFilterBar.jsx` — DateRangeSelect received wrong props (custom date range was broken)
2. ✅ `GhausiaCollection.jsx` — `getOwnerUnpaidBalance` had unnecessary `partyEdits` dependency causing performance issues
3. ✅ `lotNormalizer.js` + `UI.jsx` — Status normalization was doing pointless title-case→lowercase; simplified to clean lowercase + made StatusBadge case-insensitive
