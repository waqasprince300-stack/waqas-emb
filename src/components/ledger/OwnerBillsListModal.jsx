import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import apiService from '../../services/api';
import Loader from '../Loader';
import { Modal } from '../UI';
import { formatDisplayDate } from '../../utils/dateFilters';

/**
 * OwnerBillsListModal
 * Shows past saved bills history for an owner with view, print, and delete actions.
 * Optimized with zero horizontal scroll ("no slide system"):
 * - Fits 100% within the modal on desktop with clean, fixed proportions
 * - Automatic responsive cards layout on mobile screens
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
      maxWidth="min(96vw, 980px)"
      title={`Saved Bills History — ${ownerName || 'Owner'}`}
      onClose={onClose}
    >
      <div style={{ padding: '0 0 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
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
              style={{ fontWeight: 600, borderRadius: 6 }}
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
          <>
            {/* Desktop / Tablet: Fixed layout table with ZERO horizontal scroll */}
            <div className="bills-history-desktop-table" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table className="table" style={{ width: '100%', tableLayout: 'fixed', fontSize: 12, marginBottom: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #f8fafc)' }}>
                    <th style={{ width: '14%', padding: '10px 8px' }}>Bill #</th>
                    <th style={{ width: '12%', padding: '10px 8px' }}>Tareekh</th>
                    <th style={{ width: '8%', padding: '10px 8px' }}>Lots</th>
                    <th style={{ width: '15%', textAlign: 'right', padding: '10px 8px' }}>Kaam (Rs)</th>
                    <th style={{ width: '15%', textAlign: 'right', padding: '10px 8px' }}>Sabqa (Rs)</th>
                    <th style={{ width: '15%', textAlign: 'right', padding: '10px 8px' }}>Wasooli (Rs)</th>
                    <th style={{ width: '15%', textAlign: 'right', padding: '10px 8px' }}>Kul Baqaya (Rs)</th>
                    <th style={{ width: '60px', textAlign: 'center', padding: '10px 4px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr
                      key={b.id || b._id}
                      style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                      onClick={() => {
                        onClose();
                        onSelectBill?.(b);
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg, rgba(0,0,0,0.02))'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                    >
                      <td style={{ padding: '10px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)' }}>
                          Bill #{b.billNo}
                        </span>
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 4 }}>
                          (Bk {b.bookNo})
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatDisplayDate(b.date)}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{b.lots?.length || 0}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        Rs {Number(b.currentBillTotal || 0).toLocaleString()}
                        {Number(b.unpaidPreviousBillsTotal || 0) > 0 && (
                          <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 500 }}>
                            +Pichla: Rs {Number(b.unpaidPreviousBillsTotal).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--warning, #d97706)', padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        Rs {Number(b.sabqaBaqaya || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--success, #059669)', padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        Rs {Number(b.totalPaymentsReceived || 0).toLocaleString()}
                        {Number(b.totalDeductions || 0) > 0 && (
                          <div style={{ fontSize: 10, color: '#f87171', fontWeight: 500 }}>
                            Katoti: -Rs {Number(b.totalDeductions).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--primary, #1e40af)', padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>
                        Rs {Number(b.grandTotalBaqaya || 0).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center', padding: '10px 4px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => {
                              onClose();
                              onSelectBill?.(b);
                            }}
                            title="View / Print Bill"
                            style={{ color: 'var(--primary, #2563eb)', cursor: 'pointer', background: 'transparent', border: 'none', padding: '2px 4px' }}
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => handleDelete(b)}
                            title="Delete Bill"
                            style={{ color: 'var(--danger, #dc2626)', cursor: 'pointer', background: 'transparent', border: 'none', padding: '2px 4px' }}
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

            {/* Mobile View: Clean stacked cards (No horizontal slide) */}
            <div className="bills-history-mobile-cards" style={{ display: 'none', flexDirection: 'column', gap: 10 }}>
              {bills.map((b) => (
                <div
                  key={b.id || b._id}
                  style={{
                    background: 'var(--card-bg, #ffffff)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    <div>
                      <strong style={{ color: 'var(--primary, #2563eb)', fontSize: 14 }}>
                        Bill #{b.billNo}
                      </strong>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                        Book {b.bookNo} · {b.lots?.length || 0} lots
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDisplayDate(b.date)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, marginBottom: 10 }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Kaam:</span>{' '}
                      <strong>Rs {Number(b.currentBillTotal || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Sabqa:</span>{' '}
                      <strong style={{ color: 'var(--warning, #d97706)' }}>Rs {Number(b.sabqaBaqaya || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Wasooli:</span>{' '}
                      <strong style={{ color: 'var(--success, #059669)' }}>Rs {Number(b.totalPaymentsReceived || 0).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Kul Baqaya:</span>{' '}
                      <strong style={{ color: 'var(--primary, #1e40af)', fontSize: 13 }}>Rs {Number(b.grandTotalBaqaya || 0).toLocaleString()}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        onClose();
                        onSelectBill?.(b);
                      }}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      👁️ View / Print
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(b)}
                      style={{ fontSize: 12, padding: '4px 10px' }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @media (max-width: 680px) {
          .bills-history-desktop-table {
            display: none !important;
          }
          .bills-history-mobile-cards {
            display: flex !important;
          }
        }
      `}</style>
    </Modal>
  );
}
