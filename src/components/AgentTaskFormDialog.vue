<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import DatePicker from 'primevue/datepicker';
import { useToast } from 'primevue/usetoast';
import {
  agentTasksApi, agentTaskSchedulesApi, CRON_PRESETS,
  type AgentToolSpec, type TargetSelector, type AgentTaskSchedule,
} from '@/api/agent-tasks';
import { agentPoolsApi, type AgentPool } from '@/api/agent-pools';
import { agentTaskTemplatesApi, type AgentTaskTemplate } from '@/api/agent-task-templates';
import { saveAsTemplate as saveAsTemplateFlow } from '@/composables/useSaveAsTemplate';
import { projectsApi } from '@/api/projects';
import { assetsApi } from '@/api/assets';
import { projectRulesApi, type ProjectRule } from '@/api/project-rules';
import { useEngagementRuleLocks } from '@/composables/useEngagementRuleLocks';
import { platformTimezone } from '@/api/versions';
import AgentToolPicker from './AgentToolPicker.vue';
import ToolConfigForm from './ToolConfigForm.vue';

/**
 * Unified create/edit dialog for one-shot and recurring agent tasks.
 *
 * Behavior:
 *   • `schedule` prop set ⇒ edit-mode for an existing schedule. Mode is locked to 'recurring'.
 *   • `schedule` prop null ⇒ create mode. Operator picks one of three modes:
 *       - 'now'       → POST /agent-tasks            (immediate one-shot)
 *       - 'once'      → POST /agent-tasks            (with scheduledFor in the future)
 *       - 'recurring' → POST /agent-task-schedules   (cron, optional startAt)
 *
 * The form body is identical across modes; only the scheduling slice changes.
 */
type Mode = 'now' | 'once' | 'recurring';

const props = defineProps<{
  visible: boolean;
  projectId: number;
  /** When set, dialog opens in edit-mode for this existing recurring schedule. */
  schedule?: AgentTaskSchedule | null;
  /** Hint for which mode to default to when creating. Edit-mode ignores this. */
  initialMode?: Mode;
}>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  /** Fired after any successful create/edit so the parent can refresh both lists. */
  (e: 'saved'): void;
}>();

const toast = useToast();
const pools = ref<AgentPool[]>([]);
const tools = ref<AgentToolSpec[]>([]);
const loading = ref(false);
const saving  = ref(false);

// ── Project Rules of Engagement ────────────────────────────────────────────
const activeRules      = ref<ProjectRule[]>([]);
const bypassTimeWindow = ref(false);

const activeTimeWindows = computed(() =>
  activeRules.value.filter((r) => r.ruleType === 'time_window')
);
/** Returns {h, m, dow} in the platform timezone (1=Mon..7=Sun). */
function nowInPlatformTz(): { nowMins: number; dow: number } {
  const tz = platformTimezone.value || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  let h = 0, m = 0, dowLabel = 'Mon';
  for (const p of parts) {
    if (p.type === 'hour')    h = parseInt(p.value, 10) % 24; // '24' can appear for midnight
    if (p.type === 'minute')  m = parseInt(p.value, 10);
    if (p.type === 'weekday') dowLabel = p.value;
  }
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dow  = (days.indexOf(dowLabel) + 1) || 1; // 1=Mon..7=Sun
  return { nowMins: h * 60 + m, dow };
}

const outsideTimeWindow = computed(() => {
  if (!activeTimeWindows.value.length) return false;
  const { nowMins, dow } = nowInPlatformTz();
  function parseMins(c: Record<string, unknown>, timeKey: string, hourKey: string): number {
    if (c[timeKey]) {
      const [h, m] = String(c[timeKey]).split(':').map(Number);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    }
    return Number(c[hourKey] ?? 0) * 60;
  }
  return activeTimeWindows.value.some((r) => {
    const c = r.config;
    const startMins = parseMins(c, 'startTime', 'startHour');
    const endMins   = parseMins(c, 'endTime',   'endHour');
    const days = c.daysOfWeek as number[] | undefined;
    const dayOk = !days?.length || days.includes(dow);
    const timeOk = startMins <= endMins
      ? nowMins >= startMins && nowMins < endMins
      : nowMins >= startMins || nowMins < endMins;
    return !dayOk || !timeOk;
  });
});
const activeHeaderCount = computed(() =>
  activeRules.value.filter((r) => r.ruleType === 'required_header' || r.ruleType === 'required_user_agent').length
);
const activeRateLimit = computed(() => {
  const limits = activeRules.value
    .filter((r) => r.ruleType === 'rate_limit')
    .map((r) => {
      const c = r.config;
      const val = Number(c.value ?? 0);
      return c.unit === 'rpm' ? `${val}/min` : `${val}/sec`;
    });
  return limits[0] ?? null;
});

const { ruleRateLimitRps, ruleMaxConcurrency, ruleHeadersRecord } = useEngagementRuleLocks(activeRules);

const editing = computed(() => props.schedule != null);
const mode = ref<Mode>('now');

// ── Task templates (KB) ───────────────────────────────────────────────────
// Operators can apply a saved template (Select at the top) or snapshot the
// current form into a new template (button next to submit).
const templates = ref<AgentTaskTemplate[]>([]);
const templateId = ref<number | null>(null);
const showSaveTemplate = ref(false);
const templateSaveName = ref('');
const templateSaveDesc = ref('');
const templateSaving = ref(false);

const name       = ref('');
const poolId     = ref<number | null>(null);
const tool       = ref<string | null>('nmap');
const nacProfile = ref('');
const extraJson  = ref('');

/** Generic tool-args bag, keyed by AgentToolSpec.Field#key — replaces the 10 typed
 *  per-tool config refs. ToolConfigForm renders and mutates this directly. */
const toolArgs = ref<Record<string, unknown>>({});
const toolConfigFormRef = ref<InstanceType<typeof ToolConfigForm> | null>(null);

// Mode-specific scheduling fields
const scheduledForDate = ref<Date | null>(null);   // 'once'
const cron             = ref('0 3 * * *');         // 'recurring'
const startAtDate      = ref<Date | null>(null);   // 'recurring' (optional kickoff)
const enabled          = ref(true);                // 'recurring'
const batchSize        = ref<number | null>(null); // all modes (optional)
const maxTargetsPerRun = ref<number | null>(null); // recurring only (coverage rotation)
const timeoutMinutes   = ref<number | null>(60);   // all modes — null = no timeout

// ── Targets source ─────────────────────────────────────────────────────────
// Note: the legacy `scope_wildcards` selector was removed in favor of `scope_entries`
// with kinds=['domain_wildcard'] — the backend resolver strips the leading `*.` for
// either form. Old persisted schedules using scope_wildcards still resolve correctly.
type TargetsSource = 'manual' | 'scope_entries' | 'project_assets';
const targetsSource = ref<TargetsSource>('manual');

const targetsRaw = ref('');

const ALL_SCOPE_KIND_OPTIONS = [
  { label: 'Domains',          value: 'domain'          },
  { label: 'Domain wildcards', value: 'domain_wildcard' },
  { label: 'URLs',             value: 'url'             },
  { label: 'URL wildcards',    value: 'url_wildcard'    },
  { label: 'IPs',              value: 'ip'              },
  { label: 'CIDRs',            value: 'cidr'            },
];
const scopeKinds = ref<string[]>([]);

const ALL_ASSET_TYPE_OPTIONS = [
  { label: 'IP',       value: 'ip' },
  { label: 'Domain',   value: 'domain' },
  { label: 'Host',     value: 'host' },
  { label: 'Service',  value: 'service' },
  { label: 'Web app',  value: 'web_application' },
  { label: 'Endpoint', value: 'web_endpoint' },
];
const assetTypes = ref<string[]>([]);

// Operator-curated exclusions for the resolved-targets list. Stored on the selector
// so recurring schedules continue to exclude these specific values while still picking
// up new matching items as the scope/assets grow.
const excludeValues = ref<string[]>([]);

// ── "Pick specific" sub-mode ───────────────────────────────────────────────
// When scopeSubMode / assetSubMode is 'specific', the user hand-picks exact items.
// The result serializes as args.targets (frozen list) — no auto-refresh of new entries.
type SubMode = 'all' | 'specific';
const scopeSubMode  = ref<SubMode>('all');
const assetSubMode  = ref<SubMode>('all');
const assetScopeStrict = ref(false);

interface ScopePickItem { id: number; kind: string; value: string; displayValue: string }
interface AssetPickItem { id: number; type: string; identifier: string; targetValue: string }
const scopePickList   = ref<ScopePickItem[]>([]);
const assetPickList   = ref<AssetPickItem[]>([]);
const pickedScopeIds  = ref<Set<number>>(new Set());
const pickedAssetIds  = ref<Set<number>>(new Set());
const scopePickSearch = ref('');
const assetPickSearch = ref('');
const loadingScopePick = ref(false);
const loadingAssetPick = ref(false);

// Resolve current tool's capability sets — empty means "no restriction" (e.g. the
// tools endpoint hasn't loaded yet), which we treat as "show everything" to avoid
// blanking the picker mid-typing.
const currentSpec = computed(() => tools.value.find((t) => t.toolId === tool.value) ?? null);
const allowedScopeKinds = computed(() => new Set(currentSpec.value?.validScopeKinds ?? []));
const allowedAssetTypes = computed(() => new Set(currentSpec.value?.validAssetTypes ?? []));

const scopeKindOptions = computed(() =>
  allowedScopeKinds.value.size === 0
    ? ALL_SCOPE_KIND_OPTIONS
    : ALL_SCOPE_KIND_OPTIONS.filter((o) => allowedScopeKinds.value.has(o.value))
);
const assetTypeOptions = computed(() =>
  allowedAssetTypes.value.size === 0
    ? ALL_ASSET_TYPE_OPTIONS
    : ALL_ASSET_TYPE_OPTIONS.filter((o) => allowedAssetTypes.value.has(o.value))
);

// ── Resolved items + exclude management ───────────────────────────────────
// `previewItems` is the full (capped at 1000) list returned by the server. The user
// can click the X on any row to add it to `excludeValues`; the visible "kept" subset
// is what would actually be fired off as targets.
const previewItems = ref<string[]>([]);
const excludeSet = computed(() => new Set(excludeValues.value));
const keptItems  = computed(() => previewItems.value.filter((v) => !excludeSet.value.has(v)));
function toggleExclude(value: string) {
  const idx = excludeValues.value.indexOf(value);
  if (idx === -1) excludeValues.value = [...excludeValues.value, value];
  else excludeValues.value = excludeValues.value.filter((v) => v !== value);
}

/** Called when the operator clicks a Targets-source tab. Excludes belong to the
 *  previous strategy, so wipe them; kept selections within the same strategy stay. */
function setTargetsSource(src: TargetsSource) {
  if (targetsSource.value === src) return;
  targetsSource.value = src;
  excludeValues.value = [];
  scopeSubMode.value = 'all';
  assetSubMode.value = 'all';
  assetScopeStrict.value = false;
  pickedScopeIds.value = new Set();
  pickedAssetIds.value = new Set();
}

const previewCount  = ref<number | null>(null);
const previewSample = ref<string[]>([]);
const previewing    = ref(false);
const previewError  = ref<string | null>(null);

const selectorPayload = computed<TargetSelector | null>(() => {
  const excludes = excludeValues.value.length ? [...excludeValues.value] : undefined;
  switch (targetsSource.value) {
    case 'scope_entries':
      if (scopeSubMode.value === 'specific') return null;
      // No kinds selected = "all kinds" → still a valid selector
      return {
        type: 'scope_entries',
        kinds: scopeKinds.value.length ? [...scopeKinds.value] : undefined,
        excludeValues: excludes,
      };
    case 'project_assets':
      if (assetSubMode.value === 'specific') return null;
      // No types selected = "all asset types" → still a valid selector
      return {
        type: 'project_assets',
        assetTypes: assetTypes.value.length ? [...assetTypes.value] : undefined,
        scopeStrict: assetScopeStrict.value || undefined,
        excludeValues: excludes,
      };
    default:
      return null;
  }
});

const manualTargets = computed(() =>
  targetsRaw.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
);

const canSubmit = computed(() => {
  if (!poolId.value || !tool.value) return false;
  // In edit mode targets are already stored; skip targets validation
  if (!editing.value) {
    if (targetsSource.value === 'manual' && manualTargets.value.length === 0) return false;
    if (targetsSource.value === 'scope_entries') {
      if (scopeSubMode.value === 'specific' ? pickedScopeIds.value.size === 0 : selectorPayload.value === null) return false;
    }
    if (targetsSource.value === 'project_assets') {
      if (assetSubMode.value === 'specific' ? pickedAssetIds.value.size === 0 : selectorPayload.value === null) return false;
    }
  }
  if (mode.value === 'once') {
    if (!scheduledForDate.value) return false;
    if (scheduledForDate.value.getTime() <= Date.now()) return false;
  }
  if (mode.value === 'recurring' && !cron.value.trim()) return false;
  return true;
});

// When the tool changes (or the descriptor list arrives), prune selections that the
// new tool doesn't accept and seed sensible defaults so the operator isn't staring at
// an empty selection.
function applyToolConstraints() {
  const kinds = allowedScopeKinds.value;
  if (kinds.size) {
    scopeKinds.value = scopeKinds.value.filter((k) => kinds.has(k));
    if (!scopeKinds.value.length) {
      // Pick the first allowed kind as a sane default.
      const first = ALL_SCOPE_KIND_OPTIONS.find((o) => kinds.has(o.value));
      if (first) scopeKinds.value = [first.value];
    }
  }
  const types = allowedAssetTypes.value;
  if (types.size) {
    assetTypes.value = assetTypes.value.filter((t) => types.has(t));
    if (!assetTypes.value.length) {
      const first = ALL_ASSET_TYPE_OPTIONS.find((o) => types.has(o.value));
      if (first) assetTypes.value = [first.value];
    }
  }
}
watch([tool, currentSpec], applyToolConstraints);

// ── Pick-specific helpers ─────────────────────────────────────────────────
function resolvedScopeValue(e: { kind: string; value: string }): string {
  if (e.kind === 'domain_wildcard' && e.value.startsWith('*.')) return e.value.substring(2);
  return e.value;
}
function formatAssetTarget(a: { type: string; identifier: string }): string {
  if (a.type === 'service') {
    const slash = a.identifier.lastIndexOf('/');
    return slash > 0 ? a.identifier.substring(0, slash) : a.identifier;
  }
  return a.identifier;
}

const filteredScopePickList = computed(() => {
  const q = scopePickSearch.value.toLowerCase();
  let list = scopePickList.value;
  if (allowedScopeKinds.value.size > 0)
    list = list.filter((e) => allowedScopeKinds.value.has(e.kind));
  if (q) list = list.filter((e) => e.displayValue.toLowerCase().includes(q));
  return list;
});
const filteredAssetPickList = computed(() => {
  const q = assetPickSearch.value.toLowerCase();
  let list = assetPickList.value;
  if (allowedAssetTypes.value.size > 0)
    list = list.filter((a) => allowedAssetTypes.value.has(a.type));
  if (assetTypes.value.length > 0)
    list = list.filter((a) => assetTypes.value.includes(a.type));
  if (q) list = list.filter((a) =>
    a.targetValue.toLowerCase().includes(q) || a.identifier.toLowerCase().includes(q));
  return list;
});
const pickedScopeValues = computed(() =>
  scopePickList.value.filter((e) => pickedScopeIds.value.has(e.id)).map((e) => e.displayValue)
);
const pickedAssetValues = computed(() =>
  assetPickList.value.filter((a) => pickedAssetIds.value.has(a.id)).map((a) => a.targetValue)
);

function toggleScopePick(id: number) {
  const next = new Set(pickedScopeIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  pickedScopeIds.value = next;
}
function toggleAssetPick(id: number) {
  const next = new Set(pickedAssetIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  pickedAssetIds.value = next;
}
async function loadScopePickList() {
  if (scopePickList.value.length > 0) return;
  loadingScopePick.value = true;
  try {
    const project = await projectsApi.get(props.projectId);
    scopePickList.value = project.scopeEntries
      .filter((e) => e.inScope)
      .map((e) => ({ id: e.id, kind: e.kind, value: e.value, displayValue: resolvedScopeValue(e) }));
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load scope entries', detail: e?.message, life: 4000 });
  } finally {
    loadingScopePick.value = false;
  }
}
async function loadAssetPickList() {
  if (assetPickList.value.length > 0) return;
  loadingAssetPick.value = true;
  try {
    const all = await assetsApi.listAll({ projectId: props.projectId });
    assetPickList.value = all.map((a) => ({
      id: a.id, type: a.type, identifier: a.identifier, targetValue: formatAssetTarget(a),
    }));
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load assets', detail: e?.message, life: 4000 });
  } finally {
    loadingAssetPick.value = false;
  }
}
async function enterScopeSpecific() {
  scopeSubMode.value = 'specific';
  await loadScopePickList();
}
async function enterAssetSpecific() {
  assetSubMode.value = 'specific';
  await loadAssetPickList();
}

// Refresh preview when the selector changes. We send a selector *without* the
// excludes so the server returns the raw resolved set — letting the operator
// see what they're excluding from. The excludes are applied client-side.
const previewSelector = computed<TargetSelector | null>(() => {
  const sel = selectorPayload.value;
  if (!sel) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { excludeValues: _ex, ...rest } = sel as TargetSelector & { excludeValues?: string[] };
  return rest as TargetSelector;
});
watch(previewSelector, async (sel) => {
  if (!sel) {
    previewCount.value = null;
    previewSample.value = [];
    previewItems.value = [];
    previewError.value = null;
    return;
  }
  previewing.value = true;
  previewError.value = null;
  try {
    const r = await agentTasksApi.previewTargets(props.projectId, sel);
    previewCount.value = r.count;
    previewItems.value = r.items ?? r.sample ?? [];
    previewSample.value = previewItems.value.slice(0, 20);
  } catch (e: any) {
    previewError.value = e?.response?.data?.message ?? e.message;
    previewCount.value = null;
    previewSample.value = [];
    previewItems.value = [];
  } finally {
    previewing.value = false;
  }
}, { deep: true });

/**
 * Populate the form refs from a raw args object (the JSONB blob stored on
 * agent_task / agent_task_schedule / agent_task_template). Same logic used by
 * the schedule-edit path and the apply-template path so they stay in lockstep.
 * Tool args now round-trip as-is (every key IS an AgentToolSpec.Field#key already) —
 * so hydration is just "copy everything except targets/targetsFrom" instead of a
 * per-tool typed mapping.
 */
function hydrateFromArgs(args: Record<string, any>) {
  const tf = args.targetsFrom;
  if (tf && typeof tf === 'object') {
    if (tf.type === 'scope_wildcards') {
      // Legacy selector — surface as scope_entries[domain_wildcard].
      targetsSource.value = 'scope_entries';
      scopeKinds.value = ['domain_wildcard'];
    } else if (tf.type === 'scope_entries') {
      targetsSource.value = 'scope_entries';
      if (Array.isArray(tf.kinds)) scopeKinds.value = tf.kinds;
    } else if (tf.type === 'project_assets') {
      targetsSource.value = 'project_assets';
      if (Array.isArray(tf.assetTypes))  assetTypes.value = tf.assetTypes;
      else if (typeof tf.assetType === 'string') assetTypes.value = [tf.assetType];
      assetScopeStrict.value = tf.scopeStrict === true;
    }
    excludeValues.value = Array.isArray(tf.excludeValues) ? [...tf.excludeValues] : [];
    targetsRaw.value = '';
  } else if (args.targets !== undefined) {
    targetsSource.value = 'manual';
    targetsRaw.value = Array.isArray(args.targets) ? args.targets.join('\n') : (args.targets ?? '');
    excludeValues.value = [];
  }

  const generic: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'targets' || k === 'targetsFrom') continue;
    generic[k] = v;
  }
  toolArgs.value = generic;
}

/** Apply a template's stored args to the form. The operator picks pool / scheduling fresh. */
async function applyTemplate(id: number | null) {
  if (id == null) { templateId.value = null; return; }
  try {
    const tpl = await agentTaskTemplatesApi.get(id);
    tool.value = tpl.tool;
    if (!name.value.trim()) name.value = tpl.name;
    if (tpl.nacProfile) nacProfile.value = tpl.nacProfile;
    if (tpl.timeoutMinutes != null) timeoutMinutes.value = tpl.timeoutMinutes;
    let args: Record<string, any> = {};
    try { args = JSON.parse(tpl.args || '{}'); } catch { /* ignore */ }
    hydrateFromArgs(args);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to apply template',
      detail: e?.response?.data?.message ?? e?.message, life: 4000 });
  }
}

function openSaveTemplate() {
  if (!tool.value) {
    toast.add({ severity: 'warn', summary: 'Pick a tool first', life: 3000 });
    return;
  }
  templateSaveName.value = name.value.trim() || `${tool.value} template`;
  templateSaveDesc.value = '';
  showSaveTemplate.value = true;
}

async function saveAsTemplate() {
  if (!tool.value) return;
  const args = buildArgs();
  if (args === null) return;
  // Strip project-specific manual targets; `targetsFrom` selector is portable.
  if (Array.isArray((args as any).targets)) delete (args as any).targets;
  const name = templateSaveName.value.trim() || `${tool.value} template`;
  templateSaving.value = true;
  try {
    const created = await saveAsTemplateFlow(
      (overwrite) => agentTaskTemplatesApi.create({
        name,
        description: templateSaveDesc.value.trim() || null,
        tool: tool.value!,
        format: 'default',
        args: args as Record<string, unknown>,
        nacProfile: nacProfile.value || null,
      }, overwrite),
      name, 'task template');
    templates.value = [created, ...templates.value.filter((t) => t.id !== created.id)];
    showSaveTemplate.value = false;
    toast.add({ severity: 'success', summary: 'Template saved', detail: created.name, life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to save template',
      detail: e?.response?.data?.detail ?? e?.message, life: 4000 });
  } finally {
    templateSaving.value = false;
  }
}

watch(() => props.visible, async (v) => {
  if (!v) return;
  loading.value = true;
  scopeSubMode.value   = 'all';
  assetSubMode.value   = 'all';
  assetScopeStrict.value = false;
  scopePickList.value  = [];
  assetPickList.value  = [];
  pickedScopeIds.value = new Set();
  pickedAssetIds.value = new Set();
  scopePickSearch.value = '';
  assetPickSearch.value = '';
  try {
    const [p, t, tplPage, rules] = await Promise.all([
      agentPoolsApi.listForProject(props.projectId),
      agentTasksApi.tools(props.projectId),
      agentTaskTemplatesApi.list({ size: 200 }).catch(() => ({ items: [] as AgentTaskTemplate[], total: 0, totalPages: 0, page: 0, size: 0 })),
      projectRulesApi.list(props.projectId).catch(() => [] as ProjectRule[]),
    ]);
    pools.value = p;
    tools.value = t;
    templates.value = tplPage.items ?? [];
    activeRules.value = rules.filter((r) => r.enabled);
    bypassTimeWindow.value = false;
    templateId.value = null;

    if (props.schedule) {
      // ── Edit existing schedule ────────────────────────────────────────
      mode.value = 'recurring';
      name.value   = props.schedule.name ?? '';
      poolId.value = props.schedule.poolId;
      tool.value   = props.schedule.tool;
      cron.value   = props.schedule.cronExpression;
      enabled.value = props.schedule.enabled;
      nacProfile.value = props.schedule.nacProfile ?? '';
      startAtDate.value = props.schedule.startAt ? new Date(props.schedule.startAt) : null;
      batchSize.value = props.schedule.batchSize ?? null;
      maxTargetsPerRun.value = props.schedule.maxTargetsPerRun ?? null;
      timeoutMinutes.value = props.schedule.timeoutMinutes ?? null;
      try {
        const args = JSON.parse(props.schedule.args || '{}');
        hydrateFromArgs(args);
      } catch { /* ignore */ }
    } else {
      // ── Create mode ───────────────────────────────────────────────────
      mode.value = props.initialMode ?? 'now';
      name.value = '';
      poolId.value = p[0]?.id ?? null;
      tool.value   = t.some((x) => x.toolId === 'nmap') ? 'nmap' : (t[0]?.toolId ?? null);
      targetsSource.value = 'manual';
      targetsRaw.value = '';
      nacProfile.value = '';
      extraJson.value = '';
      batchSize.value = null;
      maxTargetsPerRun.value = null;
      timeoutMinutes.value = 60;
      // Selections (scopeKinds, assetTypes) get seeded by applyToolConstraints once
      // tools.value resolves — see the [tool, currentSpec] watcher.
      scopeKinds.value = [];
      assetTypes.value = [];
      assetScopeStrict.value = false;
      excludeValues.value = [];
      previewCount.value = null;
      previewSample.value = [];
      previewItems.value = [];
      toolArgs.value = {};
      scheduledForDate.value = null;
      cron.value = '0 3 * * *';
      startAtDate.value = null;
      enabled.value = true;
    }
    // Tools load happens above; trigger the constraint pass once now that we know
    // the descriptor list — needed because the watcher fires only on subsequent changes.
    applyToolConstraints();
  } finally { loading.value = false; }
});

function applyPreset(value: string) { cron.value = value; }

function buildArgs(): Record<string, unknown> | null {
  let extra: Record<string, unknown> = {};
  if (extraJson.value.trim()) {
    try { extra = JSON.parse(extraJson.value); }
    catch (e) {
      toast.add({ severity: 'error', summary: 'Invalid extra JSON', detail: String(e), life: 4000 });
      return null;
    }
  }
  const args: Record<string, unknown> = { ...extra };
  if (targetsSource.value === 'manual') {
    args.targets = manualTargets.value;
  } else if (targetsSource.value === 'scope_entries' && scopeSubMode.value === 'specific') {
    args.targets = pickedScopeValues.value;
  } else if (targetsSource.value === 'project_assets' && assetSubMode.value === 'specific') {
    args.targets = pickedAssetValues.value;
  } else if (selectorPayload.value) {
    args.targetsFrom = selectorPayload.value;
  }

  // Generic per-tool args, driven entirely by the selected tool's AgentToolSpec —
  // ToolConfigForm already keeps toolArgs in the exact shape each field declares.
  // Same required-field check ffuf's wordlist used to be the one hardcoded instance
  // of; now applies to every tool's declared required/conditionally-required fields.
  const validationError = toolConfigFormRef.value?.validate();
  if (validationError) {
    toast.add({ severity: 'error', summary: 'Missing required field', detail: validationError, life: 5000 });
    return null;
  }
  for (const [k, v] of Object.entries(toolArgs.value)) {
    if (v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0)) continue;
    args[k] = v;
  }

  return args;
}

async function submit() {
  if (!canSubmit.value) return;
  const args = buildArgs();
  if (args === null) return;

  saving.value = true;
  try {
    if (mode.value === 'recurring') {
      const body = {
        name: name.value || undefined,
        poolId: poolId.value!,
        tool: tool.value!,
        args,
        nacProfile: nacProfile.value || undefined,
        cronExpression: cron.value.trim(),
        enabled: enabled.value,
        startAt: startAtDate.value ? startAtDate.value.toISOString() : null,
        batchSize: batchSize.value || null,
        maxTargetsPerRun: maxTargetsPerRun.value || null,
        timeoutMinutes: timeoutMinutes.value,
      };
      if (props.schedule) {
        await agentTaskSchedulesApi.update(props.projectId, props.schedule.id, body);
      } else {
        await agentTaskSchedulesApi.create(props.projectId, body);
      }
    } else {
      // 'now' and 'once' both POST one-shot task(s); batchSize may create N tasks.
      const tasks = await agentTasksApi.create(props.projectId, {
        name: name.value || undefined,
        poolId: poolId.value!,
        tool: tool.value!,
        args,
        nacProfile: nacProfile.value || undefined,
        scheduledFor: mode.value === 'once' && scheduledForDate.value
          ? scheduledForDate.value.toISOString()
          : null,
        batchSize: batchSize.value || null,
        bypassTimeWindow: bypassTimeWindow.value,
        timeoutMinutes: timeoutMinutes.value,
      });
      if (tasks.length > 1) {
        toast.add({
          severity: 'success',
          summary: `${tasks.length} tasks queued`,
          detail: `Split into ${tasks.length} batches of up to ${batchSize.value} targets each`,
          life: 5000,
        });
      }
    }
    emit('saved');
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({
      severity: 'error',
      summary: editing.value ? 'Save failed' : 'Create failed',
      detail: e?.response?.data?.message ?? e.message, life: 5000,
    });
  } finally { saving.value = false; }
}

const headerText = computed(() => {
  if (editing.value) return 'Edit schedule';
  return 'Run agent task';
});

const submitLabel = computed(() => {
  if (editing.value) return 'Save';
  if (mode.value === 'now')       return 'Queue task';
  if (mode.value === 'once')      return 'Schedule task';
  return 'Create schedule';
});
const submitIcon = computed(() => {
  if (editing.value) return 'pi pi-check';
  if (mode.value === 'now') return 'pi pi-play';
  return 'pi pi-clock';
});
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)"
    modal :header="headerText" :style="{ width: 'min(640px, 95vw)' }">
    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else style="display:flex; flex-direction:column; gap:1rem;">

      <div v-if="!pools.length"
           style="background:color-mix(in srgb, var(--p-red-500) 12%, transparent);
                  border:1px solid color-mix(in srgb, var(--p-red-500) 35%, transparent);
                  border-radius: var(--ares-radius); padding:0.6rem 0.9rem; font-size:0.83rem;">
        No agent pools are granted to this project. Ask an MSSP admin to grant a pool first.
      </div>

      <!-- ── Rules of Engagement banner ──────────────────────────────────── -->
      <template v-if="activeRules.length">
        <div style="background:color-mix(in srgb, var(--p-blue-500) 10%, transparent);
                    border:1px solid color-mix(in srgb, var(--p-blue-500) 30%, transparent);
                    border-radius: var(--ares-radius); padding:0.6rem 0.9rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.3rem;">
          <div style="font-weight:600;">
            {{ activeRules.length }} active rule{{ activeRules.length !== 1 ? 's' : '' }}
          </div>
          <div v-if="activeHeaderCount" style="color:var(--ares-text-muted);">
            {{ activeHeaderCount }} required header{{ activeHeaderCount !== 1 ? 's' : '' }} will be injected automatically.
          </div>
          <div v-if="activeRateLimit" style="color:var(--ares-text-muted);">
            Rate limit: {{ activeRateLimit }} (most restrictive rule).
          </div>
          <div v-if="ruleMaxConcurrency" style="color:var(--ares-text-muted);">
            Max concurrency: {{ ruleMaxConcurrency }} threads (most restrictive rule).
          </div>
          <div v-if="activeTimeWindows.length" style="color:var(--ares-text-muted);">
            Time window:
            <span v-for="(r, i) in activeTimeWindows" :key="r.id">
              {{ r.config.startTime ?? (String(r.config.startHour ?? 0).padStart(2,'0') + ':00') }}–{{ r.config.endTime ?? (String(r.config.endHour ?? 0).padStart(2,'0') + ':00') }}<span v-if="i < activeTimeWindows.length - 1">, </span>
            </span>
            <span style="opacity:0.6; margin-left:0.35rem;">({{ platformTimezone }})</span>
          </div>
        </div>
        <!-- Time window violation warning + bypass -->
        <div v-if="outsideTimeWindow"
             style="background:color-mix(in srgb, var(--p-orange-500) 12%, transparent);
                    border:1px solid color-mix(in srgb, var(--p-orange-500) 35%, transparent);
                    border-radius: var(--ares-radius); padding:0.6rem 0.9rem; font-size:0.83rem; display:flex; flex-direction:column; gap:0.5rem;">
          <div style="display:flex; align-items:center; gap:0.4rem; font-weight:600;">
            <i class="pi pi-exclamation-triangle" />
            Outside testing window, task will be blocked unless bypassed
          </div>
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:400;">
            <input type="checkbox" v-model="bypassTimeWindow" style="cursor:pointer;" />
            Bypass time window (passive scanning only)
          </label>
        </div>
      </template>

      <!-- ── Template picker ─────────────────────────────────────────────
           Apply a saved KB Task Template to pre-fill tool + args. Only shows
           in create mode; editing an existing schedule keeps its own config. -->
      <div v-if="!editing && templates.length">
        <label class="ares-field-label">
          Apply template <span style="opacity:0.6;">(optional)</span>
        </label>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <Select v-model="templateId"
            :options="templates" option-label="name" option-value="id"
            placeholder="Pick a saved task template…" filter
            :filter-fields="['name', 'tool', 'description']"
            class="w-full"
            @change="applyTemplate(templateId)" />
          <Button v-if="templateId" icon="pi pi-times" text severity="secondary"
            size="small" v-tooltip="'Clear template selection'"
            @click="templateId = null" />
        </div>
      </div>

      <!-- ── When ──────────────────────────────────────────────────────── -->
      <div v-if="!editing">
        <label class="ares-field-label">When</label>
        <div class="mode-tabs">
          <button v-for="m in ([
              { v: 'now',       icon: 'pi-play',  label: 'Run now',  hint: 'Queue immediately' },
              { v: 'once',      icon: 'pi-clock', label: 'Schedule', hint: 'Run once, at a specific date & time' },
              { v: 'recurring', icon: 'pi-replay',label: 'Recurring',hint: 'Cron expression — fires repeatedly' },
            ] as const)" :key="m.v"
            type="button" class="mode-tab"
            :class="{ 'mode-tab--active': mode === m.v }"
            @click="mode = m.v">
            <i :class="['pi', m.icon]" />
            <div>
              <div class="mode-tab__title">{{ m.label }}</div>
              <div class="mode-tab__hint">{{ m.hint }}</div>
            </div>
          </button>
        </div>
      </div>

      <div>
        <label class="ares-field-label">Name <span style="opacity:0.6;">(optional)</span></label>
        <InputText v-model="name" placeholder="e.g. Daily nmap of corp range" style="width:100%;" />
      </div>

      <div>
        <label class="ares-field-label">Pool</label>
        <Select v-model="poolId" :options="pools" option-label="name" option-value="id"
          :disabled="!pools.length" style="width:100%;" />
      </div>

      <div>
        <label class="ares-field-label">Tool</label>
        <AgentToolPicker v-model="tool" :tools="tools" />
      </div>

      <ToolConfigForm v-if="currentSpec" ref="toolConfigFormRef"
        :spec="currentSpec" v-model="toolArgs"
        :locked-rate-limit="ruleRateLimitRps" :locked-concurrency="ruleMaxConcurrency"
        :locked-headers="ruleHeadersRecord" />

      <!-- ── Targets source ─────────────────────────────────────────────── -->
      <div>
        <label class="ares-field-label">Targets source</label>
        <div class="src-tabs">
          <button v-for="opt in ([
              { v: 'manual',           label: 'Manual entry' },
              { v: 'scope_entries',    label: 'Scope entries' },
              { v: 'project_assets',   label: 'Project assets' },
            ] as const)" :key="opt.v"
            type="button" class="src-tab"
            :class="{ 'src-tab--active': targetsSource === opt.v }"
            @click="setTargetsSource(opt.v)">
            {{ opt.label }}
          </button>
        </div>

        <Textarea v-if="targetsSource === 'manual'"
          v-model="targetsRaw" rows="3"
          placeholder="10.0.0.0/24
example.com"
          class="w-full" auto-resize />

        <div v-else-if="targetsSource === 'scope_entries'" style="margin-top:0.5rem;">
          <div class="sub-mode-tabs">
            <button type="button" class="sub-mode-tab"
              :class="{ 'sub-mode-tab--active': scopeSubMode === 'all' }"
              @click="scopeSubMode = 'all'">All matching</button>
            <button type="button" class="sub-mode-tab"
              :class="{ 'sub-mode-tab--active': scopeSubMode === 'specific' }"
              @click="enterScopeSpecific()">Pick specific</button>
          </div>
          <template v-if="scopeSubMode === 'all'">
            <div v-if="!scopeKindOptions.length" style="font-size:0.78rem; color:var(--ares-text-muted);">
              This tool doesn't accept any scope-entry kinds.
            </div>
            <div v-else style="display:flex; gap:0.4rem; flex-wrap:wrap;">
              <label v-for="opt in scopeKindOptions" :key="opt.value" class="kind-chip"
                :class="{ 'kind-chip--active': scopeKinds.includes(opt.value) }">
                <input type="checkbox" :value="opt.value" v-model="scopeKinds" style="display:none;" />
                {{ opt.label }}
              </label>
            </div>
          </template>
          <template v-else>
            <div v-if="loadingScopePick" style="font-size:0.78rem; color:var(--ares-text-muted);">Loading…</div>
            <template v-else>
              <InputText v-model="scopePickSearch" placeholder="Search entries…" size="small"
                style="width:100%; margin-bottom:0.4rem;" />
              <div class="pick-list">
                <label v-for="item in filteredScopePickList" :key="item.id" class="pick-row"
                  :class="{ 'pick-row--checked': pickedScopeIds.has(item.id) }">
                  <input type="checkbox" :checked="pickedScopeIds.has(item.id)"
                    @change="toggleScopePick(item.id)" />
                  <code class="pick-val">{{ item.displayValue }}</code>
                  <span class="pick-badge">{{ item.kind }}</span>
                </label>
                <div v-if="!filteredScopePickList.length" class="pick-empty">No matching entries</div>
              </div>
              <div v-if="pickedScopeIds.size" class="pick-summary">
                {{ pickedScopeIds.size }} selected
              </div>
            </template>
          </template>
        </div>

        <div v-else style="margin-top:0.5rem;">
          <div class="sub-mode-tabs">
            <button type="button" class="sub-mode-tab"
              :class="{ 'sub-mode-tab--active': assetSubMode === 'all' }"
              @click="assetSubMode = 'all'">All matching</button>
            <button type="button" class="sub-mode-tab"
              :class="{ 'sub-mode-tab--active': assetSubMode === 'specific' }"
              @click="enterAssetSpecific()">Pick specific</button>
          </div>
          <template v-if="assetSubMode === 'all'">
            <div v-if="!assetTypeOptions.length" style="font-size:0.78rem; color:var(--ares-text-muted);">
              This tool doesn't accept any asset types.
            </div>
            <div v-else style="display:flex; gap:0.4rem; flex-wrap:wrap;">
              <label v-for="opt in assetTypeOptions" :key="opt.value" class="kind-chip"
                :class="{ 'kind-chip--active': assetTypes.includes(opt.value) }">
                <input type="checkbox" :value="opt.value" v-model="assetTypes" style="display:none;" />
                {{ opt.label }}
              </label>
            </div>
            <label class="scope-strict-toggle" style="display:flex; align-items:center; gap:0.4rem; margin-top:0.5rem; font-size:0.78rem; cursor:pointer; user-select:none;">
              <input type="checkbox" v-model="assetScopeStrict" style="cursor:pointer;" />
              <span>In-scope only</span>
              <span style="color:var(--ares-text-muted);">(exclude unknowns)</span>
            </label>
          </template>
          <template v-else>
            <div v-if="!assetTypeOptions.length" style="font-size:0.78rem; color:var(--ares-text-muted);">
              This tool doesn't accept any asset types.
            </div>
            <template v-else>
              <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.4rem;">
                <label v-for="opt in assetTypeOptions" :key="opt.value" class="kind-chip"
                  :class="{ 'kind-chip--active': assetTypes.includes(opt.value) }">
                  <input type="checkbox" :value="opt.value" v-model="assetTypes" style="display:none;" />
                  {{ opt.label }}
                </label>
              </div>
              <div v-if="loadingAssetPick" style="font-size:0.78rem; color:var(--ares-text-muted);">Loading…</div>
              <template v-else>
                <InputText v-model="assetPickSearch" placeholder="Search assets…" size="small"
                  style="width:100%; margin-bottom:0.4rem;" />
                <div class="pick-list">
                  <label v-for="item in filteredAssetPickList" :key="item.id" class="pick-row"
                    :class="{ 'pick-row--checked': pickedAssetIds.has(item.id) }">
                    <input type="checkbox" :checked="pickedAssetIds.has(item.id)"
                      @change="toggleAssetPick(item.id)" />
                    <code class="pick-val">{{ item.targetValue }}</code>
                    <span class="pick-badge">{{ item.type }}</span>
                  </label>
                  <div v-if="!filteredAssetPickList.length" class="pick-empty">No matching assets</div>
                </div>
                <div v-if="pickedAssetIds.size" class="pick-summary">
                  {{ pickedAssetIds.size }} selected
                </div>
              </template>
            </template>
          </template>
        </div>

        <div v-if="(targetsSource === 'scope_entries' && scopeSubMode === 'all') || (targetsSource === 'project_assets' && assetSubMode === 'all')" class="preview-strip">
          <i class="pi pi-eye" style="font-size:0.72rem;" />
          <span v-if="previewing">Resolving…</span>
          <span v-else-if="previewError" style="color: var(--p-red-400);">{{ previewError }}</span>
          <span v-else-if="previewCount === null">—</span>
          <span v-else>
            <strong>{{ keptItems.length }}</strong>
            target{{ keptItems.length === 1 ? '' : 's' }} right now
            <span v-if="excludeValues.length" style="color:var(--ares-text-muted); margin-left:0.4rem;">
              · {{ excludeValues.length }} excluded
            </span>
          </span>
        </div>

        <!-- Full resolved list with per-row exclude toggle. Schedules persist the
             excludes so future fires keep dropping these specific values while still
             picking up newly-resolved items. -->
        <div v-if="((targetsSource === 'scope_entries' && scopeSubMode === 'all') || (targetsSource === 'project_assets' && assetSubMode === 'all')) && previewItems.length" class="resolved-list">
          <div v-for="v in previewItems" :key="v" class="resolved-row"
            :class="{ 'resolved-row--excluded': excludeSet.has(v) }">
            <code class="resolved-row__val">{{ v }}</code>
            <button type="button" class="resolved-row__btn"
              v-tooltip.left="excludeSet.has(v) ? 'Include again' : 'Exclude'"
              @click="toggleExclude(v)">
              <i :class="['pi', excludeSet.has(v) ? 'pi-plus' : 'pi-times']" />
            </button>
          </div>
          <div v-if="previewCount !== null && previewCount > previewItems.length" class="resolved-list__footer">
            +{{ previewCount - previewItems.length }} more (showing first {{ previewItems.length }})
          </div>
        </div>
      </div>

      <div>
        <label class="ares-field-label">
          Max targets per batch <span style="opacity:0.6;">(optional)</span>
        </label>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <input
            type="number"
            :value="batchSize ?? ''"
            @input="batchSize = ($event.target as HTMLInputElement).value ? parseInt(($event.target as HTMLInputElement).value) : null"
            min="1"
            step="1"
            placeholder="No limit"
            class="ares-number-input"
          />
          <button v-if="batchSize" type="button" class="preset-btn" @click="batchSize = null">Clear</button>
        </div>
        <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
          <span v-if="!batchSize">All targets run in a single task.</span>
          <span v-else>
            Targets will be split into batches of up to {{ batchSize }}.
            Each batch runs as a separate task so agents stay responsive.
          </span>
        </div>
      </div>

      <div>
        <label class="ares-field-label">
          Timeout <span style="opacity:0.6;">(minutes)</span>
        </label>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <input
            type="number"
            :value="timeoutMinutes ?? ''"
            :disabled="timeoutMinutes === null"
            @input="timeoutMinutes = ($event.target as HTMLInputElement).value ? parseInt(($event.target as HTMLInputElement).value) : null"
            min="1"
            step="1"
            placeholder="60"
            class="ares-number-input"
          />
          <label style="display:flex; align-items:center; gap:0.35rem; font-size:0.8rem; color:var(--ares-text-muted);">
            <input
              type="checkbox"
              :checked="timeoutMinutes === null"
              @change="timeoutMinutes = ($event.target as HTMLInputElement).checked ? null : 60"
            />
            No timeout
          </label>
        </div>
        <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
          <span v-if="timeoutMinutes === null">The task can run indefinitely.</span>
          <span v-else>Auto-cancelled if still running after {{ timeoutMinutes }} minute(s).</span>
        </div>
      </div>

      <div v-if="mode === 'recurring'">
        <label class="ares-field-label">
          Max targets per run <span style="opacity:0.6;">(optional — coverage rotation)</span>
        </label>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <input
            type="number"
            :value="maxTargetsPerRun ?? ''"
            @input="maxTargetsPerRun = ($event.target as HTMLInputElement).value ? parseInt(($event.target as HTMLInputElement).value) : null"
            min="1"
            step="1"
            placeholder="No cap"
            class="ares-number-input"
          />
          <button v-if="maxTargetsPerRun" type="button" class="preset-btn" @click="maxTargetsPerRun = null">Clear</button>
        </div>
        <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
          <span v-if="!maxTargetsPerRun">All resolved targets are included every run.</span>
          <span v-else>
            Each run samples {{ maxTargetsPerRun }} random targets from the uncovered subset.
            Once all targets have been visited the cycle resets automatically.
          </span>
        </div>
      </div>

      <div>
        <label class="ares-field-label">NAC profile <span style="opacity:0.6;">(optional)</span></label>
        <InputText v-model="nacProfile" placeholder="corp-laptops" style="width:100%;" />
        <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
          Source IP is detected by the agent at runtime — private interface for internal
          targets, public NAT'd IP for Internet targets.
        </div>
      </div>

      <!-- ── Mode-specific scheduling section ──────────────────────────── -->
      <div v-if="mode === 'once'">
        <label class="ares-field-label">Run at</label>
        <DatePicker v-model="scheduledForDate" show-time hour-format="24"
          :first-day-of-week="1" date-format="yy-mm-dd" placeholder="yyyy-mm-dd hh:mm"
          :min-date="new Date()" class="w-full" />
        <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
          Task stays in <code>pending</code> until this moment, then a pool member picks it up.
        </div>
      </div>

      <template v-if="mode === 'recurring'">
        <div>
          <label class="ares-field-label">Cron expression</label>
          <InputText v-model="cron" style="width:100%; font-family:monospace;" />
          <div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-top:0.4rem;">
            <button v-for="p in CRON_PRESETS" :key="p.value"
              type="button" class="preset-btn" @click="applyPreset(p.value)">{{ p.label }}</button>
          </div>
        </div>

        <div>
          <label class="ares-field-label">Start from <span style="opacity:0.6;">(optional)</span></label>
          <DatePicker v-model="startAtDate" show-time hour-format="24"
            :first-day-of-week="1" date-format="yy-mm-dd" placeholder="yyyy-mm-dd hh:mm"
            show-button-bar class="w-full" />
          <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
            Schedule lies dormant until this moment, then the first cron fire happens.
            Leave empty to start firing from the next matching slot.
          </div>
        </div>

        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem;">
          <input type="checkbox" v-model="enabled" /> Enabled
        </label>
      </template>

      <details>
        <summary style="cursor:pointer; font-size:0.8rem; color:var(--ares-text-muted);">
          Advanced — extra args (JSON)
        </summary>
        <Textarea v-model="extraJson" rows="3" placeholder='{"someField": "value"}'
          class="w-full" auto-resize style="margin-top:0.5rem;" />
      </details>

      <div style="display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
        <Button icon="pi pi-bookmark" label="Save as template" text size="small"
          :disabled="!tool"
          v-tooltip.right="'Save current tool + args config to the KB for reuse on other projects'"
          @click="openSaveTemplate" />
        <div style="display:flex; gap:0.5rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
          <Button :label="submitLabel" :icon="submitIcon" size="small"
            :loading="saving" :disabled="!canSubmit" @click="submit" />
        </div>
      </div>
    </div>

    <!-- ── Save-as-template prompt ────────────────────────────────────── -->
    <Dialog v-model:visible="showSaveTemplate" modal header="Save as task template"
      :style="{ width: 'min(28rem, 95vw)' }">
      <div style="display:flex; flex-direction:column; gap:0.75rem; padding-top:0.25rem;">
        <div style="font-size:0.8rem; color:var(--ares-text-muted);">
          Stores the current tool + args (without scheduling or pool) in the KB so you can
          reuse this configuration on other projects.
        </div>
        <div>
          <label class="ares-field-label">Name</label>
          <InputText v-model="templateSaveName" class="w-full" />
        </div>
        <div>
          <label class="ares-field-label">Description <span style="opacity:0.6;">(optional)</span></label>
          <Textarea v-model="templateSaveDesc" rows="3" auto-resize class="w-full" />
        </div>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:0.25rem;">
          <Button label="Cancel" severity="secondary" size="small" @click="showSaveTemplate = false" />
          <Button label="Save" icon="pi pi-check" size="small"
            :loading="templateSaving" :disabled="!templateSaveName.trim()"
            @click="saveAsTemplate" />
        </div>
      </div>
    </Dialog>
  </Dialog>
</template>

<style scoped>
.ares-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
.mode-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.mode-tab {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  color: var(--ares-text-2);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.mode-tab:hover { border-color: var(--p-primary-400); }
.mode-tab--active {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 18%, var(--ares-surface-2));
  color: var(--ares-text-1);
}
.mode-tab i { font-size: 0.95rem; margin-top: 0.1rem; color: var(--p-primary-400); }
.mode-tab__title { font-size: 0.83rem; font-weight: 600; }
.mode-tab__hint  { font-size: 0.7rem; color: var(--ares-text-muted); line-height: 1.25; margin-top: 0.15rem; }

.src-tabs {
  display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.55rem;
}
.src-tab {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: transparent;
  color: var(--ares-text-2);
  font-size: 0.78rem;
  cursor: pointer;
  font-family: inherit;
}
.src-tab:hover { border-color: var(--p-primary-400); }
.src-tab--active {
  background: var(--p-primary-color);
  color: #fff;
  border-color: var(--p-primary-color);
}
.src-hint { font-size: 0.78rem; color: var(--ares-text-muted); margin: 0; line-height: 1.45; }
.kind-chip {
  display: inline-block; padding: 0.25rem 0.6rem;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  font-size: 0.75rem; cursor: pointer; user-select: none;
  color: var(--ares-text-muted); background: var(--ares-surface-2);
}
.kind-chip--active {
  background: color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  border-color: color-mix(in srgb, var(--p-primary-color) 60%, transparent);
  color: var(--ares-text-1);
}
.preview-strip {
  display: flex; align-items: center; gap: 0.4rem; margin-top: 0.55rem;
  font-size: 0.78rem; color: var(--ares-text-2);
}
.resolved-list {
  margin-top: 0.55rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-sunken);
  max-height: 240px;
  overflow-y: auto;
}
.resolved-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.3rem 0.55rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 60%, transparent);
  font-size: 0.78rem;
}
.resolved-row:last-child { border-bottom: none; }
.resolved-row__val {
  font-family: monospace;
  flex: 1;
  color: var(--ares-text-1);
  word-break: break-all;
}
.resolved-row__btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--ares-text-muted);
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border-radius: var(--ares-radius);
  font-family: inherit;
}
.resolved-row__btn:hover {
  border-color: var(--ares-border);
  color: var(--p-red-400);
}
.resolved-row--excluded .resolved-row__val {
  text-decoration: line-through;
  color: var(--ares-text-muted);
  opacity: 0.55;
}
.resolved-row--excluded .resolved-row__btn { color: var(--p-green-400); }
.resolved-row--excluded .resolved-row__btn:hover { color: var(--p-green-300); border-color: var(--ares-border); }
.resolved-list__footer {
  padding: 0.35rem 0.55rem;
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  background: var(--ares-surface-2);
}
.preset-btn {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  color: var(--ares-text-2);
  font-size: 0.72rem;
  cursor: pointer;
}
.preset-btn:hover { background: var(--ares-surface-raised); }
.ares-number-input {
  width: 120px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
  color: var(--ares-text-1);
  font-size: 0.85rem;
  font-family: inherit;
  outline: none;
}
.ares-number-input:focus { border-color: var(--p-primary-color); }
.ares-number-input::placeholder { color: var(--ares-text-muted); }
.sub-mode-tabs { display: flex; gap: 0.35rem; margin-bottom: 0.5rem; }
.sub-mode-tab {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: transparent;
  color: var(--ares-text-2);
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
}
.sub-mode-tab:hover { border-color: var(--p-primary-400); }
.sub-mode-tab--active {
  background: color-mix(in srgb, var(--p-primary-color) 20%, transparent);
  border-color: var(--p-primary-color);
  color: var(--ares-text-1);
}
.pick-list {
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-sunken);
  max-height: 200px;
  overflow-y: auto;
}
.pick-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.55rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ares-border) 50%, transparent);
  font-size: 0.78rem;
  cursor: pointer;
  user-select: none;
}
.pick-row:last-child { border-bottom: none; }
.pick-row:hover { background: color-mix(in srgb, var(--p-primary-color) 8%, transparent); }
.pick-row--checked { background: color-mix(in srgb, var(--p-primary-color) 14%, transparent); }
.pick-val { font-family: monospace; flex: 1; color: var(--ares-text-1); word-break: break-all; }
.pick-badge {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
  color: var(--ares-text-muted);
  border: 1px solid var(--ares-border);
  white-space: nowrap;
  flex-shrink: 0;
}
.pick-empty { padding: 0.6rem; font-size: 0.78rem; color: var(--ares-text-muted); text-align: center; }
.pick-summary { font-size: 0.72rem; color: var(--ares-text-muted); margin-top: 0.3rem; }
</style>
