<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { projectsApi, SCOPE_KIND_META, type Project } from '@/api/projects';
import WidgetLoading from './WidgetLoading.vue';

const props = defineProps<{ scopeId: number | null; orgId: number | null }>();
const router = useRouter();
const project = ref<Project | null>(null);
const loading = ref(true);

const inScopeEntries  = computed(() => project.value?.scopeEntries.filter((s) => s.inScope)  ?? []);
const outScopeEntries = computed(() => project.value?.scopeEntries.filter((s) => !s.inScope) ?? []);

function kindTagStyle(kind: string) {
  const color = SCOPE_KIND_META[kind]?.color ?? '#4B5563';
  return { background: color, color: '#fff', border: 'none', borderRadius: '4px', padding: '0.1rem 0.4rem', fontSize: '0.68rem', fontWeight: '600', whiteSpace: 'nowrap' as const };
}
function kindLabel(kind: string): string {
  return SCOPE_KIND_META[kind]?.label ?? kind;
}

onMounted(async () => {
  if (!props.scopeId) { loading.value = false; return; }
  try { project.value = await projectsApi.get(props.scopeId); }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="ares-card widget-card">
    <div class="ares-card-section-header">
      <span>Scope</span>
      <a v-if="scopeId && orgId" class="widget-link" @click="router.push({ name: 'org-project-scope', params: { orgId, engId: scopeId } })">Manage</a>
    </div>
    <div class="widget-body">
      <WidgetLoading v-if="loading" />
      <template v-else>
        <div class="scope-section-label">In Scope ({{ inScopeEntries.length }})</div>
        <table class="ares-table">
          <tbody>
            <tr v-for="s in inScopeEntries.slice(0, 6)" :key="s.id">
              <td style="width:80px;"><span :style="kindTagStyle(s.kind)">{{ kindLabel(s.kind) }}</span></td>
              <td style="font-family:monospace; font-size:0.76rem; word-break:break-all;">{{ s.value }}</td>
            </tr>
            <tr v-if="!inScopeEntries.length"><td colspan="2" class="ares-table-empty">No in-scope entries.</td></tr>
          </tbody>
        </table>
        <div class="scope-section-label" style="margin-top:0.5rem;">Out of Scope ({{ outScopeEntries.length }})</div>
        <table class="ares-table">
          <tbody>
            <tr v-for="s in outScopeEntries.slice(0, 6)" :key="s.id" style="opacity:0.75;">
              <td style="width:80px;"><span :style="kindTagStyle(s.kind)">{{ kindLabel(s.kind) }}</span></td>
              <td style="font-family:monospace; font-size:0.76rem; word-break:break-all;">{{ s.value }}</td>
            </tr>
            <tr v-if="!outScopeEntries.length"><td colspan="2" class="ares-table-empty">No out-of-scope entries.</td></tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>

<style scoped>
.widget-card { height: 100%; padding: 0; display: flex; flex-direction: column; }
.widget-body { flex: 1; min-height: 0; overflow: auto; padding: 0.5rem 0.75rem; }
.widget-link { font-size: 0.75rem; color: var(--ares-accent-muted); cursor: pointer; }
.widget-link:hover { text-decoration: underline; }
.scope-section-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ares-text-muted); margin-bottom: 0.3rem; }
</style>
