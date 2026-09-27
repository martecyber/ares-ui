<script setup lang="ts">
/**
 * Editor for KB Task Templates. Mirrors the configurable bits of
 * AgentTaskFormDialog (tool picker, generic tool config form, targets source)
 * but strips everything project-bound — pool, scheduling, target preview, and
 * Rules-of-Engagement locks (no project to read rules from).
 *
 * The targets source is still editable so operators can lock in a portable
 * selector (e.g. scope_entries with kinds=[domain]); manual `targets` are
 * supported too but won't carry over usefully across projects.
 */
import { computed, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import {
  agentTaskTemplatesApi,
  type AgentTaskTemplate,
} from '@/api/agent-task-templates';
import type { AgentToolSpec, TargetSelector } from '@/api/agent-tasks';
import AgentToolPicker from './AgentToolPicker.vue';
import ToolConfigForm from './ToolConfigForm.vue';

const props = defineProps<{
  visible: boolean;
  /** When set, dialog opens in edit-mode for this template. Null = create. */
  template?: AgentTaskTemplate | null;
}>();
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void;
  /** Fired after a successful create/update with the saved template payload. */
  (e: 'saved', t: AgentTaskTemplate): void;
}>();

const toast = useToast();
const loading = ref(false);
const saving  = ref(false);
const tools   = ref<AgentToolSpec[]>([]);

const editing = computed(() => props.template != null);

const name        = ref('');
const description = ref('');
const tool        = ref<string | null>('nmap');
const nacProfile  = ref('');
const timeoutMinutes = ref<number | null>(60); // null = no timeout
const extraJson   = ref('');

const toolArgs = ref<Record<string, unknown>>({});
const toolConfigFormRef = ref<InstanceType<typeof ToolConfigForm> | null>(null);

type TargetsSource = 'manual' | 'scope_entries' | 'project_assets';
const targetsSource = ref<TargetsSource>('manual');
const targetsRaw    = ref('');

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
const excludeValues = ref<string[]>([]);

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

function applyToolConstraints() {
  const kinds = allowedScopeKinds.value;
  if (kinds.size) {
    scopeKinds.value = scopeKinds.value.filter((k) => kinds.has(k));
  }
  const types = allowedAssetTypes.value;
  if (types.size) {
    assetTypes.value = assetTypes.value.filter((t) => types.has(t));
  }
}
watch([tool, currentSpec], applyToolConstraints);

const manualTargets = computed(() =>
  targetsRaw.value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
);

const selectorPayload = computed<TargetSelector | null>(() => {
  const excludes = excludeValues.value.length ? [...excludeValues.value] : undefined;
  switch (targetsSource.value) {
    case 'scope_entries':
      return scopeKinds.value.length
        ? { type: 'scope_entries', kinds: [...scopeKinds.value], excludeValues: excludes }
        : null;
    case 'project_assets':
      return assetTypes.value.length
        ? { type: 'project_assets', assetTypes: [...assetTypes.value], excludeValues: excludes }
        : null;
    default:
      return null;
  }
});

function setTargetsSource(src: TargetsSource) {
  if (targetsSource.value === src) return;
  targetsSource.value = src;
  excludeValues.value = [];
}

const canSubmit = computed(() => {
  if (!name.value.trim()) return false;
  if (!tool.value) return false;
  return true;
});

/**
 * Populate the form from a raw args object (agent_task_template.args). Tool args
 * round-trip as-is (every key IS an AgentToolSpec.Field#key already) — hydration is
 * just "copy everything except targets/targetsFrom" instead of a per-tool mapping.
 */
function hydrateFromArgs(args: Record<string, any>) {
  const tf = args.targetsFrom;
  if (tf && typeof tf === 'object') {
    if (tf.type === 'scope_wildcards') {
      targetsSource.value = 'scope_entries';
      scopeKinds.value = ['domain_wildcard'];
    } else if (tf.type === 'scope_entries') {
      targetsSource.value = 'scope_entries';
      if (Array.isArray(tf.kinds)) scopeKinds.value = tf.kinds;
    } else if (tf.type === 'project_assets') {
      targetsSource.value = 'project_assets';
      if (Array.isArray(tf.assetTypes))  assetTypes.value = tf.assetTypes;
      else if (typeof tf.assetType === 'string') assetTypes.value = [tf.assetType];
    }
    excludeValues.value = Array.isArray(tf.excludeValues) ? [...tf.excludeValues] : [];
    targetsRaw.value = '';
  } else if (args.targets !== undefined) {
    targetsSource.value = 'manual';
    targetsRaw.value = Array.isArray(args.targets) ? args.targets.join('\n') : (args.targets ?? '');
    excludeValues.value = [];
  } else {
    targetsSource.value = 'manual';
    targetsRaw.value = '';
    excludeValues.value = [];
  }

  const generic: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k === 'targets' || k === 'targetsFrom') continue;
    generic[k] = v;
  }
  toolArgs.value = generic;
}

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
    // Manual targets in a TEMPLATE rarely carry over usefully — but if the
    // operator wrote some explicitly (e.g. a baseline list of public assets),
    // we preserve them. The Save-as-template path in AgentTaskFormDialog
    // strips manual targets; the KB editor doesn't, since the operator is
    // making an explicit choice here.
    if (manualTargets.value.length) args.targets = manualTargets.value;
  } else if (selectorPayload.value) {
    args.targetsFrom = selectorPayload.value;
  }

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

watch(() => props.visible, async (v) => {
  if (!v) return;
  loading.value = true;
  try {
    tools.value = await agentTaskTemplatesApi.tools();
    if (props.template) {
      // Edit mode
      const t = props.template;
      name.value        = t.name;
      description.value = t.description ?? '';
      tool.value        = t.tool;
      nacProfile.value  = t.nacProfile ?? '';
      timeoutMinutes.value = t.timeoutMinutes ?? null;
      extraJson.value   = '';
      toolArgs.value = {};
      scopeKinds.value = [];
      assetTypes.value = [];
      let parsed: Record<string, any> = {};
      try { parsed = JSON.parse(t.args || '{}'); } catch { /* ignore */ }
      hydrateFromArgs(parsed);
    } else {
      // Create mode
      name.value = '';
      description.value = '';
      tool.value = tools.value.some((x) => x.toolId === 'nmap') ? 'nmap' : (tools.value[0]?.toolId ?? null);
      nacProfile.value = '';
      timeoutMinutes.value = 60;
      extraJson.value = '';
      toolArgs.value = {};
      targetsSource.value = 'manual';
      targetsRaw.value = '';
      scopeKinds.value = [];
      assetTypes.value = [];
      excludeValues.value = [];
    }
    applyToolConstraints();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to load editor',
      detail: e?.response?.data?.message ?? e?.message, life: 4000 });
  } finally {
    loading.value = false;
  }
});

async function submit() {
  if (!canSubmit.value) return;
  const args = buildArgs();
  if (args === null) return;
  saving.value = true;
  try {
    const body = {
      name: name.value.trim(),
      description: description.value.trim() || null,
      tool: tool.value!,
      format: 'default',
      args: args as Record<string, unknown>,
      nacProfile: nacProfile.value || null,
      timeoutMinutes: timeoutMinutes.value,
    };
    const saved = props.template
      ? await agentTaskTemplatesApi.update(props.template.id, body)
      : await agentTaskTemplatesApi.create(body);
    toast.add({ severity: 'success',
      summary: props.template ? 'Template updated' : 'Template created',
      detail: saved.name, life: 3000 });
    emit('saved', saved);
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed to save template',
      detail: e?.response?.data?.message ?? e?.message, life: 5000 });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)"
    modal :header="editing ? 'Edit task template' : 'New task template'"
    :style="{ width: 'min(640px, 95vw)' }">
    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <div v-else style="display:flex; flex-direction:column; gap:1rem;">

      <div>
        <label class="ares-field-label">Name</label>
        <InputText v-model="name" placeholder="e.g. Daily nmap of corp range" style="width:100%;" />
      </div>

      <div>
        <label class="ares-field-label">Description <span style="opacity:0.6;">(optional)</span></label>
        <Textarea v-model="description" rows="2" auto-resize class="w-full"
          placeholder="What is this configuration for? When should it be applied?" />
      </div>

      <div>
        <label class="ares-field-label">Tool</label>
        <AgentToolPicker v-model="tool" :tools="tools" />
      </div>

      <ToolConfigForm v-if="currentSpec" ref="toolConfigFormRef"
        :spec="currentSpec" v-model="toolArgs" />

      <div>
        <label class="ares-field-label">Targets source</label>
        <div class="src-tabs">
          <button v-for="opt in ([
              { v: 'manual',         label: 'Manual entry' },
              { v: 'scope_entries',  label: 'Scope entries' },
              { v: 'project_assets', label: 'Project assets' },
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
        </div>
        <div v-else-if="targetsSource === 'project_assets'" style="margin-top:0.5rem;">
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
        </div>
        <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.4rem; line-height:1.4;">
          Templates aren't bound to a project — selectors resolve against whichever project
          the operator picks when they apply this template to a new task.
        </div>
      </div>

      <div>
        <label class="ares-field-label">NAC profile <span style="opacity:0.6;">(optional)</span></label>
        <InputText v-model="nacProfile" style="width:100%;" placeholder="e.g. mssp-guest" />
      </div>

      <div>
        <label class="ares-field-label">Timeout <span style="opacity:0.6;">(minutes)</span></label>
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
          <span v-if="timeoutMinutes === null">Tasks created from this template can run indefinitely.</span>
          <span v-else>Tasks created from this template are auto-cancelled after {{ timeoutMinutes }} minute(s).</span>
        </div>
      </div>

      <details>
        <summary style="cursor:pointer; font-size:0.8rem; color:var(--ares-text-muted);">
          Advanced — extra args (JSON)
        </summary>
        <Textarea v-model="extraJson" rows="3" placeholder='{"someField": "value"}'
          class="w-full" auto-resize style="margin-top:0.5rem;" />
      </details>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <Button label="Cancel" severity="secondary" size="small" @click="emit('update:visible', false)" />
        <Button :label="editing ? 'Save changes' : 'Create template'" icon="pi pi-check" size="small"
          :loading="saving" :disabled="!canSubmit" @click="submit" />
      </div>
    </div>
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
</style>
