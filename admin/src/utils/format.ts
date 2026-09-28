const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export const formatPrice = (value: number) => inr.format(Math.round(value || 0));
export const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value || 0);

export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value),
  );

export const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

/** "3 minutes ago" style, for audit logs and recent activity. */
export function timeAgo(value: string | Date) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.34524],
    ['month', 12],
    ['year', Infinity],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  let duration = -seconds;

  for (const [unit, amount] of units) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return formatter.format(Math.round(duration), 'year');
}

export const titleCase = (value: string) =>
  value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
