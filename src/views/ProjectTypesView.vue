<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Message from 'primevue/message';
import AresBadge from '@/components/AresBadge.vue';
import { projectTypesApi, type ProjectType } from '@/api/project-types';
import { useThemeStore } from '@/stores/theme';

const theme = useThemeStore();
const items = ref<ProjectType[]>([]);
const loading = ref(false);

// A disabled, plugin-owned root (requiredPluginId set) is simply unavailable right now — that
// plugin isn't installed/enabled — not something an admin can act on, so it's excluded entirely
// rather than shown disabled (unlike a disabled non-plugin root, e.g. a stuck-disabled MONITOR,
// which an admin still needs to be able to SEE here even if they can't fix it from this screen).
// It reappears here on its own once the owning plugin installs/enables it.
const isRootUnavailable = (t: ProjectType) => t.disabled && !!t.requiredPluginId;

// Subtypes are stricter: no disabled system subtype is ever shown (previously rendered as a
// "Coming soon" badge — misleading for BH_BC/BH_YWH specifically, which are fully implemented in
// code but deliberately never offered as a project type, not actually "coming" at all) plus the
// same plugin-gated case as roots.
const isSubtypeUnavailable = (t: ProjectType) => t.disabled && (t.system || !!t.requiredPluginId);

const rootTypes = computed(() =>
  items.value.filter((t) => t.system && t.supertypeId === null && !isRootUnavailable(t))
);

/** Groups root types into a "Platform" section (built-in, no owning plugin) plus one section per
 *  distinct `requiredPluginId` present — title/icon come from the type's own `pluginDisplayName`/
 *  `pluginIcon(Light)` (already joined server-side), so a new plugin contributing a project type
 *  shows up here with zero frontend changes, no plugin name ever hardcoded. */
interface TypeSection { key: string; title: string; icon: string | null; roots: ProjectType[] }
const sections = computed<TypeSection[]>(() => {
  const platform = rootTypes.value.filter((r) => !r.requiredPluginId);
  const byPlugin = new Map<string, ProjectType[]>();
  for (const r of rootTypes.value) {
    if (!r.requiredPluginId) continue;
    if (!byPlugin.has(r.requiredPluginId)) byPlugin.set(r.requiredPluginId, []);
    byPlugin.get(r.requiredPluginId)!.push(r);
  }
  const result: TypeSection[] = [];
  if (platform.length) result.push({ key: 'platform', title: 'Platform', icon: null, roots: platform });
  for (const [pluginId, roots] of byPlugin) {
    const [first] = roots;
    const icon = (theme.theme === 'light' && first.pluginIconLight) ? first.pluginIconLight : first.pluginIcon;
    result.push({ key: pluginId, title: first.pluginDisplayName ?? pluginId, icon, roots });
  }
  return result;
});

const subtypesByRoot = computed(() => {
  const map = new Map<number, ProjectType[]>();
  for (const t of items.value) {
    if (t.supertypeId !== null && !isSubtypeUnavailable(t)) {
      if (!map.has(t.supertypeId)) map.set(t.supertypeId, []);
      map.get(t.supertypeId)!.push(t);
    }
  }
  return map;
});

// Only non-disabled roots available when creating a subtype
const rootOptions = computed(() =>
  rootTypes.value
    .filter((r) => !r.disabled)
    .map((r) => ({ label: r.name, value: r.id }))
);

// ── Toggle disabled ───────────────────────────────────────────────
async function toggleDisabled(type: ProjectType) {
  const updated = await projectTypesApi.setDisabled(type.id, !type.disabled);
  const idx = items.value.findIndex((t) => t.id === updated.id);
  if (idx !== -1) items.value[idx] = updated;
}

// ── Create / edit dialog ──────────────────────────────────────────
const showDialog = ref(false);
const saving = ref(false);
const dialogError = ref('');
const editTarget = ref<ProjectType | null>(null);
const form = ref({ name: '', code: '', description: '', supertypeId: null as number | null });

function openCreate(defaultRootId?: number) {
  editTarget.value = null;
  form.value = { name: '', code: '', description: '', supertypeId: defaultRootId ?? null };
  dialogError.value = '';
  showDialog.value = true;
}

function openEdit(type: ProjectType) {
  editTarget.value = type;
  form.value = { name: type.name, code: type.code, description: type.description ?? '', supertypeId: type.supertypeId };
  dialogError.value = '';
  showDialog.value = true;
}

async function save() {
  if (!form.value.name.trim() || !form.value.code.trim() || !form.value.supertypeId) return;
  dialogError.value = '';
  saving.value = true;
  try {
    const payload = {
      name: form.value.name.trim(),
      code: form.value.code.trim().toUpperCase(),
      description: form.value.description.trim() || undefined,
      supertypeId: form.value.supertypeId,
    };
    if (editTarget.value) {
      const updated = await projectTypesApi.update(editTarget.value.id, payload);
      const idx = items.value.findIndex((t) => t.id === updated.id);
      if (idx !== -1) items.value[idx] = updated;
    } else {
      items.value.push(await projectTypesApi.create(payload));
    }
    showDialog.value = false;
  } catch (e: any) {
    dialogError.value = e?.response?.data?.detail ?? e?.message ?? 'Operation failed';
  } finally {
    saving.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────────────
const showDeleteDialog = ref(false);
const deleteSaving = ref(false);
const pendingDelete = ref<ProjectType | null>(null);

function confirmDelete(type: ProjectType) {
  pendingDelete.value = type;
  showDeleteDialog.value = true;
}

async function doDelete() {
  if (!pendingDelete.value) return;
  deleteSaving.value = true;
  try {
    await projectTypesApi.delete(pendingDelete.value.id);
    items.value = items.value.filter((t) => t.id !== pendingDelete.value!.id);
    showDeleteDialog.value = false;
    pendingDelete.value = null;
  } catch (e: any) {
    dialogError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to delete';
  } finally {
    deleteSaving.value = false;
  }
}

async function load() {
  loading.value = true;
  try { items.value = await projectTypesApi.list(); }
  finally { loading.value = false; }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Project Types</h2>
        <p class="ares-page-subtitle">Configure project types and their subtypes.</p>
      </div>
    </div>

    <div v-if="loading" style="padding:2rem; color:var(--ares-text-muted);">Loading…</div>

    <div v-for="section in sections" :key="section.key" style="margin-bottom:2.5rem;">

      <!-- Section header — only shown once a plugin contributes at least one type, so a plain
           install with no plugins looks exactly like before (a flat list, no "Platform" label). -->
      <div
        v-if="sections.length > 1"
        style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; padding-bottom:0.4rem; border-bottom:1px solid var(--ares-border);"
      >
        <img v-if="section.icon" :src="section.icon" alt="" style="width:18px; height:18px; object-fit:contain;" />
        <span style="font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ares-text-muted);">
          {{ section.title }}
        </span>
      </div>

      <div v-for="root in section.roots" :key="root.id" style="margin-bottom:2rem;" :style="root.disabled ? { opacity: '0.6' } : {}">

        <!-- Root header -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.6rem;">
          <div style="display:flex; align-items:center; gap:0.65rem;">
            <AresBadge :value="root.code" severity="info" style="font-family:monospace;" />
            <span style="font-weight:600; font-size:1rem;">{{ root.name }}</span>
            <AresBadge v-if="root.disabled" value="Disabled" severity="danger" style="font-size:0.68rem;" />
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <Button
              v-if="!root.requiredPluginId"
              :label="root.disabled ? 'Enable' : 'Disable'"
              :severity="root.disabled ? 'secondary' : 'warn'"
              size="small"
              text
              @click="toggleDisabled(root)"
            />
            <!-- Plugin-owned root types don't accept manually-added subtypes either — a subtype
                 with no platform client behind it would never sync anything. -->
            <Button
              v-if="!root.requiredPluginId && !root.disabled"
              icon="pi pi-plus"
              label="Add subtype"
              size="small"
              severity="secondary"
              text
              @click="openCreate(root.id)"
            />
          </div>
        </div>

        <!-- Subtypes table -->
        <div class="ares-table-wrap">
          <table class="ares-table">
            <thead>
              <tr>
                <th style="width:140px;">Code</th>
                <th style="width:200px;">Name</th>
                <th>Description</th>
                <th style="width:100px;"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sub in subtypesByRoot.get(root.id) ?? []"
                :key="sub.id"
                :style="sub.disabled ? { opacity: '0.55' } : {}"
              >
                <td><AresBadge :value="sub.code" severity="secondary" style="font-family:monospace; font-size:0.75rem;" /></td>
                <td>
                  <span>{{ sub.name }}</span>
                </td>
                <td style="color:var(--ares-text-muted);">{{ sub.description ?? '—' }}</td>
                <td>
                  <div style="display:flex; gap:0.15rem; justify-content:flex-end;">
                    <Button
                      v-if="!sub.requiredPluginId"
                      :icon="sub.disabled ? 'pi pi-eye' : 'pi pi-eye-slash'"
                      text
                      size="small"
                      :severity="sub.disabled ? 'secondary' : 'warn'"
                      :title="sub.disabled ? 'Enable' : 'Disable'"
                      @click="toggleDisabled(sub)"
                    />
                    <template v-if="!sub.system">
                      <Button icon="pi pi-pencil" text size="small" @click="openEdit(sub)" />
                      <Button icon="pi pi-trash" text severity="danger" size="small" @click="confirmDelete(sub)" />
                    </template>
                  </div>
                </td>
              </tr>
              <tr v-if="!subtypesByRoot.get(root.id)?.length">
                <td colspan="4" class="ares-table-empty">No subtypes defined. Click "Add subtype" to create one.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Create / edit dialog -->
    <Dialog v-model:visible="showDialog" :header="editTarget ? 'Edit subtype' : 'New project subtype'" modal style="width:34rem;">
      <div style="display:flex; flex-direction:column; gap:0.85rem; padding-top:0.5rem;">

        <div class="form-field">
          <label>Root type *</label>
          <Select
            v-model="form.supertypeId"
            :options="rootOptions"
            option-label="label"
            option-value="value"
            placeholder="Select root type"
            class="w-full"
            :disabled="!!editTarget"
          />
          <span v-if="editTarget" style="font-size:0.72rem; color:var(--ares-text-muted);">Root type cannot be changed after creation.</span>
        </div>

        <div class="form-field">
          <label>Name *</label>
          <InputText v-model="form.name" placeholder="e.g. DAST Web Application" class="w-full" />
        </div>

        <div class="form-field">
          <label>
            Code *
            <span style="font-weight:400; text-transform:none; font-size:0.72rem; margin-left:0.25rem;">(used in project identifiers)</span>
          </label>
          <InputText
            v-model="form.code"
            placeholder="e.g. DAST_WEB"
            class="w-full"
            style="font-family:monospace;"
            @input="(e: Event) => form.code = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9_]/g, '')"
          />
          <span style="font-size:0.75rem; color:var(--ares-text-muted);">
            Preview: <code style="color:var(--ares-accent);">ORGSLUG-{{ form.code || 'CODE' }}-26-01</code>
          </span>
        </div>

        <div class="form-field">
          <label>Description</label>
          <Textarea v-model="form.description" placeholder="Describe what this project type covers…" rows="3" class="w-full" auto-resize />
        </div>

        <Message v-if="dialogError" severity="error" :closable="false">{{ dialogError }}</Message>

        <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
          <Button label="Cancel" severity="secondary" @click="showDialog = false" />
          <Button
            :label="editTarget ? 'Save' : 'Create'"
            :loading="saving"
            :disabled="!form.name.trim() || !form.code.trim() || !form.supertypeId"
            @click="save"
          />
        </div>
      </div>
    </Dialog>

    <!-- Delete confirmation -->
    <Dialog v-model:visible="showDeleteDialog" header="Delete subtype" modal style="width:24rem;">
      <p style="color:var(--ares-text-2); margin-bottom:1rem;">
        Delete <strong style="color:var(--ares-accent);">{{ pendingDelete?.name }}</strong>
        (<code>{{ pendingDelete?.code }}</code>)?
        Existing projects will keep their generated codes.
      </p>
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <Button label="Cancel" severity="secondary" @click="showDeleteDialog = false" />
        <Button label="Delete" severity="danger" :loading="deleteSaving" @click="doDelete" />
      </div>
    </Dialog>
  </div>
</template>
