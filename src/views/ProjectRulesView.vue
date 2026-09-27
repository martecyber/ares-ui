<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import ProgressSpinner from 'primevue/progressspinner';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import {
  projectRulesApi, RULE_TYPE_LABELS,
  type ProjectRule, type ProjectRuleType,
} from '@/api/project-rules';
import { platformTimezone } from '@/api/versions';
import { useContextStore } from '@/stores/context';
import { projectsApi, type ProjectMember } from '@/api/projects';
import { organizationContactsApi, type OrganizationContact } from '@/api/organizationContacts';
import AqlFilterInput from '@/components/AqlFilterInput.vue';

const route   = useRoute();
const context = useContextStore();
const toast   = useToast();
const engId   = computed(() => Number(route.params.engId));

const rules   = ref<ProjectRule[]>([]);
const loading = ref(true);
const orgContacts    = ref<OrganizationContact[]>([]);
const projectMembers = ref<ProjectMember[]>([]);

async function load() {
  loading.value = true;
  try {
    const [project, r] = await Promise.all([
      projectsApi.get(engId.value),
      projectRulesApi.list(engId.value),
    ]);
    if (project) {
      context.setProject({ id: project.id, name: project.name, code: project.code, typeCode: project.typeCode ?? null, supertypeCode: project.supertypeCode ?? null, clientsCanViewDetections: project.clientsCanViewDetections ?? false });
      projectMembers.value = project.members ?? [];
      organizationContactsApi.list(project.organizationId).then((c) => { orgContacts.value = c; }).catch(() => {});
    }
    rules.value = r;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// One merged, deduped-by-email picklist for the "email_recipients" rule form — a contact and a
// project member can share an email (e.g. the lead is also listed as an org contact); when that
// happens the organization contact's curated name wins and the member entry is dropped, so the
// same person never appears twice in the dropdown. `key` round-trips as "contact:<id>"/"user:<id>"
// through buildConfig()/openEdit() so each recipient row remembers which pool it came from.
interface ContactOption { key: string; label: string; email: string }
const contactOptions = computed<ContactOption[]>(() => {
  const byEmail = new Map<string, ContactOption>();
  for (const c of orgContacts.value) {
    byEmail.set(c.email.toLowerCase(), { key: `contact:${c.id}`, label: `${c.name} <${c.email}>`, email: c.email });
  }
  for (const m of projectMembers.value) {
    const email = m.userEmail.toLowerCase();
    if (!byEmail.has(email)) {
      byEmail.set(email, { key: `user:${m.userId}`, label: `${m.userDisplayName || m.userEmail} <${m.userEmail}>`, email: m.userEmail });
    }
  }
  return [...byEmail.values()].sort((a, b) => a.label.localeCompare(b.label));
});

// ── Summary helpers ────────────────────────────────────────────────────────

function twTimeStr(c: Record<string, unknown>, key: 'startTime' | 'endTime', fallbackHour: 'startHour' | 'endHour'): string {
  if (c[key]) return String(c[key]);
  const h = c[fallbackHour];
  return h != null ? `${String(Number(h)).padStart(2, '0')}:00` : '?';
}

function ruleSummary(r: ProjectRule): string {
  const c = r.config;
  switch (r.ruleType) {
    case 'time_window': {
      const s = twTimeStr(c, 'startTime', 'startHour');
      const e = twTimeStr(c, 'endTime', 'endHour');
      const days = (c.daysOfWeek as number[] | undefined);
      const dayLabels = days?.length
        ? days.map((d) => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d] ?? d).join(', ')
        : 'every day';
      return `${s} – ${e}, ${dayLabels}`;
    }
    case 'rate_limit':
      return `${c.value} req/${c.unit === 'rpm' ? 'min' : 'sec'}`;
    case 'required_header':
      return `${c.name}: ${c.value}`;
    case 'required_user_agent':
      return String(c.userAgent ?? '');
    case 'severity_override':
      return `${c.vulnType} → ${c.severity}`;
    case 'max_concurrency':
      return `Max ${c.value} threads`;
    case 'excluded_vuln_type':
      return String(c.vulnType ?? '');
    case 'email_recipients': {
      const recipients = Array.isArray(c.recipients) ? (c.recipients as { placement?: string }[]) : [];
      const counts: Record<string, number> = {};
      for (const r of recipients) {
        const p = (r.placement ?? 'to').toUpperCase();
        counts[p] = (counts[p] ?? 0) + 1;
      }
      const parts = Object.entries(counts).map(([p, n]) => `${p}: ${n}`).join(', ');
      const aql = c.aql ? ` if ${c.aql}` : '';
      return `${parts || 'no recipients'}${aql}`;
    }
    default:
      return '';
  }
}

// ── Inline toggle enable ───────────────────────────────────────────────────

async function toggleEnabled(r: ProjectRule) {
  const prev = r.enabled;
  r.enabled = !prev;
  try {
    const updated = await projectRulesApi.update(engId.value, r.id, { enabled: r.enabled });
    Object.assign(r, updated);
  } catch {
    r.enabled = prev;
    toast.add({ severity: 'error', summary: 'Update failed', life: 3000 });
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function deleteRule(id: number) {
  try {
    await projectRulesApi.delete(engId.value, id);
    rules.value = rules.value.filter((r) => r.id !== id);
  } catch {
    toast.add({ severity: 'error', summary: 'Delete failed', life: 3000 });
  }
}

// ── Create / Edit dialog ───────────────────────────────────────────────────

const RULE_TYPE_OPTIONS = (Object.entries(RULE_TYPE_LABELS) as [ProjectRuleType, string][]).map(
  ([value, label]) => ({ value, label })
);

const DOW_OPTIONS = [
  { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 },
];

const RATE_UNIT_OPTIONS = [
  { label: 'per second (rps)', value: 'rps' },
  { label: 'per minute (rpm)', value: 'rpm' },
];

const SEVERITY_OPTIONS = [
  { label: 'Info', value: 'info' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

const showDialog = ref(false);
const saving     = ref(false);
const editingId  = ref<number | null>(null);

const formType    = ref<ProjectRuleType>('time_window');
const formNote    = ref('');
const formEnabled = ref(true);

// Type-specific form fields
function makeTime(h: number, m = 0) { const d = new Date(); d.setHours(h, m, 0, 0); return d; }
function parseTime(s: string): Date {
  const [h, m] = s.split(':').map(Number);
  return makeTime(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m);
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const twStartTime = ref<Date>(makeTime(9));
const twEndTime   = ref<Date>(makeTime(18));
const twDays      = ref<number[]>([1, 2, 3, 4, 5]);

const rlValue = ref(10);
const rlUnit  = ref<'rps' | 'rpm'>('rps');

const rhName  = ref('');
const rhValue = ref('');

const ruaValue = ref('');

const soVulnType  = ref('');
const soSeverity  = ref('medium');

const mcValue = ref(10);

const evtVulnType = ref('');

interface RecipientRow { placement: 'to' | 'cc' | 'bcc'; key: string | null }
function emptyRecipientRow(): RecipientRow { return { placement: 'cc', key: null }; }
const erRows = ref<RecipientRow[]>([emptyRecipientRow()]);
const erAql  = ref('');

const PLACEMENT_OPTIONS = [
  { label: 'To',  value: 'to' },
  { label: 'Cc',  value: 'cc' },
  { label: 'Bcc', value: 'bcc' },
];

watch(formType, () => {
  // Reset type-specific fields when type changes
  twStartTime.value = makeTime(9); twEndTime.value = makeTime(18); twDays.value = [1, 2, 3, 4, 5];
  rlValue.value = 10; rlUnit.value = 'rps';
  rhName.value = ''; rhValue.value = '';
  ruaValue.value = '';
  soVulnType.value = ''; soSeverity.value = 'medium';
  mcValue.value = 10;
  evtVulnType.value = '';
  erRows.value = [emptyRecipientRow()]; erAql.value = '';
});

function openCreate() {
  editingId.value = null;
  formType.value  = 'time_window';
  formNote.value  = '';
  formEnabled.value = true;
  showDialog.value = true;
}

function openEdit(r: ProjectRule) {
  editingId.value   = r.id;
  formType.value    = r.ruleType;
  formNote.value    = r.note ?? '';
  formEnabled.value = r.enabled;
  const c = r.config;
  switch (r.ruleType) {
    case 'time_window':
      twStartTime.value = c.startTime ? parseTime(String(c.startTime)) : makeTime(Number(c.startHour ?? 9));
      twEndTime.value   = c.endTime   ? parseTime(String(c.endTime))   : makeTime(Number(c.endHour   ?? 18));
      twDays.value      = Array.isArray(c.daysOfWeek) ? (c.daysOfWeek as number[]) : [1,2,3,4,5];
      break;
    case 'rate_limit':
      rlValue.value = Number(c.value ?? 10);
      rlUnit.value  = (c.unit as 'rps' | 'rpm') ?? 'rps';
      break;
    case 'required_header':
      rhName.value  = String(c.name  ?? '');
      rhValue.value = String(c.value ?? '');
      break;
    case 'required_user_agent':
      ruaValue.value = String(c.userAgent ?? '');
      break;
    case 'severity_override':
      soVulnType.value = String(c.vulnType  ?? '');
      soSeverity.value = String(c.severity  ?? 'medium');
      break;
    case 'max_concurrency':
      mcValue.value = Number(c.value ?? 10);
      break;
    case 'excluded_vuln_type':
      evtVulnType.value = String(c.vulnType ?? '');
      break;
    case 'email_recipients': {
      const recipients = Array.isArray(c.recipients)
        ? (c.recipients as { placement?: string; kind?: string; id?: number }[]) : [];
      erRows.value = recipients.length
        ? recipients.map((r) => ({
            placement: (r.placement as 'to' | 'cc' | 'bcc') ?? 'cc',
            key: r.kind && r.id != null ? `${r.kind}:${r.id}` : null,
          }))
        : [emptyRecipientRow()];
      erAql.value = String(c.aql ?? '');
      break;
    }
  }
  showDialog.value = true;
}

function buildConfig(): Record<string, unknown> {
  switch (formType.value) {
    case 'time_window':
      return { startTime: fmtTime(twStartTime.value), endTime: fmtTime(twEndTime.value), daysOfWeek: [...twDays.value] };
    case 'rate_limit':
      return { value: rlValue.value, unit: rlUnit.value };
    case 'required_header':
      return { name: rhName.value.trim(), value: rhValue.value };
    case 'required_user_agent':
      return { userAgent: ruaValue.value.trim() };
    case 'severity_override':
      return { vulnType: soVulnType.value.trim(), severity: soSeverity.value };
    case 'max_concurrency':
      return { value: mcValue.value };
    case 'excluded_vuln_type':
      return { vulnType: evtVulnType.value.trim() };
    case 'email_recipients': {
      const recipients = erRows.value
        .filter((r) => r.key)
        .map((r) => {
          const [kind, idStr] = r.key!.split(':');
          return { placement: r.placement, kind, id: Number(idStr) };
        });
      const cfg: Record<string, unknown> = { recipients };
      if (erAql.value.trim()) cfg.aql = erAql.value.trim();
      return cfg;
    }
  }
}

async function save() {
  saving.value = true;
  try {
    const config  = buildConfig();
    const note    = formNote.value.trim() || null;
    const enabled = formEnabled.value;

    if (editingId.value != null) {
      const updated = await projectRulesApi.update(engId.value, editingId.value, { enabled, note, config });
      const idx = rules.value.findIndex((r) => r.id === editingId.value);
      if (idx >= 0) rules.value[idx] = updated;
    } else {
      const created = await projectRulesApi.create(engId.value, { ruleType: formType.value, enabled, note, config });
      rules.value.push(created);
    }
    showDialog.value = false;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Save failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally {
    saving.value = false; }
}

function toggleDow(v: number) {
  const idx = twDays.value.indexOf(v);
  if (idx >= 0) twDays.value.splice(idx, 1);
  else twDays.value.push(v);
}

// ── Active rule counts for the header ─────────────────────────────────────

const activeCount = computed(() => rules.value.filter((r) => r.enabled).length);
</script>

<template>
  <div>
    <Toast />

    <div class="ares-page-header" style="margin-bottom:1.25rem;">
      <div>
        <h2 class="ares-page-title">Rules of Engagement</h2>
        <p class="ares-page-subtitle">
          Operational constraints for this project.
          <span v-if="!loading && activeCount > 0" style="color:var(--ares-warning);">
            {{ activeCount }} active rule{{ activeCount !== 1 ? 's' : '' }} — enforced on all agent tasks.
          </span>
        </p>
      </div>
      <Button icon="pi pi-plus" text size="small" v-tooltip.top="'Add rule'" @click="openCreate" />
    </div>

    <div v-if="loading" class="ares-table-empty"><ProgressSpinner style="width:32px;height:32px;" /></div>

    <template v-else>
      <div v-if="rules.length === 0" class="ares-table-empty" style="padding:2rem 0;">
        No rules defined. Click "Add rule" to set testing constraints.
      </div>

      <div v-else class="ares-table-wrap">
        <table class="ares-table">
          <thead>
            <tr>
              <th style="width:180px;">Type</th>
              <th>Summary</th>
              <th>Note</th>
              <th style="width:80px; text-align:center;">Enabled</th>
              <th style="width:80px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rules" :key="r.id">
              <td data-label="Type">
                {{ RULE_TYPE_LABELS[r.ruleType] }}
              </td>
              <td data-label="Summary" style="font-family:monospace; font-size:0.82rem;">{{ ruleSummary(r) }}</td>
              <td data-label="Note" style="color:var(--ares-text-muted); font-size:0.82rem;">{{ r.note ?? '—' }}</td>
              <td data-label="Enabled" style="text-align:center;">
                <ToggleSwitch :modelValue="r.enabled" @update:modelValue="toggleEnabled(r)" />
              </td>
              <td data-actions style="text-align:right;">
                <div style="display:flex; gap:0.25rem; justify-content:flex-end;">
                  <Button icon="pi pi-pencil" size="small" text severity="secondary" @click="openEdit(r)" />
                  <Button icon="pi pi-trash"  size="small" text severity="danger"     @click="deleteRule(r.id)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Informational callout for reference-only rule types -->
      <div v-if="rules.some((r) => r.ruleType === 'severity_override' || r.ruleType === 'excluded_vuln_type')"
           style="margin-top:1rem; padding:0.75rem 1rem; border-radius: var(--ares-radius);
                  background:var(--ares-surface-b); border:1px solid var(--ares-border);
                  font-size:0.82rem; color:var(--ares-text-muted); display:flex; gap:0.5rem; align-items:flex-start;">
        <i class="pi pi-info-circle" style="margin-top:0.1rem; flex-shrink:0;" />
        Severity override and out-of-scope vulnerability type rules are stored for reference only in v1 — they are not automatically applied to findings.
      </div>
    </template>

    <!-- ── Create / Edit dialog ───────────────────────────────────────── -->
    <Dialog
      v-model:visible="showDialog"
      :header="editingId != null ? 'Edit rule' : 'Add rule'"
      :modal="true"
      :style="{ width: '480px', maxWidth: '95vw' }"
    >
      <div style="display:flex; flex-direction:column; gap:1rem;">

        <!-- Rule type — locked when editing -->
        <div class="ares-form-field">
          <label class="ares-form-label">Type</label>
          <Select
            v-model="formType"
            :options="RULE_TYPE_OPTIONS"
            option-label="label"
            option-value="value"
            :disabled="editingId != null"
            style="width:100%;"
          />
        </div>

        <!-- Dynamic config fields -->
        <template v-if="formType === 'time_window'">
          <div style="display:flex; gap:0.75rem;">
            <div class="ares-form-field" style="flex:1;">
              <label class="ares-form-label">From</label>
              <DatePicker v-model="twStartTime" timeOnly :showSeconds="false" hourFormat="24" fluid />
            </div>
            <div class="ares-form-field" style="flex:1;">
              <label class="ares-form-label">To</label>
              <DatePicker v-model="twEndTime" timeOnly :showSeconds="false" hourFormat="24" fluid />
            </div>
          </div>
          <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:-0.25rem;">
            Platform time zone: <strong>{{ platformTimezone }}</strong>
          </div>
          <div class="ares-form-field">
            <label class="ares-form-label">Days of week (empty = every day)</label>
            <div style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.25rem;">
              <button
                v-for="d in DOW_OPTIONS" :key="d.value"
                type="button"
                :style="{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  border: '1px solid var(--ares-border)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  background: twDays.includes(d.value) ? 'var(--ares-accent)' : 'var(--ares-surface-b)',
                  color: twDays.includes(d.value) ? '#fff' : 'var(--ares-text)',
                }"
                @click="toggleDow(d.value)"
              >{{ d.label }}</button>
            </div>
          </div>
        </template>

        <template v-else-if="formType === 'rate_limit'">
          <div class="ares-form-field">
            <label class="ares-form-label">Unit</label>
            <Select v-model="rlUnit" :options="RATE_UNIT_OPTIONS" option-label="label" option-value="value" style="width:100%;" />
          </div>
          <div class="ares-form-field">
            <label class="ares-form-label">Max requests</label>
            <InputNumber v-model="rlValue" :min="1" style="width:100%;" />
          </div>
        </template>

        <template v-else-if="formType === 'required_header'">
          <div class="ares-form-field">
            <label class="ares-form-label">Header name</label>
            <InputText v-model="rhName" placeholder="X-Custom-Header" style="width:100%;" />
          </div>
          <div class="ares-form-field">
            <label class="ares-form-label">Header value</label>
            <InputText v-model="rhValue" placeholder="secret-value" style="width:100%;" />
          </div>
        </template>

        <template v-else-if="formType === 'required_user_agent'">
          <div class="ares-form-field">
            <label class="ares-form-label">User-Agent string</label>
            <InputText v-model="ruaValue" placeholder="Mozilla/5.0 ..." style="width:100%;" />
          </div>
        </template>

        <template v-else-if="formType === 'severity_override'">
          <div class="ares-form-field">
            <label class="ares-form-label">Vulnerability type</label>
            <InputText v-model="soVulnType" placeholder="e.g. SQLi, XSS, IDOR..." style="width:100%;" />
          </div>
          <div class="ares-form-field">
            <label class="ares-form-label">Forced severity</label>
            <Select v-model="soSeverity" :options="SEVERITY_OPTIONS" option-label="label" option-value="value" style="width:100%;" />
          </div>
        </template>

        <template v-else-if="formType === 'max_concurrency'">
          <div class="ares-form-field">
            <label class="ares-form-label">Max threads / concurrency</label>
            <InputNumber v-model="mcValue" :min="1" :max="1000" style="width:100%;" />
            <div style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
              Applied to: nuclei (-c), httpx (-threads), naabu (-c), ffuf (-t), katana (-c), subfinder (-t), dnsx (-t).
            </div>
          </div>
        </template>

        <template v-else-if="formType === 'excluded_vuln_type'">
          <div class="ares-form-field">
            <label class="ares-form-label">Vulnerability type</label>
            <InputText v-model="evtVulnType" placeholder="e.g. Clickjacking, Self-XSS, CSRF…" style="width:100%;" />
            <div style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
              Stored for reference — not automatically applied to findings in v1.
            </div>
          </div>
        </template>

        <template v-else-if="formType === 'email_recipients'">
          <div class="ares-form-field">
            <label class="ares-form-label">Recipients</label>
            <div v-for="(row, idx) in erRows" :key="idx" style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
              <Select v-model="row.placement" :options="PLACEMENT_OPTIONS" option-label="label" option-value="value" style="width:100px; flex-shrink:0;" />
              <Select
                v-model="row.key" :options="contactOptions" option-label="label" option-value="key"
                filter placeholder="Select a contact or member…" style="flex:1; min-width:0;"
              />
              <Button icon="pi pi-trash" text size="small" severity="danger"
                :disabled="erRows.length <= 1" @click="erRows.splice(idx, 1)" />
            </div>
            <Button icon="pi pi-plus" label="Add recipient" text size="small" @click="erRows.push(emptyRecipientRow())" />
            <div v-if="!contactOptions.length" style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.3rem;">
              No organization contacts or project members available yet — add contacts under
              Organization → Settings → Contacts, or add members to this project.
            </div>
          </div>
          <div class="ares-form-field">
            <label class="ares-form-label">Only when finding matches (optional AQL)</label>
            <AqlFilterInput v-model="erAql" entity="finding" :project-id="engId" placeholder="severity == 'critical'" />
            <div style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.3rem;">
              Leave empty to always apply this rule. Several rules can target the same or different
              placements — each is evaluated independently when a finding is reported by email.
            </div>
          </div>
        </template>

        <div class="ares-form-field">
          <label class="ares-form-label">Note (optional)</label>
          <Textarea v-model="formNote" rows="2" style="width:100%;" placeholder="Context or justification..." />
        </div>

        <div style="display:flex; align-items:center; gap:0.5rem;">
          <ToggleSwitch v-model="formEnabled" />
          <span style="font-size:0.85rem;">{{ formEnabled ? 'Enabled' : 'Disabled' }}</span>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" size="small" severity="secondary" @click="showDialog = false" />
        <Button label="Save" size="small" icon="pi pi-check" :loading="saving" @click="save" />
      </template>
    </Dialog>
  </div>
</template>
