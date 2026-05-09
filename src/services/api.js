// API utility for Express.js Backend
// Render
// const API_BASE_URL = 'https://waqas-emb-backend-1.onrender.com/api';
// Localhost
const API_BASE_URL = 'http://localhost:3001/api';
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

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}, meta = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = readAuthToken();
    const headerBiz =
      meta.businessOwnerId != null && String(meta.businessOwnerId).trim() !== ''
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
        let detail = '';
        try {
          const errBody = await response.json();
          detail = errBody.message || errBody.error || (typeof errBody === 'string' ? errBody : '');
          if (errBody.error && errBody.error !== detail) detail = `${detail} ${errBody.error}`.trim();
        } catch {
          /* ignore non-JSON error bodies */
        }
        throw new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP error! status: ${response.status}`);
      }
      return await response.json();
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
  async getBusinessOwners() {
    return this.request('/businessOwners');
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

  // Dashboard
  async getDashboardStats() {
    return this.request('/dashboard');
  }

  // Collections
  async getCollections() {
    return this.request('/collections');
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
  async getParties() {
    return this.request('/parties');
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
    return this.request(`/ghausiaLots${q ? `?${q}` : ''}`);
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
    return this.request(`/partyEdits${q ? `?${q}` : ''}`);
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
    return this.request(`/payments${q ? `?${q}` : ''}`);
  }

  async getPartyPayments(partyId) {
    return this.request(`/payments?partyId=${partyId}`);
  }

  async createPayment(data) {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePayment(id, data) {
    return this.request(`/payments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePayment(id) {
    return this.request(`/payments/${id}`, {
      method: 'DELETE',
    });
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