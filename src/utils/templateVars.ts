export interface TemplateVar {
  token: string;
  label: string;
  description: string;
  group: 'project' | 'findings' | 'detections';
}

/** Top-level variables — same names as the poi-tl Word context */
export const TEMPLATE_VARS: TemplateVar[] = [
  { token: '{{project.name}}',          label: 'Project name',        description: 'Name of the current project',          group: 'project'  },
  { token: '{{project.code}}',          label: 'Project code',        description: 'Short code of the project',            group: 'project'  },
  { token: '{{organization.name}}',     label: 'Organization',        description: 'Name of the client organization',      group: 'project'  },
  { token: '{{findingsCount}}',         label: 'Total findings',      description: 'Total number of findings',             group: 'findings' },
  { token: '{{findingsCountCritical}}', label: 'Critical count',      description: 'Number of Critical severity findings', group: 'findings' },
  { token: '{{findingsCountHigh}}',     label: 'High count',          description: 'Number of High severity findings',     group: 'findings' },
  { token: '{{findingsCountMedium}}',   label: 'Medium count',        description: 'Number of Medium severity findings',   group: 'findings' },
  { token: '{{findingsCountLow}}',      label: 'Low count',           description: 'Number of Low severity findings',      group: 'findings' },
  { token: '{{findingsCountInfo}}',     label: 'Info count',          description: 'Number of Info severity findings',     group: 'findings' },
  { token: '{{detectionsCount}}',         label: 'Total detections',      description: 'Total number of detections',             group: 'detections' },
  { token: '{{detectionsCountCritical}}', label: 'Critical count',        description: 'Number of Critical severity detections', group: 'detections' },
  { token: '{{detectionsCountHigh}}',     label: 'High count',            description: 'Number of High severity detections',     group: 'detections' },
  { token: '{{detectionsCountMedium}}',   label: 'Medium count',          description: 'Number of Medium severity detections',   group: 'detections' },
  { token: '{{detectionsCountLow}}',      label: 'Low count',             description: 'Number of Low severity detections',      group: 'detections' },
  { token: '{{detectionsCountInfo}}',     label: 'Info count',            description: 'Number of Info severity detections',     group: 'detections' },
];

export interface TemplateVarContext {
  projectName?: string | null;
  projectCode?: string | null;
  orgName?: string | null;
  findingsCount?: number;
  findingsCountCritical?: number;
  findingsCountHigh?: number;
  findingsCountMedium?: number;
  findingsCountLow?: number;
  findingsCountInfo?: number;
  detectionsCount?: number;
  detectionsCountCritical?: number;
  detectionsCountHigh?: number;
  detectionsCountMedium?: number;
  detectionsCountLow?: number;
  detectionsCountInfo?: number;
}

export function resolveVars(html: string, ctx: TemplateVarContext): string {
  return html
    .replace(/\{\{project\.name\}\}/g,          ctx.projectName            ?? '—')
    .replace(/\{\{project\.code\}\}/g,          ctx.projectCode            ?? '—')
    .replace(/\{\{organization\.name\}\}/g,     ctx.orgName                ?? '—')
    .replace(/\{\{findingsCount\}\}/g,          String(ctx.findingsCount          ?? 0))
    .replace(/\{\{findingsCountCritical\}\}/g,  String(ctx.findingsCountCritical  ?? 0))
    .replace(/\{\{findingsCountHigh\}\}/g,      String(ctx.findingsCountHigh      ?? 0))
    .replace(/\{\{findingsCountMedium\}\}/g,    String(ctx.findingsCountMedium    ?? 0))
    .replace(/\{\{findingsCountLow\}\}/g,       String(ctx.findingsCountLow       ?? 0))
    .replace(/\{\{findingsCountInfo\}\}/g,      String(ctx.findingsCountInfo      ?? 0))
    .replace(/\{\{detectionsCount\}\}/g,          String(ctx.detectionsCount         ?? 0))
    .replace(/\{\{detectionsCountCritical\}\}/g,  String(ctx.detectionsCountCritical ?? 0))
    .replace(/\{\{detectionsCountHigh\}\}/g,      String(ctx.detectionsCountHigh     ?? 0))
    .replace(/\{\{detectionsCountMedium\}\}/g,    String(ctx.detectionsCountMedium   ?? 0))
    .replace(/\{\{detectionsCountLow\}\}/g,       String(ctx.detectionsCountLow      ?? 0))
    .replace(/\{\{detectionsCountInfo\}\}/g,      String(ctx.detectionsCountInfo     ?? 0));
}

export const CHART_TOKENS = {
  PIE: '{{chart:pie}}',
  BAR: '{{chart:bar}}',
} as const;

// ── Findings loop — poi-tl compatible syntax ─────────────────────────
export const FINDINGS_LOOP_START = '{{?findings}}';
export const FINDINGS_LOOP_END   = '{{/findings}}';

/** Variables available inside {{?findings}}...{{/findings}} — same keys as poi-tl */
export const FINDING_VARS: TemplateVar[] = [
  { token: '{{code}}',     label: 'Code',     description: 'Finding code (e.g. ACME-1-1)', group: 'findings' },
  { token: '{{title}}',    label: 'Title',    description: 'Finding title',                group: 'findings' },
  { token: '{{severity}}', label: 'Severity', description: 'Severity level (uppercase)',   group: 'findings' },
  { token: '{{status}}',   label: 'Status',   description: 'Status name',                  group: 'findings' },
  { token: '{{retestNote}}', label: 'Retest note', description: 'RETEST projects only — affected-asset status changes and notes recorded since this finding was linked into the retest', group: 'findings' },
];

/** Default loop template inserted when clicking "Findings loop" */
export const FINDINGS_LOOP_TEMPLATE =
  `${FINDINGS_LOOP_START}<p><strong>{{code}}</strong> — {{title}} <em>({{severity}})</em></p>${FINDINGS_LOOP_END}`;

// ── Detections loop — poi-tl compatible syntax ────────────────────────
export const DETECTIONS_LOOP_START = '{{?detections}}';
export const DETECTIONS_LOOP_END   = '{{/detections}}';

/** Variables available inside {{?detections}}...{{/detections}} — same keys as poi-tl */
export const DETECTION_VARS: TemplateVar[] = [
  { token: '{{id}}',              label: 'ID',              description: 'Detection ID',                        group: 'detections' },
  { token: '{{title}}',           label: 'Title',           description: 'Detection title',                     group: 'detections' },
  { token: '{{severity}}',        label: 'Severity',        description: 'Severity level (uppercase)',          group: 'detections' },
  { token: '{{status}}',          label: 'Status',          description: 'Status code (new/affected/fixed…)', group: 'detections' },
  { token: '{{sourceType}}',      label: 'Source',          description: 'Tool/integration that reported it',   group: 'detections' },
  { token: '{{occurrenceCount}}', label: 'Occurrences',     description: 'Times re-seen across imports',        group: 'detections' },
];

/** Default loop template inserted when clicking "Detections loop" */
export const DETECTIONS_LOOP_TEMPLATE =
  `${DETECTIONS_LOOP_START}<p><strong>{{title}}</strong> <em>({{severity}} — {{status}})</em></p>${DETECTIONS_LOOP_END}`;

// Severity order and platform colors (mirrors SeverityTag)
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

export const PLATFORM_SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#ca8a04',
  low:      '#16a34a',
  info:     '#3b82f6',
};
