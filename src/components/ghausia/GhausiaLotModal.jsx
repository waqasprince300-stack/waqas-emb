import React from 'react';
import { Modal, FormGroup } from '../UI';

export default function GhausiaLotModal({
  isOpen,
  onClose,
  isEditing,
  form,
  setForm,
  onSubmit,
  saving,
  parties,
}) {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Ghausia Lot' : 'Add New Ghausia Lot'}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <FormGroup label="Lot Number">
          <input
            type="text"
            className="input-field"
            value={form.lotNumber || ''}
            onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
            placeholder="e.g. 101"
            required
          />
        </FormGroup>

        <FormGroup label="Design Number">
          <input
            type="text"
            className="input-field"
            value={form.designNo || ''}
            onChange={(e) => setForm({ ...form, designNo: e.target.value })}
            placeholder="e.g. D-502"
          />
        </FormGroup>

        <FormGroup label="Party">
          <select
            className="select-input"
            value={form.partyId || ''}
            onChange={(e) => setForm({ ...form, partyId: e.target.value })}
          >
            <option value="">Select Party</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormGroup>

        <FormGroup label="Quantity / Pieces">
          <input
            type="number"
            className="input-field"
            value={form.quantity || ''}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="e.g. 100"
          />
        </FormGroup>

        <FormGroup label="Rate (₨)">
          <input
            type="number"
            className="input-field"
            value={form.rate || ''}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
            placeholder="e.g. 50"
          />
        </FormGroup>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEditing ? 'Update Lot' : 'Save Lot'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
