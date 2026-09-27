<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { aqlApi, type AqlFieldInfo } from '@/api/aql';
import { computeAqlSuggestions, applyAqlSuggestion, type AqlSuggestion, type AqlVariableRef } from '@/utils/aqlAutocomplete';

/**
 * Dual basic/AQL search bar (AQL implementation plan, Phase 4). Basic mode is a plain
 * substring-search box, same as every other list view's existing search input. AQL mode adds a
 * cursor-aware autocomplete dropdown (field names -> operators -> values, sourced from
 * GET /api/v1/aql/fields) and live validation (GET /api/v1/aql/validate) so a malformed query is
 * flagged before it's ever sent to the real list endpoint.
 *
 * Ownership: this component owns its own text/mode state and only reports outward via `search`
 * (debounced, and — in AQL mode — only once the query validates or is empty). Parents don't need
 * to mirror mode/text into their own refs; they just wire `@search` to their existing load().
 */
const props = withDefaults(defineProps<{
  entity: string;
  placeholder?: string;
  aqlPlaceholder?: string;
  debounceMs?: number;
  /** Deep-link entry point (dashboard widget click-through) — when set, switches to AQL mode,
   *  pre-fills this query, and applies it immediately on mount (no debounce wait, unlike normal
   *  typing). Only read once at mount; changing it later has no effect (matches how every other
   *  QueryBar-hosting view already treats its own route params as mount-time-only). */
  initialAql?: string;
  /** Scope for {{...}} context-variable autocomplete (AQL context-variables initiative) — which
   *  of current_iteration_start/current_iteration_end/pX_sla_period apply, if any, depends on
   *  this. `now` is always offered regardless. Omit both on a platform-wide catalog view (KB
   *  entities); autocomplete then only offers `now`. */
  projectId?: number | null;
  organizationId?: number | null;
}>(), {
  placeholder: 'Search…',
  aqlPlaceholder: 'priority == P0 AND status == open',
  debounceMs: 350,
});

const emit = defineEmits<{
  search: [{ mode: 'basic' | 'aql'; value: string }];
}>();

// The BASIC/AQL choice is a single global preference, not per-page state — once a user picks
// AQL on one list view, every other QueryBar across the app should open in AQL mode too, rather
// than making them re-select it on every page. Persisted in localStorage (no store needed for a
// single scalar preference); read once at module load since every QueryBar instance should agree
// on today's preference from the moment it mounts.
const MODE_STORAGE_KEY = 'ares.queryBar.mode';
function loadStoredMode(): 'basic' | 'aql' {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  return stored === 'aql' ? 'aql' : 'basic';
}
const mode = ref<'basic' | 'aql'>(loadStoredMode());
function setMode(m: 'basic' | 'aql') {
  mode.value = m;
  localStorage.setItem(MODE_STORAGE_KEY, m);
}
const basicText = ref('');
const aqlText = ref('');

const fields = ref<AqlFieldInfo[]>([]);
const fieldsLoaded = ref(false);
const variables = ref<AqlVariableRef[]>([]);

const validating = ref(false);
const validationError = ref<string | null>(null);

const inputRef = ref<HTMLInputElement | null>(null);
const suggestions = ref<AqlSuggestion[]>([]);
const activeIndex = ref(0);
const showSuggestions = ref(false);
const suggestionsStyle = ref<Record<string, string>>({});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let validateSeq = 0;

async function loadVariables() {
  variables.value = await aqlApi.variables(props.projectId, props.organizationId);
}
watch([() => props.projectId, () => props.organizationId], loadVariables, { immediate: true });

async function ensureFieldsLoaded() {
  if (fieldsLoaded.value) return;
  try {
    fields.value = await aqlApi.fields(props.entity);
  } catch {
    fields.value = [];
  } finally {
    fieldsLoaded.value = true;
  }
}

function refreshSuggestions() {
  if (!inputRef.value || mode.value !== 'aql') { suggestions.value = []; return; }
  const cursor = inputRef.value.selectionStart ?? aqlText.value.length;
  suggestions.value = computeAqlSuggestions(aqlText.value, cursor, fields.value, variables.value);
  activeIndex.value = 0;
  showSuggestions.value = suggestions.value.length > 0;
  if (showSuggestions.value) positionSuggestions();
}

// Teleported to <body> (see template) so the dropdown isn't clipped by the shell's own
// `overflow: hidden` (needed to keep the BASIC/AQL buttons' corners flush with the shell's
// border-radius) or by any scrollable/clipped ancestor elsewhere the bar gets placed in —
// same reason ColumnHeader.vue's filter popup does this. Position is computed from the input's
// own rect, not the whole shell, so the dropdown still lines up under the text field.
function positionSuggestions() {
  if (!inputRef.value) return;
  const rect = inputRef.value.getBoundingClientRect();
  suggestionsStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: '900',
  };
}

function scheduleEmit() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runEmit, props.debounceMs);
}

async function runEmit() {
  if (mode.value === 'basic') {
    validationError.value = null;
    emit('search', { mode: 'basic', value: basicText.value.trim() });
    return;
  }
  const q = aqlText.value.trim();
  if (!q) {
    validationError.value = null;
    emit('search', { mode: 'aql', value: '' });
    return;
  }
  const seq = ++validateSeq;
  validating.value = true;
  try {
    await aqlApi.validate(props.entity, q, props.projectId, props.organizationId);
    if (seq !== validateSeq) return; // superseded by a newer keystroke
    validationError.value = null;
    emit('search', { mode: 'aql', value: q });
  } catch (err: any) {
    if (seq !== validateSeq) return;
    validationError.value = err?.response?.data?.detail ?? 'Invalid AQL query';
  } finally {
    if (seq === validateSeq) validating.value = false;
  }
}

function onBasicInput() { scheduleEmit(); }

function onAqlInput() {
  nextTick(refreshSuggestions);
  scheduleEmit();
}

function onAqlKeydown(e: KeyboardEvent) {
  if (showSuggestions.value && suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = (activeIndex.value + 1) % suggestions.value.length; return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length; return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectSuggestion(suggestions.value[activeIndex.value]);
      return;
    }
    if (e.key === 'Escape') { showSuggestions.value = false; return; }
  }
}

function selectSuggestion(s: AqlSuggestion) {
  const { text, cursor } = applyAqlSuggestion(aqlText.value, s);
  aqlText.value = text;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.setSelectionRange(cursor, cursor);
    refreshSuggestions();
  });
  scheduleEmit();
}

function onAqlBlur() {
  // Let a click on the dropdown register before it disappears.
  setTimeout(() => { showSuggestions.value = false; }, 150);
}

function onAqlFocus() {
  ensureFieldsLoaded().then(refreshSuggestions);
}

function clearBasic() { basicText.value = ''; scheduleEmit(); }
function clearAql() { aqlText.value = ''; validationError.value = null; showSuggestions.value = false; scheduleEmit(); }

function reset() {
  basicText.value = '';
  aqlText.value = '';
  validationError.value = null;
  showSuggestions.value = false;
}
defineExpose({ reset });

watch(mode, async (m) => {
  validationError.value = null;
  showSuggestions.value = false;
  if (m === 'aql') { await ensureFieldsLoaded(); }
  scheduleEmit();
});

onMounted(() => {
  if (props.initialAql) {
    aqlText.value = props.initialAql;
    setMode('aql');
    ensureFieldsLoaded();
    runEmit();
  } else if (mode.value === 'aql') {
    ensureFieldsLoaded();
  }
});
onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer); });

const kindIcon: Record<string, string> = {
  field: 'pi-sliders-h',
  operator: 'pi-code',
  value: 'pi-tag',
  keyword: 'pi-link',
  variable: 'pi-hashtag',
};
</script>

<template>
  <div class="query-bar">
    <div class="query-bar__shell">
      <div class="query-bar__input-wrap">
        <i class="pi pi-search query-bar__icon" />
        <input
          v-if="mode === 'basic'"
          v-model="basicText"
          type="text"
          class="query-bar__input"
          :placeholder="placeholder"
          @input="onBasicInput"
        />
        <input
          v-else
          ref="inputRef"
          v-model="aqlText"
          type="text"
          class="query-bar__input query-bar__input--aql"
          :class="{ 'query-bar__input--error': !!validationError }"
          :placeholder="aqlPlaceholder"
          spellcheck="false"
          autocomplete="off"
          @input="onAqlInput"
          @keydown="onAqlKeydown"
          @focus="onAqlFocus"
          @blur="onAqlBlur"
          @click="refreshSuggestions"
        />
        <button
          v-if="(mode === 'basic' && basicText) || (mode === 'aql' && aqlText)"
          class="query-bar__clear"
          type="button"
          @click="mode === 'basic' ? clearBasic() : clearAql()"
        >
          <i class="pi pi-times" />
        </button>
        <i v-if="mode === 'aql' && validating" class="pi pi-spin pi-spinner query-bar__spinner" />
      </div>

      <div class="query-bar__mode-toggle">
        <button
          type="button"
          class="query-bar__mode-btn"
          :class="{ 'query-bar__mode-btn--active': mode === 'basic' }"
          @click="setMode('basic')"
        >BASIC</button>
        <button
          type="button"
          class="query-bar__mode-btn"
          :class="{ 'query-bar__mode-btn--active': mode === 'aql' }"
          @click="setMode('aql')"
        >AQL</button>
      </div>
    </div>

    <p v-if="mode === 'aql' && validationError" class="query-bar__error">
      <i class="pi pi-exclamation-circle" /> {{ validationError }}
    </p>

    <!-- ── Autocomplete dropdown — teleported so the shell's overflow:hidden (and any
         scrollable ancestor elsewhere the bar is used) never clips it ─────────────── -->
    <Teleport to="body">
      <div v-if="mode === 'aql' && showSuggestions" class="query-bar__suggestions" :style="suggestionsStyle">
        <button
          v-for="(s, i) in suggestions"
          :key="s.kind + s.label + i"
          type="button"
          class="query-bar__suggestion"
          :class="{ 'query-bar__suggestion--active': i === activeIndex }"
          @mousedown.prevent="selectSuggestion(s)"
          @mouseenter="activeIndex = i"
        >
          <i class="pi query-bar__suggestion-icon" :class="kindIcon[s.kind]" />
          <span class="query-bar__suggestion-label">{{ s.label }}</span>
          <span v-if="s.detail" class="query-bar__suggestion-detail">{{ s.detail }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.query-bar {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
}

/* One bordered shell holding the input and the BASIC/AQL segmented control flush
   against its right edge, so the whole thing reads as a single integrated widget
   rather than an input plus a separate control. */
.query-bar__shell {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 260px;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface);
  overflow: hidden;
}
.query-bar__shell:focus-within {
  border-color: var(--ares-accent);
}

.query-bar__input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.query-bar__icon {
  position: absolute;
  left: 0.65rem;
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  pointer-events: none;
  z-index: 1;
}

.query-bar__input {
  width: 100%;
  padding: 0.45rem 2rem;
  font-size: 0.85rem;
  border: none;
  background: transparent;
  color: var(--ares-text-1);
}
.query-bar__input:focus {
  outline: none;
}
.query-bar__input--aql {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}
.query-bar__input--error {
  color: var(--ares-error);
}

.query-bar__clear {
  position: absolute;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.2rem;
  border-radius: 50%;
  transition: color 0.12s;
  z-index: 1;
}
.query-bar__clear:hover { color: var(--ares-text); }

.query-bar__spinner {
  position: absolute;
  right: 1.9rem;
  font-size: 0.75rem;
  color: var(--ares-text-muted);
}

/* ── BASIC / AQL segmented control ───────────────────────────────────────
   Two buttons stretching to the shell's full height, flush against its
   right edge — the selected one highlighted, the other muted. */
.query-bar__mode-toggle {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  border-left: 1px solid var(--ares-border);
}

.query-bar__mode-btn {
  appearance: none;
  border: none;
  border-left: 1px solid var(--ares-border);
  background: var(--ares-surface-2);
  color: var(--ares-text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0 0.75rem;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.query-bar__mode-btn:first-child {
  border-left: none;
}
.query-bar__mode-btn:hover {
  color: var(--ares-text-1);
}
.query-bar__mode-btn--active,
.query-bar__mode-btn--active:hover {
  background: var(--ares-accent-bg);
  color: #fff;
}

.query-bar__error {
  margin: 0;
  font-size: 0.76rem;
  color: var(--ares-error);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

/* ── Autocomplete dropdown ─────────────────────────────────────────────
   position/top/left/width/z-index come from suggestionsStyle (computed from the input's
   getBoundingClientRect() — see positionSuggestions()), since this is teleported to <body>. */
.query-bar__suggestions {
  max-height: 280px;
  overflow-y: auto;
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  padding: 0.25rem;
}

.query-bar__suggestion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.55rem;
  background: none;
  border: none;
  border-radius: calc(var(--ares-radius) - 2px);
  text-align: left;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--ares-text-1);
}
.query-bar__suggestion--active,
.query-bar__suggestion:hover {
  background: color-mix(in srgb, var(--ares-accent) 12%, transparent);
}

.query-bar__suggestion-icon {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
}

.query-bar__suggestion-label {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-weight: 500;
}

.query-bar__suggestion-detail {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--ares-text-muted);
  white-space: nowrap;
}
</style>
