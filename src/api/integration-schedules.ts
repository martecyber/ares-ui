/** Presets for tool integration syncs (assets, vulns) — can be frequent */
export const CRON_PRESETS = [
  { label: 'Every hour',         cron: '0 * * * *'    },
  { label: 'Every 6 hours',      cron: '0 */6 * * *'  },
  { label: 'Every day at 3am',   cron: '0 3 * * *'    },
  { label: 'Every day at 8am',   cron: '0 8 * * *'    },
  { label: 'Every Monday 3am',   cron: '0 3 * * 1'    },
] as const;

/** Presets for KB external database syncs — less frequent, data changes slowly */
export const KB_CRON_PRESETS = [
  { label: 'Every day at 3am',    cron: '0 3 * * *'   },
  { label: 'Every day at midnight',cron: '0 0 * * *'   },
  { label: 'Every Monday 3am',    cron: '0 3 * * 1'   },
  { label: 'Every Sunday midnight',cron: '0 0 * * 0'  },
  { label: 'Every 1st of month',  cron: '0 3 1 * *'   },
] as const;

export function humanCron(expr: string): string {
  const all = [...CRON_PRESETS, ...KB_CRON_PRESETS];
  const preset = all.find((p) => p.cron === expr);
  return preset ? preset.label : expr;
}
