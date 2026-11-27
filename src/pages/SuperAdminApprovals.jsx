import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Shield, Users, Ban, CheckCircle2, Trash2, RotateCcw } from 'lucide-react';
import apiService from '../services/api';
import LoaderDashboard from '../components/LoaderDashboard';
import DeletePartyLoginModal from '../components/DeletePartyLoginModal';
import { EmptyState, Modal, PaginationFooter, SearchBar } from '../components/UI';
import { formatApiError } from '../utils/formatApiError';
import { formatDisplayDateTime } from '../utils/dateFilters';
import {
  ACCOUNT_STATUS_FILTER_OPTIONS,
  getAccountStatusBadge,
} from '../utils/userStatusBadges';

const PAGE_SIZE = 15;

const extractList = (res) => (Array.isArray(res) ? res : res?.data || []);

const hasOrganizationData = (stats = {}) =>
  Number(stats.workspaces || 0) > 0 ||
  Number(stats.parties || 0) > 0 ||
  Number(stats.lots || 0) > 0 ||
  Number(stats.partyUsers || 0) > 0;

function StatusPill({ status }) {
  const badge = getAccountStatusBadge(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        background: badge.bg,
        color: badge.color,
        border: `1px solid ${badge.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {badge.label}
    </span>
  );
}

function OrgStatsPills({ stats = {} }) {
  const items = [
    { label: 'Workspaces', value: stats.workspaces || 0 },
    { label: 'Parties', value: stats.parties || 0 },
    { label: 'Logins', value: stats.partyUsers || 0 },
    { label: 'Lots', value: stats.lots || 0 },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((item) => (
        <span
          key={item.label}
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 6,
            background: 'var(--body-bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong> {item.label}
        </span>
      ))}
    </div>
  );
}

export default function SuperAdminApprovals() {
  const [activeTab, setActiveTab] = useState('admins');
  const [admins, setAdmins] = useState([]);
  const [partyUsers, setPartyUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busyId, setBusyId] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [disableTarget, setDisableTarget] = useState(null);
  const [disableReason, setDisableReason] = useState('');
  const [deleteAdminTarget, setDeleteAdminTarget] = useState(null);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [forceRequireEmail, setForceRequireEmail] = useState(false);
  const [deletePartyTarget, setDeletePartyTarget] = useState(null);
  const [modalError, setModalError] = useState('');

  const listTopRef = useRef(null);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [adminsRes, partyRes] = await Promise.all([
        apiService.getSuperAdminOrganizationAdmins(),
        apiService.getSuperAdminPartyUsers(),
      ]);
      setAdmins(extractList(adminsRes));
      setPartyUsers(extractList(partyRes));
    } catch (e) {
      setError(formatApiError(e, 'Could not load super admin records'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, statusFilter, orgFilter]);

  const adminCounts = useMemo(() => {
    const counts = { all: admins.length, pending: 0, approved: 0, disabled: 0, rejected: 0 };
    for (const row of admins) {
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    }
    return counts;
  }, [admins]);

  const partyCounts = useMemo(() => {
    const counts = { all: partyUsers.length, pending: 0, approved: 0, disabled: 0, rejected: 0 };
    for (const row of partyUsers) {
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    }
    return counts;
  }, [partyUsers]);

  const orgFilterOptions = useMemo(() => {
    const map = new Map();
    for (const row of admins) {
      map.set(String(row._id), `${row.name || 'Admin'} (${row.email || ''})`);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [admins]);

  const filteredAdmins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return admins.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(row.name || '').toLowerCase().includes(q) ||
        String(row.email || '').toLowerCase().includes(q) ||
        String(row.phone || '').toLowerCase().includes(q)
      );
    });
  }, [admins, searchQuery, statusFilter]);

  const filteredPartyUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return partyUsers.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      const orgAdmin = row.ownerId || row.pendingForAdminId;
      const orgAdminId = orgAdmin?._id ? String(orgAdmin._id) : String(orgAdmin || '');
      if (orgFilter !== 'all' && orgAdminId !== orgFilter) return false;
      if (!q) return true;
      return (
        String(row.name || '').toLowerCase().includes(q) ||
        String(row.email || '').toLowerCase().includes(q) ||
        String(row.phone || '').toLowerCase().includes(q) ||
        String(row.partyName || '').toLowerCase().includes(q) ||
        String(orgAdmin?.name || '').toLowerCase().includes(q) ||
        String(orgAdmin?.email || '').toLowerCase().includes(q)
      );
    });
  }, [partyUsers, searchQuery, statusFilter, orgFilter]);

  const activeRows = activeTab === 'admins' ? filteredAdmins : filteredPartyUsers;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleRows = activeRows.slice(pageStart, pageStart + PAGE_SIZE);

  const runDirectAction = async (id, actionFn, successMessage, updateTarget) => {
    setBusyId(id);
    setError('');
    setFeedback(null);
    try {
      const updated = await actionFn();
      if (updateTarget === 'admins') {
        setAdmins((prev) => prev.map((row) => (String(row._id) === String(id) ? { ...row, ...updated } : row)));
      } else {
        setPartyUsers((prev) => prev.map((row) => (String(row._id) === String(id) ? { ...row, ...updated } : row)));
      }
      setFeedback({ type: 'success', text: successMessage });
    } catch (e) {
      setError(formatApiError(e, 'Action could not be completed'));
    } finally {
      setBusyId('');
    }
  };

  const handleApproveAdmin = (row) => {
    const label = row.status === 'rejected' ? 're-approved' : 'approved';
    runDirectAction(
      row._id,
      () => apiService.approveOrganizationAdmin(row._id),
      `${row.name || row.email} ${label}. They can sign in now.`,
      'admins'
    );
  };

  const handleRejectAdmin = (row) => {
    runDirectAction(
      row._id,
      () => apiService.rejectOrganizationAdmin(row._id),
      `${row.name || row.email} request rejected.`,
      'admins'
    );
  };

  const handleEnableAdmin = (row) => {
    runDirectAction(
      row._id,
      () => apiService.enableOrganizationAdmin(row._id),
      `${row.name || row.email} account re-enabled.`,
      'admins'
    );
  };

  const handleEnablePartyUser = (row) => {
    runDirectAction(
      row._id,
      () => apiService.enableSuperAdminPartyUser(row._id),
      `${row.name || row.email} party login re-enabled.`,
      'partyUsers'
    );
  };

  const openDisableModal = (kind, row) => {
    setDisableTarget({ kind, row });
    setDisableReason('');
    setModalError('');
  };

  const submitDisable = async () => {
    if (!disableTarget) return;
    const { kind, row } = disableTarget;
    setBusyId(row._id);
    setModalError('');
    setFeedback(null);
    try {
      if (kind === 'admin') {
        const updated = await apiService.disableOrganizationAdmin(row._id, disableReason.trim());
        setAdmins((prev) => prev.map((item) => (String(item._id) === String(row._id) ? { ...item, ...updated } : item)));
        setFeedback({ type: 'success', text: `${row.name || row.email} administrator account disabled.` });
      } else {
        const updated = await apiService.disableSuperAdminPartyUser(row._id, disableReason.trim());
        setPartyUsers((prev) => prev.map((item) => (String(item._id) === String(row._id) ? { ...item, ...updated } : item)));
        setFeedback({ type: 'success', text: `${row.name || row.email} party login disabled.` });
      }
      setDisableTarget(null);
    } catch (e) {
      setModalError(formatApiError(e, 'Could not disable account'));
    } finally {
      setBusyId('');
    }
  };

  const openDeleteAdminModal = (row) => {
    setDeleteAdminTarget(row);
    setConfirmEmailInput('');
    setForceRequireEmail(hasOrganizationData(row.stats));
    setModalError('');
  };

  const submitDeleteAdmin = async () => {
    if (!deleteAdminTarget) return;
    const row = deleteAdminTarget;
    setBusyId(row._id);
    setModalError('');
    setFeedback(null);
    try {
      const res = await apiService.deleteOrganizationAdmin(row._id, confirmEmailInput.trim());
      setAdmins((prev) => prev.filter((item) => String(item._id) !== String(row._id)));
      setPartyUsers((prev) =>
        prev.filter((u) => {
          const oid = u.ownerId?._id ? String(u.ownerId._id) : String(u.ownerId || '');
          const pid = u.pendingForAdminId?._id ? String(u.pendingForAdminId._id) : String(u.pendingForAdminId || '');
          return oid !== String(row._id) && pid !== String(row._id);
        })
      );
      setDeleteAdminTarget(null);
      setFeedback({
        type: 'success',
        text: `Deleted ${row.name || row.email}${res?.deletedPartyUserCount ? ` and ${res.deletedPartyUserCount} linked party login(s)` : ''}.`,
      });
    } catch (e) {
      if (
        e?.body?.code === 'CONFIRM_EMAIL_REQUIRED' ||
        e?.code === 'CONFIRM_EMAIL_REQUIRED' ||
        e?.data?.code === 'CONFIRM_EMAIL_REQUIRED'
      ) {
        setForceRequireEmail(true);
      }
      setModalError(formatApiError(e, 'Could not delete administrator account'));
    } finally {
      setBusyId('');
    }
  };

  const submitDeletePartyUser = async () => {
    if (!deletePartyTarget) return;
    const row = deletePartyTarget;
    setBusyId(row._id);
    setModalError('');
    setFeedback(null);
    try {
      await apiService.deleteSuperAdminPartyUser(row._id);
      setPartyUsers((prev) => prev.filter((item) => String(item._id) !== String(row._id)));
      await loadData({ silent: true });
      setDeletePartyTarget(null);
      setFeedback({
        type: 'success',
        text: `Deleted party login for ${row.name || row.email}. Business parties, lots, and ledger records remain intact.`,
      });
    } catch (e) {
      setModalError(formatApiError(e, 'Could not delete party user login'));
    } finally {
      setBusyId('');
    }
  };

  const renderAdminActions = (row) => {
    const busy = busyId === row._id;
    return (
      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {(row.status === 'pending' || row.status === 'rejected') && (
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={busy}
            onClick={() => handleApproveAdmin(row)}
          >
            <CheckCircle2 size={13} />
            {row.status === 'rejected' ? 'Re-approve' : 'Approve'}
          </button>
        )}
        {row.status === 'pending' && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={busy}
            onClick={() => handleRejectAdmin(row)}
          >
            Reject
          </button>
        )}
        {(row.status === 'approved' || row.status === 'pending') && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={busy}
            onClick={() => openDisableModal('admin', row)}
            style={{ color: 'var(--warning-text, #92600a)', borderColor: 'var(--warning-border, #fde68a)' }}
          >
            <Ban size={12} />
            Disable
          </button>
        )}
        {row.status === 'disabled' && (
          <button
            type="button"
            className="btn btn-success btn-xs"
            disabled={busy}
            onClick={() => handleEnableAdmin(row)}
          >
            <RotateCcw size={12} />
            Enable
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger btn-xs"
          disabled={busy}
          onClick={() => openDeleteAdminModal(row)}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    );
  };

  const renderPartyActions = (row) => {
    const busy = busyId === row._id;
    return (
      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {row.status === 'approved' && (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={busy}
            onClick={() => openDisableModal('party', row)}
            style={{ color: 'var(--warning-text, #92600a)', borderColor: 'var(--warning-border, #fde68a)' }}
          >
            <Ban size={12} />
            Disable
          </button>
        )}
        {row.status === 'disabled' && (
          <button
            type="button"
            className="btn btn-success btn-xs"
            disabled={busy}
            onClick={() => handleEnablePartyUser(row)}
          >
            <RotateCcw size={12} />
            Enable
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger btn-xs"
          disabled={busy}
          onClick={() => {
            setDeletePartyTarget(row);
            setModalError('');
          }}
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    );
  };

  const activeCounts = activeTab === 'admins' ? adminCounts : partyCounts;
  const emailMatchesAdmin =
    deleteAdminTarget &&
    confirmEmailInput.trim().toLowerCase() === String(deleteAdminTarget.email || '').trim().toLowerCase();

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Platform Administration</h1>
          <p className="page-subtitle">
            Approve, disable, monitor usage, or safely clean up organization administrators and party login accounts.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => loadData()}
          disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Summary KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('admins');
            setStatusFilter('pending');
          }}
        >
          <div className="stat-label">Pending Admins</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #d97706)' }}>
            {adminCounts.pending}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Awaiting verification</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('admins');
            setStatusFilter('approved');
          }}
        >
          <div className="stat-label">Active Admins</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #15803d)' }}>
            {adminCounts.approved}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {adminCounts.all} total admin accounts
          </div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('admins');
            setStatusFilter(adminCounts.disabled > 0 ? 'disabled' : 'rejected');
          }}
        >
          <div className="stat-label">Disabled / Rejected</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger, #dc2626)' }}>
            {adminCounts.disabled + adminCounts.rejected}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {adminCounts.disabled} disabled · {adminCounts.rejected} rejected
          </div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setActiveTab('partyUsers');
            setStatusFilter('all');
          }}
        >
          <div className="stat-label">Party Login Accounts</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary, #1e40af)' }}>
            {partyCounts.all}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {partyCounts.approved} active · {partyCounts.pending} pending
          </div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div
        ref={listTopRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div className="segmented-tabs" role="tablist" aria-label="Super admin sections">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'admins'}
              className={`segmented-tab ${activeTab === 'admins' ? 'active' : ''}`}
              onClick={() => setActiveTab('admins')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Shield size={15} />
              Organization Admins ({adminCounts.all})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'partyUsers'}
              className={`segmented-tab ${activeTab === 'partyUsers' ? 'active' : ''}`}
              onClick={() => setActiveTab('partyUsers')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Users size={15} />
              Party Users ({partyCounts.all})
            </button>
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
                  {opt.label} ({activeCounts[opt.value] ?? 0})
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 280px' }}>
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={
                activeTab === 'admins'
                  ? 'Search organization admin by name, email, or phone...'
                  : 'Search party user by name, email, phone, party, or admin...'
              }
              resultCount={activeRows.length}
            />
          </div>
          {activeTab === 'partyUsers' && (
            <select
              className="select-input"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              style={{ minWidth: 220, padding: '6px 10px' }}
              aria-label="Filter by organization admin"
            >
              <option value="all">All Organizations ({admins.length})</option>
              {orgFilterOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
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
          <span>{feedback.text}</span>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          className="auth-alert"
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 8,
            background: 'var(--danger-bg, #fef2f2)',
            border: '1px solid var(--danger, #fecaca)',
            color: 'var(--danger, #991b1b)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <LoaderDashboard message="Loading accounts…" />
      ) : activeRows.length === 0 ? (
        <EmptyState
          message={
            activeTab === 'admins'
              ? 'No organization administrator accounts match this filter.'
              : 'No party user accounts match this filter.'
          }
        />
      ) : activeTab === 'admins' ? (
        <>
          <div className="table-wrapper desktop-only-table">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Status</th>
                    <th>Organization Usage</th>
                    <th>Requested</th>
                    <th>Resolved / Verified By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const resolvedAt = row.approvedAt || row.rejectedAt || row.disabledAt;
                    const verifiedByText = row.approvedBy
                      ? `${row.approvedBy.name || 'Super Admin'} (${row.approvedBy.email || ''})`
                      : '—';
                    return (
                      <tr key={row._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.name || '—'}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{row.email}</div>
                          {row.phone && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.phone}</div>
                          )}
                          {row.status === 'disabled' && row.disabledReason && (
                            <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 2 }}>
                              Reason: {row.disabledReason}
                            </div>
                          )}
                        </td>
                        <td>
                          <StatusPill status={row.status} />
                        </td>
                        <td>
                          <OrgStatsPills stats={row.stats} />
                        </td>
                        <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {row.createdAt ? formatDisplayDateTime(row.createdAt) : '—'}
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5 }}>
                            {resolvedAt ? formatDisplayDateTime(resolvedAt) : '—'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{verifiedByText}</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{renderAdminActions(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mobile-only-ghausia-cards">
            {visibleRows.map((row) => (
              <div key={row._id} className="ghausia-mobile-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{row.name || '—'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{row.email}</div>
                  </div>
                  <StatusPill status={row.status} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <OrgStatsPills stats={row.stats} />
                </div>
                {row.status === 'disabled' && row.disabledReason && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                    Reason: {row.disabledReason}
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Requested: {row.createdAt ? formatDisplayDateTime(row.createdAt) : '—'}
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  {renderAdminActions(row)}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="table-wrapper desktop-only-table">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Party User</th>
                    <th>Organization Admin</th>
                    <th>Linked Party</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const orgAdmin = row.ownerId || row.pendingForAdminId;
                    return (
                      <tr key={row._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.name || '—'}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{row.email}</div>
                          {row.phone && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.phone}</div>
                          )}
                          {row.status === 'disabled' && row.disabledReason && (
                            <div style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: 2 }}>
                              Reason: {row.disabledReason}
                            </div>
                          )}
                        </td>
                        <td>
                          {orgAdmin && typeof orgAdmin === 'object' ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{orgAdmin.name || '—'}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{orgAdmin.email}</div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {row.partyName || (
                            <span style={{ color: 'var(--text-secondary)' }}>Unassigned</span>
                          )}
                        </td>
                        <td>
                          <StatusPill status={row.status} />
                        </td>
                        <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {row.createdAt ? formatDisplayDateTime(row.createdAt) : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{renderPartyActions(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mobile-only-ghausia-cards">
            {visibleRows.map((row) => {
              const orgAdmin = row.ownerId || row.pendingForAdminId;
              return (
                <div key={row._id} className="ghausia-mobile-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{row.name || '—'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{row.email}</div>
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    <strong>Admin:</strong> {orgAdmin?.name || '—'} · <strong>Party:</strong> {row.partyName || 'Unassigned'}
                  </div>
                  {row.status === 'disabled' && row.disabledReason && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>
                      Reason: {row.disabledReason}
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    {renderPartyActions(row)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!loading && activeRows.length > PAGE_SIZE && (
        <PaginationFooter
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={activeRows.length}
          pageStart={pageStart}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          scrollTargetRef={listTopRef}
        />
      )}

      {disableTarget && (
        <Modal
          title={
            disableTarget.kind === 'admin'
              ? 'Disable Organization Administrator'
              : 'Disable Party User Login'
          }
          maxWidth={480}
          onClose={() => !busyId && setDisableTarget(null)}
          onFormSubmit={submitDisable}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={Boolean(busyId)}
                onClick={() => setDisableTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={Boolean(busyId)}
              >
                {busyId ? 'Disabling…' : 'Disable Account'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 12 }}>
            You are disabling <strong style={{ color: 'var(--text-primary)' }}>{disableTarget.row.name || disableTarget.row.email}</strong> ({disableTarget.row.email}).
            They will immediately lose sign-in access until you re-enable them. All existing lots, parties, and ledger history stay intact.
          </p>
          <div className="form-group">
            <label className="form-label">Reason (optional — shown if they try to sign in)</label>
            <input
              type="text"
              className="form-input"
              maxLength={300}
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              placeholder="e.g., Account paused or test account"
            />
          </div>
          {modalError && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{modalError}</div>
          )}
        </Modal>
      )}

      {deleteAdminTarget && (
        <Modal
          title="Delete Organization Administrator"
          maxWidth={520}
          onClose={() => !busyId && setDeleteAdminTarget(null)}
          onFormSubmit={submitDeleteAdmin}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={Boolean(busyId)}
                onClick={() => setDeleteAdminTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={Boolean(busyId) || (forceRequireEmail && !emailMatchesAdmin)}
              >
                {busyId
                  ? 'Deleting…'
                  : forceRequireEmail
                    ? 'Delete Organization Permanently'
                    : 'Delete Account'}
              </button>
            </>
          }
        >
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 12 }}>
            Account: <strong style={{ color: 'var(--text-primary)' }}>{deleteAdminTarget.name || '—'}</strong> ({deleteAdminTarget.email})
          </div>
          <div style={{ marginBottom: 12 }}>
            <OrgStatsPills stats={deleteAdminTarget.stats} />
          </div>
          {forceRequireEmail ? (
            <>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--danger-bg, #fef2f2)',
                  border: '1px solid var(--danger, #fecaca)',
                  color: 'var(--danger, #991b1b)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                <strong>Warning:</strong> This organization owns data or linked party logins. Deleting this admin permanently erases their workspaces, parties, lots, ledger entries, payments, bills, and linked party logins.
              </div>
              <div className="form-group">
                <label className="form-label">
                  Type <strong>{deleteAdminTarget.email}</strong> to confirm permanent deletion
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={confirmEmailInput}
                  onChange={(e) => setConfirmEmailInput(e.target.value)}
                  placeholder={deleteAdminTarget.email}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              This administrator account has no workspaces, parties, lots, or party logins. Deleting removes only the empty account cleanly.
            </p>
          )}
          {modalError && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{modalError}</div>
          )}
        </Modal>
      )}

      <DeletePartyLoginModal
        user={deletePartyTarget}
        organizationAdminName={
          (deletePartyTarget?.ownerId || deletePartyTarget?.pendingForAdminId)?.name || ''
        }
        busy={Boolean(busyId)}
        error={modalError}
        onClose={() => setDeletePartyTarget(null)}
        onConfirm={submitDeletePartyUser}
      />
    </div>
  );
}
