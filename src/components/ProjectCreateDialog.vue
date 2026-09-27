<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import DatePicker from 'primevue/datepicker';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import { projectsApi, isBugHunting, isMonitoring, isAssessment, isRetest, ITERATION_CADENCES, type Project } from '@/api/projects';
import { kbTestingGuidesApi, type TestingGuide } from '@/api/kb-testing-guides';
import { projectTestingGuidesApi } from '@/api/project-testing-guides';
import { projectTypesApi, type ProjectType } from '@/api/project-types';
import { bugHuntingProgramsApi } from '@/api/bugHuntingPrograms';
import { vdpIntegrationsApi } from '@/api/vdp-integrations';
import { useAuthStore } from '@/stores/auth';
import type { ToolIntegration } from '@/api/tool-integrations';
import type { UserSummary } from '@/api/users';
import UserCalendarPickerDialog from '@/components/UserCalendarPickerDialog.vue';

const props = defineProps<{ visible: boolean; orgId: number }>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  created: [project: Project];
}>();

const auth = useAuthStore();
const router = useRouter();
const saving = ref(false);
const error = ref('');
const allTypes = ref<ProjectType[]>([]);

// ── Team selection ─────────────────────────────────────────────────
const selectedLeader    = ref<UserSummary | null>(null);
const selectedOperators = ref<UserSummary[]>([]);
const showLeaderPicker   = ref(false);
const showOperatorPicker = ref(false);

const leadExcludeIds = computed(() => {
  const ids = selectedOperators.value.map((u) => u.id);
  if (selectedLeader.value) ids.push(selectedLeader.value.id);
  return ids;
});
const operatorExcludeIds = computed(() => {
  const ids = selectedOperators.value.map((u) => u.id);
  if (selectedLeader.value) ids.push(selectedLeader.value.id);
  return ids;
});

function removeOperator(id: number) {
  selectedOperators.value = selectedOperators.value.filter((u) => u.id !== id);
}
const allIntegrations = ref<ToolIntegration[]>([]);
const loaded = ref(false);
const codeLoading = ref(false);
const codeManuallyEdited = ref(false);

const form = ref({
  name: '',
  typeId: null as number | null,
  code: '',
  startDate: null as Date | null,
  endDate: null as Date | null,
  iterationCadence: null as string | null,
  autoAdvanceIterations: false,
  // Bug Hunting fields (optional, shown when BH platform subtype is selected)
  bhIntegrationId: null as number | null,
  bhProgramHandle: '',
});

const typeOptions = computed(() => {
  // Disabled types (whether admin-disabled or plugin-gated — e.g. a Bug Hunting subtype whose
  // owning plugin isn't installed/enabled) must never be offered here: creating a project of a
  // type nothing currently backs would leave it stuck with no working feature behind it.
  const available = allTypes.value.filter((t) => !t.disabled);
  const roots    = available.filter((t) => t.supertypeId === null);
  const subtypes = available.filter((t) => t.supertypeId !== null);
  return [
    ...roots.map((t) => ({ label: `${t.name}  (${t.code})`, value: t.id, code: t.code, isRoot: true })),
    ...subtypes.map((t) => ({ label: `${t.name}  (${t.code})`, value: t.id, code: t.code, isRoot: false })),
  ];
});

const selectedTypeCode = computed((): string | null => {
  if (!form.value.typeId) return null;
  return allTypes.value.find((t) => t.id === form.value.typeId)?.code ?? null;
});

const selectedSupertypeCode = computed((): string | null => {
  if (!form.value.typeId) return null;
  const t = allTypes.value.find((t) => t.id === form.value.typeId);
  if (!t?.supertypeId) return null;
  return allTypes.value.find((s) => s.id === t.supertypeId)?.code ?? null;
});

/** True when a platform BH subtype is selected (not generic BH). */
const isBhPlatformSubtype = computed(() => {
  const code = selectedTypeCode.value;
  return code != null && code !== 'BH' && isBugHunting(code);
});

/** True for the generic (root) BH type — no platform API, but a manual programme
 *  link can still be configured, same as the platform subtypes. */
const isGenericBhType = computed(() => selectedTypeCode.value === 'BH');

const isMonitorType   = computed(() => isMonitoring(selectedTypeCode.value, selectedSupertypeCode.value));
const isAssessType    = computed(() => isAssessment(selectedTypeCode.value, selectedSupertypeCode.value));
const isRetestType    = computed(() => isRetest(selectedTypeCode.value, selectedSupertypeCode.value));

// ── Testing guide (optional, assessment only) ──────────────────────────────
const availGuides    = ref<TestingGuide[]>([]);
const guidesLoaded   = ref(false);
const form_guideId   = ref<number | null>(null);

watch(isAssessType, async (isAssess) => {
  if (isAssess && !guidesLoaded.value) {
    guidesLoaded.value = true;
    try {
      const r = await kbTestingGuidesApi.list({ size: 200 });
      availGuides.value = (r.items ?? []).filter(g => g.enabled);
    } catch { /* silent */ }
  }
  if (!isAssess) form_guideId.value = null;
});

// Unlike ProjectDashboardView/ProjectBugHuntingProgramView (which read the authoritative
// `platform` off an already-saved BugHuntingProgram DTO once one exists), there is no project —
// let alone a programme — yet at this point in the create dialog, so there's nothing server-side
// to read from. This stays a client-side guess from the selected type's own code purely to
// pre-filter the integration picker/placeholder before the project is created; the backend
// independently (and authoritatively) resolves the real platform from the type code once the
// project actually exists (BugHuntingProgramService#resolvePlatform), so a stale/missing entry
// here only affects this dialog's own UX, never correctness.
const platformForSelectedType = computed(() => {
  const code = selectedTypeCode.value ?? '';
  const map: Record<string, string> = {
    BH_BC: 'bugcrowd', BH_YWH: 'yeswehack', BH_INTG: 'intigriti', BH_H1: 'hackerone',
  };
  return map[code] ?? null;
});

const bhIntegrationOptions = computed(() => {
  const plat = platformForSelectedType.value;
  if (!plat) return [];
  return allIntegrations.value
    .filter((i) => i.type === plat)
    .map((i) => ({ label: i.name, value: i.id }));
});

const canSubmit = computed(() => {
  if (!form.value.name.trim() || !form.value.typeId) return false;
  if (isRetestType.value && (!form.value.startDate || !form.value.endDate)) return false;
  return true;
});

async function fetchCode(typeId: number) {
  codeLoading.value = true;
  try {
    form.value.code = await projectsApi.previewCode(props.orgId, typeId);
  } catch {
    // silently fail — user can still type manually
  } finally {
    codeLoading.value = false;
  }
}

watch(() => form.value.typeId, (typeId) => {
  if (!typeId) { form.value.code = ''; return; }
  if (!codeManuallyEdited.value) fetchCode(typeId);
});

function onCodeInput(e: Event) {
  const val = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  form.value.code = val;
  codeManuallyEdited.value = val !== '';
}

function resetCode() {
  codeManuallyEdited.value = false;
  if (form.value.typeId) fetchCode(form.value.typeId);
  else form.value.code = '';
}

async function loadOptions() {
  if (loaded.value) return;
  [allTypes.value] = await Promise.all([
    projectTypesApi.list(),
    vdpIntegrationsApi.bugHuntingProgramPlatformIntegrations().then((r) => { allIntegrations.value = r.items; }),
  ]);
  loaded.value = true;
}

function resetForm() {
  form.value = { name: '', typeId: null, code: '', startDate: null, endDate: null,
    iterationCadence: null, autoAdvanceIterations: false, bhIntegrationId: null, bhProgramHandle: '' };
  form_guideId.value = null;
  error.value = '';
  codeManuallyEdited.value = false;
  selectedLeader.value    = null;
  selectedOperators.value = [];
}

watch(() => props.visible, (val) => {
  if (val) { resetForm(); loadOptions(); }
});

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function submit() {
  if (!canSubmit.value) return;
  error.value = '';
  saving.value = true;
  try {
    const created = await projectsApi.create({
      organizationId: props.orgId,
      name: form.value.name.trim(),
      typeId: form.value.typeId ?? undefined,
      code: codeManuallyEdited.value ? form.value.code : undefined,
      startDate: form.value.startDate ? toLocalDateStr(form.value.startDate) : undefined,
      endDate: form.value.endDate ? toLocalDateStr(form.value.endDate) : undefined,
      iterationCadence: form.value.iterationCadence ?? undefined,
      autoAdvanceIterations: form.value.autoAdvanceIterations,
    });

    // Assign leader — defaults to the creating user if none selected
    const leaderId = selectedLeader.value?.id ?? auth.user?.id;
    if (leaderId) {
      await projectsApi.addMember(created.id, { userId: leaderId, role: 'lead' }).catch(() => null);
    }

    // Assign operators
    for (const op of selectedOperators.value) {
      await projectsApi.addMember(created.id, { userId: op.id, role: 'operator' }).catch(() => null);
    }

    // Assign testing guide to assessment projects if one was selected
    if (isAssessType.value && form_guideId.value) {
      projectTestingGuidesApi.assign(created.id, form_guideId.value).catch(() => null);
    }

    // If a BH platform subtype was selected and credentials/handle were provided, configure the programme
    if ((isBhPlatformSubtype.value || isGenericBhType.value) && (form.value.bhIntegrationId || form.value.bhProgramHandle)) {
      try {
        await bugHuntingProgramsApi.upsert(created.id, {
          integrationId: form.value.bhIntegrationId ?? undefined,
          programHandle: form.value.bhProgramHandle || undefined,
        });
      } catch { /* non-blocking — user can configure later from Programme tab */ }
    }

    emit('created', created);
    emit('update:visible', false);

    // RETEST projects start with no findings in scope — land the user straight on the
    // findings view, which doubles as the "add findings to retest" screen for this type.
    if (isRetestType.value) {
      router.push({ name: 'org-project-findings', params: { orgId: props.orgId, engId: created.id } });
    }
  } catch (e: any) {
    error.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to create project';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="New project"
    modal
    style="width:36rem;"
  >
    <div style="display:flex; flex-direction:column; gap:0.9rem; padding-top:0.5rem;">

      <div class="form-field">
        <label>Name *</label>
        <InputText v-model="form.name" placeholder="e.g. Web Pentest Q2 2026" class="w-full" />
      </div>

      <div class="form-field">
        <label>Type *</label>
        <Select
          v-model="form.typeId"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          placeholder="Select type"
          class="w-full"
        >
          <template #option="{ option }">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span>{{ option.label }}</span>
              <span v-if="option.isRoot" style="font-size:0.67rem; padding:0.1rem 0.35rem; border-radius: var(--ares-radius); background:var(--ares-accent-bg); color:#fff; font-weight:600;">root</span>
            </div>
          </template>
        </Select>
      </div>

      <!-- Bug Hunting platform fields — shown only for platform subtypes (BH_BC, BH_YWH, etc.) -->
      <template v-if="isBhPlatformSubtype">
        <div class="form-field">
          <label>Integration <span style="color:var(--ares-text-muted);font-weight:400;">(optional — can be set later)</span></label>
          <Select
            v-model="form.bhIntegrationId"
            :options="bhIntegrationOptions"
            option-label="label"
            option-value="value"
            placeholder="Select integration…"
            class="w-full"
          />
          <small v-if="bhIntegrationOptions.length === 0" style="color:var(--ares-text-muted);">
            No matching integrations found. You can add one later from the Programme tab.
          </small>
        </div>
        <div class="form-field">
          <label>Programme handle / slug <span style="color:var(--ares-text-muted);font-weight:400;">(optional)</span></label>
          <InputText v-model="form.bhProgramHandle" placeholder="e.g. my-program" class="w-full" />
        </div>
      </template>

      <!-- Generic BH: no platform API, but a manual programme link can still be set -->
      <div v-if="isGenericBhType" class="form-field">
        <label>Programme URL <span style="color:var(--ares-text-muted);font-weight:400;">(optional — can be set later)</span></label>
        <InputText v-model="form.bhProgramHandle" placeholder="https://…" class="w-full" />
      </div>

      <div class="form-field">
        <label style="display:flex; align-items:center; justify-content:space-between;">
          <span>Code</span>
          <button
            v-if="codeManuallyEdited"
            type="button"
            style="font-size:0.7rem; color:var(--ares-accent-muted); background:none; border:none; cursor:pointer; padding:0; font-family:inherit;"
            @click="resetCode"
          >↺ auto-generate</button>
        </label>
        <div style="position:relative;">
          <InputText
            :value="form.code"
            :placeholder="form.typeId ? (codeLoading ? 'Loading…' : 'Auto-generated') : 'Select a type first'"
            class="w-full"
            style="font-family:monospace; padding-right:2rem;"
            @input="onCodeInput"
          />
          <i
            v-if="codeLoading"
            class="pi pi-spin pi-spinner"
            style="position:absolute; right:0.65rem; top:50%; transform:translateY(-50%); font-size:0.8rem; color:var(--ares-text-muted);"
          />
        </div>
        <span style="font-size:0.73rem; color:var(--ares-text-muted);">
          <template v-if="codeManuallyEdited">Custom code — will be used as-is.</template>
          <template v-else>Auto-generated. Edit to override.</template>
        </span>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
        <div class="form-field">
          <label>Start date{{ isRetestType ? ' *' : '' }}</label>
          <DatePicker v-model="form.startDate" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="body" class="w-full" />
        </div>
        <div v-if="!isMonitorType" class="form-field">
          <label>End date{{ isRetestType ? ' *' : '' }}</label>
          <DatePicker v-model="form.endDate" date-format="yy-mm-dd" placeholder="yyyy-mm-dd" :first-day-of-week="1" append-to="body" class="w-full" />
        </div>
        <div v-if="isMonitorType" class="form-field">
          <label>Iteration cadence</label>
          <Select
            v-model="form.iterationCadence"
            :options="[...ITERATION_CADENCES]"
            option-label="label"
            option-value="value"
            placeholder="No cadence (free-form)"
            show-clear
            class="w-full"
          />
          <small style="color:var(--ares-text-muted);">Determines how finding codes are labeled per period.</small>
        </div>
        <div v-if="isMonitorType" class="form-field" style="flex-direction:row; align-items:center; gap:0.5rem;">
          <Checkbox v-model="form.autoAdvanceIterations" input-id="autoAdvanceIterations" binary />
          <label for="autoAdvanceIterations" style="margin:0;">Auto-advance iterations without manual approval</label>
        </div>
      </div>

      <!-- Testing guide (assessment projects only, optional) -->
      <div v-if="isAssessType" class="form-field">
        <label>
          Testing guide
          <span style="font-weight:400; color:var(--ares-text-muted); font-size:0.72rem;">(optional)</span>
        </label>
        <Select
          v-model="form_guideId"
          :options="availGuides"
          option-label="name"
          option-value="id"
          placeholder="None — assign later"
          show-clear
          filter
          class="w-full"
        >
          <template #option="{ option }">
            <div>
              <div>{{ option.name }}</div>
              <div style="font-size:0.72rem; color:var(--ares-text-muted);">
                {{ option.pointCount }} point{{ option.pointCount !== 1 ? 's' : '' }}
              </div>
            </div>
          </template>
        </Select>
        <small style="color:var(--ares-text-muted);">
          The checklist will be automatically assigned to the new project.
        </small>
      </div>

      <!-- ── Team ─────────────────────────────────────────────── -->
      <div class="form-field">
        <label style="display:flex; align-items:center; justify-content:space-between;">
          <span>Leader <span style="font-weight:400; color:var(--ares-text-muted); font-size:0.72rem;">(defaults to you)</span></span>
          <button
            type="button"
            class="team-link-btn"
            @click="showLeaderPicker = true"
          >{{ selectedLeader ? '↺ Change' : '+ Select' }}</button>
        </label>
        <div v-if="selectedLeader" class="team-chip">
          <div class="team-chip-avatar">{{ (selectedLeader.displayName || selectedLeader.email)[0]?.toUpperCase() }}</div>
          <span class="team-chip-name">{{ selectedLeader.displayName }}</span>
          <span class="team-chip-email">{{ selectedLeader.email }}</span>
          <button type="button" class="team-chip-remove" @click="selectedLeader = null">×</button>
        </div>
        <div v-else class="team-empty">{{ auth.user?.displayName || auth.user?.email }}</div>
      </div>

      <div class="form-field">
        <label style="display:flex; align-items:center; justify-content:space-between;">
          <span>Operators <span style="font-weight:400; color:var(--ares-text-muted); font-size:0.72rem;">(optional)</span></span>
          <button type="button" class="team-link-btn" @click="showOperatorPicker = true">+ Add</button>
        </label>
        <div v-if="selectedOperators.length" style="display:flex; flex-direction:column; gap:0.3rem; margin-top:0.3rem;">
          <div v-for="op in selectedOperators" :key="op.id" class="team-chip">
            <div class="team-chip-avatar">{{ (op.displayName || op.email)[0]?.toUpperCase() }}</div>
            <span class="team-chip-name">{{ op.displayName }}</span>
            <span class="team-chip-email">{{ op.email }}</span>
            <button type="button" class="team-chip-remove" @click="removeOperator(op.id)">×</button>
          </div>
        </div>
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.25rem;">
        <Button label="Cancel" severity="secondary" @click="emit('update:visible', false)" />
        <Button label="Create" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </div>
    </div>
  </Dialog>

  <!-- Leader picker -->
  <UserCalendarPickerDialog
    v-model:visible="showLeaderPicker"
    title="Select leader"
    :eng-start-date="form.startDate"
    :eng-end-date="form.endDate"
    :exclude-user-ids="leadExcludeIds"
    @select="selectedLeader = $event"
  />

  <!-- Operator picker -->
  <UserCalendarPickerDialog
    v-model:visible="showOperatorPicker"
    title="Add operator"
    :eng-start-date="form.startDate"
    :eng-end-date="form.endDate"
    :exclude-user-ids="operatorExcludeIds"
    @select="selectedOperators.push($event)"
  />
</template>

<style scoped>
.team-link-btn {
  background: none; border: none; cursor: pointer;
  font-size: 0.75rem; color: var(--ares-accent-muted);
  font-family: inherit; padding: 0;
}
.team-link-btn:hover { color: var(--p-primary-300); }
.team-chip {
  display: flex; align-items: center; gap: 0.45rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--ares-border); border-radius: var(--ares-radius);
  background: var(--ares-surface);
}
.team-chip-avatar {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--ares-accent-bg); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.68rem; font-weight: 700; flex-shrink: 0;
}
.team-chip-name  { font-size: 0.82rem; font-weight: 600; color: var(--ares-text); }
.team-chip-email { font-size: 0.72rem; color: var(--ares-text-muted); flex: 1; }
.team-chip-remove {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); font-size: 1rem; padding: 0; line-height: 1;
}
.team-chip-remove:hover { color: var(--ares-error); }
.team-empty {
  font-size: 0.82rem; color: var(--ares-text-muted); padding: 0.15rem 0; font-style: italic;
}
</style>
