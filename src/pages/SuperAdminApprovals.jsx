import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiService from '../services/api';
import LoaderDashboard from '../components/LoaderDashboard';
import { EmptyState } from '../components/UI';
import { formatApiError } from '../utils/formatApiError';
import { formatDisplayDateTime } from '../utils/dateFilters';

const getUserId = (user) => String(user?._id || user?.id || '');

/** Never treat a non-array API shape as empty (would wipe the table). */
function normalizeAdminListPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload == null || typeof payload !== 'object') return [];
  if (Array.isArray(payload.admins)) return payload.admins;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'disabled') return 'Disabled';
  return status || '—';
}

function statusStyle(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return { color: '#b45309', fontWeight: 700 };
  if (s === 'approved') return { color: '#15803d', fontWeight: 700 };
  if (s === 'rejected') return { color: '#b91c1c', fontWeight: 700 };
  if (s === 'disabled') return { color: '#64748b', fontWeight: 700 };
  return { fontWeight: 600 };
}

function verifierLabel(row) {
  const by = row.approvedBy;
  if (!by || typeof by !== 'object') return '—';
  const name = String(by.name || '').trim();
  const email = String(by.email || '').trim();
  if (name && email) return `${name} (${email})`;
  return name || email || '—';
}

export default function SuperAdminApprovals() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ showPageLoader = true } = {}) => {
    if (showPageLoader) setLoading(true);
    setError('');
    try {
      const rows = await apiService.getSuperAdminOrganizationAdmins();
      const list = normalizeAdminListPayload(rows);
      setAdmins(list);
    } catch (err) {
      setError(formatApiError(err, 'Unable to load organization administrators'));
    } finally {
      if (showPageLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ showPageLoader: true });
  }, [load]);

  const pendingCount = useMemo(
    () => admins.filter((a) => String(a.status || '').toLowerCase() === 'pending').length,
    [admins]
  );

  const approve = async (row) => {
    const id = getUserId(row);
    setSavingId(id);
    setError('');
    try {
      const updated = await apiService.approveOrganizationAdmin(id);
      setAdmins((current) => {
        const idStr = String(updated?._id || updated?.id || id);
        const has = current.some((item) => getUserId(item) === idStr);
        const patch = {
          ...row,
          ...updated,
          status: 'approved',
          rejectedAt: null,
        };
        if (!has) return [patch, ...current];
        return current.map((item) => (getUserId(item) === idStr ? { ...item, ...patch } : item));
      });
      await load({ showPageLoader: false });
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
      const updated = await apiService.rejectOrganizationAdmin(id);
      setAdmins((current) => {
        const idStr = String(updated?._id || updated?.id || id);
        const has = current.some((item) => getUserId(item) === idStr);
        const patch = {
          ...row,
          ...updated,
          status: 'rejected',
          approvedAt: null,
        };
        if (!has) return [patch, ...current];
        return current.map((item) => (getUserId(item) === idStr ? { ...item, ...patch } : item));
      });
      await load({ showPageLoader: false });
    } catch (err) {
      setError(formatApiError(err, 'Unable to reject'));
    } finally {
      setSavingId('');
    }
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
          <div className="page-title">Verify organization administrators</div>
          <div className="page-subtitle">
            New business administrators can sign up, but cannot use the app until you approve them.
            Approved and rejected requests stay listed for your records.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => load({ showPageLoader: true })}
        >
          Refresh
        </button>
      </div>

      {error && <div className="alert alert-warning">{error}</div>}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="stat-card" style={{ flex: '1 1 180px' }}>
          <div className="stat-label">Pending requests</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#b45309' }}>{pendingCount}</div>
        </div>
        <div className="stat-card" style={{ flex: '1 1 180px' }}>
          <div className="stat-label">Total administrator accounts</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1e40af' }}>{admins.length}</div>
        </div>
      </div>

      <div className="table-wrapper">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Resolved</th>
                <th>Verified by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="No organization administrator accounts" />
                  </td>
                </tr>
              ) : (
                admins.map((row) => {
                  const id = getUserId(row);
                  const busy = savingId === id;
                  const st = String(row.status || '').toLowerCase();
                  const pending = st === 'pending';
                  const approvedAt = row.approvedAt
                    ? formatDisplayDateTime(row.approvedAt, '')
                    : '';
                  const rejectedAt = row.rejectedAt
                    ? formatDisplayDateTime(row.rejectedAt, '')
                    : '';
                  const resolved = approvedAt || rejectedAt || '—';
                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 700 }}>{row.name}</td>
                      <td>{row.email}</td>
                      <td style={statusStyle(row.status)}>{statusLabel(row.status)}</td>
                      <td>{formatDisplayDateTime(row.createdAt)}</td>
                      <td>{resolved}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {verifierLabel(row)}
                      </td>
                      <td>
                        {pending ? (
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
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                        )}
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
