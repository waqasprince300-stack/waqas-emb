import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import Swal from 'sweetalert2';
import LoaderDashboard from './LoaderDashboard';
import { Modal, FormGroup } from './UI';

export default function BroadcastModal({ isOpen, onClose }) {
  const { parties, activeAnnouncement, setActiveAnnouncement } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('info');
  const [targetPartyId, setTargetPartyId] = useState('all');
  const [durationHours, setDurationHours] = useState('24');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleStop = async () => {
    if (!activeAnnouncement) return;
    setSubmitting(true);
    try {
      await apiService.stopBroadcast(activeAnnouncement.id || activeAnnouncement._id);
      setActiveAnnouncement(null);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Broadcast Stopped!',
        showConfirmButton: false,
        timer: 3000
      });
      onClose();
    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to stop broadcast', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim()) {
      return Swal.fire('Error', 'Title is required', 'error');
    }

    setSubmitting(true);
    try {
      const created = await apiService.createBroadcast({
        title,
        body,
        severity,
        targetPartyId,
        durationHours: Number(durationHours)
      });
      // Immediately show the broadcast for admin
      if (created && created.id) {
        setActiveAnnouncement({ ...created, isActive: true });
      }
      // Reset form first (before onClose unmounts the component)
      setTitle('');
      setBody('');
      setSeverity('info');
      setTargetPartyId('all');
      setDurationHours('24');
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Broadcast Sent!',
        showConfirmButton: false,
        timer: 3000
      });
      onClose();
    } catch (err) {
      Swal.fire('Error', err.message || 'Failed to send broadcast', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
        Cancel
      </button>
      <button 
        type="button" 
        className="btn btn-primary" 
        onClick={handleSubmit} 
        disabled={submitting}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
      >
        {submitting ? <><LoaderDashboard width={16} height={16} /> Sending...</> : 'Broadcast Now'}
      </button>
    </div>
  );

  return (
    <Modal title="Manage Announcement" onClose={onClose} footer={footer} overlayClassName="broadcast-modal-overlay">
      <div style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {activeAnnouncement && activeAnnouncement.isActive && (
          <div style={{ background: 'var(--danger-bg, #fef2f2)', border: '1px solid var(--danger, #ef4444)', borderRadius: '8px', padding: '12px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: 'var(--danger, #b91c1c)' }}>Currently Active Broadcast</h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <strong>{activeAnnouncement.title}</strong>: {activeAnnouncement.body}
            </p>
            <button 
              type="button" 
              className="btn btn-danger" 
              onClick={handleStop}
              disabled={submitting}
            >
              {submitting ? 'Stopping...' : 'Stop Active Broadcast'}
            </button>
            <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Creating a new one will override the current one.</p>
          </div>
        )}

        <FormGroup label="Title *">
          <input 
            type="text" 
            className="form-input" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            placeholder="E.g., Urgent Requirement, Happy Eid" 
            autoFocus 
          />
        </FormGroup>

        <FormGroup label="Message / Details">
          <textarea 
            className="form-input" 
            rows="3" 
            value={body} 
            onChange={e => setBody(e.target.value)} 
            placeholder="Enter your message here..."
            style={{ resize: 'vertical' }}
          />
        </FormGroup>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FormGroup label="Target Audience" half>
            <select className="form-input" value={targetPartyId} onChange={e => setTargetPartyId(e.target.value)}>
              <option value="all">All Parties</option>
              {parties?.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormGroup>

          <FormGroup label="Type / Color" half>
            <select className="form-input" value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="info">Info (Blue 📢)</option>
              <option value="warning">Warning (Orange ⚠️)</option>
              <option value="urgent">Urgent / Bounty (Red 🔥)</option>
              <option value="success">Motivational (Green 🌟)</option>
            </select>
          </FormGroup>
        </div>

        <FormGroup label="Duration (How long it shows)">
          <select className="form-input" value={durationHours} onChange={e => setDurationHours(e.target.value)}>
            <option value="1">1 Hour</option>
            <option value="24">24 Hours</option>
            <option value="72">3 Days</option>
            <option value="0">Manual (Until I stop it)</option>
          </select>
        </FormGroup>
      </div>
    </Modal>
  );
}
