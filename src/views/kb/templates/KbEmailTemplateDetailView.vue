<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import HtmlEmailEditor from '@/components/HtmlEmailEditor.vue';
import { kbEmailTemplatesApi, type EmailTemplate, type PriorityDisplayEntry } from '@/api/kb-email-templates';
import { severityToPriorityLabel } from '@/utils/cvss';

const route = useRoute();
const router = useRouter();
const templateId = computed(() => Number(route.params.id));

const template = ref<EmailTemplate | null>(null);
const loading  = ref(true);
const err      = ref<string | null>(null);
const saving   = ref(false);
const saved    = ref(false);

const name            = ref('');
const subjectTemplate = ref('');
const htmlContent     = ref('');

// Same key convention as ReportTemplate.priorityColors (DOCX templates) — raw severity, not
// P0-P4 — so this and the docx editor stay consistent. Unlike docx (which needs a bg/text pair
// for Word cell fills) an email badge is plain CSS, so one color is enough.
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const;
const DEFAULT_PRIORITY_COLORS: Record<string, PriorityDisplayEntry> = {
  critical: { label: '', color: '#ef4444' },
  high:     { label: '', color: '#f97316' },
  medium:   { label: '', color: '#ca8a04' },
  low:      { label: '', color: '#16a34a' },
  info:     { label: '', color: '#3b82f6' },
};
const priorityColors = ref<Record<string, PriorityDisplayEntry>>({ ...DEFAULT_PRIORITY_COLORS });

/** What actually gets used at send time: the author's custom label if set, else the P0-P4
 *  default — mirrors the backend's PriorityLabels fallback. */
function resolvedLabel(sev: string): string {
  return priorityColors.value[sev]?.label?.trim() || severityToPriorityLabel(sev);
}

async function load() {
  loading.value = true;
  err.value = null;
  try {
    const t = await kbEmailTemplatesApi.get(templateId.value);
    template.value = t;
    name.value = t.name;
    subjectTemplate.value = t.subjectTemplate ?? '';
    htmlContent.value = t.htmlContent ?? '';
    priorityColors.value = t.priorityColors
      ? { ...DEFAULT_PRIORITY_COLORS, ...t.priorityColors }
      : { ...DEFAULT_PRIORITY_COLORS };
  } catch {
    err.value = 'Failed to load email template.';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  saved.value = false;
  try {
    const updated = await kbEmailTemplatesApi.update(templateId.value, {
      name: name.value.trim(),
      subjectTemplate: subjectTemplate.value,
      htmlContent: htmlContent.value,
      priorityColors: priorityColors.value,
    });
    template.value = updated;
    // The backend re-sanitizes on every save — reflect what actually got persisted rather than
    // what was typed, so the editor never drifts from the source of truth.
    htmlContent.value = updated.htmlContent ?? '';
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2000);
  } catch {
    err.value = 'Failed to save template.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" class="ares-table-empty" style="margin-top:1rem;">Loading…</div>
    <div v-else-if="err" class="ares-alert ares-alert--error" style="margin-top:1rem;">{{ err }}</div>

    <template v-else-if="template">
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.5rem;">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
          <Button icon="pi pi-arrow-left" severity="secondary" text style="flex-shrink:0;"
            @click="router.push({ name: 'kb-email-templates' })" />
          <InputText v-model="name" class="ares-page-title" style="font-size:1.25rem; font-weight:600; border:none; background:transparent; padding:0; flex:1;" />
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
          <span v-if="saved" style="font-size:0.8rem; color:var(--ares-success);">
            <i class="pi pi-check" /> Saved
          </span>
          <Button label="Save" icon="pi pi-check" size="small"
            :loading="saving" :disabled="!name.trim()" @click="save" />
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <label class="field-label">
          Subject template
          <i class="pi pi-info-circle" style="font-size:0.7rem; opacity:0.6;"
            v-tooltip.top="'Plain text — {{var}} placeholders and {{#name}}...{{/name}} repeat blocks resolved when the report is sent. See the Email report templates page in the docs for the full variable list.'" />
        </label>
        <InputText v-model="subjectTemplate" style="width:100%; font-family:monospace;"
          placeholder="e.g. [{{finding.severityLabel}}] {{finding.title}} — {{project.name}}" />
      </div>

      <!-- Per-template severity styling — the email equivalent of a DOCX ReportTemplate's own
           priorityColors, replacing the old platform-wide admin setting. -->
      <div class="ares-card" style="padding:0.85rem 1rem; margin-bottom:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <span class="section-header-label">Severity colors</span>
        </div>
        <p style="font-size:0.78rem; color:var(--ares-text-muted); margin:0 0 0.65rem;">
          <code>finding.severityLabel</code>/<code>finding.severityColor</code> for this template. Leave
          a label blank to use the default (P0-P4).
        </p>
        <div style="display:grid; grid-template-columns:repeat(5,1fr); gap:0.5rem;">
          <div v-for="sev in SEVERITY_LEVELS" :key="sev" style="display:flex; flex-direction:column; gap:0.3rem; align-items:center;">
            <div :style="{ background: priorityColors[sev]?.color, color:'#fff',
              padding:'0.25rem 0.4rem', borderRadius:'4px', fontSize:'0.7rem', fontWeight:700, width:'100%', textAlign:'center' }">
              {{ resolvedLabel(sev) }}
            </div>
            <input
              type="text"
              :value="priorityColors[sev]?.label ?? ''"
              :placeholder="severityToPriorityLabel(sev)"
              maxlength="30"
              style="width:100%; font-size:0.72rem; text-align:center; padding:0.15rem 0.25rem; border-radius: var(--ares-radius); border:1px solid var(--ares-border); background:var(--ares-surface-raised); color:var(--ares-text);"
              @input="(e) => { if (priorityColors[sev]) priorityColors[sev].label = (e.target as HTMLInputElement).value }"
            />
            <input type="color" :value="priorityColors[sev]?.color ?? '#888888'"
              style="width:28px; height:28px; border:none; cursor:pointer; background:none;"
              @input="(e) => { if (priorityColors[sev]) priorityColors[sev].color = (e.target as HTMLInputElement).value }" />
          </div>
        </div>
      </div>

      <div class="ares-card" style="padding:0; margin-bottom:1.5rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">
            HTML body
            <i class="pi pi-info-circle" style="font-size:0.7rem; opacity:0.6;"
              v-tooltip.top="'Sanitized server-side on every save — script tags, event handlers and javascript: URLs are stripped. See the Email report templates page in the docs for the full variable list.'" />
          </span>
        </div>
        <HtmlEmailEditor v-model="htmlContent" editor-style="min-height:420px;"
          placeholder="<table><tr><td>{{finding.title}}</td></tr></table>" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.field-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
