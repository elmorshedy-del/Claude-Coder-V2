// Utility to format dates in GMT+3 (used for order/day-level reporting)
export function formatLocalDate(date = new Date()) {
  const gmt3OffsetMs = 3 * 60 * 60 * 1000;
  const gmt3Date = new Date(date.getTime() + gmt3OffsetMs);
  return gmt3Date.toISOString().split('T')[0];
}
