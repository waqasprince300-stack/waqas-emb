import React, { useEffect, useMemo, useState } from 'react';
import apiService from '../services/api';
import { useApp } from '../context/AppContext';
import LoaderDashboard from '../components/LoaderDashboard';
import { EmptyState } from '../components/UI';
import { compareRowsByUpdatedNewestFirst } from '../utils/dateFilters';

const getUserId = (user) => String(user?._id || user?.id || '');

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

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === 'pending'),
    [users],
  );

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
    const form = approvalForms[id] || { partyId: user.partyId || '' };

    if (!form.partyId) {
      setError('Select a party before approving a party user.');
      return;
    }

    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.approveUser(id, form);
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

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        compareRowsByUpdatedNewestFirst(a, b, 'user'),
      ),
    [users],
  );

  if (loading) {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoaderDashboard height={30} width={30} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Users / Approvals</div>
          <div className="page-subtitle">Approve party users who requested your organization and link them to parties</div>
        </div>
        <button className="btn btn-ghost" onClick={loadUsers}>Refresh</button>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}

      <div className="stat-card" style={{ marginBottom: 18 }}>
        <div className="stat-label">Pending Approvals</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#1e40af' }}>{pendingUsers.length}</div>
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
                  const form = approvalForms[id] || { partyId: user.partyId || '' };
                  const isPending = user.status === 'pending';
                  const isSaving = savingId === id;

                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 700 }}>{user.name}</td>
                      <td>{user.email}</td>
                      <td style={{ textTransform: 'capitalize' }}>{user.status}</td>
                      <td>
                        <select
                          className="form-select"
                          value={form.partyId}
                          disabled={!isPending || isSaving}
                          onChange={(event) => setFormValue(id, 'partyId', event.target.value)}
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
                          {isPending ? (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={isSaving}
                                onClick={() => approveUser(user)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={isSaving}
                                onClick={() => rejectUser(user)}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={isSaving || user.status === 'disabled'}
                              onClick={() => disableUser(user)}
                            >
                              Disable
                            </button>
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
