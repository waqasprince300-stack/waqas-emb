import React, { useEffect, useMemo, useState } from 'react';
import apiService from '../services/api';
import { useApp } from '../context/AppContext';
import LoaderDashboard from '../components/LoaderDashboard';
import { EmptyState } from '../components/UI';
import { compareRowsByUpdatedNewestFirst } from '../utils/dateFilters';

const getUserId = (user) => String(user?._id || user?.id || '');

const STATUS_BADGES = {
  pending: { color: '#92400e', bg: '#fef3c7', border: '#fcd34d' },
  approved: { color: '#166534', bg: '#dcfce7', border: '#86efac' },
  disabled: { color: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
  rejected: { color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
  default: { color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
};

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

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, disabled: 0, rejected: 0 };
    for (const u of users) {
      if (u.status in c) c[u.status] += 1;
    }
    return c;
  }, [users]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'user')),
    [users]
  );

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
            Approve party users, switch their linked party, or disable / re-enable access.
          </div>
        </div>
        <button className="btn btn-ghost" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          { label: 'Pending', value: counts.pending, color: '#b45309' },
          { label: 'Approved', value: counts.approved, color: '#15803d' },
          { label: 'Disabled', value: counts.disabled, color: '#b91c1c' },
          { label: 'Rejected', value: counts.rejected, color: '#64748b' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '14px 16px',
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

      <div className="table-wrapper">
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
                  const id = getUserId(user);
                  const form = approvalForms[id] || { partyId: normalizedPartyIdFromUser(user) };
                  const isPending = user.status === 'pending';
                  const isApproved = user.status === 'approved';
                  const isDisabled = user.status === 'disabled';
                  const isRejected = user.status === 'rejected';
                  const isSaving = savingId === id;
                  const canEditParty = isPending || isApproved || isDisabled;
                  const partyChanged =
                    !isPending &&
                    normalizePartyIdRef(form.partyId).trim() !== normalizedPartyIdFromUser(user);

                  const badge = STATUS_BADGES[user.status] || STATUS_BADGES.default;

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
                                  borderColor: '#6366f1',
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
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {isPending && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                disabled={isSaving}
                                onClick={() => approveUser(user)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#b91c1c', borderColor: '#fecaca' }}
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
                              disabled={isSaving}
                              onClick={() => saveParty(user)}
                            >
                              Save party
                            </button>
                          )}

                          {isApproved && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                              disabled={isSaving}
                              onClick={() => disableUser(user)}
                            >
                              Disable
                            </button>
                          )}

                          {isDisabled && (
                            <button
                              className="btn btn-success btn-sm"
                              disabled={isSaving}
                              onClick={() => enableUser(user)}
                            >
                              Enable
                            </button>
                          )}

                          {isRejected && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
