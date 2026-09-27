<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import MarkdownEditor from '@/components/MarkdownEditor.vue';
import MarkdownView from '@/components/MarkdownView.vue';
import AresBadge from '@/components/AresBadge.vue';
import TestingProcedureExtRefDialog from '@/components/TestingProcedureExtRefDialog.vue';
import TestingProcedureGuidePointDialog from '@/components/TestingProcedureGuidePointDialog.vue';
import {
  kbTestingProceduresApi, externalRefTypeLabel, externalRefRoute,
  type TestingProcedure, type TestingProcedureGuidePointRef, type TestingProcedureExternalRef,
} from '@/api/kb-testing-procedures';

const route = useRoute();
const router = useRouter();
const procedureId = computed(() => Number(route.params.id));

const procedure = ref<TestingProcedure | null>(null);
const loading   = ref(true);
const err       = ref<string | null>(null);
const saving    = ref(false);
const saved     = ref(false);

const title        = ref('');
const content      = ref('');
const tags         = ref<string[]>([]);
const linkedPoints = ref<TestingProcedureGuidePointRef[]>([]);
const linkedRefs   = ref<TestingProcedureExternalRef[]>([]);

const editingContent  = ref(false);
const showPointDialog = ref(false);
const showRefDialog   = ref(false);

// ── Inline title editor ───────────────────────────────────────────────────────
const editingTitle = ref(false);
const titleDraft   = ref('');

function openTitleEdit() {
  titleDraft.value = title.value;
  editingTitle.value = true;
}

function commitTitle() {
  const v = titleDraft.value.trim();
  if (v) title.value = v;
  editingTitle.value = false;
}

// ── Tags (custom chip input) ──────────────────────────────────────────────────
const tagInput = ref('');

function addTag() {
  const vals = tagInput.value.split(/[,\n]/).map(t => t.trim()).filter(Boolean);
  for (const v of vals) {
    if (!tags.value.includes(v)) tags.value.push(v);
  }
  tagInput.value = '';
}

function removeTag(t: string) {
  tags.value = tags.value.filter(x => x !== t);
}

function onTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addTag();
  } else if (e.key === 'Backspace' && !tagInput.value && tags.value.length) {
    tags.value = tags.value.slice(0, -1);
  }
}

// ── Load / save ───────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  err.value = null;
  try {
    const p = await kbTestingProceduresApi.get(procedureId.value);
    procedure.value = p;
    title.value = p.title;
    content.value = p.content ?? '';
    tags.value = [...(p.tags ?? [])];
    linkedPoints.value = p.guidePoints ?? [];
    linkedRefs.value = p.externalRefs ?? [];
  } catch {
    err.value = 'Failed to load procedure.';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!title.value.trim()) return;
  saving.value = true;
  saved.value = false;
  try {
    const updated = await kbTestingProceduresApi.update(procedureId.value, {
      title: title.value.trim(),
      content: content.value,
      tags: tags.value,
      guidePointIds: linkedPoints.value.map((p) => p.guidePointId),
      externalRefs: linkedRefs.value.map((r) => ({ refType: r.refType, refKey: r.refKey, refLabel: r.refLabel })),
    });
    procedure.value = updated;
    linkedPoints.value = updated.guidePoints ?? [];
    linkedRefs.value = updated.externalRefs ?? [];
    saved.value = true;
    editingTitle.value = false;
    editingContent.value = false;
    setTimeout(() => { saved.value = false; }, 2000);
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

    <template v-else-if="procedure">
      <!-- Header: back + title (inline editable) + save -->
      <div class="ares-page-header" style="align-items:flex-start; margin-bottom:1.5rem;">
        <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:0;">
          <Button icon="pi pi-arrow-left" severity="secondary" text style="flex-shrink:0;"
            @click="router.push({ name: 'kb-testing-procedures' })" />
          <!-- Title display / edit -->
          <div style="flex:1; min-width:0;">
            <div v-if="!editingTitle" class="title-row">
              <h2 class="ares-page-title" style="margin:0;">{{ title }}</h2>
              <button class="title-edit-btn" v-tooltip.right="'Edit title'" @click="openTitleEdit">
                <i class="pi pi-pencil" />
              </button>
            </div>
            <div v-else class="title-row title-row--editing">
              <InputText v-model="titleDraft" class="title-input"
                @keyup.enter="commitTitle" @keyup.escape="editingTitle = false" autofocus />
              <Button icon="pi pi-check" size="small" severity="success" text
                v-tooltip.top="'Confirm (Enter)'" @click="commitTitle" />
              <Button icon="pi pi-times" size="small" severity="secondary" text
                v-tooltip.top="'Cancel (Esc)'" @click="editingTitle = false" />
            </div>
          </div>
        </div>
        <!-- Save -->
        <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
          <span v-if="saved" style="font-size:0.8rem; color:var(--ares-success);">
            <i class="pi pi-check" /> Saved
          </span>
          <Button label="Save" icon="pi pi-check" size="small"
            :loading="saving" :disabled="!title.trim()" @click="save" />
        </div>
      </div>

      <!-- Tags -->
      <div style="margin-bottom:1rem;">
        <label class="field-label">Tags</label>
        <div class="tag-input-wrap" @click="($refs.tagRef as HTMLInputElement)?.focus()">
          <span v-for="t in tags" :key="t" class="tag-chip">
            {{ t }}
            <button type="button" class="tag-chip-x" @click.stop="removeTag(t)">×</button>
          </span>
          <input
            ref="tagRef"
            v-model="tagInput"
            placeholder="Add tag…"
            class="tag-text-input"
            @keydown="onTagKeydown"
            @blur="addTag"
          />
        </div>
        <span class="field-hint">Enter or comma to add. Saved with the procedure.</span>
      </div>

      <!-- Rich-text content -->
      <div class="ares-card" style="padding:0; margin-bottom:1.5rem;">
        <div class="ares-card-section-header">
          <span class="section-header-label">Content</span>
          <Button v-if="!editingContent" icon="pi pi-pencil" label="Edit" size="small"
            severity="secondary" text style="margin:-0.25rem -0.25rem -0.25rem 0;"
            @click="editingContent = true" />
          <Button v-else icon="pi pi-times" label="Cancel" size="small"
            severity="secondary" text style="margin:-0.25rem -0.25rem -0.25rem 0;"
            @click="editingContent = false" />
        </div>
        <!-- Read mode: rendered Markdown -->
        <MarkdownView v-if="!editingContent"
          class="content-preview"
          :source="content"
          empty-text="No content yet. Click Edit to add."
        />
        <!-- Edit mode: Markdown source editor -->
        <MarkdownEditor v-else v-model="content" editor-style="min-height:340px;" />
      </div>

      <!-- Linked sections side by side -->
      <div class="links-row">

        <!-- Guide points card -->
        <div class="ares-card links-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              Linked guide points
              <span v-if="linkedPoints.length" class="section-badge">{{ linkedPoints.length }}</span>
            </span>
            <Button icon="pi pi-plus" label="Add" size="small" severity="secondary" text
              style="margin: -0.25rem -0.25rem -0.25rem 0;"
              @click="showPointDialog = true" />
          </div>
          <div v-if="!linkedPoints.length" class="ares-table-empty" style="font-style:italic;">
            No linked points.
          </div>
          <div v-else class="ares-table-wrap" style="border:none; border-radius: 0;">
            <table class="ares-table">
              <tbody>
                <tr v-for="p in linkedPoints" :key="p.guidePointId">
                  <td style="font-size:0.85rem;">
                    <div style="font-weight:500;">{{ p.pointTitle }}</div>
                    <div style="font-size:0.72rem; color:var(--ares-text-muted); margin-top:0.1rem;">{{ p.guideName }}</div>
                  </td>
                  <td style="width:36px; text-align:right; padding-right:0.5rem;">
                    <Button icon="pi pi-times" text size="small" severity="danger"
                      @click="linkedPoints = linkedPoints.filter(x => x.guidePointId !== p.guidePointId)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- External DB refs card -->
        <div class="ares-card links-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              Linked external DB entries
              <span v-if="linkedRefs.length" class="section-badge">{{ linkedRefs.length }}</span>
            </span>
            <Button icon="pi pi-plus" label="Add" size="small" severity="secondary" text
              style="margin: -0.25rem -0.25rem -0.25rem 0;"
              @click="showRefDialog = true" />
          </div>
          <div v-if="!linkedRefs.length" class="ares-table-empty" style="font-style:italic;">
            No linked entries.
          </div>
          <div v-else class="ares-table-wrap" style="border:none; border-radius: 0;">
            <table class="ares-table">
              <tbody>
                <tr v-for="r in linkedRefs" :key="r.refType + r.refKey">
                  <td style="width:64px; padding-right:0;">
                    <AresBadge :value="externalRefTypeLabel(r.refType)" severity="info" style="font-size:0.68rem;" />
                  </td>
                  <td style="font-size:0.83rem;">
                    <router-link v-if="externalRefRoute(r)" :to="externalRefRoute(r)!"
                      style="color:var(--ares-accent); text-decoration:none;">
                      {{ r.refLabel || r.refKey }}
                    </router-link>
                    <span v-else>{{ r.refLabel || r.refKey }}</span>
                  </td>
                  <td style="width:36px; text-align:right; padding-right:0.5rem;">
                    <Button icon="pi pi-times" text size="small" severity="danger"
                      @click="linkedRefs = linkedRefs.filter(x => !(x.refType === r.refType && x.refKey === r.refKey))" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.75rem;">
        Link changes are saved together with the procedure — click <strong>Save</strong> to persist.
      </p>
    </template>

    <TestingProcedureGuidePointDialog v-model:visible="showPointDialog" v-model="linkedPoints" />
    <TestingProcedureExtRefDialog     v-model:visible="showRefDialog"   v-model="linkedRefs"   />
  </div>
</template>

<style scoped>
/* ── Inline title editor ───────────────────────────────────────────── */
.title-row { display: flex; align-items: center; gap: 0.5rem; }
.title-row--editing { gap: 0.4rem; flex: 1; min-width: 0; }
.title-row:hover .title-edit-btn { opacity: 1; }
.title-edit-btn {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); padding: 0.2rem; border-radius: var(--ares-radius);
  font-size: 0.85rem; opacity: 0; transition: opacity 0.12s, color 0.12s;
}
.title-edit-btn:hover { color: var(--p-primary-400); }
.title-input { flex: 1; min-width: 0; font-size: 1.25rem; font-weight: 600; }

/* ── Tags custom input ─────────────────────────────────────────────── */
.field-label {
  display: block; font-size: 0.78rem; font-weight: 600;
  color: var(--ares-text-muted); margin-bottom: 0.35rem;
}
.field-hint {
  display: block; font-size: 0.72rem; color: var(--ares-text-muted); margin-top: 0.3rem;
}
.tag-input-wrap {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem;
  min-height: 2.35rem; padding: 0.35rem 0.65rem;
  background: var(--ares-surface); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); cursor: text;
  transition: border-color 0.15s;
}
.tag-input-wrap:focus-within { border-color: var(--p-primary-400); }
.tag-chip {
  display: inline-flex; align-items: center; gap: 0.3rem;
  background: var(--ares-surface-2); border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius); padding: 0.1rem 0.45rem 0.1rem 0.55rem;
  font-size: 0.78rem; color: var(--ares-text-2); white-space: nowrap;
}
.tag-chip-x {
  background: none; border: none; cursor: pointer;
  color: var(--ares-text-muted); font-size: 0.95rem; line-height: 1; padding: 0;
}
.tag-chip-x:hover { color: var(--p-red-400); }
.tag-text-input {
  flex: 1; min-width: 80px; background: none; border: none; outline: none;
  font-size: 0.83rem; color: var(--ares-text); font-family: inherit;
}
.tag-text-input::placeholder { color: var(--ares-text-muted); }

/* ── Content preview ───────────────────────────────────────────────── */
.content-preview {
  padding: 1rem 1.25rem;
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--ares-text-2);
  min-height: 80px;
}
.content-preview :deep(h1), .content-preview :deep(h2), .content-preview :deep(h3) {
  color: var(--ares-text-1); margin: 0.75em 0 0.4em;
}
.content-preview :deep(p) { margin: 0 0 0.65em; }
.content-preview :deep(ul), .content-preview :deep(ol) { padding-left: 1.4em; margin: 0.4em 0 0.65em; }
.content-preview :deep(pre), .content-preview :deep(code) {
  background: var(--ares-surface-raised); border-radius: var(--ares-radius); font-size: 0.82em;
}
.content-preview :deep(pre) { padding: 0.65em 0.85em; overflow-x: auto; }
.content-preview :deep(img) { max-width: 100%; border-radius: var(--ares-radius); }

/* ── Links layout ──────────────────────────────────────────────────── */
.links-row { display: flex; gap: 1.25rem; align-items: flex-start; margin-bottom: 1rem; }
.links-card { flex: 1; min-width: 0; }
@media (max-width: 700px) { .links-row { flex-direction: column; } }
</style>
