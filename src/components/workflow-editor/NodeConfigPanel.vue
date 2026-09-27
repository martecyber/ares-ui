<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import ToggleSwitch from 'primevue/toggleswitch';
import AutoComplete from 'primevue/autocomplete';
import AqlConditionInput from './AqlConditionInput.vue';
import AqlFieldPicker from './AqlFieldPicker.vue';
import type { AqlVariableRef } from '@/utils/aqlAutocomplete';
import { aqlApi } from '@/api/aql';
import { tagsApi, type Tag } from '@/api/tags';
import { DETECTION_STATUSES, detectionStatusLabel } from '@/api/detections';
import { projectsApi } from '@/api/projects';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import type { MessagingIntegration } from '@/api/messaging';
import { kbEmailTemplatesApi, type EmailTemplate } from '@/api/kb-email-templates';
import { reportTemplatesApi, type ReportTemplate } from '@/api/reports';
import type { WorkflowGraphNode, WorkflowGraphEdge, WorkflowScopeKind } from '@/api/workflows';
import { agentPoolsApi, type AgentPool } from '@/api/agent-pools';
import { agentTasksApi, type AgentToolSpec } from '@/api/agent-tasks';
import { projectRulesApi, type ProjectRule } from '@/api/project-rules';
import { useEngagementRuleLocks } from '@/composables/useEngagementRuleLocks';
import AgentToolPicker from '@/components/AgentToolPicker.vue';
import IntegrationTypePicker from '@/components/IntegrationTypePicker.vue';
import CreateTagDialog from '@/components/CreateTagDialog.vue';
import ToolConfigForm from '@/components/ToolConfigForm.vue';
import { workflowsApi, webhookPublicUrl, type WebhookInfo, type IntegrationActionCatalogEntry } from '@/api/workflows';
import { useToast } from 'primevue/usetoast';
import { confirmDialog } from '@/composables/useConfirmDialog';

const props = defineProps<{
  node: WorkflowGraphNode; scopeKind: WorkflowScopeKind; integrations: MessagingIntegration[];
  allNodes?: WorkflowGraphNode[]; allEdges?: WorkflowGraphEdge[]; projectId?: number;
  integrationActionCatalog?: IntegrationActionCatalogEntry[];
  workflowId?: number; scopeId?: number;
  /** True for a locked (managed-by-legacy-scheduler) workflow — the body renders normally so its
   *  current config is still inspectable, but is inert (no field edits, no delete). */
  readonly?: boolean;
}>();
const emit = defineEmits<{ 'update:config': [Record<string, unknown>]; 'update:label': [string]; close: []; delete: [] }>();
const toast = useToast();

// ── Resizable width: dragging the panel's left edge — persisted so it stays put across nodes/
// sessions rather than snapping back to the default every time a different node is selected.
const PANEL_WIDTH_KEY = 'ares.workflowEditor.nodePanelWidth';
const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 900;
const panelWidth = ref(Number(localStorage.getItem(PANEL_WIDTH_KEY)) || 320);
let resizeStartX = 0;
let resizeStartWidth = 0;

function onResizeMove(e: MouseEvent) {
  const next = resizeStartWidth - (e.clientX - resizeStartX);
  panelWidth.value = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, next));
}
function onResizeEnd() {
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', onResizeEnd);
  localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth.value));
}
function onResizeStart(e: MouseEvent) {
  resizeStartX = e.clientX;
  resizeStartWidth = panelWidth.value;
  window.addEventListener('mousemove', onResizeMove);
  window.addEventListener('mouseup', onResizeEnd);
  e.preventDefault();
}
// If the panel unmounts mid-drag (e.g. the node gets deleted via the keyboard while the mouse
// button is still down), a mouseup over this document may never fire — onResizeEnd's own
// removeEventListener calls never run, leaking two window-level listeners whose closure keeps
// this whole component instance alive, permanently, on every future mousemove anywhere in the
// app. onResizeEnd() is safe to call unconditionally (removing an already-detached listener is a
// no-op) so this alone guarantees cleanup regardless of how the drag ended.
onUnmounted(onResizeEnd);

// ── ACTION_AGENT_TASK: pools + per-tool config, mirroring AgentTaskFormDialog ──────────────
const pools = ref<AgentPool[]>([]);
const agentTools = ref<AgentToolSpec[]>([]);
watch(() => props.projectId, async (pid) => {
  if (!pid) { pools.value = []; agentTools.value = []; return; }
  try { pools.value = await agentPoolsApi.listForProject(pid); }
  catch { pools.value = []; }
  try { agentTools.value = await agentTasksApi.tools(pid); }
  catch { agentTools.value = []; }
}, { immediate: true });

// ── ACTION_AGENT_TASK: Rules of Engagement — same project-level rules AgentTaskFormDialog.vue
// surfaces to an operator creating a task manually. Every AgentTaskService.createAll() caller
// (manual, schedule, workflow) already enforces headers/rate-limit/max-concurrency and the
// time-window block identically server-side (EngagementRuleEnforcer#applyToTaskArgs) — this is
// purely so a workflow author isn't flying blind while wiring the node, and so nacProfile /
// bypassTimeWindow have somewhere to be set instead of always going in as null/false. The
// per-tool rate-limit/header/concurrency locks (ruleRateLimitRps/ruleHeadersRecord/
// ruleMaxConcurrency below) read from this same list — same derivation AgentTaskFormDialog.vue
// uses for a manually-created task, see useEngagementRuleLocks.
const projectRules = ref<ProjectRule[]>([]);
watch(() => props.projectId, async (pid) => {
  if (!pid) { projectRules.value = []; return; }
  try { projectRules.value = (await projectRulesApi.list(pid)).filter((r) => r.enabled); }
  catch { projectRules.value = []; }
}, { immediate: true });
const hasTimeWindowRule = computed(() => projectRules.value.some((r) => r.ruleType === 'time_window'));
const { ruleRateLimitRps, ruleMaxConcurrency, ruleHeadersRecord } = useEngagementRuleLocks(projectRules);

// The AQL-based targets query is AND-restricted (server-side, in TargetResolver) to the
// selected tool's own validAssetTypes — empty means the tool doesn't restrict asset types at all.
const selectedToolAssetTypes = computed(() =>
  agentTools.value.find((t) => t.toolId === local.value.tool)?.validAssetTypes ?? []);
const currentAgentToolSpec = computed(() =>
  agentTools.value.find((t) => t.toolId === local.value.tool) ?? null);

// ── ACTION_AGENT_TASK targets: AQL query (existing) or an already-assigned asset-typed variable
// (WorkflowRunService#resolveWorkflowVariableTargets) — either way, the tool's own validAssetTypes
// automatically restricts which assets actually become targets; the operator never picks that set
// manually for the variable path (see selectedToolAssetTypes' own comment for the AQL path, which
// still needs it spelled out since TargetResolver composes it into the AQL query it runs).
const AGENT_TASK_TARGET_SOURCES = [
  { label: 'AQL query', value: 'aql' },
  { label: 'Variable', value: 'variable' },
];
const agentTaskVariableOptions = computed(() => ancestorNodes.value
  .filter((n) => n.type === 'ASSIGN_VARIABLE' && (n.data.config as any)?.variableType === 'asset')
  .map((n) => (n.data.config as any)?.variableName as string)
  .filter(Boolean));

/** Generic tool-args bag, keyed by AgentToolSpec.Field#key — replaces the 10 typed
 *  per-tool config refs. ToolConfigForm renders and mutates this directly. */
const agentTaskArgs = ref<Record<string, unknown>>({});
const agentToolConfigFormRef = ref<InstanceType<typeof ToolConfigForm> | null>(null);

/** Same mapping as AgentTaskFormDialog.hydrateFromArgs — populates the generic args bag
 *  from the node's stored `argsTemplate`. Targets are an AQL query (`targetsFrom.type ===
 *  'asset_aql'`), not literal strings — see TargetResolver.resolveAssetAql on the backend.
 *  Tool args round-trip as-is (every key IS an AgentToolSpec.Field#key already). */
function hydrateAgentTaskArgs(args: Record<string, any>) {
  const tf = args.targetsFrom;
  if (tf && tf.type === 'workflow_variable' && typeof tf.variableName === 'string') {
    local.value.targetSource = 'variable';
    local.value.targetsVariableName = tf.variableName;
    local.value.targetsAql = '';
  } else {
    local.value.targetSource = 'aql';
    local.value.targetsAql = tf && tf.type === 'asset_aql' && typeof tf.aql === 'string' ? tf.aql : '';
    local.value.targetsVariableName = '';
  }

  const generic: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'targetsFrom') continue;
    generic[k] = v;
  }
  agentTaskArgs.value = generic;
}

/** Same mapping as AgentTaskFormDialog.buildArgs — flattens the generic args bag back into
 *  the `argsTemplate` JSON object stored on the node. Targets resolve server-side at run time
 *  from an AQL query (see TargetResolver's `asset_aql` selector) rather than being authored here. */
function buildAgentTaskArgs(): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (local.value.targetSource === 'variable' && local.value.targetsVariableName) {
    // No assetTypes here — WorkflowRunService derives the tool's validAssetTypes itself at run
    // time from the tool name already on this node, so it's never stale even if the tool's own
    // asset-type support changes later without this node being resaved.
    args.targetsFrom = { type: 'workflow_variable', variableName: local.value.targetsVariableName };
  } else if (local.value.targetsAql) {
    args.targetsFrom = {
      type: 'asset_aql',
      aql: local.value.targetsAql,
      assetTypes: selectedToolAssetTypes.value,
    };
  }

  for (const [k, v] of Object.entries(agentTaskArgs.value)) {
    if (v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0)) continue;
    args[k] = v;
  }
  return args;
}

// Only 'detection' has in-memory value resolvers wired on the backend today
// (DetectionAqlRegistry) — other entities will 400 at save time with a clear message until
// their registries grow resolvers too (AqlInMemoryEvaluator rejects unresolvable fields, it
// doesn't silently misevaluate them). Also scope-gated: Asset/Detection/Finding always belong
// to a specific project, so a platform-scoped workflow has no project context to resolve them
// against — WorkflowGraphValidator rejects these at save time for platform scope too.
const ALL_CONDITION_ENTITIES = [
  { label: 'Detection', value: 'detection' },
  { label: 'Finding', value: 'finding' },
  { label: 'Asset', value: 'asset' },
];
const conditionEntities = computed(() => props.scopeKind === 'platform' ? [] : ALL_CONDITION_ENTITIES);

// COUNT_COMPARE — CONDITION's second mode: compare two *counts* (an AQL query's matching row
// count, an already-assigned ASSIGN_VARIABLE variable's item count, or a literal number) with a
// numeric operator, instead of matching one bound entity's fields. Mirrors
// WorkflowGraphValidator#validateCountOperand's three operand kinds exactly.
const CONDITION_MODES = [
  { label: 'Entity match', value: 'ENTITY_MATCH' },
  { label: 'Count compare', value: 'COUNT_COMPARE' },
];
const COUNT_COMPARE_SIDES = ['left', 'right'] as const;
const COUNT_COMPARE_KINDS = [
  { label: 'AQL query count', value: 'QUERY' },
  { label: 'Variable item count', value: 'VARIABLE' },
  { label: 'Number', value: 'LITERAL' },
];
const COUNT_COMPARE_OPERATORS = [
  { label: '=', value: 'EQ' },
  { label: '≠', value: 'NEQ' },
  { label: '>', value: 'GT' },
  { label: '≥', value: 'GTE' },
  { label: '<', value: 'LT' },
  { label: '≤', value: 'LTE' },
];

function defaultCountOperand() {
  // Unlike ENTITY_MATCH's in-memory conditionEntities, a QUERY-kind count operand is a live AQL
  // COUNT query — every AQL-registered entity is fair game (CVE/CWE/CAPEC/ATT&CK/OWASP/Exploit
  // included), so it shares assignVariableEntityOptions' dynamic, scope-aware list instead.
  return { kind: 'QUERY', entityType: assignVariableEntityOptions.value[0]?.value ?? '', aql: '' };
}

// Any ASSIGN_VARIABLE ancestor is eligible here (unlike ACTION_MANAGE_TAGS's manageTagsVariableOptions,
// which restricts to taggable entity types) — a count comparison only cares about the item count,
// so every variableType (entity or scalar) qualifies.
const countCompareVariableOptions = computed(() => ancestorNodes.value
  .filter((n) => n.type === 'ASSIGN_VARIABLE')
  .map((n) => (n.data.config as any)?.variableName as string)
  .filter(Boolean));

function onCountOperandKindChange(side: 'left' | 'right') {
  const kind = (local.value[side] ?? {}).kind;
  if (kind === 'QUERY') local.value[side] = defaultCountOperand();
  else if (kind === 'VARIABLE') local.value[side] = { kind: 'VARIABLE', variableName: countCompareVariableOptions.value[0] ?? '' };
  else local.value[side] = { kind: 'LITERAL', value: 0 };
  commit();
}

// A single dropdown of concrete, nameable events — not a generic entityType+event pair. Mirrors
// WorkflowGraphValidator.EVENT_CODES_BY_SCOPE exactly, including its own scope-gating rationale:
// each level watches what actually lives at (or one level below) that level, not everything
// reachable underneath it the way ACTION_CALL_WORKFLOW's broadcast does — a platform-wide workflow
// firing on *every* detection/finding/asset across every client would be enormous noise, whereas
// an organization onboarding or a CVE entering a KEV catalog are exactly the kind of low-frequency,
// structural events a platform-level workflow should watch instead. `fields` mirrors
// WorkflowEventDispatcher's payload for that exact code (its *Snapshot(...) methods, plus whatever
// extra fields a specific code like cve.kev_added/cve.poc_added adds on top) — shown at the bottom
// of this node's own panel so an admin sees immediately what it will hand off downstream.
interface EventCodeDef { code: string; label: string; scopes: WorkflowScopeKind[]; fields: string[]; }
const CVE_BASE_FIELDS = ['cveId', 'severity', 'cvssScore', 'kevListed', 'vulncheckKevListed', 'exploitCount'];
const EVENT_CODE_CATALOG: EventCodeDef[] = [
  { code: 'organization.created', label: 'Organization: Created', scopes: ['platform'], fields: ['id', 'name', 'slug', 'status'] },
  { code: 'organization.updated', label: 'Organization: Updated', scopes: ['platform'], fields: ['id', 'name', 'slug', 'status'] },
  { code: 'finding_template.created', label: 'Finding Template (KB): Created', scopes: ['platform'], fields: ['id', 'title', 'severity'] },
  { code: 'finding_template.updated', label: 'Finding Template (KB): Updated', scopes: ['platform'], fields: ['id', 'title', 'severity'] },
  { code: 'finding_template.deleted', label: 'Finding Template (KB): Deleted', scopes: ['platform'], fields: ['id'] },
  { code: 'cve.created', label: 'CVE (external DB): Created', scopes: ['platform'], fields: CVE_BASE_FIELDS },
  { code: 'cve.updated', label: 'CVE (external DB): Updated', scopes: ['platform'], fields: CVE_BASE_FIELDS },
  { code: 'cve.kev_added', label: 'CVE: Added to KEV catalog', scopes: ['platform'], fields: ['cveId', 'catalog', 'dateAdded', ...CVE_BASE_FIELDS] },
  { code: 'cve.poc_added', label: 'CVE: Got a new PoC', scopes: ['platform'], fields: ['cveId', 'exploitId', 'exploitName', 'exploitLink'] },
  { code: 'project.created', label: 'Project: Created', scopes: ['organization'], fields: ['id', 'name', 'code', 'organizationId'] },
  { code: 'project.updated', label: 'Project: Updated', scopes: ['organization'], fields: ['id', 'name', 'code', 'organizationId'] },
  { code: 'project.deleted', label: 'Project: Deleted', scopes: ['organization'], fields: ['id'] },
  { code: 'detection.created', label: 'Detection: Created', scopes: ['organization', 'project'], fields: ['id', 'title', 'severity', 'severityLabel', 'severityColor', 'status', 'projectId', 'assetId'] },
  { code: 'detection.updated', label: 'Detection: Updated', scopes: ['organization', 'project'], fields: ['id', 'title', 'severity', 'severityLabel', 'severityColor', 'status', 'projectId', 'assetId'] },
  { code: 'detection.deleted', label: 'Detection: Deleted', scopes: ['organization', 'project'], fields: ['id'] },
  { code: 'finding.created', label: 'Finding: Created', scopes: ['organization', 'project'], fields: ['id', 'title', 'severity', 'severityLabel', 'severityColor', 'affections', 'statusId', 'projectId', 'dueDate'] },
  { code: 'finding.updated', label: 'Finding: Updated', scopes: ['organization', 'project'], fields: ['id', 'title', 'severity', 'severityLabel', 'severityColor', 'affections', 'statusId', 'projectId', 'dueDate'] },
  { code: 'finding.deleted', label: 'Finding: Deleted', scopes: ['organization', 'project'], fields: ['id'] },
  { code: 'asset.created', label: 'Asset: Created', scopes: ['organization', 'project'], fields: ['id', 'code', 'type', 'identifier', 'organizationId'] },
  { code: 'asset.updated', label: 'Asset: Updated', scopes: ['organization', 'project'], fields: ['id', 'code', 'type', 'identifier', 'organizationId'] },
  { code: 'asset.deleted', label: 'Asset: Deleted', scopes: ['organization', 'project'], fields: ['id'] },
];
const eventCodeOptions = computed(() =>
  EVENT_CODE_CATALOG.filter((e) => e.scopes.includes(props.scopeKind)).map((e) => ({ label: e.label, value: e.code })));

// WorkflowEventDispatcher keys the fired entity's snapshot by its own type — not a fixed
// "entity" — derived from the eventCode's own prefix up to the first '.' (e.g. "detection.created"
// → trigger.detection.*, "cve.kev_added" → trigger.cve.*). Same derivation, client-side.
function entityTypeOfEventCode(code: string | undefined) {
  return code?.split('.')[0];
}

// Takes an explicit eventCode rather than reading local.value.eventCode directly, since this is
// used two ways: (a) for the currently-edited TRIGGER_EVENT node itself ("This node exports",
// where local.value IS that node's own config), and (b) for an ANCESTOR TRIGGER_EVENT node feeding
// a downstream node's "Available here" list, where local.value is the downstream node's own
// (unrelated) config and the ancestor's own eventCode must be passed in instead.
function triggerEventContextItems(eventCode: string | undefined): ContextVarItem[] {
  const base: ContextVarItem[] = [
    { ref: 'trigger.eventCode', display: '{{trigger.eventCode}}', label: 'Event code', type: 'string', description: '' },
    { ref: 'trigger.entityId', display: '{{trigger.entityId}}', label: 'Entity id', description: '' },
  ];
  const def = EVENT_CODE_CATALOG.find((e) => e.code === eventCode);
  const entityType = entityTypeOfEventCode(eventCode);
  const fields = def?.fields ?? [];
  if (!entityType) return base;
  return [
    ...base,
    { ref: `trigger.${entityType}`, display: `{{trigger.${entityType}}}`, label: 'Whole entity', type: entityType, insertable: false, description: "Not a template value by itself — {{...}} only resolves single fields. Use one of the fields below instead." },
    ...fields.map((f) => ({ ref: `trigger.${entityType}.${f}`, display: `{{trigger.${entityType}.${f}}}`, label: f, description: '' })),
  ];
}

const triggerEventOwnContextItems = computed<ContextVarItem[]>(() => triggerEventContextItems(local.value.eventCode));

// ASSIGN_VARIABLE uses the real DB-query AQL path (not the in-memory evaluator CONDITION uses),
// so it isn't limited to detection/finding/asset — every AQL-registered entity is fetched once
// (session-cached by aqlApi) and offered as a source's entity type. asset/finding/detection stay
// gated to non-platform scope client-side (mirrors WorkflowGraphValidator; the backend is the
// actual enforcement) since they always belong to a specific project.
const PROJECT_SCOPED_ASSIGN_VARIABLE_ENTITIES = new Set(['asset', 'finding', 'detection']);
const SCALAR_VARIABLE_TYPES = [
  { label: 'String', value: 'string' },
  { label: 'Number', value: 'number' },
  { label: 'Date', value: 'date' },
  { label: 'Boolean', value: 'boolean' },
];
const combineModeOptions = [
  { label: 'Union', value: 'union' },
  { label: 'Intersection', value: 'intersection' },
];

const END_RESULT_OPTIONS = [
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];

// ASSIGN_VARIABLE's optional cap on the final combined/deduped list — applied once, after
// union/intersection (see WorkflowRunService#applyVariableLimit), never per-source. For
// asset/finding/detection, "field" is restricted to that service's own fixed sort-key vocabulary
// (WorkflowGraphValidator#validateAssignVariableLimit) since almost nothing else is resolvable
// in-memory against the DTOs listByAql returns — the AqlFieldPicker used for scalar-projection
// sources isn't reusable here for those three entity types.
const ASSET_LIMIT_SORT_KEYS = [
  { label: 'Identifier', value: 'identifier' }, { label: 'Type', value: 'type' },
  { label: 'Code', value: 'code' }, { label: 'Created at', value: 'createdat' },
];
const FINDING_LIMIT_SORT_KEYS = [
  { label: 'Title', value: 'title' }, { label: 'Priority', value: 'priority' },
  { label: 'Due date', value: 'duedate' }, { label: 'Reported at', value: 'reportedat' },
  { label: 'Updated at', value: 'updatedat' }, { label: 'Created at', value: 'createdat' },
];
const DETECTION_LIMIT_SORT_KEYS = [
  { label: 'Severity', value: 'severity' }, { label: 'Title', value: 'title' },
  { label: 'Last seen', value: 'lastseen' }, { label: 'Status', value: 'status' },
  { label: 'Source', value: 'source' }, { label: 'Created at', value: 'createdat' },
];
const FIXED_LIMIT_SORT_KEYS: Record<string, { label: string; value: string }[]> = {
  asset: ASSET_LIMIT_SORT_KEYS, finding: FINDING_LIMIT_SORT_KEYS, detection: DETECTION_LIMIT_SORT_KEYS,
};
const LIMIT_STRATEGIES = [
  { label: 'Order by field', value: 'ORDER' },
  { label: 'Random', value: 'RANDOM' },
];
const LIMIT_DIRECTIONS = [
  { label: 'Ascending', value: 'ASC' },
  { label: 'Descending', value: 'DESC' },
];

function fixedLimitSortKeys(variableType: string | undefined) {
  return variableType ? FIXED_LIMIT_SORT_KEYS[variableType] : undefined;
}

function toggleAssignVariableLimit(enabled: boolean) {
  if (enabled) local.value.limit = { count: 50, strategy: 'ORDER', field: null, direction: 'ASC' };
  else delete local.value.limit;
  commit();
}

const assignVariableAllEntities = ref<string[]>([]);
aqlApi.entities().then((names) => { assignVariableAllEntities.value = names; }).catch(() => {});

const assignVariableEntityOptions = computed(() =>
  assignVariableAllEntities.value
    .filter((e) => props.scopeKind !== 'platform' || !PROJECT_SCOPED_ASSIGN_VARIABLE_ENTITIES.has(e))
    .map((e) => ({ label: e, value: e })));

// A "Variable type" Select grouped into entity types (whole matching rows) vs scalar types
// (every source must project a single field down to this type) — see WorkflowGraphValidator
// #validateAssignVariable for the exact rule this mirrors.
const assignVariableTypeGroups = computed(() => [
  { label: 'Entity', items: assignVariableEntityOptions.value },
  { label: 'Scalar', items: SCALAR_VARIABLE_TYPES },
]);

function isScalarVariableType(t: string | undefined) {
  return SCALAR_VARIABLE_TYPES.some((s) => s.value === t);
}

function addAssignVariableSource() {
  if (!Array.isArray(local.value.sources)) local.value.sources = [];
  local.value.sources.push({ entityType: assignVariableEntityOptions.value[0]?.value ?? '', aql: '', field: null });
  commit();
}

function removeAssignVariableSource(idx: number) {
  (local.value.sources as any[]).splice(idx, 1);
  commit();
}

// ── ACTION_MANAGE_TAGS: adds/removes tags on the entities held by an ASSIGN_VARIABLE variable ──
const TAGGABLE_VARIABLE_TYPES = new Set(['asset', 'detection', 'finding', 'exploit', 'finding_template']);

// Only variables this node could actually reach (true ancestors, see ancestorNodes below) AND
// whose variableType is one the shared tag catalog attaches to — mirrors WorkflowGraphValidator
// #validateManageTags' own cross-check, just computed client-side for the picker.
const manageTagsVariableOptions = computed(() => ancestorNodes.value
  .filter((n) => n.type === 'ASSIGN_VARIABLE' && TAGGABLE_VARIABLE_TYPES.has((n.data.config as any)?.variableType))
  .map((n) => (n.data.config as any).variableName as string));

const manageTagsCatalog = ref<Tag[]>([]);
async function loadManageTagsCatalog() {
  try {
    if (props.scopeKind === 'platform') {
      manageTagsCatalog.value = await tagsApi.listPlatform();
    } else if (props.scopeKind === 'organization') {
      manageTagsCatalog.value = props.scopeId != null ? await tagsApi.list(props.scopeId) : [];
    } else {
      // project scope: scopeId is the project id, not an org id — tags are always an
      // organization's catalog, so resolve the project's own organization first.
      const projectId = props.scopeId ?? props.projectId;
      if (projectId == null) { manageTagsCatalog.value = []; return; }
      const project = await projectsApi.get(projectId);
      manageTagsCatalog.value = await tagsApi.list(project.organizationId);
    }
  } catch {
    manageTagsCatalog.value = [];
  }
}

// Shared by every "Add tags"/"Remove tags" picker on this panel (the top-level ACTION_MANAGE_TAGS
// node and any LOOP body block) — one dialog, one catalog, so a tag created from either spot is
// immediately selectable everywhere else too.
const showCreateTagDialog = ref(false);
function onTagCreated(tag: Tag) {
  manageTagsCatalog.value = [...manageTagsCatalog.value, tag].sort((a, b) => a.name.localeCompare(b.name));
}

// ── ACTION_UPDATE_DETECTION_STATUS: sets the status of every detection held by an ASSIGN_VARIABLE
// variable (e.g. auto-dismissing detections an upstream CONDITION/AQL query matched) — see
// WorkflowGraphValidator#validateUpdateDetectionStatus/WorkflowRunService#executeUpdateDetectionStatus.
// Unlike manageTagsVariableOptions above, only "detection" qualifies — status is detection-
// specific, not shared across entity types the way tags are. Every status is offered regardless
// of any target's current one: transition legality depends on each individual detection's
// current status (unknown here, since the variable can hold a mix), so — same call
// WorkflowGraphValidator itself makes — that check happens at run time, not in this picker.
const updateDetectionStatusVariableOptions = computed(() => ancestorNodes.value
  .filter((n) => n.type === 'ASSIGN_VARIABLE' && (n.data.config as any)?.variableType === 'detection')
  .map((n) => (n.data.config as any).variableName as string));
const detectionStatusOptions = DETECTION_STATUSES.map((s) => ({ value: s, label: detectionStatusLabel(s) }));

// ── LOOP: runs the real graph nodes wired to its "loop_body" output once per item held by an
// already-assigned ASSIGN_VARIABLE variable, closing each iteration via a feedback edge the user
// draws back into this node — see WorkflowNodeType#LOOP and WorkflowRunService#advance for the
// full redesign. The variable picker is unrestricted (like countCompareVariableOptions, any
// ASSIGN_VARIABLE ancestor qualifies) since the body can now be any node type, not just
// Manage-tags/Notification blocks — this node's own config is just the variable + error policy;
// everything about what actually runs lives in the graph itself.
const loopVariableOptions = computed(() => ancestorNodes.value
  .filter((n) => n.type === 'ASSIGN_VARIABLE')
  .map((n) => (n.data.config as any)?.variableName as string)
  .filter(Boolean));

const loopBodyHint = 'The body itself is wired on the canvas: connect this node\'s "loop" output to '
  + 'whatever should run each iteration, and connect the end of that chain back to this node to '
  + 'close the loop. Its "done" output fires once, after the last item (or immediately, if the '
  + 'variable is empty). Reference the current item with {{loop.item.<field>}}, its position with '
  + '{{loop.index}} (0-based), and the total count with {{loop.count}} in any body node\'s own fields.';

// ── ACTION_NOTIFICATION: severity drives the color accent on rich transports (Discord embed
// side-bar, Teams MessageCard, Slack attachment strip) — see NotificationMessage.colorRgb().
const notificationSeverityOptions = [
  { label: 'None (default accent)', value: null, color: '#4141A2' },
  { label: 'Critical', value: 'critical', color: '#EF4444' },
  { label: 'High', value: 'high', color: '#F97316' },
  { label: 'Medium', value: 'medium', color: '#EAB308' },
  { label: 'Low', value: 'low', color: '#22C55E' },
  { label: 'Info', value: 'info', color: '#3B82F6' },
];

// Only email-kind integrations get To/CC/BCC — every other transport's destination is baked into
// the integration's own config (see NotificationMessage's doc comment). Plain chat-style
// notification otherwise, same as every other kind — rich HTML report content lives in
// ACTION_REPORT_FINDING instead, not here (see [[report_finding_email_redesign]]).
const selectedNotificationIntegration = computed(() =>
  props.integrations.find((i) => i.id === local.value.integrationId) ?? null);
const isEmailNotificationIntegration = computed(() =>
  selectedNotificationIntegration.value?.kind === 'email');

// Shared by ACTION_REPORT_FINDING's email mode (below) and formerly by ACTION_NOTIFICATION.
const emailTemplates = ref<EmailTemplate[]>([]);
let emailTemplatesLoaded = false;
async function loadEmailTemplates() {
  if (emailTemplatesLoaded) return;
  emailTemplatesLoaded = true;
  try {
    const r = await kbEmailTemplatesApi.list({ size: 200 });
    emailTemplates.value = r.items ?? [];
  } catch { /* picker just stays empty — not fatal to editing the rest of the node */ }
}

// ── ACTION_REPORT_FINDING ────────────────────────────────────────────────────
const reportFindingModeOptions = [
  { label: 'Document (DOCX)', value: 'document' },
  { label: 'Email', value: 'email' },
];
const emailIntegrations = computed(() => props.integrations.filter((i) => i.kind === 'email'));
const reportTemplates = ref<ReportTemplate[]>([]);
let reportTemplatesLoaded = false;
async function loadReportTemplates() {
  if (reportTemplatesLoaded) return;
  reportTemplatesLoaded = true;
  try {
    reportTemplates.value = await reportTemplatesApi.list();
  } catch { /* picker just stays empty — not fatal to editing the rest of the node */ }
}

// ── ACTION_INTEGRATION_CALL: Integration type → Instance → Action, entirely driven by
// integrationActionCatalog (the backend's IntegrationActionRegistry) — no hardcoded list here,
// so a newly registered handler/action just appears once the catalog includes it. ─────────────
const integrationCallTypeOptions = computed(() =>
  (props.integrationActionCatalog ?? []).map((e) => ({ label: e.typeLabel, value: e.type })));
const selectedIntegrationCallEntry = computed(() =>
  (props.integrationActionCatalog ?? []).find((e) => e.type === local.value.integrationType));
const integrationCallInstanceOptions = computed(() =>
  (selectedIntegrationCallEntry.value?.instances ?? []).map((i) => ({ label: i.label, value: i.id })));
const integrationCallActionOptions = computed(() =>
  (selectedIntegrationCallEntry.value?.actions ?? []).map((a) => ({ label: a.label, value: a.code })));
function onIntegrationCallTypeChange() {
  // A different type invalidates whatever instance/action were picked for the old one.
  local.value.integrationId = null;
  local.value.action = null;
  commit();
}
// Same "raw {{...}} in template text breaks Vue's compiler" reason as callWorkflowParamsHint.
const integrationCallParamsHint =
  "Each row's name is a parameter the chosen action reads (e.g. a Caido action needs " +
  "caidoProjectId) — check the action's own docs for which names it expects. The value can be " +
  "static text or a variable from this workflow's own context, e.g. {{trigger.entityId}}.";

// ── TRIGGER_WEBHOOK: fetch the provisioned URL/secret — 404s until the workflow has been
// saved at least once with this node, since the endpoint is provisioned on save, not on
// adding the node to the (unsaved) canvas. ─────────────────────────────────────────────────
const webhookInfo = ref<WebhookInfo | null>(null);
const webhookLoading = ref(false);
const webhookUnsaved = ref(false);
const webhookSecretVisible = ref(false);
const webhookRegenerating = ref(false);

async function loadWebhookInfo() {
  webhookInfo.value = null;
  webhookUnsaved.value = false;
  webhookSecretVisible.value = false;
  if (!props.workflowId) { webhookUnsaved.value = true; return; }
  webhookLoading.value = true;
  try {
    webhookInfo.value = await workflowsApi.getWebhookInfo(props.workflowId, props.node.id);
  } catch {
    webhookUnsaved.value = true;
  } finally {
    webhookLoading.value = false;
  }
}

async function regenerateWebhookSecret() {
  if (!props.workflowId) return;
  const ok = await confirmDialog({
    header: 'Regenerate secret',
    message: 'The URL stays the same, but the signing secret changes — the external caller will need reconfiguring with the new secret before its requests are accepted again.',
  });
  if (!ok) return;
  webhookRegenerating.value = true;
  try {
    webhookInfo.value = await workflowsApi.regenerateWebhookSecret(props.workflowId, props.node.id);
    webhookSecretVisible.value = false;
    toast.add({ severity: 'success', summary: 'Secret regenerated', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to regenerate secret', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    webhookRegenerating.value = false;
  }
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ severity: 'success', summary: `${label} copied`, life: 2000 });
  } catch {
    toast.add({ severity: 'error', summary: `Failed to copy ${label.toLowerCase()}`, life: 3000 });
  }
}

// ── ACTION_CALL_WORKFLOW: always a topic broadcast — one matching subscriber or several go
// through the exact same field, there's no separate "direct" mode to pick a target from. The
// topic input autocompletes against every topic already reachable (per the backend's own vertical
// hierarchy rule) from this workflow's scope, so an admin adding a subscriber can see what's
// already in use instead of having to go check the broadcaster's config by hand — but it's still
// free text, since the whole point of topics is a subscriber can exist before its topic does.
const topicSuggestions = ref<string[]>([]);
const allReachableTopics = ref<string[]>([]);
async function loadReachableTopics() {
  if (props.scopeId == null) { allReachableTopics.value = []; return; }
  try {
    allReachableTopics.value = await workflowsApi.reachableTopics(props.scopeKind, props.scopeId);
  } catch {
    allReachableTopics.value = [];
  }
}
function filterTopicSuggestions(query: string) {
  const q = query.trim().toLowerCase();
  topicSuggestions.value = q
    ? allReachableTopics.value.filter((t) => t.toLowerCase().includes(q))
    : allReachableTopics.value;
}

// ── ACTION_CALL_WORKFLOW/ACTION_INTEGRATION_CALL params: authored as a name/value list, not raw
// JSON — each value is a template string that can reference this workflow's own context (trigger
// fields, {{variables.*}} assigned by an ASSIGN_VARIABLE node elsewhere on the canvas). No
// per-row variable picker — the bottom "Available here" panel is the one place to look up and
// copy a working reference, rather than duplicating that list next to every templated field.
function addParamRow() {
  local.value.paramsRows = [...(local.value.paramsRows ?? []), { name: '', value: '' }];
}
function removeParamRow(index: number) {
  local.value.paramsRows = (local.value.paramsRows ?? []).filter((_: unknown, i: number) => i !== index);
  commit();
}

// Built as a plain string (not inlined in the template) because raw {{...}} in a template's text
// content gets parsed as a Vue interpolation, not shown as literal text.
const callWorkflowParamsHint =
  "Each row's name is how the called workflow(s) will see it — this row becomes {{trigger.<name>}} " +
  'on the other side. The value can be static text, a variable from this workflow\'s own context ' +
  '(pick from the dropdown, e.g. {{trigger.entityId}} or {{variables.myVar}}), or a mix of both. ' +
  'To pass an AQL query\'s result, add an ASSIGN_VARIABLE node earlier in this graph and reference ' +
  "its output here as {{variables.thatName}} — there's no separate AQL editor in this row.";

// ── ACTION_WEBHOOK_CALL: outbound signing secret is write-only (see WorkflowService's doc
// comment) — this only ever tracks whether one is configured, never the plaintext.
const outboundSecretConfigured = ref(false);
const outboundSecretLoading = ref(false);
const outboundSecretUnsaved = ref(false);
const outboundSecretDraft = ref('');
const outboundSecretSaving = ref(false);
const headersJsonError = ref('');
const bodyTemplateJsonError = ref('');

async function loadOutboundSecretStatus() {
  outboundSecretConfigured.value = false;
  outboundSecretUnsaved.value = false;
  if (!props.workflowId) { outboundSecretUnsaved.value = true; return; }
  outboundSecretLoading.value = true;
  try {
    const status = await workflowsApi.getOutboundWebhookSecretStatus(props.workflowId, props.node.id);
    outboundSecretConfigured.value = status.configured;
  } catch {
    outboundSecretUnsaved.value = true;
  } finally {
    outboundSecretLoading.value = false;
  }
}

async function saveOutboundSecret() {
  if (!props.workflowId || !outboundSecretDraft.value.trim()) return;
  outboundSecretSaving.value = true;
  try {
    await workflowsApi.setOutboundWebhookSecret(props.workflowId, props.node.id, outboundSecretDraft.value.trim());
    outboundSecretConfigured.value = true;
    outboundSecretDraft.value = '';
    toast.add({ severity: 'success', summary: 'Signing secret saved', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to save secret', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  } finally {
    outboundSecretSaving.value = false;
  }
}

async function clearOutboundSecret() {
  if (!props.workflowId) return;
  const ok = await confirmDialog({
    header: 'Remove signing secret',
    message: 'Future deliveries from this node will no longer include an X-Webhook-Signature header.',
  });
  if (!ok) return;
  try {
    await workflowsApi.clearOutboundWebhookSecret(props.workflowId, props.node.id);
    outboundSecretConfigured.value = false;
    toast.add({ severity: 'success', summary: 'Signing secret removed', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to remove secret', detail: e?.response?.data?.detail ?? e.message, life: 5000 });
  }
}

const local = ref<Record<string, any>>({});
const labelDraft = ref('');

function resetFromNode() {
  local.value = { ...(props.node.data.config ?? {}) };
  labelDraft.value = props.node.data.label;
  if (props.node.type === 'CONDITION') {
    if (!local.value.mode) local.value.mode = 'ENTITY_MATCH';
    if (!local.value.entityType) local.value.entityType = conditionEntities.value[0]?.value;
    if (!local.value.operator) local.value.operator = 'GT';
    if (!local.value.left) local.value.left = defaultCountOperand();
    if (!local.value.right) local.value.right = { kind: 'LITERAL', value: 0 };
  }
  if (props.node.type === 'TRIGGER_EVENT') {
    if (!eventCodeOptions.value.some((e) => e.value === local.value.eventCode)) {
      local.value.eventCode = eventCodeOptions.value[0]?.value;
    }
  }
  if (props.node.type === 'ASSIGN_VARIABLE') {
    if (!Array.isArray(local.value.sources) || !local.value.sources.length) {
      local.value.sources = [{ entityType: assignVariableEntityOptions.value[0]?.value ?? '', aql: '', field: null }];
    }
    if (!local.value.variableType) local.value.variableType = local.value.sources[0]?.entityType;
  }
  if (props.node.type === 'END') {
    if (!local.value.result) local.value.result = 'success';
  }
  if (props.node.type === 'ACTION_MANAGE_TAGS') {
    if (!Array.isArray(local.value.addTagIds)) local.value.addTagIds = [];
    if (!Array.isArray(local.value.removeTagIds)) local.value.removeTagIds = [];
    loadManageTagsCatalog();
  }
  if (props.node.type === 'ACTION_REPORT_FINDING') {
    if (!local.value.mode) local.value.mode = 'document';
    loadEmailTemplates();
    loadReportTemplates();
  }
  if (props.node.type === 'LOOP') {
    if (local.value.continueOnError === undefined) local.value.continueOnError = true;
  }
  if (props.node.type === 'ACTION_AGENT_TASK') {
    agentTaskArgs.value = {};
    hydrateAgentTaskArgs((local.value.argsTemplate as Record<string, any>) ?? {});
    if (local.value.nacProfile === undefined) local.value.nacProfile = '';
    if (local.value.bypassTimeWindow === undefined) local.value.bypassTimeWindow = false;
  }
  if (props.node.type === 'TRIGGER_WEBHOOK') {
    loadWebhookInfo();
  }
  if (props.node.type === 'ACTION_CALL_WORKFLOW' || props.node.type === 'ACTION_INTEGRATION_CALL') {
    const params = (local.value.paramsTemplate ?? {}) as Record<string, string>;
    local.value.paramsRows = Object.entries(params).map(([name, value]) => ({ name, value }));
  }
  if (props.node.type === 'ACTION_CALL_WORKFLOW') {
    loadReachableTopics();
  }
  if (props.node.type === 'ACTION_WEBHOOK_CALL') {
    local.value.headersText = local.value.headers ? JSON.stringify(local.value.headers, null, 2) : '';
    local.value.bodyTemplateText = local.value.bodyTemplate ? JSON.stringify(local.value.bodyTemplate, null, 2) : '';
    headersJsonError.value = '';
    bodyTemplateJsonError.value = '';
    outboundSecretDraft.value = '';
    loadOutboundSecretStatus();
  }
}

watch(() => props.node.id, resetFromNode, { immediate: true });

function commit() {
  const out = { ...local.value };
  if (props.node.type === 'CONDITION') {
    if (out.mode === 'COUNT_COMPARE') {
      delete out.entityType;
      delete out.aql;
    } else {
      out.mode = 'ENTITY_MATCH';
      delete out.left;
      delete out.right;
      delete out.operator;
    }
  }
  if (props.node.type === 'ASSIGN_VARIABLE') {
    const scalar = isScalarVariableType(out.variableType as string);
    const rawSources = (local.value.sources ?? []) as { entityType: string; aql: string; field?: string | null }[];
    out.sources = rawSources.map((s) => {
      const cleaned: Record<string, unknown> = { entityType: s.entityType, aql: s.aql };
      if (scalar && s.field) cleaned.field = s.field;
      return cleaned;
    });
    if (rawSources.length < 2) delete out.combineMode;
    if (out.limit && !(out.limit as any).count) delete out.limit;
    if (out.limit && (out.limit as any).strategy === 'RANDOM') {
      out.limit = { count: (out.limit as any).count, strategy: 'RANDOM' };
    } else if (out.limit && scalar) {
      out.limit = { count: (out.limit as any).count, strategy: 'ORDER', direction: (out.limit as any).direction ?? 'ASC' };
    }
  }
  if (props.node.type === 'ACTION_AGENT_TASK') {
    out.argsTemplate = buildAgentTaskArgs();
    delete out.targetsAql;
    delete out.targetSource;
    delete out.targetsVariableName;
  }
  if (props.node.type === 'ACTION_REPORT_FINDING') {
    if (out.mode === 'email') {
      delete out.reportTemplateId;
    } else {
      out.mode = 'document';
      delete out.emailTemplateId;
      delete out.integrationId;
      delete out.to;
      delete out.cc;
      delete out.bcc;
    }
  }
  if (props.node.type === 'ACTION_CALL_WORKFLOW' || props.node.type === 'ACTION_INTEGRATION_CALL') {
    const rows = (local.value.paramsRows ?? []) as { name: string; value: string }[];
    const params: Record<string, string> = {};
    for (const row of rows) {
      if (row.name.trim()) params[row.name.trim()] = row.value ?? '';
    }
    if (Object.keys(params).length) out.paramsTemplate = params;
    else delete out.paramsTemplate;
    delete out.paramsRows;
  }
  if (props.node.type === 'ACTION_WEBHOOK_CALL') {
    headersJsonError.value = '';
    bodyTemplateJsonError.value = '';
    const headersText = (local.value.headersText ?? '').trim();
    if (headersText) {
      try { out.headers = JSON.parse(headersText); }
      catch { headersJsonError.value = 'Invalid JSON'; delete out.headers; }
    } else {
      delete out.headers;
    }
    const bodyText = (local.value.bodyTemplateText ?? '').trim();
    if (bodyText) {
      try { out.bodyTemplate = JSON.parse(bodyText); }
      catch { bodyTemplateJsonError.value = 'Invalid JSON'; delete out.bodyTemplate; }
    } else {
      delete out.bodyTemplate;
    }
    delete out.headersText;
    delete out.bodyTemplateText;
  }
  emit('update:config', out);
}

function commitLabel() {
  const next = labelDraft.value.trim();
  if (!next || next === props.node.data.label) {
    labelDraft.value = props.node.data.label;
    return;
  }
  emit('update:label', next);
}

// ── Join threshold — generic per-node config, not tied to any node type (see
// WorkflowRunService#resolveJoinThreshold for the run-time behavior this drives, and
// WorkflowGraphValidator#validateJoinThreshold for the save-time checks on it). Default (no
// joinMode, or "ALL") requires every incoming edge to have fired; "AT_LEAST" + joinCount requires
// only that many. Only shown for a node with 2+ incoming edges — with 0 or 1 there's nothing to
// choose between. LOOP nodes are excluded: the engine always ignores this config for them (their
// entry/feedback edges follow LOOP-specific semantics this generic threshold isn't designed for).
const incomingEdgeCount = computed(() =>
  (props.allEdges ?? []).filter((e) => e.target === props.node.id).length);
const showJoinThreshold = computed(() => props.node.type !== 'LOOP' && incomingEdgeCount.value >= 2);
const joinAtLeastEnabled = computed({
  get: () => local.value.joinMode === 'AT_LEAST',
  set: (enabled: boolean) => {
    if (enabled) {
      local.value.joinMode = 'AT_LEAST';
      if (!local.value.joinCount) local.value.joinCount = 1;
    } else {
      delete local.value.joinMode;
      delete local.value.joinCount;
    }
    commit();
  },
});

const NODE_TYPE_LABELS: Record<string, string> = {
  TRIGGER_MANUAL: 'Manual trigger', TRIGGER_CRON: 'Scheduled trigger', TRIGGER_WEBHOOK: 'Webhook trigger',
  TRIGGER_EVENT: 'Event trigger', TRIGGER_CALL_TOPIC: 'Topic subscriber trigger',
  CONDITION: 'Condition', ASSIGN_VARIABLE: 'Assign variable', ACTION_AGENT_TASK: 'Agent task action', ACTION_NOTIFICATION: 'Notification action',
  ACTION_CALL_WORKFLOW: 'Call workflow action', ACTION_WEBHOOK_CALL: 'Webhook call action',
  ACTION_INTEGRATION_CALL: 'Integration action', ACTION_MANAGE_TAGS: 'Manage tags action',
  ACTION_REPORT_FINDING: 'Report finding action', ACTION_UPDATE_DETECTION_STATUS: 'Update detection status action',
  LOOP: 'Loop action', END: 'End',
};

const typeLabel = computed(() => NODE_TYPE_LABELS[props.node.type] ?? props.node.type);

// ── Context variables reference — purely informational, shown for any node so the admin can see
// (a) what's available to reference in *this* node's own templated fields, and (b) what *this*
// node itself hands off downstream once it runs — both live in collapsible panels at the very
// bottom (see "Available here"/"This node exports" in the template) rather than inline, so they
// don't compete for space with the node's own config while it's being edited.

// Field names WorkflowRunService actually sets on step.output when a node completes successfully
// (kept in sync with its own step.setOutput(...) calls, and WorkflowStepPoller's for the async
// ones it completes). Every non-trigger node type can ALSO fail (executeNode's own try/catch),
// in which case steps.<nodeId>.error (a plain string, the thrown message) is set instead — that's
// universal across every type, not listed per type here. TRIGGER_* types are absent — a trigger
// never sets a step output; its payload lives under trigger.* instead (see triggerPayloadFields).
const NODE_SUCCESS_OUTPUT_FIELDS: Record<string, string[]> = {
  CONDITION: ['result', 'leftCount', 'rightCount'],
  ASSIGN_VARIABLE: ['variableName', 'variableType', 'count'],
  ACTION_NOTIFICATION: ['sent'],
  ACTION_AGENT_TASK: ['taskId', 'status', 'exitCode'],
  ACTION_CALL_WORKFLOW: ['topic', 'subscriberCount', 'childRunIds'],
  ACTION_WEBHOOK_CALL: ['status'],
  ACTION_INTEGRATION_CALL: [], // varies entirely by which action is selected — see its own params
  ACTION_MANAGE_TAGS: ['variableType', 'targetCount', 'tagsAdded', 'tagsRemoved'],
  ACTION_UPDATE_DETECTION_STATUS: ['status', 'targetCount'],
  // Only one of these is actually set, depending on the node's own mode: reportId (document) or
  // sent (email) — both listed since either can be referenced downstream depending on config.
  ACTION_REPORT_FINDING: ['reportId', 'sent'],
  // A LOOP node's step re-runs once per iteration attempt (see WorkflowRunService#advance) — an
  // in-progress gate's output is just {hasNext, index, count}; the shape below is what its FINAL
  // gate (hasNext: false) writes, which is what {{steps.<loopNodeId>.output.*}} normally resolves
  // to downstream, since "latest write wins" and downstream nodes run after the loop finishes.
  LOOP: ['hasNext', 'variableName', 'itemCount', 'itemsSucceeded', 'itemsFailed'],
};

const FIELD_DESCRIPTIONS: Record<string, string> = {
  result: 'boolean', leftCount: 'only set in Count compare mode', rightCount: 'only set in Count compare mode',
  variableName: '', variableType: '', count: 'the matched items themselves are under variables.<name>, not here',
  sent: 'boolean', taskId: '', status: 'HTTP status code for ACTION_WEBHOOK_CALL, agent task status otherwise',
  exitCode: '', jobId: '', capability: "replaced by the sync job's own result once it completes",
  topic: '', subscriberCount: '', childRunIds: '',
  targetCount: 'how many entities from the variable were processed', tagsAdded: '', tagsRemoved: '',
  hasNext: 'false once the loop has finished (or the variable was empty)',
  itemCount: 'total items the loop ran over', itemsSucceeded: '', itemsFailed: '',
  reportId: 'only set in document mode',
};

// Shown as a small type badge next to a reference chip — deliberately only the well-defined,
// always-this-shape fields; left out wherever the "type" would just restate FIELD_DESCRIPTIONS'
// own free text (e.g. `status`, `capability`) rather than name a real type.
const FIELD_TYPES: Record<string, string> = {
  result: 'boolean', leftCount: 'number', rightCount: 'number', count: 'number', sent: 'boolean',
  taskId: 'number', jobId: 'number', subscriberCount: 'number', childRunIds: 'list[number]',
  targetCount: 'number', tagsAdded: 'number', tagsRemoved: 'number', variableName: 'string', variableType: 'string',
  itemCount: 'number', itemsSucceeded: 'number', itemsFailed: 'number', hasNext: 'boolean',
  reportId: 'number',
};

function triggerPayloadFields(type: string): { ref: string; description: string }[] {
  switch (type) {
    case 'TRIGGER_WEBHOOK': return [{ ref: 'trigger', description: "the webhook's parsed JSON body (or a raw fallback if not valid JSON)" }];
    case 'TRIGGER_CALL_TOPIC': return [{ ref: 'trigger', description: "whatever the broadcaster's Params list sends — varies by caller" }];
    case 'TRIGGER_MANUAL': return [{ ref: 'trigger', description: 'whatever was passed to "Run now" (usually empty)' }];
    case 'TRIGGER_CRON': return [];
    default: return [];
  }
}

// insertable: false marks a ref that names a whole JSON object/list rather than a scalar leaf —
// WorkflowContextFlattener only ever flattens leaf values into the run context, so {{ref}} for one
// of these silently renders as "" (MessagingTemplate.render: "unknown variables collapse to empty
// string") instead of erroring, which is worse — still shown in "Available here" for discovery/
// copy-as-a-starting-point, but excluded from availableVariableRefs (the AQL "{{" autocomplete
// feed) so accepting a suggestion there always inserts something that actually resolves.
interface ContextVarItem { ref: string; display: string; label: string; description: string; type?: string; insertable?: boolean; }

function fieldItem(scopeRef: string, label: string, field: string): ContextVarItem {
  const ref = `${scopeRef}.${field}`;
  return { ref, display: `{{${ref}}}`, label, description: FIELD_DESCRIPTIONS[field] ?? '', type: FIELD_TYPES[field] };
}

// END's own 'result' field ("success"/"failure") isn't the shared FIELD_DESCRIPTIONS/FIELD_TYPES
// meaning of that name (CONDITION's boolean 'result') — built directly rather than through
// fieldItem/NODE_SUCCESS_OUTPUT_FIELDS to avoid that collision.
function endExportItems(scopeRef: string, label: string): ContextVarItem[] {
  return [
    { ref: `${scopeRef}.result`, display: `{{${scopeRef}.result}}`, label, type: "'success'|'failure'", description: 'What this END node declared the run to be.' },
    { ref: `${scopeRef}.message`, display: `{{${scopeRef}.message}}`, label, description: 'Only set when a message was configured.' },
  ];
}

// True ancestors only (nodes with an edge path leading to this one) — not "every other node on
// the canvas" — so a downstream node never gets shown a variable from a sibling branch or a node
// that hasn't run by the time this one does.
const ancestorNodeIds = computed(() => {
  const incomingBySource = new Map<string, string[]>();
  for (const e of props.allEdges ?? []) {
    if (!incomingBySource.has(e.target)) incomingBySource.set(e.target, []);
    incomingBySource.get(e.target)!.push(e.source);
  }
  const ids = new Set<string>();
  const queue = [...(incomingBySource.get(props.node.id) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    ids.add(id);
    queue.push(...(incomingBySource.get(id) ?? []));
  }
  return ids;
});

const ancestorNodes = computed(() => (props.allNodes ?? []).filter((n) => ancestorNodeIds.value.has(n.id)));

const triggerContextVars = computed<ContextVarItem[]>(() => ancestorNodes.value
  .filter((n) => n.type.startsWith('TRIGGER_'))
  .flatMap((n) => n.type === 'TRIGGER_EVENT'
    ? triggerEventContextItems((n.data.config as any)?.eventCode)
    : triggerPayloadFields(n.type).map((f) => ({ ref: f.ref, display: `{{${f.ref}}}`, label: NODE_TYPE_LABELS[n.type] ?? n.type, description: f.description }))));

const stepOutputVars = computed<ContextVarItem[]>(() => ancestorNodes.value
  .filter((n) => !n.type.startsWith('TRIGGER_') && n.type !== 'ASSIGN_VARIABLE')
  .flatMap((n) => {
    const scopeRef = `steps.${n.id}.output`;
    const label = n.data.label || n.id;
    const fields = (NODE_SUCCESS_OUTPUT_FIELDS[n.type] ?? []).map((f) => fieldItem(scopeRef, label, f));
    const errorItem: ContextVarItem = { ref: `steps.${n.id}.error`, display: `{{steps.${n.id}.error}}`, label, description: 'set only if this step failed' };
    return [...fields, errorItem];
  }));

const assignedVariables = computed<ContextVarItem[]>(() => ancestorNodes.value
  .filter((n) => n.type === 'ASSIGN_VARIABLE' && (n.data.config as any)?.variableName)
  .map((n) => {
    const config = n.data.config as any;
    const ref = `variables.${config.variableName}`;
    return {
      ref, display: `{{${ref}}}`, label: n.data.label || n.id, type: config.variableType ? `list[${config.variableType}]` : undefined,
      insertable: false,
      description: "A list, not a template value by itself — {{...}} only resolves single fields. Use e.g. variables.name.items.0.title, or the COUNT_COMPARE 'Variable item count' operand for its size.",
    };
  }));

const contextVariableGroups = computed(() => [
  { title: 'Trigger', items: triggerContextVars.value },
  { title: 'Variables', items: assignedVariables.value },
  { title: 'Step outputs', items: stepOutputVars.value },
].filter((g) => g.items.length));

// Same set as "Available here" above, flattened — fed to every AqlConditionInput on this node so
// typing "{{" autocompletes with whatever's actually resolvable via MessagingTemplate.render at
// run time (AQL text is templated before it's parsed — see WorkflowRunService's countByAql/
// runAssignVariableSource/executeConditionEntityMatch call sites).
const availableVariableRefs = computed<AqlVariableRef[]>(() => [
  ...triggerContextVars.value, ...assignedVariables.value, ...stepOutputVars.value,
].filter((i) => i.insertable !== false).map((i) => ({ ref: i.ref, label: i.label, type: i.type })));

// What THIS node itself exports for whatever comes after it — same field-level detail as
// stepOutputVars above, just scoped to this node's own id instead of an ancestor's.
const thisNodeExports = computed(() => {
  const type = props.node.type;
  if (type.startsWith('TRIGGER_')) {
    const items: ContextVarItem[] = type === 'TRIGGER_EVENT' ? triggerEventOwnContextItems.value
      : triggerPayloadFields(type).map((f) => ({ ref: f.ref, display: `{{${f.ref}}}`, label: 'Trigger payload', description: f.description }));
    return [{ title: 'Trigger payload', items }].filter((g) => g.items.length);
  }
  const scopeRef = `steps.${props.node.id}.output`;
  const successFields = type === 'END' ? endExportItems(scopeRef, 'On success')
    : (NODE_SUCCESS_OUTPUT_FIELDS[type] ?? []).map((f) => fieldItem(scopeRef, 'On success', f));
  const errorItem: ContextVarItem = { ref: `steps.${props.node.id}.error`, display: `{{steps.${props.node.id}.error}}`, label: 'On error', description: 'the thrown error message' };
  return [
    { title: 'On success', items: successFields },
    { title: 'On error', items: [errorItem] },
  ].filter((g) => g.items.length);
});

function copyVariableRef(item: ContextVarItem) {
  copyToClipboard(item.display, 'Reference');
}

// Both bottom reference panels start collapsed — they're look-up-when-needed, not something that
// should compete with the node's own config for attention every time it's opened.
const availableVarsExpanded = ref(false);
const exportedVarsExpanded = ref(false);
</script>

<template>
  <div class="node-panel" :style="{ width: panelWidth + 'px' }">
    <div class="node-panel__resize-handle" @mousedown="onResizeStart" v-tooltip.left="'Drag to resize'" />
    <div class="node-panel__header">
      <span>{{ typeLabel }}</span>
      <div>
        <Button v-if="!readonly" icon="pi pi-trash" text severity="danger" size="small" v-tooltip.bottom="'Delete node'" @click="emit('delete')" />
        <Button icon="pi pi-times" text size="small" v-tooltip.bottom="'Close panel'" @click="emit('close')" />
      </div>
    </div>

    <p v-if="readonly" class="node-panel__readonly-hint">
      <i class="pi pi-lock" /> Managed automatically — view only.
    </p>

    <div class="node-panel__body" :class="{ 'node-panel__body--readonly': readonly }">
      <div>
        <label class="ares-field-label">Label</label>
        <InputText v-model="labelDraft" style="width:100%;" @change="commitLabel" @keyup.enter="commitLabel" />
      </div>

      <div v-if="showJoinThreshold">
        <label class="ares-field-label">
          Join
          <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'This node has ' + incomingEdgeCount + ' incoming edges. By default all of them must fire for this node to run — any that don\'t, skip-propagate it instead. Enable to require only a minimum number.'" />
        </label>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <ToggleSwitch v-model="joinAtLeastEnabled" input-id="join-at-least" :disabled="readonly" />
          <template v-if="joinAtLeastEnabled">
            <label for="join-at-least" style="font-size:0.85rem; color:var(--ares-text-muted);">At least</label>
            <InputNumber v-model="local.joinCount" :min="1" :max="incomingEdgeCount"
              :use-grouping="false" style="width:5.5rem;" :disabled="readonly" @update:model-value="commit" />
            <span style="font-size:0.85rem; color:var(--ares-text-muted);">of {{ incomingEdgeCount }}</span>
          </template>
          <label v-else for="join-at-least" style="font-size:0.85rem; color:var(--ares-text-muted);">
            Require all {{ incomingEdgeCount }}
          </label>
        </div>
      </div>

      <template v-if="node.type === 'TRIGGER_MANUAL'">
        <div class="no-config-hint">
          No configuration
          <i class="pi pi-info-circle field-help-icon"
            v-tooltip.top="'Launched via the &quot;Run now&quot; button, or by any workflow calling this one (once ACTION_CALL_WORKFLOW ships).'" />
        </div>
      </template>

      <template v-else-if="node.type === 'TRIGGER_CRON'">
        <div>
          <label class="ares-field-label">
            Cron expression
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'5-field cron (minute hour day month weekday), in the platform-configured timezone (Admin → Configuration).'" />
          </label>
          <InputText v-model="local.cronExpression" placeholder="0 9 * * *" style="width:100%; font-family:monospace;" @change="commit" />
        </div>
      </template>

      <template v-else-if="node.type === 'TRIGGER_WEBHOOK'">
        <div v-if="webhookLoading" class="field-hint">Loading…</div>
        <p v-else-if="webhookUnsaved" class="field-hint">
          Save the workflow first — the webhook URL is generated once this node is persisted, and then stays stable across future saves.
        </p>
        <template v-else-if="webhookInfo">
          <div>
            <label class="ares-field-label">
              URL
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'External callers POST here. Stays stable across workflow saves — only regenerating the secret changes.'" />
            </label>
            <div class="webhook-copy-row">
              <InputText :model-value="webhookPublicUrl(webhookInfo.token)" readonly style="width:100%; font-family:monospace; font-size:0.76rem;" />
              <Button icon="pi pi-copy" text size="small" v-tooltip.top="'Copy URL'" @click="copyToClipboard(webhookPublicUrl(webhookInfo.token), 'URL')" />
            </div>
          </div>
          <div>
            <label class="ares-field-label">
              Signing secret
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'HMAC-SHA256 over the raw request body. Send it as: X-Webhook-Signature: sha256=&lt;hex digest&gt;'" />
            </label>
            <div class="webhook-copy-row">
              <InputText :model-value="webhookSecretVisible ? webhookInfo.secret : '•'.repeat(24)" readonly
                style="width:100%; font-family:monospace; font-size:0.76rem;" />
              <Button :icon="webhookSecretVisible ? 'pi pi-eye-slash' : 'pi pi-eye'" text size="small"
                v-tooltip.top="webhookSecretVisible ? 'Hide' : 'Show'" @click="webhookSecretVisible = !webhookSecretVisible" />
              <Button icon="pi pi-copy" text size="small" v-tooltip.top="'Copy secret'" @click="copyToClipboard(webhookInfo.secret, 'Secret')" />
            </div>
          </div>
          <div class="field-hint">
            {{ webhookInfo.requestCount }} request{{ webhookInfo.requestCount === 1 ? '' : 's' }} received{{ webhookInfo.lastTriggeredAt ? ' — last at ' + new Date(webhookInfo.lastTriggeredAt).toLocaleString() : '' }}.
          </div>
          <Button label="Regenerate secret" icon="pi pi-refresh" size="small" severity="secondary"
            :loading="webhookRegenerating" @click="regenerateWebhookSecret" />
        </template>
      </template>

      <template v-else-if="node.type === 'TRIGGER_EVENT'">
        <div>
          <label class="ares-field-label">
            Event
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Which concrete event this trigger watches for — the options depend on this workflow\'s own scope (platform/organization/project), since each level only watches what actually lives at or one level below it.'" />
          </label>
          <Select v-model="local.eventCode" :options="eventCodeOptions" option-label="label" option-value="value" style="width:100%;" @change="commit" />
        </div>
      </template>

      <template v-else-if="node.type === 'TRIGGER_CALL_TOPIC'">
        <div>
          <label class="ares-field-label">
            Topic
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'A free-text channel name. Any ACTION_CALL_WORKFLOW node in broadcast mode with this exact topic starts this workflow — the broadcaster never needs to know this workflow exists, so a new subscriber only needs this trigger added here, nothing changed at the broadcasting end.'" />
          </label>
          <InputText v-model="local.topic" placeholder="e.g. kev-check" style="width:100%; font-family:monospace;" @change="commit" />
        </div>
        <div class="no-config-hint">
          Reachable only from within this hierarchy
          <i class="pi pi-info-circle field-help-icon"
            v-tooltip.top="'Only a broadcast from this workflow\'s own scope or a scope above it (platform → organization → project) can reach this trigger — never a workflow in another org or project.'" />
        </div>
      </template>

      <template v-else-if="node.type === 'CONDITION'">
        <div>
          <label class="ares-field-label">Mode</label>
          <Select v-model="local.mode" :options="CONDITION_MODES" option-label="label" option-value="value" style="width:100%;" @change="commit" />
        </div>

        <template v-if="local.mode !== 'COUNT_COMPARE'">
          <p v-if="!conditionEntities.length" class="field-hint">
            No entities are available for conditions at platform scope — Detection/Finding/Asset all belong to a
            specific project, so a platform-wide workflow has nothing to resolve them against. Move this condition
            into an organization or project workflow instead.
          </p>
          <template v-else>
            <div>
              <label class="ares-field-label">
                Entity
                <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Only fields with an in-memory value resolver can be evaluated here.'" />
              </label>
              <Select v-model="local.entityType" :options="conditionEntities" option-label="label" option-value="value" style="width:100%;" @change="commit" />
            </div>
            <div>
              <label class="ares-field-label">AQL condition</label>
              <AqlConditionInput v-model="local.aql" :entity-type="local.entityType" :variables="availableVariableRefs" @update:model-value="commit" />
            </div>
          </template>
        </template>

        <template v-else>
          <div v-for="side in COUNT_COMPARE_SIDES" :key="side" class="assign-variable-source">
            <span class="ares-field-label" style="margin:0; text-transform:capitalize;">{{ side }} operand</span>
            <Select v-model="local[side].kind" :options="COUNT_COMPARE_KINDS" option-label="label" option-value="value"
              style="width:100%;" @change="onCountOperandKindChange(side)" />

            <template v-if="local[side].kind === 'QUERY'">
              <Select v-model="local[side].entityType" :options="assignVariableEntityOptions" option-label="label" option-value="value"
                style="width:100%; margin-top:0.35rem;" @change="commit" />
              <AqlConditionInput v-model="local[side].aql" :entity-type="local[side].entityType" :variables="availableVariableRefs" @update:model-value="commit" />
            </template>
            <template v-else-if="local[side].kind === 'VARIABLE'">
              <Select v-model="local[side].variableName" :options="countCompareVariableOptions"
                style="width:100%; margin-top:0.35rem;" @change="commit" />
              <p v-if="!countCompareVariableOptions.length" class="field-hint">No "Assign variable" node precedes this one yet.</p>
            </template>
            <template v-else>
              <InputNumber v-model="local[side].value" style="width:100%; margin-top:0.35rem;" @update:model-value="commit" />
            </template>
          </div>

          <div>
            <label class="ares-field-label">Operator</label>
            <Select v-model="local.operator" :options="COUNT_COMPARE_OPERATORS" option-label="label" option-value="value" style="width:100%;" @change="commit" />
          </div>
        </template>
      </template>

      <template v-else-if="node.type === 'ASSIGN_VARIABLE'">
        <div>
          <label class="ares-field-label">
            Variable name
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Letters, digits, underscore — referenced elsewhere as {{variables.name...}}.'" />
          </label>
          <InputText v-model="local.variableName" placeholder="e.g. p0Assets" style="width:100%; font-family:monospace;" @change="commit" />
        </div>
        <div>
          <label class="ares-field-label">
            Variable type
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'Entity: every source below queries this exact entity, whole matching rows. Scalar: every source may query any entity but must project a single field down to this type.'" />
          </label>
          <Select v-model="local.variableType" :options="assignVariableTypeGroups" option-label="label" option-value="value"
            option-group-label="label" option-group-children="items" style="width:100%;" @change="commit" />
        </div>

        <div v-for="(source, idx) in (local.sources ?? [])" :key="idx" class="assign-variable-source">
          <div class="assign-variable-source__header">
            <span class="ares-field-label" style="margin:0;">Source {{ idx + 1 }}</span>
            <Button v-if="(local.sources ?? []).length > 1" icon="pi pi-trash" text severity="danger" size="small"
              @click="removeAssignVariableSource(idx)" />
          </div>
          <Select v-model="source.entityType" :options="assignVariableEntityOptions" option-label="label" option-value="value"
            style="width:100%;" @change="commit" />
          <AqlConditionInput v-model="source.aql" :entity-type="source.entityType" :variables="availableVariableRefs" @update:model-value="commit" />
          <template v-if="isScalarVariableType(local.variableType)">
            <label class="ares-field-label" style="margin-top:0.35rem;">Field to project</label>
            <AqlFieldPicker v-model="source.field" :entity-type="source.entityType" @update:model-value="commit" />
          </template>
        </div>
        <Button label="Add source" icon="pi pi-plus" text size="small" @click="addAssignVariableSource" />

        <div v-if="(local.sources ?? []).length > 1">
          <label class="ares-field-label">
            Combine mode
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Union merges by id (entities) or value (scalars), first source wins on a tie. Intersection keeps only what every source matched.'" />
          </label>
          <Select v-model="local.combineMode" :options="combineModeOptions" option-label="label" option-value="value" style="width:100%;" @change="commit" />
        </div>

        <p class="field-hint">Matches are capped at 200 items per source. Result is always a list, however long — including empty.</p>

        <div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <ToggleSwitch :model-value="!!local.limit" @update:model-value="toggleAssignVariableLimit" />
            <label class="ares-field-label" style="margin:0;">
              Limit results
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Caps the final combined list (after union/intersection) to a set number of items, keeping either a random sample or the top/bottom items by a chosen field.'" />
            </label>
          </div>
        </div>
        <template v-if="local.limit">
          <div>
            <label class="ares-field-label">Max items</label>
            <InputNumber v-model="local.limit.count" :min="1" :use-grouping="false" style="width:100%;" @update:model-value="commit" />
          </div>
          <div>
            <label class="ares-field-label">Selection</label>
            <Select v-model="local.limit.strategy" :options="LIMIT_STRATEGIES" option-label="label" option-value="value" style="width:100%;" @change="commit" />
          </div>
          <template v-if="local.limit.strategy === 'ORDER'">
            <div v-if="!isScalarVariableType(local.variableType)">
              <label class="ares-field-label">Order by</label>
              <Select v-if="fixedLimitSortKeys(local.variableType)" v-model="local.limit.field"
                :options="fixedLimitSortKeys(local.variableType)" option-label="label" option-value="value"
                style="width:100%;" @change="commit" />
              <AqlFieldPicker v-else v-model="local.limit.field" :entity-type="local.variableType" @update:model-value="commit" />
            </div>
            <p v-else class="field-hint">A scalar variable is ordered by its own value — no field to pick.</p>
            <div>
              <label class="ares-field-label">Direction</label>
              <Select v-model="local.limit.direction" :options="LIMIT_DIRECTIONS" option-label="label" option-value="value" style="width:100%;" @change="commit" />
            </div>
          </template>
        </template>
      </template>

      <template v-else-if="node.type === 'ACTION_MANAGE_TAGS'">
        <p v-if="!manageTagsVariableOptions.length" class="field-hint">
          No taggable variable is available yet — add an "Assign variable" node before this one, with a Variable type of
          asset, detection, finding, exploit, or finding template.
        </p>
        <template v-else>
          <div>
            <label class="ares-field-label">
              Variable
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Which already-assigned variable\'s entities to tag — must be one of the taggable entity types.'" />
            </label>
            <Select v-model="local.variableName" :options="manageTagsVariableOptions" style="width:100%;" @change="commit" />
          </div>
          <div>
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <label class="ares-field-label" style="margin:0;">Add tags</label>
              <Button label="New tag" icon="pi pi-plus" text size="small" style="padding:0.15rem 0.4rem;" @click="showCreateTagDialog = true" />
            </div>
            <MultiSelect v-model="local.addTagIds" :options="manageTagsCatalog" option-label="name" option-value="id"
              filter filter-placeholder="Search tags…" placeholder="Select tags to add" style="width:100%;" display="chip" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">Remove tags</label>
            <MultiSelect v-model="local.removeTagIds" :options="manageTagsCatalog" option-label="name" option-value="id"
              filter filter-placeholder="Search tags…" placeholder="Select tags to remove" style="width:100%;" display="chip" @change="commit" />
          </div>
          <p class="field-hint" v-if="!manageTagsCatalog.length">
            No tags exist yet for this scope — use "New tag" above to create one.
          </p>
        </template>
      </template>

      <template v-else-if="node.type === 'ACTION_UPDATE_DETECTION_STATUS'">
        <p v-if="!updateDetectionStatusVariableOptions.length" class="field-hint">
          No detection variable is available yet — add an "Assign variable" node before this one, with a Variable type of detection.
        </p>
        <template v-else>
          <div>
            <label class="ares-field-label">
              Variable
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Which already-assigned detection variable to update — e.g. the result of an AQL query upstream that matched exactly the detections to act on.'" />
            </label>
            <Select v-model="local.variableName" :options="updateDetectionStatusVariableOptions" style="width:100%;" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">
              New status
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Applied to every detection held by the variable, one by one — same transition rules a manual status change enforces, so a target whose current status can\'t legally reach this one fails the node.'" />
            </label>
            <Select v-model="local.status" :options="detectionStatusOptions" option-label="label" option-value="value"
              placeholder="Select status" style="width:100%;" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">Note (optional)</label>
            <InputText v-model="local.note" placeholder="e.g. Auto-ignored by workflow" style="width:100%;" @change="commit" />
          </div>
        </template>
      </template>

      <template v-else-if="node.type === 'LOOP'">
        <p v-if="!loopVariableOptions.length" class="field-hint">
          No variable is available yet — add an "Assign variable" node before this one.
        </p>
        <template v-else>
          <div>
            <label class="ares-field-label">
              Variable
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Runs the body once for each item held by this already-assigned variable. 0 items runs the body 0 times.'" />
            </label>
            <Select v-model="local.variableName" :options="loopVariableOptions" style="width:100%;" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">
              If a body node fails without its own error edge
              <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'On: skip the rest of that item and keep looping. Off: stop the whole loop immediately and fail this step.'" />
            </label>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <ToggleSwitch v-model="local.continueOnError" @change="commit" />
              <span style="font-size:0.78rem; color:var(--ares-text-muted);">{{ local.continueOnError ? 'Continue with the next item' : 'Stop the whole loop' }}</span>
            </div>
          </div>
          <p class="field-hint">{{ loopBodyHint }}</p>
        </template>
      </template>

      <template v-else-if="node.type === 'END'">
        <div>
          <label class="ares-field-label">
            Result
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Declares the whole workflow run success or failure once execution reaches this node. Terminal — no outgoing edges.'" />
          </label>
          <Select v-model="local.result" :options="END_RESULT_OPTIONS" option-label="label" option-value="value" style="width:100%;" @change="commit" />
        </div>
        <div>
          <label class="ares-field-label">Message (optional)</label>
          <InputText v-model="local.message" placeholder="e.g. No P0 detections found" style="width:100%;" @change="commit" />
        </div>
      </template>

      <template v-else-if="node.type === 'ACTION_AGENT_TASK'">
        <div>
          <label class="ares-field-label">Pool</label>
          <Select v-model="local.poolId" :options="pools" option-label="name" option-value="id"
            placeholder="Select pool" :disabled="!pools.length" style="width:100%;" @change="commit" />
          <div v-if="!pools.length" class="field-hint">No agent pools are granted to this project.</div>
        </div>
        <div>
          <label class="ares-field-label">Tool</label>
          <AgentToolPicker v-model="local.tool" :tools="agentTools" @update:model-value="commit" />
        </div>

        <div v-if="projectRules.length" class="field-hint">
          <strong>Rules of Engagement:</strong>
          {{ projectRules.length }} active rule{{ projectRules.length !== 1 ? 's' : '' }} for this project —
          headers/rate limit/max concurrency show as locked fields below (same as a manually-created task),
          and are enforced automatically at dispatch either way.
          <template v-if="hasTimeWindowRule">
            A time window rule is active; this node fails outside it unless "Bypass time window" below is on.
          </template>
        </div>

        <div>
          <label class="ares-field-label">
            Vantage point (optional)
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Tags which agent/location this task should be dispatched from — same field a manually-created task can set.'" />
          </label>
          <InputText v-model="local.nacProfile" style="width:100%;" @change="commit" />
        </div>
        <div v-if="hasTimeWindowRule">
          <label class="ares-field-label">
            Bypass time window
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Off (default): this node fails if it runs outside the project\'s active time window, same as a scheduled task — nothing is here to confirm an override at run time. On: pre-authorize this specific node as safe to run anytime (e.g. a passive tool), the same call an operator makes via the checkbox when submitting a task manually.'" />
          </label>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <ToggleSwitch v-model="local.bypassTimeWindow" @change="commit" />
            <span style="font-size:0.78rem; color:var(--ares-text-muted);">{{ local.bypassTimeWindow ? 'Runs anytime' : 'Blocked outside the time window' }}</span>
          </div>
        </div>

        <ToolConfigForm v-if="currentAgentToolSpec" ref="agentToolConfigFormRef"
          :spec="currentAgentToolSpec" v-model="agentTaskArgs" @update:model-value="commit"
          :locked-rate-limit="ruleRateLimitRps" :locked-concurrency="ruleMaxConcurrency"
          :locked-headers="ruleHeadersRecord" />

        <div>
          <label class="ares-field-label">Timeout (minutes, optional)</label>
          <InputNumber v-model="local.timeoutMinutes" :use-grouping="false" style="width:100%;" @update:model-value="commit" />
        </div>
        <div>
          <label class="ares-field-label">
            Max targets per batch
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'Leave blank to run every target in one task. If the selector resolves to more targets than this, the run creates one task per batch instead of failing — also the only way to go over the 5,000-target cap on a single task.'" />
          </label>
          <InputNumber v-model="local.batchSize" :use-grouping="false" :min="1" style="width:100%;" @update:model-value="commit" />
        </div>
        <div>
          <label class="ares-field-label">
            Targets from
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'Where the task targets come from, resolved right before dispatch — either way, automatically restricted to the asset types this tool supports, so you never pick that part manually.'" />
          </label>
          <Select v-model="local.targetSource" :options="AGENT_TASK_TARGET_SOURCES" option-label="label" option-value="value"
            style="width:100%; margin-bottom:0.5rem;" @change="commit" />

          <template v-if="local.targetSource === 'variable'">
            <p v-if="!agentTaskVariableOptions.length" class="field-hint">
              No asset-typed variable is available yet — add an "Assign variable" node (Variable type: asset) before this one.
            </p>
            <Select v-else v-model="local.targetsVariableName" :options="agentTaskVariableOptions" style="width:100%;" @change="commit" />
          </template>
          <AqlConditionInput v-else v-model="local.targetsAql" entity-type="asset" :variables="availableVariableRefs" @update:model-value="commit" />

          <div class="field-hint">
            <template v-if="selectedToolAssetTypes.length">Automatically restricted to {{ selectedToolAssetTypes.join(', ') }} assets — {{ local.tool }}'s supported types.</template>
            <template v-else>{{ local.tool || 'This tool' }} accepts any asset type.</template>
          </div>
        </div>
      </template>

      <template v-else-if="node.type === 'ACTION_CALL_WORKFLOW'">
        <div>
          <label class="ares-field-label">
            Topic
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'Every enabled topic-subscriber trigger with this exact topic, reachable per the platform → organization → project hierarchy, starts — fire-and-forget, this step doesn\'t wait for them to finish. One matching subscriber or several both go through this same field.'" />
          </label>
          <AutoComplete v-model="local.topic" :suggestions="topicSuggestions" placeholder="e.g. kev-check"
            :input-style="{ width: '100%', fontFamily: 'monospace' }" style="width:100%;" dropdown
            @complete="filterTopicSuggestions($event.query)" @update:model-value="commit" />
        </div>

        <div>
          <label class="ares-field-label">
            Params (optional)
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="callWorkflowParamsHint" />
          </label>
          <div v-for="(row, idx) in (local.paramsRows ?? [])" :key="idx" class="params-row">
            <InputText v-model="row.name" placeholder="name" style="width:35%; font-size:0.8rem;" @change="commit" />
            <InputText v-model="row.value" placeholder="value or {{trigger.entityId}}" style="flex:1; font-family:monospace; font-size:0.8rem;" @change="commit" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Remove'" @click="removeParamRow(idx)" />
          </div>
          <Button label="Add parameter" icon="pi pi-plus" text size="small" @click="addParamRow" />
        </div>
      </template>

      <template v-else-if="node.type === 'ACTION_INTEGRATION_CALL'">
        <div>
          <label class="ares-field-label">
            Integration
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Which integration to act through. Only integration types with at least one registered action show up here.'" />
          </label>
          <IntegrationTypePicker v-model="local.integrationType" :options="integrationCallTypeOptions"
            @update:model-value="onIntegrationCallTypeChange" />
        </div>

        <div v-if="local.integrationType">
          <label class="ares-field-label">Instance</label>
          <Select v-model="local.integrationId" :options="integrationCallInstanceOptions" option-label="label" option-value="value"
            placeholder="Select instance" :disabled="!integrationCallInstanceOptions.length" style="width:100%;" @change="commit" />
        </div>

        <div v-if="local.integrationType">
          <label class="ares-field-label">Action</label>
          <Select v-model="local.action" :options="integrationCallActionOptions" option-label="label" option-value="value"
            placeholder="Select action" :disabled="!integrationCallActionOptions.length" style="width:100%;" @change="commit" />
        </div>

        <div>
          <label class="ares-field-label">
            Params (optional)
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="integrationCallParamsHint" />
          </label>
          <div v-for="(row, idx) in (local.paramsRows ?? [])" :key="idx" class="params-row">
            <InputText v-model="row.name" placeholder="name" style="width:35%; font-size:0.8rem;" @change="commit" />
            <InputText v-model="row.value" placeholder="value or {{trigger.entityId}}" style="flex:1; font-family:monospace; font-size:0.8rem;" @change="commit" />
            <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Remove'" @click="removeParamRow(idx)" />
          </div>
          <Button label="Add parameter" icon="pi pi-plus" text size="small" @click="addParamRow" />
        </div>
      </template>

      <template v-else-if="node.type === 'ACTION_WEBHOOK_CALL'">
        <div>
          <label class="ares-field-label">
            URL
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'{{trigger.entityId}} / {{variables.name}}-style placeholders are substituted before sending.'" />
          </label>
          <InputText v-model="local.url" placeholder="https://example.com/hook" style="width:100%; font-family:monospace; font-size:0.8rem;" @change="commit" />
        </div>
        <div>
          <label class="ares-field-label">
            Headers (optional)
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'JSON object of header name to value template, e.g. {&quot;Authorization&quot;: &quot;Bearer {{variables.token}}&quot;}.'" />
          </label>
          <Textarea v-model="local.headersText" rows="3" class="w-full" style="font-family:monospace; font-size:0.78rem;"
            placeholder='{"X-Auth": "..."}' @change="commit" />
          <div v-if="headersJsonError" class="field-hint field-hint--error">{{ headersJsonError }}</div>
        </div>
        <div>
          <label class="ares-field-label">
            Body template (optional)
            <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'JSON template — string values are substituted the same way ACTION_NOTIFICATION templates are. Sent as-is if left blank.'" />
          </label>
          <Textarea v-model="local.bodyTemplateText" rows="5" class="w-full" style="font-family:monospace; font-size:0.78rem;"
            placeholder='{"detectionId": "{{trigger.entityId}}"}' @change="commit" />
          <div v-if="bodyTemplateJsonError" class="field-hint field-hint--error">{{ bodyTemplateJsonError }}</div>
        </div>
        <div>
          <label class="ares-field-label">
            Signing secret (optional)
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'When set, requests carry X-Webhook-Signature: sha256=&lt;HMAC-SHA256 hex digest&gt; over the exact JSON body — the same header Ares\' own inbound webhooks verify.'" />
          </label>
          <p v-if="outboundSecretLoading" class="field-hint">Loading…</p>
          <p v-else-if="outboundSecretUnsaved" class="field-hint">Save the workflow first to configure a signing secret.</p>
          <template v-else>
            <div v-if="outboundSecretConfigured" class="webhook-copy-row">
              <InputText model-value="Configured — write-only, not shown again" readonly style="width:100%; font-family:monospace; font-size:0.76rem;" />
              <Button icon="pi pi-trash" text severity="danger" size="small" v-tooltip.top="'Remove secret'" @click="clearOutboundSecret" />
            </div>
            <div class="webhook-copy-row">
              <InputText v-model="outboundSecretDraft" type="password" :placeholder="outboundSecretConfigured ? 'Replace with a new secret' : 'New secret'"
                style="width:100%; font-family:monospace; font-size:0.8rem;" @keyup.enter="saveOutboundSecret" />
              <Button label="Save" size="small" :disabled="!outboundSecretDraft.trim()" :loading="outboundSecretSaving" @click="saveOutboundSecret" />
            </div>
          </template>
        </div>
      </template>

      <template v-else-if="node.type === 'ACTION_NOTIFICATION'">
        <div>
          <label class="ares-field-label">Integration</label>
          <Select v-model="local.integrationId" :options="integrations" option-label="name" option-value="id"
            placeholder="Select integration" style="width:100%;" @change="commit" />
        </div>
        <div>
          <label class="ares-field-label">
            Severity
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'Drives the color accent on rich transports (Discord embed side-bar, Teams card, Slack attachment strip).'" />
          </label>
          <Select v-model="local.severity" :options="notificationSeverityOptions" option-label="label" option-value="value"
            placeholder="None (default accent)" style="width:100%;" @change="commit" />
        </div>
        <template v-if="isEmailNotificationIntegration">
          <div>
            <label class="ares-field-label">
              To
              <i class="pi pi-info-circle field-help-icon"
                v-tooltip.top="'One address per line or comma-separated. Each entry can be a {{var}} placeholder, e.g. {{trigger.detection.ownerEmail}}.'" />
            </label>
            <Textarea v-model="local.to" rows="2" style="width:100%; font-family:monospace; font-size:0.8rem;" auto-resize
              placeholder="soc@example.com" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">CC (optional)</label>
            <Textarea v-model="local.cc" rows="1" style="width:100%; font-family:monospace; font-size:0.8rem;" auto-resize
              @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">BCC (optional)</label>
            <Textarea v-model="local.bcc" rows="1" style="width:100%; font-family:monospace; font-size:0.8rem;" auto-resize
              @change="commit" />
          </div>
        </template>

        <div>
          <label class="ares-field-label">Title template (optional)</label>
          <InputText v-model="local.titleTemplate" style="width:100%; font-family:monospace; font-size:0.8rem;" @change="commit" />
        </div>
        <div>
          <label class="ares-field-label">
            Body template (optional)
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'Markdown — rendered into the destination integration\'s own rich-text format on send. {{trigger.entityId}} / {{variables.name}}-style placeholders still work.'" />
          </label>
          <MarkdownEditor v-model="local.bodyTemplate" editor-style="min-height:120px;" placeholder="e.g. **{{trigger.detection.title}}** just fired"
            @update:model-value="commit" />
        </div>
      </template>

      <template v-else-if="node.type === 'ACTION_REPORT_FINDING'">
        <div>
          <label class="ares-field-label">
            Finding ID
            <i class="pi pi-info-circle field-help-icon"
              v-tooltip.top="'A {{var}} placeholder — usually {{trigger.entityId}} on a workflow triggered by finding.created/updated.'" />
          </label>
          <InputText v-model="local.findingId" style="width:100%; font-family:monospace; font-size:0.8rem;"
            placeholder="{{trigger.entityId}}" @change="commit" />
        </div>
        <div>
          <label class="ares-field-label">Delivery</label>
          <Select v-model="local.mode" :options="reportFindingModeOptions" option-label="label" option-value="value"
            style="width:100%;" @change="commit" />
        </div>

        <template v-if="local.mode === 'document'">
          <div>
            <label class="ares-field-label">Report template</label>
            <Select v-model="local.reportTemplateId" :options="reportTemplates" option-label="name" option-value="id"
              placeholder="Select a template" style="width:100%;" @change="commit" />
          </div>
        </template>
        <template v-else>
          <div>
            <label class="ares-field-label">Integration</label>
            <Select v-model="local.integrationId" :options="emailIntegrations" option-label="name" option-value="id"
              placeholder="Select an email integration" style="width:100%;" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">Email template</label>
            <Select v-model="local.emailTemplateId" :options="emailTemplates" option-label="name" option-value="id"
              placeholder="Select a template" style="width:100%;" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">
              To
              <i class="pi pi-info-circle field-help-icon"
                v-tooltip.top="'One address per line or comma-separated. Each entry can be a {{var}} placeholder.'" />
            </label>
            <Textarea v-model="local.to" rows="2" style="width:100%; font-family:monospace; font-size:0.8rem;" auto-resize
              placeholder="soc@example.com" @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">CC (optional)</label>
            <Textarea v-model="local.cc" rows="1" style="width:100%; font-family:monospace; font-size:0.8rem;" auto-resize
              @change="commit" />
          </div>
          <div>
            <label class="ares-field-label">BCC (optional)</label>
            <Textarea v-model="local.bcc" rows="1" style="width:100%; font-family:monospace; font-size:0.8rem;" auto-resize
              @change="commit" />
          </div>
        </template>
      </template>

      <div v-if="contextVariableGroups.length" class="context-vars">
        <button type="button" class="context-vars__header" @click="availableVarsExpanded = !availableVarsExpanded">
          <i :class="availableVarsExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
          <span>Available here</span>
          <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Reference these in any templated field on this node. Click one to copy it.'" @click.stop />
        </button>
        <template v-if="availableVarsExpanded">
          <div v-for="group in contextVariableGroups" :key="group.title" class="context-vars__group">
            <div class="context-vars__group-title">{{ group.title }}</div>
            <button v-for="item in group.items" :key="item.ref + item.label" type="button" class="context-vars__chip"
              :class="{ 'context-vars__chip--info': item.insertable === false }"
              v-tooltip.top="`${item.label}${item.description ? ' — ' + item.description : ''}`" @click="copyVariableRef(item)">
              <code>{{ item.display }}</code>
              <span v-if="item.type" class="context-vars__type">{{ item.type }}</span>
            </button>
          </div>
        </template>
      </div>

      <div v-if="thisNodeExports.length" class="context-vars">
        <button type="button" class="context-vars__header" @click="exportedVarsExpanded = !exportedVarsExpanded">
          <i :class="exportedVarsExpanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
          <span>This node exports</span>
          <i class="pi pi-info-circle field-help-icon" v-tooltip.top="'Available to any downstream node once this one runs. Click one to copy it.'" @click.stop />
        </button>
        <template v-if="exportedVarsExpanded">
          <div v-for="group in thisNodeExports" :key="group.title" class="context-vars__group">
            <div class="context-vars__group-title">{{ group.title }}</div>
            <button v-for="item in group.items" :key="item.ref + item.label" type="button" class="context-vars__chip"
              :class="{ 'context-vars__chip--info': item.insertable === false }"
              v-tooltip.top="`${item.label}${item.description ? ' — ' + item.description : ''}`" @click="copyVariableRef(item)">
              <code>{{ item.display }}</code>
              <span v-if="item.type" class="context-vars__type">{{ item.type }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <CreateTagDialog v-model:visible="showCreateTagDialog" :scope-kind="scopeKind" :scope-id="scopeId" :project-id="projectId"
      @created="onTagCreated" />
  </div>
</template>

<style scoped>
.assign-variable-source {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
}
.assign-variable-source__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.node-panel {
  position: relative;
  flex-shrink: 0;
  border-left: 1px solid var(--ares-border);
  background: var(--ares-surface-raised);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.node-panel__resize-handle {
  position: absolute;
  top: 0;
  left: -3px;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
  z-index: 5;
}
.node-panel__resize-handle:hover,
.node-panel__resize-handle:active {
  background: var(--ares-primary, #6366f1);
  opacity: 0.5;
}
.node-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--ares-border);
  font-weight: 600;
  font-size: 0.85rem;
}
.node-panel__body {
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.node-panel__body--readonly {
  pointer-events: none;
  opacity: 0.7;
}
.node-panel__readonly-hint {
  margin: 0.6rem 0.9rem 0;
  padding: 0.4rem 0.6rem;
  font-size: 0.75rem;
  color: var(--ares-text-muted);
  background: var(--ares-surface-2);
  border-radius: var(--ares-radius);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.ares-field-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.field-help-icon {
  font-size: 0.78rem;
  color: var(--ares-text-muted);
  opacity: 0.65;
  cursor: help;
}
.field-help-icon:hover {
  opacity: 1;
}
.field-hint {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  margin-top: 0.25rem;
}
.field-hint--error {
  color: var(--ares-danger, #e5484d);
}
.no-config-hint {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--ares-text-muted);
}
.webhook-copy-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.webhook-copy-row :deep(input) {
  flex: 1;
  min-width: 0;
}
.params-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.35rem;
}
.params-row :deep(.p-inputtext) {
  height: 2.15rem;
  box-sizing: border-box;
}
.context-vars {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  padding: 0.55rem 0.65rem;
}
.context-vars__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ares-text-muted);
}
.context-vars__header i.pi-chevron-down,
.context-vars__header i.pi-chevron-right {
  font-size: 0.68rem;
}
.context-vars__header .field-help-icon {
  margin-left: auto;
}
.context-vars__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.5rem;
}
.context-vars__group-title {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  width: 100%;
}
.context-vars__chip {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-1);
  padding: 0.15rem 0.45rem;
  font-size: 0.74rem;
  cursor: pointer;
}
.context-vars__chip:hover {
  border-color: var(--ares-accent, var(--ares-border));
}
.context-vars__chip--info {
  opacity: 0.6;
  border-style: dashed;
}
.context-vars__chip code {
  font-family: monospace;
}
.context-vars__type {
  margin-left: 0.35rem;
  padding: 0.05rem 0.32rem;
  border-radius: 999px;
  background: var(--ares-surface-2);
  color: var(--ares-text-muted);
  font-size: 0.62rem;
}
</style>
