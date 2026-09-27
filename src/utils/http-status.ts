/** Maps an HTTP status code to an AresBadge severity by range: 1xx gray, 2xx green,
 *  3xx blue, 4xx orange, 5xx red. Falls back to 'secondary' for anything unrecognized. */
export function httpStatusSeverity(code: string | number): 'secondary' | 'success' | 'info' | 'warn' | 'danger' {
  const n = typeof code === 'number' ? code : parseInt(code, 10);
  if (Number.isNaN(n)) return 'secondary';
  if (n >= 100 && n < 200) return 'secondary';
  if (n >= 200 && n < 300) return 'success';
  if (n >= 300 && n < 400) return 'info';
  if (n >= 400 && n < 500) return 'warn';
  if (n >= 500 && n < 600) return 'danger';
  return 'secondary';
}
