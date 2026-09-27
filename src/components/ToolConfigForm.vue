<script setup lang="ts">
/**
 * Generic, spec-driven replacement for the 10 hand-built XConfigPanel.vue components —
 * renders one form control per AgentToolSpec.Field, the same declarative source
 * ares-agent's Python interpreter (build_cmd_from_spec) reads to build the tool's argv.
 * A new plugin's tool needs zero frontend changes to get a working config form.
 *
 * modelValue is the tool's args object (field key -> raw value) — the same shape that
 * gets JSON-encoded into agent_task.args / agent_task_schedule.args / agent_task_template.args.
 * The parent still owns `targets`/`targetsFrom` (not a declared field) and merges it in
 * separately at submit time, same as before.
 */
import { computed, reactive, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import HttpHeadersEditor from './HttpHeadersEditor.vue';
import { kbWordlistsApi, type KbWordlist } from '@/api/kb-wordlists';
import type { AgentToolSpec, AgentToolSpecField } from '@/api/agent-tasks';

const props = defineProps<{
  spec: AgentToolSpec | null;
  modelValue: Record<string, unknown>;
  /** Rules-of-Engagement locks — see AgentToolSpecField#ruleBinding's own doc. */
  lockedRateLimit?: number | null;
  lockedConcurrency?: number | null;
  lockedHeaders?: Record<string, string> | null;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, unknown>): void }>();

/** "detectVersion" -> "Detect version", "minRate" -> "Min rate". Field keys are the only
 *  label source a plugin author provides (no separate displayLabel in the spec) — good
 *  enough for the semi-technical audience that already reads raw CLI flag names. */
function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function setField(key: string, value: unknown) {
  const next = { ...props.modelValue };
  if (value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0)) {
    delete next[key];
  } else {
    next[key] = value;
  }
  emit('update:modelValue', next);
}

// Pre-fill defaultValue for any field the operator hasn't touched yet, whenever the
// spec changes (i.e. the operator picked a different tool) — mirrors what each old
// panel's own `ref(props.modelValue?.x ?? default)` did per-field.
watch(() => props.spec, (spec) => {
  if (!spec) return;
  const next = { ...props.modelValue };
  let changed = false;
  for (const f of spec.fields) {
    if (f.defaultValue != null && next[f.key] === undefined) {
      next[f.key] = f.type === 'number' ? Number(f.defaultValue) : f.defaultValue;
      changed = true;
    }
  }
  if (changed) emit('update:modelValue', next);
}, { immediate: true });

// ── Rules-of-Engagement lock overrides ────────────────────────────────────────
// One override flag per locked field key — separate from modelValue since "I want to
// type my own value" is a per-session UI choice, not something that should persist
// into the saved task/template args.
const overrides = reactive<Record<string, boolean>>({});
function isLocked(field: AgentToolSpecField): number | null {
  if (field.ruleBinding === 'rate_limit') return props.lockedRateLimit ?? null;
  if (field.ruleBinding === 'concurrency') return props.lockedConcurrency ?? null;
  return null;
}

// ── server_fetch (KB wordlist) picker ─────────────────────────────────────────
const wordlistOptions = ref<KbWordlist[]>([]);
const wordlistLoading = ref(false);
const wordlistSearch = ref('');
let wordlistSearchTimer: ReturnType<typeof setTimeout> | undefined;

async function loadWordlists(q?: string) {
  wordlistLoading.value = true;
  try {
    const page = await kbWordlistsApi.list(undefined, 0, 30, q || undefined, 'name', 'asc');
    wordlistOptions.value = page.items ?? [];
  } catch {
    wordlistOptions.value = [];
  } finally {
    wordlistLoading.value = false;
  }
}
function onWordlistFilter(q: string) {
  wordlistSearch.value = q;
  clearTimeout(wordlistSearchTimer);
  wordlistSearchTimer = setTimeout(() => loadWordlists(q), 250);
}
function onWordlistFilterEvent(e: { value: string }) {
  onWordlistFilter(e.value);
}
loadWordlists();

// ── headers (repeat string, "Name: value" per entry) <-> Record<string,string> ──
// HttpHeadersEditor already exists and works well as paired name/value rows; the
// wire shape declared by the spec is a flat array of "Name: value" strings (one -H
// per entry) — convert at this boundary rather than teaching that shared editor a
// second shape.
function headersToRecord(arr: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(arr)) return out;
  for (const raw of arr) {
    const s = String(raw);
    const idx = s.indexOf(':');
    if (idx <= 0) continue;
    out[s.slice(0, idx).trim()] = s.slice(idx + 1).trim();
  }
  return out;
}
function recordToHeaders(rec: Record<string, string> | undefined): string[] {
  if (!rec) return [];
  return Object.entries(rec).map(([n, v]) => `${n}: ${v}`);
}

// ── server_fetch: repeat (array of KB ids) helpers ────────────────────────────
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}
function addRepeatEntry(field: AgentToolSpecField) {
  setField(field.key, [...asArray(props.modelValue[field.key]), null]);
}
function removeRepeatEntry(field: AgentToolSpecField, i: number) {
  const next = asArray(props.modelValue[field.key]).slice();
  next.splice(i, 1);
  setField(field.key, next);
}
function setRepeatEntry(field: AgentToolSpecField, i: number, value: unknown) {
  const next = asArray(props.modelValue[field.key]).slice();
  next[i] = value;
  setField(field.key, next);
}

// Conditional fields (requiredIfField/requiredIfEquals) are always shown, never
// hidden — the condition only changes whether they're mandatory, matching how the
// old nmap panel always showed 'ports' regardless of the chosen scanType.
const visibleFields = computed(() => props.spec?.fields ?? []);

function isFieldRequiredNow(field: AgentToolSpecField): boolean {
  if (field.required) return true;
  if (field.requiredIfField && field.requiredIfEquals != null) {
    return String(props.modelValue[field.requiredIfField] ?? '') === field.requiredIfEquals;
  }
  return false;
}

/** Called by the parent dialog right before submit — returns a human-readable error
 *  for the first unmet required field, or null when everything mandatory is filled.
 *  Generalizes what used to be one hardcoded "Wordlist required" check in ffuf's
 *  buildArgs() to every tool's declared required/conditionally-required fields. */
function validate(): string | null {
  if (!props.spec) return null;
  for (const f of props.spec.fields) {
    if (!isFieldRequiredNow(f)) continue;
    const v = props.modelValue[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      return `${props.spec.displayName}: '${humanize(f.key)}' is required`;
    }
  }
  return null;
}
defineExpose({ validate });
</script>

<template>
  <div v-if="spec && visibleFields.length" class="tool-config-form">
    <div v-for="field in visibleFields" :key="field.key" class="tcf-field">
      <label class="ares-field-label">
        {{ humanize(field.key) }}
        <span v-if="isFieldRequiredNow(field)" style="color:var(--p-red-400);">*</span>
        <span v-if="field.flag" style="opacity:0.55; font-weight:400;">({{ field.flag }})</span>
      </label>

      <!-- boolean_flag -->
      <label v-if="field.type === 'boolean_flag'" class="tcf-checkbox">
        <input type="checkbox" :checked="!!modelValue[field.key]"
          @change="setField(field.key, ($event.target as HTMLInputElement).checked || undefined)" />
        <span>Enable</span>
      </label>

      <!-- enum, single -->
      <Select v-else-if="field.type === 'enum' && !field.repeat"
        :model-value="modelValue[field.key] ?? null"
        @update:model-value="(v) => setField(field.key, v)"
        :options="field.options ?? []" placeholder="Default" show-clear
        class="w-full" />

      <!-- enum, repeat (multi-select) -->
      <MultiSelect v-else-if="field.type === 'enum' && field.repeat"
        :model-value="asArray(modelValue[field.key])"
        @update:model-value="(v) => setField(field.key, v)"
        :options="field.options ?? []" placeholder="None selected"
        class="w-full" display="chip" />

      <!-- number, with optional Rules-of-Engagement lock -->
      <template v-else-if="field.type === 'number'">
        <template v-if="isLocked(field) != null && !overrides[field.key]">
          <div class="tcf-locked" v-tooltip.top="'Enforced by a Rule of Engagement — cannot be increased'">
            <span>{{ isLocked(field) }}</span>
            <i class="pi pi-lock" />
          </div>
          <label class="tcf-override">
            <input type="checkbox" v-model="overrides[field.key]" /> Override rule
          </label>
        </template>
        <InputNumber v-else :model-value="(modelValue[field.key] as number) ?? null"
          @update:model-value="(v) => setField(field.key, v)"
          :min="field.min ?? undefined" :max="field.max ?? undefined"
          show-buttons fluid />
      </template>

      <!-- string, repeat, ruleBinding: headers -->
      <template v-else-if="field.type === 'string' && field.repeat && field.ruleBinding === 'headers'">
        <div v-if="lockedHeaders && Object.keys(lockedHeaders).length" class="tcf-locked-headers">
          <div v-for="(val, name) in lockedHeaders" :key="name" class="tcf-locked-header-row"
            v-tooltip.top="'Enforced by a Rule of Engagement — injected automatically'">
            <i class="pi pi-lock" />
            <code>{{ name }}: {{ val }}</code>
          </div>
        </div>
        <HttpHeadersEditor :model-value="headersToRecord(modelValue[field.key])"
          @update:model-value="(v) => setField(field.key, recordToHeaders(v))" />
      </template>

      <!-- string, repeat, plain (no known ruleBinding) -->
      <div v-else-if="field.type === 'string' && field.repeat" class="tcf-repeat-list">
        <div v-for="(v, i) in asArray(modelValue[field.key])" :key="i" class="tcf-repeat-row">
          <InputText :model-value="v as string" @update:model-value="(val) => setRepeatEntry(field, i, val)"
            style="flex:1;" />
          <button type="button" class="tcf-repeat-remove" @click="removeRepeatEntry(field, i)">×</button>
        </div>
        <button type="button" class="tcf-repeat-add" @click="addRepeatEntry(field)">+ Add</button>
      </div>

      <!-- string, single -->
      <InputText v-else-if="field.type === 'string'"
        :model-value="(modelValue[field.key] as string) ?? ''"
        @update:model-value="(v) => setField(field.key, v)"
        class="w-full" />

      <!-- server_fetch, repeat (e.g. ffuf's per-position fuzzWordlists) -->
      <div v-else-if="field.type === 'server_fetch' && field.repeat" class="tcf-repeat-list">
        <div v-for="(v, i) in asArray(modelValue[field.key])" :key="i" class="tcf-repeat-row">
          <Select :model-value="v" @update:model-value="(val) => setRepeatEntry(field, i, val)"
            :options="wordlistOptions" option-label="name" option-value="id"
            filter :filter-fields="['name']" @filter="onWordlistFilterEvent"
            :loading="wordlistLoading" placeholder="Pick a KB wordlist…" style="flex:1;" />
          <button type="button" class="tcf-repeat-remove" @click="removeRepeatEntry(field, i)">×</button>
        </div>
        <button type="button" class="tcf-repeat-add" @click="addRepeatEntry(field)">+ Add</button>
      </div>

      <!-- server_fetch, single -->
      <Select v-else-if="field.type === 'server_fetch'"
        :model-value="modelValue[field.key] ?? null"
        @update:model-value="(v) => setField(field.key, v)"
        :options="wordlistOptions" option-label="name" option-value="id"
        filter :filter-fields="['name']" @filter="onWordlistFilterEvent"
        :loading="wordlistLoading" placeholder="Pick a KB wordlist…" show-clear class="w-full" />
    </div>
  </div>
</template>

<style scoped>
.tool-config-form { display: flex; flex-direction: column; gap: 0.85rem; }
.ares-field-label {
  display: block; font-size: 0.78rem; font-weight: 600;
  color: var(--ares-text-muted); margin-bottom: 0.35rem;
}
.tcf-checkbox { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; }
.tcf-locked {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.5rem 0.75rem; border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  background: var(--ares-surface-2); color: var(--ares-text-2); font-size: 0.85rem;
}
.tcf-locked .pi { font-size: 0.72rem; color: var(--p-amber-500); }
.tcf-override { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--ares-text-muted); margin-top: 0.3rem; cursor: pointer; }
.tcf-locked-headers { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.4rem; }
.tcf-locked-header-row {
  display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem;
  color: var(--ares-text-2); background: var(--ares-surface-2);
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius); padding: 0.3rem 0.55rem;
}
.tcf-locked-header-row .pi { font-size: 0.68rem; color: var(--p-amber-500); }
.tcf-repeat-list { display: flex; flex-direction: column; gap: 0.4rem; }
.tcf-repeat-row { display: flex; align-items: center; gap: 0.4rem; }
.tcf-repeat-remove {
  background: transparent; border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  color: var(--ares-text-muted); cursor: pointer; width: 1.8rem; height: 1.8rem; font-size: 0.9rem;
}
.tcf-repeat-remove:hover { color: var(--p-red-400); border-color: var(--p-red-400); }
.tcf-repeat-add {
  align-self: flex-start; padding: 0.25rem 0.65rem; border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); background: var(--ares-surface-2); color: var(--ares-text-2);
  font-size: 0.75rem; cursor: pointer;
}
.tcf-repeat-add:hover { background: var(--ares-surface-raised); }
</style>
