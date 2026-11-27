/** Shared status badge styling and filter options for Admin and Party User management pages. */
export const ACCOUNT_STATUS_BADGES = {
  approved: {
    label: 'Approved',
    bg: 'var(--success-bg, #f0fdf4)',
    color: 'var(--success, #166534)',
    border: 'var(--success, #86efac)',
  },
  pending: {
    label: 'Pending',
    bg: 'var(--warning-bg, #fffbeb)',
    color: 'var(--warning-text, #92600a)',
    border: 'var(--warning-border, #fde68a)',
  },
  rejected: {
    label: 'Rejected',
    bg: 'var(--danger-bg, #fef2f2)',
    color: 'var(--danger, #991b1b)',
    border: 'var(--danger, #fecaca)',
  },
  disabled: {
    label: 'Disabled',
    bg: 'var(--hover-bg, #f3f4f6)',
    color: 'var(--text-secondary, #4b5563)',
    border: 'var(--border, #d1d5db)',
  },
  default: {
    label: 'Unknown',
    bg: 'var(--hover-bg, #f3f4f6)',
    color: 'var(--text-secondary, #4b5563)',
    border: 'var(--border, #d1d5db)',
  },
};

export const ACCOUNT_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'rejected', label: 'Rejected' },
];

export function getAccountStatusBadge(status) {
  return ACCOUNT_STATUS_BADGES[status] || ACCOUNT_STATUS_BADGES.default;
}
