// API utility for Express.js Backend
// CRA only loads env vars that start with REACT_APP_ from .env in the project root (not src/).
// In production set REACT_APP_API_BASE_URL (e.g. https://api.seamandgrace.com/api) so the
// frontend always talks to one backend regardless of www / non-www host. Falls back to a
// same-origin relative "/api" when unset.
const API_BASE_URL = String(
  process.env.REACT_APP_API_BASE_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001/api"
      : ""),
).replace(/\/$/, "");

/** Network-level request timeout (ms). Transient failures auto-retry once for safe GET reads. */
const REQUEST_TIMEOUT_MS = Number(process.env.REACT_APP_API_TIMEOUT_MS) || 45_000;
const AUTH_SESSION_KEY = 'waqas_emb_auth_session';
const BUSINESS_OWNER_KEY = 'waqas_emb_business_owner_id';

const readAuthToken = () => {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
    return session?.token || '';
  } catch {
    return '';
  }
};

const readBusinessOwnerId = () => {
  try {
    const raw = localStorage.getItem(BUSINESS_OWNER_KEY);
    const trimmed = raw != null ? String(raw).trim() : '';
    return trimmed || '';
  } catch {
    return '';
  }
};

function metaPartySkipTenant(filtersOrOpts = {}) {
  return filtersOrOpts?.skipTenantHeader === true
    ? { skipBusinessOwnerHeader: true }
    : {};
}
/** Paths where 401 means wrong credentials / signup issues, not “session expired”. */
function isPublicAuthEndpoint(endpoint) {
  const path = String(endpoint || '').split('?')[0];
  return (
    /^\/login$/i.test(path) ||
    /^\/signup$/i.test(path) ||
    /^\/forgot-password$/i.test(path) ||
    /^\/reset-password\//i.test(path)
  );
}

let sessionExpiredHandler = null;
let sessionExpiryNotified = false;

/** Register `fn` to run when an authenticated API call gets 401 (e.g. expired JWT). */
export function registerSessionExpiredHandler(fn) {
  sessionExpiredHandler = fn;
  sessionExpiryNotified = false;
}

function notifySessionExpired() {
  if (sessionExpiryNotified) return;
  sessionExpiryNotified = true;
  try {
    sessionExpiredHandler?.();
  } catch (e) {
    console.error('sessionExpiredHandler failed:', e);
  }
}

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}, meta = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const method = String(options.method || 'GET').toUpperCase();
    // Only safe, idempotent reads are auto-retried — never re-send POST/PUT/PATCH writes.
    const isIdempotent = method === 'GET' || method === 'HEAD';
    const maxAttempts = isIdempotent ? 2 : 1;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // Token/header are read fresh each attempt (session may refresh between retries).
      const token = readAuthToken();
      /** When true: do not send `x-business-owner-id` even if one is cached in localStorage (party JWT cross-tenant reads). */
      const headerBiz =
        meta.skipBusinessOwnerHeader === true
          ? ''
          : meta.businessOwnerId != null && String(meta.businessOwnerId).trim() !== ''
            ? String(meta.businessOwnerId).trim()
            : readBusinessOwnerId() || '';
      const mergedHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headerBiz ? { 'x-business-owner-id': headerBiz } : {}),
        ...(options.headers || {}),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const config = {
        ...options,
        headers: mergedHeaders,
        signal: controller.signal,
      };

      try {
        const response = await fetch(url, config);
        clearTimeout(timeoutId);
        if (!response.ok) {
          if (
            response.status === 401 &&
            token &&
            !isPublicAuthEndpoint(endpoint)
          ) {
            notifySessionExpired();
          }
          let errBody = null;
          let detail = '';
          try {
            errBody = await response.json();
            detail = errBody.message || errBody.error || (typeof errBody === 'string' ? errBody : '');
            if (errBody.error && errBody.error !== detail) detail = `${detail} ${errBody.error}`.trim();
          } catch {
            errBody = null;
          }
          if (response.status === 413) {
            detail =
              typeof detail === 'string' && detail.trim()
                ? detail
                : 'Request too large — try a smaller receipt image or PDF.';
          }
          if (typeof detail === 'object' && detail != null) {
            detail = String(detail.message || JSON.stringify(detail));
          }
          // Retry once on transient server errors for idempotent reads (Atlas/network hiccups).
          if (isIdempotent && attempt < maxAttempts && (response.status === 502 || response.status === 503 || response.status === 504)) {
            lastError = new Error(`HTTP ${response.status}`);
            await new Promise((r) => setTimeout(r, 600 * attempt));
            continue;
          }
          const err = new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP error! status: ${response.status}`);
          err.status = response.status;
          if (errBody && typeof errBody === 'object') err.body = errBody;
          throw err;
        }
        if (response.status === 204 || response.status === 205) {
          return null;
        }
        const text = await response.text();
        if (!text.trim()) return null;
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      } catch (error) {
        clearTimeout(timeoutId);
        // Network failure / timeout ("Failed to fetch", "Load failed", AbortError) — retry safe reads.
        const isNetworkLevel =
          error?.name === 'AbortError' ||
          error?.name === 'TypeError' ||
          /failed to fetch|load failed|network/i.test(String(error?.message || ''));
        if (isIdempotent && attempt < maxAttempts && isNetworkLevel) {
          lastError = error;
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        if (error?.name === 'AbortError') {
          const timeoutErr = new Error('Request timed out. Please check your connection and try again.');
          timeoutErr.status = 0;
          console.error('API request timed out:', url);
          throw timeoutErr;
        }
        console.error('API request failed:', error);
        throw error;
      }
    }

    throw lastError || new Error('Request failed');
  }

  // Bootstrap — consolidated initial-load payload (one round-trip instead of 7+ calls)
  async getBootstrap(opts = {}) {
    const { minimal = false, includeReceipts = false } = opts;
    const qs = new URLSearchParams();
    if (minimal) qs.set('minimal', '1');
    if (includeReceipts) qs.set('includeReceipts', '1');
    const q = qs.toString();
    const meta = { ...metaPartySkipTenant(opts) };
    // The minimal payload is workspace-independent (reporting = scope=all, parties by user).
    // Never send a possibly-stale x-business-owner-id header, which would 404 before owners resolve.
    if (minimal) meta.skipBusinessOwnerHeader = true;
    return this.request(`/bootstrap${q ? `?${q}` : ''}`, {}, meta);
  }

  // Auth
  async signup(data) {
    return this.request('/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** Verify the new-device login code. Returns { token, user } on success. */
  async verifyLoginOtp(data) {
    return this.request('/login/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** Resend the new-device login code (optionally on a different channel). */
  async resendLoginOtp(data) {
    return this.request('/login/resend-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** OTP password reset — step 1: request a code via email or phone. */
  async requestPasswordResetOtp(data) {
    return this.request('/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** OTP password reset — step 2: verify the code and set a new password. */
  async verifyPasswordResetOtp(data) {
    return this.request('/password-reset/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** Upgrade a Personal Khata account to a business admin / party account. */
  async upgradeAccount(data) {
    return this.request('/account/upgrade', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  }

  // Legacy email-link password reset (kept for any links already sent).
  async forgotPassword(data) {
    return this.request('/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resetPassword(token, data) {
    return this.request(`/reset-password/${token}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /** All organization admins (pending + approved + rejected + disabled) for super-admin audit. */
  async getSuperAdminOrganizationAdmins() {
    return this.request('/super-admin/organization-admins');
  }

  /** @deprecated Same as getSuperAdminOrganizationAdmins — name kept for compatibility. */
  async getSuperAdminPendingAdmins() {
    return this.getSuperAdminOrganizationAdmins();
  }

  async approveOrganizationAdmin(id) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/super-admin/admins/${safe}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  async rejectOrganizationAdmin(id) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/super-admin/admins/${safe}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  // Users / Approvals
  async getUsers() {
    return this.request('/users');
  }

  async getPendingUsers() {
    return this.request('/users/pending');
  }

  async approveUser(id, data) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/users/${safe}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data ?? {}),
    });
  }

  async rejectUser(id) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/users/${safe}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  async disableUser(id) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/users/${safe}/disable`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  async enableUser(id) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/users/${safe}/enable`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  async updateUserParty(id, data) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    return this.request(`/users/${safe}/party`, {
      method: 'PATCH',
      body: JSON.stringify(data ?? {}),
    });
  }

  // Personal Khata — server-synced so the same account shows the same data on any device/browser.
  async getPersonalKhata() {
    return this.request('/personal-khata', {}, { skipBusinessOwnerHeader: true });
  }

  async savePersonalKhata(payload) {
    return this.request('/personal-khata', {
      method: 'PUT',
      body: JSON.stringify(payload ?? {}),
    }, { skipBusinessOwnerHeader: true });
  }

  // Business Owners
  async getBusinessOwners(filters = {}) {
    return this.request('/businessOwners', {}, metaPartySkipTenant(filters));
  }

  /** Resolve one workspace owner by id — used when party JWT cannot list all owners. */
  async getBusinessOwner(id) {
    const idStr = String(id ?? "").trim();
    const safe = encodeURIComponent(idStr);
    return this.request(`/businessOwners/${safe}`, {}, { businessOwnerId: idStr });
  }

  async createBusinessOwner(data) {
    return this.request('/businessOwners', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBusinessOwner(id, data) {
    return this.request(`/businessOwners/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBusinessOwner(id, opts = {}) {
    const safe = encodeURIComponent(String(id ?? '').trim());
    const q = opts.force ? '?force=true' : '';
    return this.request(`/businessOwners/${safe}${q}`, { method: 'DELETE' });
  }

  // Dashboard
  async getDashboardStats() {
    return this.request('/dashboard');
  }

  // Collections
  async getCollections(filters = {}) {
    return this.request('/collections', {}, metaPartySkipTenant(filters));
  }

  async getCollection(id) {
    return this.request(`/collections/${id}`);
  }

  async createCollection(data) {
    return this.request('/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCollection(id, data) {
    return this.request(`/collections/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteCollection(id) {
    return this.request(`/collections/${id}`, {
      method: 'DELETE',
    });
  }

  // Parties
  async getParties(filters = {}) {
    return this.request('/parties', {}, metaPartySkipTenant(filters));
  }

  async getParty(id) {
    return this.request(`/parties/${id}`);
  }

  async createParty(data) {
    return this.request('/parties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateParty(id, data) {
    return this.request(`/parties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteParty(id) {
    return this.request(`/parties/${id}`, {
      method: 'DELETE',
    });
  }

  // Ghausia Lots
  async getGhausiaLots(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.scope === 'all') qs.set('scope', 'all');
    if (opts.partyScope === 'all') qs.set('partyScope', 'all');
    const q = qs.toString();
    return this.request(`/ghausiaLots${q ? `?${q}` : ''}`, {}, metaPartySkipTenant(opts));
  }

  async getGhausiaLot(id) {
    return this.request(`/ghausiaLots/${id}`);
  }

  async createGhausiaLot(data, businessOwnerId) {
    return this.request('/ghausiaLots', {
      method: 'POST',
      body: JSON.stringify(data),
    }, { businessOwnerId });
  }

  async updateGhausiaLot(id, data, businessOwnerId) {
    return this.request(`/ghausiaLots/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }, { businessOwnerId });
  }

  async approveLotCompletion(id, opts = {}) {
    const { businessOwnerId, ownerBillingChoice, ownerBillAmount } = opts || {};
    const body = {};
    if (ownerBillingChoice) body.ownerBillingChoice = ownerBillingChoice;
    if (ownerBillAmount != null && ownerBillAmount !== '' && Number.isFinite(Number(ownerBillAmount))) {
      body.ownerBillAmount = Number(ownerBillAmount);
    }
    return this.request(`/ghausiaLots/${id}/approve-completion`, {
      method: 'POST',
      body: JSON.stringify(body),
    }, { businessOwnerId });
  }

  async rejectLotCompletion(id, rejectionNote, businessOwnerId) {
    return this.request(`/ghausiaLots/${id}/reject-completion`, {
      method: 'POST',
      body: JSON.stringify({ rejectionNote }),
    }, { businessOwnerId });
  }

  async deleteGhausiaLot(id, businessOwnerId) {
    return this.request(`/ghausiaLots/${id}`, {
      method: 'DELETE',
    }, { businessOwnerId });
  }

  // Party Edits
  async getPartyEdits(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.scope === 'all') qs.set('scope', 'all');
    if (opts.partyScope === 'all') qs.set('partyScope', 'all');
    if (opts.includeReceipts) qs.set('includeReceipts', '1');
    const q = qs.toString();
    return this.request(`/partyEdits${q ? `?${q}` : ''}`, {}, metaPartySkipTenant(opts));
  }

  async getPartyEditByLotId(lotId, opts = {}) {
    const qs = new URLSearchParams();
    if (opts.includeReceipts) qs.set('includeReceipts', '1');
    const biz = opts.businessOwnerId != null ? String(opts.businessOwnerId).trim() : '';
    if (biz) qs.set('businessOwnerId', biz);
    const q = qs.toString();
    return this.request(
      `/partyEdits/lot/${lotId}${q ? `?${q}` : ''}`,
      {},
      { businessOwnerId: biz || undefined, ...metaPartySkipTenant(opts) },
    );
  }

  async createPartyEdit(data) {
    return this.request('/partyEdits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePartyEdit(id, data) {
    return this.request(`/partyEdits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async upsertPartyEditByLotId(lotId, data, businessOwnerId) {
    return this.request(`/partyEdits/lot/${lotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, { businessOwnerId });
  }

  // Party Ledger
  async getPartyLedger(partyId = null) {
    const endpoint = partyId ? `/partyLedger?partyId=${partyId}` : '/partyLedger';
    return this.request(endpoint);
  }

  async createLedgerEntry(data) {
    return this.request('/partyLedger', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Payments
  async getPayments(filters = {}) {
    const qs = new URLSearchParams();
    if (filters.scope === 'all') qs.set('scope', 'all');
    if (filters.partyScope === 'all') qs.set('partyScope', 'all');
    if (filters.partyId) qs.set('partyId', filters.partyId);
    const q = qs.toString();
    return this.request(`/payments${q ? `?${q}` : ''}`, {}, metaPartySkipTenant(filters));
  }

  async getPartyPayments(partyId) {
    return this.request(`/payments?partyId=${partyId}`);
  }

  async createPayment(data, businessOwnerId) {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }, { businessOwnerId });
  }

  async updatePayment(id, data) {
    return this.request(`/payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePayment(id, businessOwnerId) {
    return this.request(
      `/payments/${id}`,
      {
        method: 'DELETE',
      },
      { businessOwnerId },
    );
  }

  // Rate Calculations
  async getRateCalculations() {
    return this.request('/rateCalculations');
  }

  async createRateCalculation(data) {
    return this.request('/rateCalculations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRateCalculation(id, data) {
    return this.request(`/rateCalculations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Saved Designs
  async getSavedDesigns() {
    return this.request('/savedDesigns');
  }

  async getSavedDesign(id) {
    return this.request(`/savedDesigns/${id}`);
  }

  async createSavedDesign(data) {
    return this.request('/savedDesigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSavedDesign(id, data) {
    return this.request(`/savedDesigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSavedDesign(id) {
    return this.request(`/savedDesigns/${id}`, {
      method: 'DELETE',
    });
  }

  // Cash Flow
  async getCashFlow() {
    return this.request('/cashFlow');
  }

  async createCashFlowEntry(data) {
    return this.request('/cashFlow', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiService = new ApiService();
export default apiService;