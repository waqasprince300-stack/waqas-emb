import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import apiService from '../../services/api';
import Loader from '../Loader';
import { Modal } from '../UI';
import { formatDisplayDate } from '../../utils/dateFilters';

/**
 * OwnerBillsListModal
 * Shows past saved bills history for an owner with view, print, and delete actions.
 */
export default function OwnerBillsListModal({
  ownerId,
  ownerName,
  onClose,
  onSelectBill,
  onCreateNew,
  onBillDeleted,
}) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getOwnerBills(ownerId);
      setBills(res?.bills || []);
    } catch (err) {
      console.warn('Could not load owner bills:', err.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handleDelete = async (b) => {
    const hasNewerBills = bills.some(
      (other) =>
        Number(other.bookNo || 1) > Number(b.bookNo || 1) ||
        (Number(other.bookNo || 1) === Number(b.bookNo || 1) && Number(other.billNo || 1) > Number(b.billNo || 1))
    );

    const res = await Swal.fire({
      title: `Delete Bill #${b.billNo}?`,
      html: hasNewerBills
        ? `<div style="font-size:13px; color:#f87171; margin-bottom:8px; line-height:1.4;">⚠️ <strong>Tawajjo:</strong> Is bill ke baad agle bills ban chuke hain. Isay delete karne se hisab ki chain toot sakti hai.</div>Kya aap waqai is bill ko delete karna chahte hain?`
        : 'Kya aap waqai is saved bill record ko delete karna chahte hain?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Haan, delete karein',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });

    if (res.isConfirmed) {
      try {
        await apiService.deleteOwnerBill(b.id || b._id, ownerId);
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Bill #${b.billNo} deleted`,
          showConfirmButton: false,
          timer: 2000,
        });
        loadBills();
        onBillDeleted?.(b);
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'Could not delete bill',
          text: err?.message || 'Please try again.',
        });
      }
    }
  };

  return (
    <Modal
      wide
      title={`Saved Bills History — ${ownerName || 'Owner'}`}
      onClose={onClose}
    >
      <div style={{ padding: '0 0 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Total <strong>{bills.length}</strong> bills recorded
          </div>
          {onCreateNew && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onClose();
                onCreateNew();
              }}
            >
              + Create New Bill
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Loader />
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>Loading bills...</div>
          </div>
        ) : bills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              Abhi koi saved bill nahi hai.
            </div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              Jab aap pehla bill banayein ge to uska record yahan mehfooz rahega.
            </div>
            {onCreateNew && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onCreateNew();
                }}
              >
                Create First Bill
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table className="table" style={{ fontSize: 12, marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Book - Bill#</th>
                  <th>Tareekh</th>
                  <th>Lots</th>
                  <th style={{ textAlign: 'right' }}>Current Bill (Rs)</th>
                  <th style={{ textAlign: 'right' }}>Sabqa (Rs)</th>
                  <th style={{ textAlign: 'right' }}>Wusooli (Rs)</th>
                  <th style={{ textAlign: 'right' }}>Kul Baqaya (Rs)</th>
                  <th style={{ textAlign: 'center', width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id || b._id}>
                    <td>
                      <strong style={{ color: 'var(--primary, #2563eb)' }}>
                        Book {b.bookNo} - Bill #{b.billNo}
                      </strong>
                    </td>
                    <td>{formatDisplayDate(b.date)}</td>
                    <td>{b.lots?.length || 0} lots</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      Rs {Number(b.currentBillTotal || 0).toLocaleString()}
                      {Number(b.unpaidPreviousBillsTotal || 0) > 0 && (
                        <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 500 }}>
                          +Pichla: Rs {Number(b.unpaidPreviousBillsTotal).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--warning, #d97706)' }}>
                      Rs {Number(b.sabqaBaqaya || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--success, #059669)' }}>
                      Rs {Number(b.totalPaymentsReceived || 0).toLocaleString()}
                      {Number(b.totalDeductions || 0) > 0 && (
                        <div style={{ fontSize: 10, color: '#f87171', fontWeight: 500 }}>
                          Katoti: -Rs {Number(b.totalDeductions).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary, #1e40af)' }}>
                      Rs {Number(b.grandTotalBaqaya || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => {
                            onClose();
                            onSelectBill?.(b);
                          }}
                          title="View / Print Bill"
                          style={{ color: 'var(--primary, #2563eb)' }}
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleDelete(b)}
                          title="Delete Bill"
                          style={{ color: 'var(--danger, #dc2626)' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
