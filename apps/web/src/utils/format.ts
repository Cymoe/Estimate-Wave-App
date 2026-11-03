export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * A stored day ("2026-11-03", no time) as that day where the user is. new Date()
 * reads it as midnight UTC, which in Texas is still the evening before, so
 * every such date showed one day early. Full timestamps are read as usual.
 */
export const parseDay = (value: string): Date => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
};

/** Today where the user is, as "2026-11-03", for comparing with stored days. */
export const localToday = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export const formatDate = (date: string): string => {
  return parseDay(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};