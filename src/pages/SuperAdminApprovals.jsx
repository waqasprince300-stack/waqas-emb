import React, { useCallback, useEffect, useState } from 'react';
import apiService from '../services/api';
import LoaderDashboard from '../components/LoaderDashboard';
import { EmptyState } from '../components/UI';
import { formatApiError } from '../utils/formatApiError';

const getUserId = (user) => String(user?._id || user?.id || '');

export default function SuperAdminApprovals() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await apiService.getSuperAdminPendingAdmins();
      setAdmins(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(formatApiError(err, 'Unable to load pending administrators'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (row) => {
    const id = getUserId(row);
    setSavingId(id);
    setError('');
    try {
      await apiService.approveOrganizationAdmin(id);
      setAdmins((current) => current.filter((item) => getUserId(item) !== id));
    } catch (err) {
      setError(formatApiError(err, 'Unable to approve'));
    } finally {
      setSavingId('');
    }
  };

  const reject = async (row) => {
    const id = getUserId(row);
    if (!window.confirm('Reject this administrator request? They will not be able to sign in.')) {
      return;
    }
    setSavingId(id);
    setError('');
    try {
      await apiService.rejectOrganizationAdmin(id);
      setAdmins((current) => current.filter((item) => getUserId(item) !== id));
    } catch (err) {
      setError(formatApiError(err, 'Unable to reject'));
    } finally {
      setSavingId('');
    }
  };

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
          <div className="page-title">Verify organization administrators</div>
          <div className="page-subtitle">
            New business administrators can sign up, but cannot use the app until you approve them here.
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}

      <div className="stat-card" style={{ marginBottom: 18 }}>
        <div className="stat-label">Pending administrator requests</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#1e40af' }}>{admins.length}</div>
      </div>

      <div className="table-wrapper">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState message="No pending administrator accounts" />
                  </td>
                </tr>
              ) : (
                admins.map((row) => {
                  const id = getUserId(row);
                  const busy = savingId === id;
                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 700 }}>{row.name}</td>
                      <td>{row.email}</td>
                      <td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => approve(row)}
                          >
                            {busy ? '…' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy}
                            onClick={() => reject(row)}
                          >
                            Reject
                          </button>
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
