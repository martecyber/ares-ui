<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import AresLoadingState from '@/components/AresLoadingState.vue';
import AppPagination from '@/components/AppPagination.vue';
import { kbEmailTemplatesApi, type EmailTemplate } from '@/api/kb-email-templates';
import { confirmDialog } from '@/composables/useConfirmDialog';

const router = useRouter();

// Built here, not written literally in the template — a `}}` inside a template text
// interpolation closes the interpolation early and breaks the Vue compiler (see
// MessagingBindingsPanel.vue's chipText() for the same fix applied to the same problem).
const varPlaceholderExample = '{{finding.title}}';

const templates  = ref<EmailTemplate[]>([]);
const loading    = ref(true);
const err        = ref<string | null>(null);

const q          = ref('');
const page       = ref(0);
const totalPages = ref(0);
const total      = ref(0);
const pageSize   = 50;

const deleting = ref<number | null>(null);
const creating = ref(false);

let debounce: ReturnType<typeof setTimeout> | null = null;

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const r = await kbEmailTemplatesApi.list({ q: q.value.trim() || undefined, page: page.value, size: pageSize });
    templates.value = r.items ?? [];
    totalPages.value = r.totalPages;
    total.value = r.total;
  } catch {
    err.value = 'Failed to load email templates.';
  } finally {
    loading.value = false;
  }
}

watch(q, () => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => { page.value = 0; load(); }, 300);
});

async function createNew() {
  creating.value = true;
  try {
    const created = await kbEmailTemplatesApi.create({ name: 'Untitled template' });
    router.push({ name: 'kb-email-template-detail', params: { id: created.id } });
  } catch { err.value = 'Failed to create template.'; }
  finally { creating.value = false; }
}

async function remove(e: Event, id: number) {
  e.stopPropagation();
  const ok = await confirmDialog({ header: 'Delete email template', message: 'Delete this template?' });
  if (!ok) return;
  deleting.value = id;
  try {
    await kbEmailTemplatesApi.delete(id);
    templates.value = templates.value.filter(t => t.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch { err.value = 'Failed to delete.'; }
  finally { deleting.value = null; }
}

function prevPage() { page.value--; load(); }
function nextPage() { page.value++; load(); }

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Email Templates</h2>
        <p class="ares-page-subtitle">
          Reusable HTML email bodies for reporting a finding by email — an alternative to a DOCX
          report template, picked the same way when delivering a report. Reference
          <code>{{ varPlaceholderExample }}</code>-style variables — resolved from the finding when the report is sent.
        </p>
      </div>
      <Button icon="pi pi-plus" text size="small" :loading="creating" v-tooltip.top="'New template'" @click="createNew" />
    </div>

    <div style="margin-bottom:0.85rem;">
      <InputText v-model="q" placeholder="Search templates…" style="max-width:300px;" />
    </div>

    <div v-if="err" class="ares-alert ares-alert--error" style="margin-bottom:0.75rem;">{{ err }}</div>

    <template v-if="loading">
      <AresLoadingState />
    </template>
    <template v-else>
      <div class="ares-table-wrap">
        <table class="ares-table ares-table--clickable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Subject</th>
              <th style="width:120px;">Updated</th>
              <th style="width:60px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id"
              @click="router.push({ name: 'kb-email-template-detail', params: { id: t.id } })">
              <td style="font-weight:500;">{{ t.name }}</td>
              <td style="color:var(--ares-text-muted); font-size:0.85rem;">{{ t.subjectTemplate || '—' }}</td>
              <td style="color:var(--ares-text-muted); font-size:0.8rem; white-space:nowrap;">
                {{ new Date(t.updatedAt).toLocaleDateString() }}
              </td>
              <td @click.stop style="text-align:right; padding-right:0.5rem;">
                <Button icon="pi pi-trash" text severity="danger" size="small"
                  :loading="deleting === t.id" @click="remove($event, t.id)" />
              </td>
            </tr>
            <tr v-if="!templates.length">
              <td colspan="4" class="ares-table-empty">
                No email templates yet. Click "New template" to create one.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPagination :page="page" :total-pages="totalPages" :total="total"
        @prev="prevPage" @next="nextPage" />
    </template>
  </div>
</template>
