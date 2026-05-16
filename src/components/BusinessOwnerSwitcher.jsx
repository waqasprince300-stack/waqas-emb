import React, { useState } from 'react';
import { useApp, ADMIN_ALL_WORKSPACES_ID } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup } from './UI';

const REMOVE_COUNT_LABELS = {
  partyEdits: 'Party edit records',
  partyLedger: 'Ledger rows',
  payments: 'Payments',
  ghausiaLots: 'Lots',
  parties: 'Parties',
  collections: 'Collections',
  rateCalculations: 'Rate calculations',
  savedDesigns: 'Saved designs',
  partyUsers: 'Party logins (will be disabled)',
};

function nonzeroCountLines(counts) {
  if (!counts || typeof counts !== 'object') return [];
  return Object.entries(counts)
    .filter(([, n]) => Number(n) > 0)
    .map(([key, n]) => `${REMOVE_COUNT_LABELS[key] || key}: ${n}`);
}

export default function BusinessOwnerSwitcher({ compact = false }) {
  const { isAdmin } = useAuth();
  const {
    businessOwners,
    activeBusinessOwnerId,
    selectBusinessOwner,
    selectAllWorkspacesView,
    viewAllWorkspaces,
    createBusinessOwner,
    deleteBusinessOwner,
  } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [removeForceStep, setRemoveForceStep] = useState(false);
  const [removeCounts, setRemoveCounts] = useState(null);

  /** Main app admin manages workspaces; party users never see this. */
  if (!isAdmin) return null;

  const activeOwner = businessOwners.find((owner) => String(owner.id || owner._id) === String(activeBusinessOwnerId));

  const compactSelectValue = viewAllWorkspaces ? ADMIN_ALL_WORKSPACES_ID : String(activeBusinessOwnerId || '');

  const displayOwnerName = viewAllWorkspaces
    ? 'All workspaces'
    : (activeOwner?.name || 'Select business owner');

  const canRemoveWorkspace =
    !viewAllWorkspaces && Boolean(String(activeBusinessOwnerId || '').trim()) && businessOwners.length > 0;

  const resetRemoveModal = () => {
    setRemoveModalOpen(false);
    setRemoveForceStep(false);
    setRemoveCounts(null);
    setRemoveError('');
  };

  const openRemoveModal = () => {
    setRemoveError('');
    setRemoveForceStep(false);
    setRemoveCounts(null);
    setRemoveModalOpen(true);
  };

  const handleRemoveTry = async () => {
    const wid = String(activeBusinessOwnerId || '').trim();
    if (!wid) return;
    setRemoveError('');
    setRemoveSaving(true);
    try {
      await deleteBusinessOwner(wid);
      resetRemoveModal();
    } catch (err) {
      if (err.status === 409 && err.body?.counts) {
        setRemoveCounts(err.body.counts);
        setRemoveForceStep(true);
      } else {
        setRemoveError(err.message || 'Could not remove workspace');
      }
    } finally {
      setRemoveSaving(false);
    }
  };

  const handleRemoveForce = async () => {
    const wid = String(activeBusinessOwnerId || '').trim();
    if (!wid) return;
    setRemoveError('');
    setRemoveSaving(true);
    try {
      await deleteBusinessOwner(wid, { force: true });
      resetRemoveModal();
    } catch (err) {
      setRemoveError(err.message || 'Could not remove workspace');
    } finally {
      setRemoveSaving(false);
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('Business owner name is required');
      return;
    }

    setSaving(true);
    try {
      await createBusinessOwner({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      });
      setForm({ name: '', phone: '', address: '' });
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Unable to create business owner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {compact ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: '1 1 auto' }}>
          <select
            className="form-select"
            style={{
              minWidth: 200,
              flex: '1 1 220px',
              maxWidth: 400,
              fontWeight: 600,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: '#f8fafc',
            }}
            value={compactSelectValue}
            onChange={(event) => {
              const next = event.target.value;
              if (next === ADMIN_ALL_WORKSPACES_ID) selectAllWorkspacesView();
              else selectBusinessOwner(next);
            }}
            title="Switch workspace"
            aria-label="Switch workspace"
          >
            <option value={ADMIN_ALL_WORKSPACES_ID}>All workspaces</option>
            {businessOwners.map((owner) => (
              <option key={owner.id || owner._id} value={owner.id || owner._id}>
                {owner.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              border: '1px solid var(--border)',
              background: '#fff',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            + New workspace
          </button>
          <button
            className="btn btn-danger"
            type="button"
            disabled={!canRemoveWorkspace || removeSaving}
            title={!canRemoveWorkspace ? 'Select a single workspace to remove it' : 'Remove this workspace'}
            onClick={() => openRemoveModal()}
            style={{
              fontWeight: 600,
              whiteSpace: 'nowrap',
              opacity: canRemoveWorkspace ? 1 : 0.5,
            }}
          >
            Remove workspace
          </button>
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            padding: '12px 14px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Active business owner
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: 'var(--text-primary)',
                marginTop: 4,
                lineHeight: 1.25,
              }}
            >
              {displayOwnerName}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ minWidth: 220 }}
              value={compactSelectValue}
              onChange={(event) => {
                const next = event.target.value;
                if (next === ADMIN_ALL_WORKSPACES_ID) selectAllWorkspacesView();
                else selectBusinessOwner(next);
              }}
            >
              <option value={ADMIN_ALL_WORKSPACES_ID}>All workspaces</option>
              {businessOwners.map((owner) => (
                <option key={owner.id || owner._id} value={owner.id || owner._id}>
                  {owner.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="button" onClick={() => setModalOpen(true)}>
              Add New Business
            </button>
            <button
              className="btn btn-danger"
              type="button"
              disabled={!canRemoveWorkspace || removeSaving}
              title={!canRemoveWorkspace ? 'Select a single workspace to remove it' : 'Remove this workspace'}
              onClick={() => openRemoveModal()}
              style={{ opacity: canRemoveWorkspace ? 1 : 0.5 }}
            >
              Remove workspace
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal
          title="Create Business Owner"
          onClose={() => {
            if (!saving) {
              setModalOpen(false);
              setError('');
            }
          }}
          onFormSubmit={() => {
            void handleCreate();
          }}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create Owner'}
              </button>
            </>
          )}
        >
          {error && <div className="alert alert-warning">{error}</div>}
          <FormGroup label="Business Owner Name *">
            <input
              className="form-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Ghausia Collection"
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Phone">
            <input
              className="form-input"
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Optional"
            />
          </FormGroup>
          <FormGroup label="Address">
            <textarea
              className="form-textarea"
              rows={3}
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              placeholder="Optional"
            />
          </FormGroup>
        </Modal>
      )}

      {removeModalOpen && (
        <Modal
          title={removeForceStep ? 'Delete workspace and all data?' : 'Remove workspace'}
          onClose={() => {
            if (!removeSaving) resetRemoveModal();
          }}
          wide={removeForceStep}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" disabled={removeSaving} onClick={() => resetRemoveModal()}>
                Cancel
              </button>
              {removeForceStep ? (
                <button type="button" className="btn btn-danger" disabled={removeSaving} onClick={() => void handleRemoveForce()}>
                  {removeSaving ? 'Deleting…' : 'Delete workspace and all data'}
                </button>
              ) : (
                <button type="button" className="btn btn-danger" disabled={removeSaving} onClick={() => void handleRemoveTry()}>
                  {removeSaving ? 'Working…' : 'Remove workspace'}
                </button>
              )}
            </>
          )}
        >
          {removeError && <div className="alert alert-warning">{removeError}</div>}
          {removeForceStep ? (
            <>
              <p style={{ marginTop: 0 }}>
                This workspace still has related records. Deleting it will permanently remove the items below and disable party logins that belong only to this workspace.
              </p>
              {nonzeroCountLines(removeCounts).length > 0 ? (
                <ul style={{ margin: '12px 0', paddingLeft: 20 }}>
                  {nonzeroCountLines(removeCounts).map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="alert alert-warning">Unable to load detail counts; you can still confirm deletion.</p>
              )}
            </>
          ) : (
            <p style={{ marginTop: 0 }}>
              Remove <strong>{activeOwner?.name || 'this workspace'}</strong>? Empty workspaces are removed immediately.
              If there are still lots, parties, or payments, you will be asked to confirm a full delete.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
