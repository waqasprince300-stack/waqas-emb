export const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getDateRangeStart = (range) => {
  const start = startOfToday();
  if (range === 'weekly') {
    start.setDate(start.getDate() - 6);
    return start;
  }
  if (range === 'monthly') {
    start.setMonth(start.getMonth() - 1);
    return start;
  }
  if (range === 'annually') {
    start.setFullYear(start.getFullYear() - 1);
    return start;
  }
  return null;
};

export const parseDateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const isWithinDateRange = (value, range) => {
  if (range === 'all') return true;
  const date = parseDateValue(value);
  const start = getDateRangeStart(range);
  if (!date || !start) return false;
  return date >= start;
};

export const latestDateFrom = (item, keys) => {
  let latest = null;
  keys.forEach((key) => {
    const date = parseDateValue(item?.[key]);
    if (date && (!latest || date > latest)) {
      latest = date;
    }
  });
  return latest;
};

export function DateRangeSelect({ value, onChange, style }) {
  return (
    <select
      className="form-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: 150, ...style }}
    >
      {DATE_RANGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
