import type { WorkflowNodeType } from '@/api/workflows';

/** Shared between the palette (left-border accent) and the node header background, so the two
 *  never drift apart. Three distinct hues per the palette's three groups — deliberately none of
 *  them reuse the run-status colors (green=completed, red=failed, gray=skipped, blue=waiting)
 *  so a node's own color is never confused with its execution outcome in the Runs view. */
export const NODE_TYPE_COLORS: Record<WorkflowNodeType, string> = {
  TRIGGER_MANUAL: '#6366f1',
  TRIGGER_CRON: '#6366f1',
  TRIGGER_WEBHOOK: '#6366f1',
  TRIGGER_EVENT: '#6366f1',
  TRIGGER_CALL_TOPIC: '#6366f1',
  CONDITION: '#eab308',
  ASSIGN_VARIABLE: '#eab308',
  LOOP: '#eab308',
  ACTION_AGENT_TASK: '#0d9488',
  ACTION_NOTIFICATION: '#0d9488',
  ACTION_CALL_WORKFLOW: '#0d9488',
  ACTION_WEBHOOK_CALL: '#0d9488',
  ACTION_INTEGRATION_CALL: '#0d9488',
  ACTION_MANAGE_TAGS: '#0d9488',
  ACTION_REPORT_FINDING: '#0d9488',
  ACTION_UPDATE_DETECTION_STATUS: '#0d9488',
  END: '#64748b',
};
