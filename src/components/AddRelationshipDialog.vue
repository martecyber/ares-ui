<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { assetsApi, ASSET_LINK_LABELS, ASSET_TYPE_ICONS, ASSET_TYPE_LABELS, type Asset, type AssetRelationship, type AssetLinkTypeDef } from '@/api/assets';
import { loadLinkTypes, linkOptionsBetween, linkOptionsFor, type LinkOption } from '@/composables/useAssetLinkTypes';

const props = defineProps<{
  source: Asset;
  /** Pre-chosen target (graph "Link to…"); when absent the user searches for one. */
  target?: Asset | null;
  /** Opened from a project view — relationships are org-wide, so say so. */
  fromProject?: boolean;
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ created: [rel: AssetRelationship] }>();

const defs        = ref<AssetLinkTypeDef[]>([]);
const defsError   = ref('');
const selectedKey = ref<string | null>(null);
const picked      = ref<Asset | null>(null);
const saving      = ref(false);
const error       = ref('');

const query        = ref('');
const results      = ref<Asset[]>([]);
const searching    = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const target = computed(() => props.target ?? picked.value);

const options = computed<LinkOption[]>(() =>
  props.target
    ? linkOptionsBetween(defs.value, props.source.type, props.target.type)
    : linkOptionsFor(defs.value, props.source.type),
);
const selected = computed(() => options.value.find((o) => o.key === selectedKey.value) ?? null);

function linkLabel(linkType: string) {
  return ASSET_LINK_LABELS[linkType] ?? linkType.replace(/_/g, ' ');
}
function typeLabel(type: string) {
  return ASSET_TYPE_LABELS[type] ?? type;
}

/** "from  —link→  to" for the chosen option and the current target. */
const preview = computed(() => {
  if (!selected.value || !target.value) return null;
  const [from, to] = selected.value.direction === 'out' ? [props.source, target.value] : [target.value, props.source];
  return { from, to, link: linkLabel(selected.value.linkType) };
});

watch(visible, async (open) => {
  if (!open) return;
  selectedKey.value = null;
  picked.value      = null;
  query.value       = '';
  results.value     = [];
  error.value       = '';
  defsError.value   = '';
  try {
    defs.value = await loadLinkTypes();
    if (options.value.length === 1) selectedKey.value = options.value[0].key;
  } catch {
    defsError.value = 'Could not load the relationship types.';
  }
}, { immediate: true });

// A new link type can restrict the target types, so a previously picked target may no longer fit.
watch(selectedKey, () => {
  if (props.target) return;
  picked.value  = null;
  results.value = [];
  if (selected.value) runSearch();
});

watch(query, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

async function runSearch() {
  if (!selected.value) return;
  searching.value = true;
  try {
    const res = await assetsApi.list({
      organizationId: props.source.organizationId,
      types: selected.value.otherTypes,
      q: query.value.trim() || undefined,
      size: 20,
    });
    results.value = res.items.filter((a) => a.id !== props.source.id);
  } catch {
    results.value = [];
  } finally {
    searching.value = false;
  }
}

async function submit() {
  if (!selected.value || !target.value) return;
  saving.value = true;
  error.value  = '';
  try {
    const [fromId, toId] = selected.value.direction === 'out'
      ? [props.source.id, target.value.id]
      : [target.value.id, props.source.id];
    const rel = await assetsApi.addRelationship(fromId, { toAssetId: toId, linkType: selected.value.linkType });
    emit('created', rel);
    visible.value = false;
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create the relationship';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog v-model:visible="visible" header="Add relationship" modal style="width:min(34rem,96vw);">
    <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.25rem;">
      <Message v-if="defsError" severity="error" :closable="false">{{ defsError }}</Message>

      <template v-else-if="target && props.target && !options.length">
        <p class="muted">
          There is no relationship type between a <strong>{{ typeLabel(source.type) }}</strong>
          and a <strong>{{ typeLabel(target.type) }}</strong> that can be created manually.
        </p>
      </template>

      <template v-else>
        <div>
          <label class="form-label">Relationship</label>
          <!-- Known target: phrase each option as a sentence between the two assets -->
          <div v-if="props.target" class="option-list">
            <label v-for="o in options" :key="o.key" class="option" :class="{ 'option--active': selectedKey === o.key }">
              <input v-model="selectedKey" type="radio" :value="o.key" />
              <span class="mono">{{ o.direction === 'out' ? source.identifier : props.target.identifier }}</span>
              <span class="link-chip">{{ linkLabel(o.linkType) }}</span>
              <span class="mono">{{ o.direction === 'out' ? props.target.identifier : source.identifier }}</span>
            </label>
          </div>
          <Select v-else v-model="selectedKey" :options="options" option-label="label" option-value="key"
            placeholder="Choose a relationship type" class="w-full" filter />
        </div>

        <div v-if="!props.target && selected">
          <label class="form-label">{{ selected.direction === 'out' ? 'Target' : 'Source' }} ({{ selected.otherTypes.map(typeLabel).join(' / ') }})</label>
          <InputText v-model="query" placeholder="Search by identifier…" class="w-full" />
          <div class="results">
            <div v-if="searching" class="muted" style="padding:0.5rem;"><i class="pi pi-spin pi-spinner" /> Searching…</div>
            <template v-else>
              <button v-for="a in results" :key="a.id" type="button" class="result"
                :class="{ 'result--active': picked?.id === a.id }" @click="picked = a">
                <i :class="'pi ' + (ASSET_TYPE_ICONS[a.type] ?? 'pi-circle')" />
                <span v-if="a.displayName" class="result__name">{{ a.displayName }}</span>
                <span class="mono result__id">{{ a.identifier }}</span>
                <code class="result__code">{{ a.code }}</code>
              </button>
              <div v-if="!results.length" class="muted" style="padding:0.5rem;">No matching assets.</div>
            </template>
          </div>
        </div>

        <p v-if="preview" class="preview">
          <span class="mono">{{ preview.from.identifier }}</span>
          <span class="link-chip">{{ preview.link }}</span>
          <span class="mono">{{ preview.to.identifier }}</span>
        </p>

        <p class="muted" style="font-size:0.75rem;">
          <i class="pi pi-info-circle" />
          Relationships belong to the organization{{ fromProject ? ', so this one will also show in every other project that includes these assets' : '' }}.
          Scope is recalculated afterwards.
        </p>
      </template>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" size="small" @click="visible = false" />
        <Button label="Create" icon="pi pi-link" size="small" :loading="saving" :disabled="!selected || !target" @click="submit" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.result__name {
  font-size: 0.82rem;
  font-weight: 500;
  white-space: nowrap;
}
.form-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  color: var(--ares-text-muted);
}
.muted { color: var(--ares-text-muted); font-size: 0.85rem; margin: 0; }
.mono { font-family: monospace; font-size: 0.82rem; overflow-wrap: anywhere; }
.link-chip {
  font-size: 0.72rem;
  padding: 0.05em 0.5em;
  border-radius: var(--ares-radius);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-2);
  white-space: nowrap;
}
.option-list { display: flex; flex-direction: column; gap: 0.35rem; }
.option {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  cursor: pointer;
}
.option--active { border-color: var(--ares-accent); background: color-mix(in srgb, var(--ares-accent) 8%, transparent); }
.option input { accent-color: var(--ares-accent); }
.results {
  margin-top: 0.4rem;
  max-height: 14rem;
  overflow-y: auto;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
}
.result {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.6rem;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ares-border);
  color: var(--ares-text-2);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.result:last-child { border-bottom: none; }
.result:hover { background: var(--ares-surface-2); }
.result--active { background: color-mix(in srgb, var(--ares-accent) 12%, transparent); }
.result__id { flex: 1; min-width: 0; }
.result__code { font-size: 0.7rem; color: var(--ares-text-muted); }
.preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: var(--ares-radius);
  background: var(--ares-surface-2);
}
</style>
