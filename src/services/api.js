// API utility for Express.js Backend
// CRA only loads env vars that start with REACT_APP_ from .env in the project root (not src/).
const API_BASE_URL = String(
  // process.env.REACT_APP_API_BASE_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001/api"
      : ""),
).replace(/\/$/, "");
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
    const config = {
      ...options,
      headers: mergedHeaders,
    };

    try {
      const response = await fetch(url, config);
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
      console.error('API request failed:', error);
      throw error;
    }
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

  async getSuperAdminPendingAdmins() {
    return this.request('/super-admin/pending-admins');
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
    return this.request(`/users/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async rejectUser(id) {
    return this.request(`/users/${id}/reject`, {
      method: 'PATCH',
    });
  }

  async disableUser(id) {
    return this.request(`/users/${id}/disable`, {
      method: 'PATCH',
    });
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
    const q = qs.toString();
    return this.request(`/partyEdits${q ? `?${q}` : ''}`, {}, metaPartySkipTenant(opts));
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