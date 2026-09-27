/**
 * Format a duration in milliseconds as a short human-readable string.
 *   null / 0          → "—"
 *   < 1s              → "Ns" with 1 decimal
 *   < 1min            → "Ns"
 *   < 1h              → "Nm Ns" (s only when nonzero)
 *   ≥ 1h              → "Nh Nm"
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—';
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
