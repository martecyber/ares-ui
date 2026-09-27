<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import DatePicker from 'primevue/datepicker';
import Message from 'primevue/message';
import { projectsApi } from '@/api/projects';
import { projectTypesApi } from '@/api/project-types';

const route = useRoute();
const router = useRouter();

const orgId = computed(() => Number(route.params.orgId));

const saving = ref(false);
const error = ref('');
const groupedTypeOptions = ref<{ label: string; code: string; items: { label: string; value: number; code: string }[] }[]>([]);

const form = ref({
  name: '',
  typeId: null as number | null,
  startDate: null as Date | null,
  endDate: null as Date | null,
});

const selectedTypeCode = computed(() => {
  for (const group of groupedTypeOptions.value) {
    const found = group.items.find((t) => t.value === form.value.typeId);
    if (found) return found.code;
  }
  return null;
});

const codePreview = computed(() => {
  if (!selectedTypeCode.value) return null;
  const yy = String(new Date().getFullYear()).slice(2);
  return `{ORG_SLUG}-${selectedTypeCode.value}-${yy}-NN`;
});

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function submit() {
  error.value = '';
  saving.value = true;
  try {
    const created = await projectsApi.create({
      organizationId: orgId.value,
      name: form.value.name,
      typeId: form.value.typeId ?? undefined,
      startDate: form.value.startDate ? toLocalDateStr(form.value.startDate) : undefined,
      endDate: form.value.endDate ? toLocalDateStr(form.value.endDate) : undefined,
    });
    router.push({ name: 'org-project-detail', params: { orgId: orgId.value, id: created.id } });
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create project';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const types = await projectTypesApi.list();

  // Build groups: root types as group headers, subtypes as items
  const roots = types.filter((t) => t.system && t.supertypeId === null);
  const byRoot = new Map<number, typeof types>();
  for (const t of types) {
    if (!t.system && t.supertypeId !== null) {
      if (!byRoot.has(t.supertypeId)) byRoot.set(t.supertypeId, []);
      byRoot.get(t.supertypeId)!.push(t);
    }
  }
  groupedTypeOptions.value = roots
    .map((r) => ({
      label: r.name,
      code: r.code,
      items: (byRoot.get(r.id) ?? []).map((t) => ({ label: `${t.name} (${t.code})`, value: t.id, code: t.code })),
    }))
    .filter((g) => g.items.length > 0);
});
</script>

<template>
  <div style="max-width:560px;">
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.5rem;">
      <Button icon="pi pi-arrow-left" severity="secondary" text @click="router.back()" />
      <h2 class="ares-page-title">New project</h2>
    </div>

    <form @submit.prevent="submit" style="display:flex; flex-direction:column; gap:1rem;">
      <div class="form-field">
        <label>Name *</label>
        <InputText v-model="form.name" required placeholder="e.g. Web Pentest Q2 2025" class="w-full" />
      </div>

      <div class="form-field">
        <label>Type *</label>
        <Select
          v-model="form.typeId"
          :options="groupedTypeOptions"
          option-group-label="label"
          option-group-children="items"
          option-label="label"
          option-value="value"
          placeholder="Select type"
          required
          class="w-full"
        />
        <span v-if="codePreview" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.2rem;">
          Code preview: <code style="color:var(--ares-accent);">{{ codePreview }}</code>
        </span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-field">
          <label>Start date</label>
          <DatePicker v-model="form.startDate" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" class="w-full" />
        </div>
        <div class="form-field">
          <label>End date</label>
          <DatePicker v-model="form.endDate" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" class="w-full" />
        </div>
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.75rem; margin-top:0.5rem;">
        <Button type="submit" label="Create project" :loading="saving" :disabled="!form.name || !form.typeId" />
        <Button type="button" label="Cancel" severity="secondary" @click="router.back()" />
      </div>
    </form>
  </div>
</template>
