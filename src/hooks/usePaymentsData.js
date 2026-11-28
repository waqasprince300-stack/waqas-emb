import { useState, useCallback } from 'react';
import { apiService } from '../services/api';

export const INITIAL_PAYMENTS = [];

export function usePaymentsData({ trackWrite, userRole, activeBusinessOwnerId }) {
  const [payments, setPayments] = useState(INITIAL_PAYMENTS);
  const [adminReportingPayments, setAdminReportingPayments] = useState(INITIAL_PAYMENTS);
  const [partyCrossPayments, setPartyCrossPayments] = useState(INITIAL_PAYMENTS);

  const isWithinActiveScope = useCallback(
    (bizId) => {
      const target = String(bizId ?? '').trim();
      const active = String(activeBusinessOwnerId ?? '').trim();
      return !target || !active || target === active;
    },
    [activeBusinessOwnerId]
  );

  const addPayment = useCallback(
    async (p, opts = {}) => {
      const { businessOwnerId } = opts;
      const payment = await trackWrite(
        apiService.createPayment({ ...p, amount: Number(p.amount) }, businessOwnerId)
      );
      if (isWithinActiveScope(payment?.businessOwnerId ?? businessOwnerId)) {
        setPayments((arr) => [...arr, payment]);
      }
      if (userRole === 'admin') {
        setAdminReportingPayments((arr) => [...arr, payment]);
      }
      if (userRole === 'party') {
        setPartyCrossPayments((arr) => [...arr, payment]);
      }
      return payment;
    },
    [trackWrite, userRole, isWithinActiveScope]
  );

  const updatePayment = useCallback(
    async (id, patch, opts = {}) => {
      const { businessOwnerId } = opts;
      const updated = await trackWrite(
        apiService.updatePayment(id, patch, businessOwnerId)
      );
      const idStr = String(id);
      const applyUpdate = (arr) =>
        arr.map((x) => (String(x.id || x._id) === idStr ? { ...x, ...updated } : x));
      if (isWithinActiveScope(updated?.businessOwnerId ?? businessOwnerId)) {
        setPayments(applyUpdate);
      } else {
        setPayments((arr) => arr.filter((x) => String(x.id || x._id) !== idStr));
      }
      if (userRole === 'admin') {
        setAdminReportingPayments(applyUpdate);
      }
      if (userRole === 'party') {
        setPartyCrossPayments(applyUpdate);
      }
      return updated;
    },
    [trackWrite, userRole, isWithinActiveScope]
  );

  const deletePayment = useCallback(
    async (id, opts = {}) => {
      const { businessOwnerId } = opts;
      await trackWrite(apiService.deletePayment(id, businessOwnerId));
      const idStr = String(id);
      setPayments((arr) => arr.filter((x) => String(x.id || x._id) !== idStr));
      if (userRole === 'admin') {
        setAdminReportingPayments((arr) => arr.filter((x) => String(x.id || x._id) !== idStr));
      }
      if (userRole === 'party') {
        setPartyCrossPayments((arr) => arr.filter((x) => String(x.id || x._id) !== idStr));
      }
    },
    [trackWrite, userRole]
  );

  return {
    payments,
    setPayments,
    adminReportingPayments,
    setAdminReportingPayments,
    partyCrossPayments,
    setPartyCrossPayments,
    addPayment,
    updatePayment,
    deletePayment,
  };
}
