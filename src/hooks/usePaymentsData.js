import { useState, useCallback } from 'react';
import { apiService } from '../services/api';

export const INITIAL_PAYMENTS = [];

export function usePaymentsData({ trackWrite, userRole }) {
  const [payments, setPayments] = useState(INITIAL_PAYMENTS);
  const [adminReportingPayments, setAdminReportingPayments] = useState(INITIAL_PAYMENTS);
  const [partyCrossPayments, setPartyCrossPayments] = useState(INITIAL_PAYMENTS);

  const addPayment = useCallback(
    async (p, opts = {}) => {
      const { businessOwnerId } = opts;
      const payment = await trackWrite(
        apiService.createPayment({ ...p, amount: Number(p.amount) }, businessOwnerId)
      );
      setPayments((arr) => [...arr, payment]);
      if (userRole === 'admin') {
        setAdminReportingPayments((arr) => [...arr, payment]);
      }
      if (userRole === 'party') {
        setPartyCrossPayments((arr) => [...arr, payment]);
      }
      return payment;
    },
    [trackWrite, userRole]
  );

  const deletePayment = useCallback(
    async (id, opts = {}) => {
      const { businessOwnerId } = opts;
      await trackWrite(apiService.deletePayment(id, businessOwnerId));
      const idStr = String(id);
      setPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
      if (userRole === 'admin') {
        setAdminReportingPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
      }
      if (userRole === 'party') {
        setPartyCrossPayments((arr) => arr.filter((x) => String(x.id) !== idStr));
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
    deletePayment,
  };
}
