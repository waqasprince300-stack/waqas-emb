import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import apiService from '../services/api';
import { useApp } from '../context/AppContext';
import LoaderDashboard from '../components/LoaderDashboard';
import DeletePartyLoginModal from '../components/DeletePartyLoginModal';
import { EmptyState, SearchBar } from '../components/UI';
import { compareRowsByUpdatedNewestFirst } from '../utils/dateFilters';
import { formatApiError } from '../utils/formatApiError';
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  getAccountStatusBadge,
} from '../utils/userStatusBadges';

const getUserId = (user) => String(user?._id || user?.id || '');

/** Mongo populate may expose `partyId` as `{ _id, name }` — API approve body expects an id string. */
function normalizePartyIdRef(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') {
    const oid = raw._id ?? raw.id;
    return oid != null && oid !== '' ? String(oid) : '';
  }
  return String(raw);
}

function normalizedPartyIdFromUser(user) {
  return normalizePartyIdRef(user?.partyId);
}

export default function UserApprovals() {
  const { parties } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteModalError, setDeleteModalError] = useState('');
  const [approvalForms, setApprovalForms] = useState({});

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const remoteUsers = await apiService.getUsers();
      setUsers(Array.isArray(remoteUsers) ? remoteUsers : []);
    } catch (err) {
      setError(err.message || 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const setFormValue = (userId, key, value) => {
    setApprovalForms((prev) => ({
      ...prev,
      [userId]: {
        partyId: '',
        ...(prev[userId] || {}),
        [key]: value,
      },
    }));
  };

  const approveUser = async (user) => {
    const id = getUserId(user);
    const merged = approvalForms[id] || { partyId: normalizedPartyIdFromUser(user) };
    const partyId = normalizePartyIdRef(merged.partyId).trim();

    if (!partyId) {
      setError('Select a party before approving a party user.');
      return;
    }

    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.approveUser(id, { partyId });
      setUsers((current) => current.map((item) => (getUserId(item) === id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Unable to approve user');
    } finally {
      setSavingId('');
    }
  };

  const rejectUser = async (user) => {
    const id = getUserId(user);
    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.rejectUser(id);
      setUsers((current) => current.map((item) => (getUserId(item) === id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Unable to reject user');
    } finally {
      setSavingId('');
    }
  };

  const disableUser = async (user) => {
    const id = getUserId(user);
    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.disableUser(id);
      setUsers((current) => current.map((item) => (getUserId(item) === id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Unable to disable user');
    } finally {
      setSavingId('');
    }
  };

  const enableUser = async (user) => {
    const id = getUserId(user);
    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.enableUser(id);
      setUsers((current) => current.map((item) => (getUserId(item) === id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Unable to enable user');
    } finally {
      setSavingId('');
    }
  };

  const saveParty = async (user) => {
    const id = getUserId(user);
    const merged = approvalForms[id] || { partyId: normalizedPartyIdFromUser(user) };
    const partyId = normalizePartyIdRef(merged.partyId).trim();
    if (!partyId) {
      setError('Select a party first.');
      return;
    }
    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.updateUserParty(id, { partyId });
      setUsers((current) => current.map((item) => (getUserId(item) === id ? updated : item)));
      setApprovalForms((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err.message || 'Unable to change party');
    } finally {
      setSavingId('');
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const id = getUserId(deleteTarget);
    setSavingId(id);
    setDeleteModalError('');
    setError('');
    setFeedback('');
    try {
      await apiService.deleteUser(id);
      setUsers((current) => current.filter((item) => getUserId(item) !== id));
      setApprovalForms((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setFeedback(
        `Deleted party login for ${deleteTarget.name || deleteTarget.email}. Linked party lots, ledger entries, and payments remain intact.`
      );
      setDeleteTarget(null);
    } catch (err) {
      setDeleteModalError(formatApiError(err, 'Unable to delete party user login'));
    } finally {
      setSavingId('');
    }
  };

  const counts = useMemo(() => {
    const c = { all: users.length, pending: 0, approved: 0, disabled: 0, rejected: 0 };
    for (const u of users) {
      if (u.status in c && u.status !== 'all') c[u.status] += 1;
    }
    return c;
  }, [users]);

  const sortedUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...users]
      .filter((u) => {
        if (statusFilter !== 'all' && u.status !== statusFilter) return false;
        if (!q) return true;
        return (
          String(u.name || '').toLowerCase().includes(q) ||
          String(u.email || '').toLowerCase().includes(q) ||
          String(u.phone || '').toLowerCase().includes(q) ||
          String(u.partyName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'user'));
  }, [users, searchQuery, statusFilter]);

  const getUserRowView = (user) => {
    const id = getUserId(user);
    const form = approvalForms[id] || { partyId: normalizedPartyIdFromUser(user) };
    const isPending = user.status === 'pending';
    const isApproved = user.status === 'approved';
    const isDisabled = user.status === 'disabled';
    return {
      id,
      form,
      isSaving: savingId === id,
      canEditParty: isPending || isApproved || isDisabled,
      partyChanged:
        !isPending &&
        normalizePartyIdRef(form.partyId).trim() !== normalizedPartyIdFromUser(user),
      badge: getAccountStatusBadge(user.status),
    };
  };

  const renderUserActions = (user, { fullWidth = false, partyChanged = false } = {}) => {
    const id = getUserId(user);
    const isPending = user.status === 'pending';
    const isApproved = user.status === 'approved';
    const isDisabled = user.status === 'disabled';
    const isSaving = savingId === id;
    const flexStyle = fullWidth ? { flex: 1 } : undefined;

    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isPending && (
          <>
            <button
              className="btn btn-success btn-sm"
              style={flexStyle}
              disabled={isSaving}
              onClick={() => approveUser(user)}
            >
              Approve
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                color: 'var(--danger, #b91c1c)',
                borderColor: 'var(--danger-bg, #fecaca)',
                ...flexStyle,
              }}
              disabled={isSaving}
              onClick={() => rejectUser(user)}
            >
              Reject
            </button>
          </>
        )}

        {(isApproved || isDisabled) && partyChanged && (
          <button
            className="btn btn-primary btn-sm"
            style={flexStyle}
            disabled={isSaving}
            onClick={() => saveParty(user)}
          >
            Save party
          </button>
        )}

        {isApproved && (
          <button
            className="btn btn-ghost btn-sm"
            style={{
              color: 'var(--danger, #b91c1c)',
              borderColor: 'var(--danger-bg, #fecaca)',
              ...flexStyle,
            }}
            disabled={isSaving}
            onClick={() => disableUser(user)}
          >
            Disable
          </button>
        )}

        {isDisabled && (
          <button
            className="btn btn-success btn-sm"
            style={flexStyle}
            disabled={isSaving}
            onClick={() => enableUser(user)}
          >
            Enable
          </button>
        )}

        <button
          type="button"
          className="btn btn-danger btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, ...flexStyle }}
          disabled={isSaving}
          onClick={() => {
            setDeleteModalError('');
            setDeleteTarget(user);
          }}
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '70vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LoaderDashboard height={30} width={30} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Users / Approvals</div>
          <div className="page-subtitle">
            Approve party users, switch their linked party, disable/enable access, or safely delete login accounts.
          </div>
        </div>
        <button className="btn btn-ghost" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      {feedback && (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13.5,
            background: 'var(--success-bg, #f0fdf4)',
            border: '1px solid var(--success, #86efac)',
            color: 'var(--success, #166534)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{feedback}</span>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setFeedback('')}>
            Dismiss
          </button>
        </div>
      )}

      {error && <div className="alert alert-warning">{error}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {[
          { key: 'pending', label: 'Pending', value: counts.pending, color: 'var(--warning, #b45309)' },
          { key: 'approved', label: 'Approved', value: counts.approved, color: 'var(--success, #15803d)' },
          { key: 'disabled', label: 'Disabled', value: counts.disabled, color: 'var(--danger, #b91c1c)' },
          { key: 'rejected', label: 'Rejected', value: counts.rejected, color: 'var(--text-muted, #64748b)' },
        ].map((card) => (
          <div
            key={card.label}
            onClick={() => setStatusFilter((prev) => (prev === card.key ? 'all' : card.key))}
            style={{
              background: 'var(--card-bg, #fff)',
              border: statusFilter === card.key ? `1.5px solid ${card.color}` : '1px solid var(--border)',
              borderRadius: 10,
              padding: '14px 16px',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {card.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: card.color, marginTop: 4 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search user by name, email, phone, or linked party..."
            resultCount={sortedUsers.length}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ACCOUNT_STATUS_FILTER_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className="btn btn-xs"
                style={{
                  background: active ? 'var(--primary)' : 'var(--card-bg)',
                  color: active ? 'var(--primary-text, #fff)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 999,
                  padding: '5px 12px',
                }}
              >
                {opt.label} ({counts[opt.value] ?? 0})
              </button>
            );
          })}
        </div>
      </div>

      <div className="table-wrapper desktop-only-table">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Party</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No users found" />
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => {
                  const { id, form, isSaving, canEditParty, partyChanged, badge } = getUserRowView(user);

                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 700 }}>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            color: badge.color,
                            background: badge.bg,
                            border: `1px solid ${badge.border}`,
                            textTransform: 'capitalize',
                          }}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          value={form.partyId}
                          disabled={!canEditParty || isSaving}
                          onChange={(event) => setFormValue(id, 'partyId', event.target.value)}
                          style={
                            partyChanged
                              ? {
                                  borderColor: 'var(--purple, #6366f1)',
                                  boxShadow: '0 0 0 2px rgba(99,102,241,0.15)',
                                }
                              : undefined
                          }
                        >
                          <option value="">Select party</option>
                          {parties.map((party) => (
                            <option key={party.id} value={party.id}>
                              {party.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {renderUserActions(user, { partyChanged })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile View */}
      <div className="mobile-only-ghausia-cards" style={{ marginTop: 16 }}>
        {sortedUsers.length === 0 ? (
          <EmptyState message="No users found" />
        ) : (
          sortedUsers.map((user) => {
            const { id, form, isSaving, canEditParty, partyChanged, badge } = getUserRowView(user);

            return (
              <div key={`mob-${id}`} className="ghausia-mobile-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary, #1e293b)' }}>{user.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', marginTop: 2 }}>{user.email}</div>
                  </div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: badge.color,
                      background: badge.bg,
                      border: `1px solid ${badge.border}`,
                      textTransform: 'capitalize',
                    }}
                  >
                    {user.status}
                  </span>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #475569)', marginBottom: 4 }}>Party</label>
                  <select
                    className="form-select"
                    value={form.partyId}
                    disabled={!canEditParty || isSaving}
                    onChange={(event) => setFormValue(id, 'partyId', event.target.value)}
                    style={{
                      width: '100%',
                      fontSize: 13,
                      padding: '6px 10px',
                      ...(partyChanged
                        ? {
                            borderColor: 'var(--purple, #6366f1)',
                            boxShadow: '0 0 0 2px rgba(99,102,241,0.15)',
                            backgroundColor: 'var(--primary-bg, #f8fafc)'
                          }
                        : {})
                    }}
                  >
                    <option value="">Select party</option>
                    {parties.map((party) => (
                      <option key={party.id} value={party.id}>{party.name}</option>
                    ))}
                  </select>
                </div>

                {renderUserActions(user, { fullWidth: true, partyChanged })}
              </div>
            );
          })
        )}
      </div>

      <DeletePartyLoginModal
        user={deleteTarget}
        busy={Boolean(savingId)}
        error={deleteModalError}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteUser}
      />
    </div>
  );
}
