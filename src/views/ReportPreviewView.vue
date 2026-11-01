<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import AresBadge from '@/components/AresBadge.vue';
import SeverityTag from '@/components/SeverityTag.vue';
import { reportsApi, reportStatusLabel, reportStatusSeverity, type ReportPreview } from '@/api/reports';
import { renderMarkdown } from '@/utils/markdown';

const route = useRoute();
const router = useRouter();

const orgId = computed(() => Number(route.params.orgId));
const reportId = computed(() => Number(route.params.id));

const preview = ref<ReportPreview | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

function goBack() {
  router.push({ name: 'org-reports', params: { orgId: orgId.value } });
}

function goToFinding(findingId: number) {
  router.push({ name: 'org-finding-detail', params: { orgId: orgId.value, id: findingId } });
}

onMounted(async () => {
  try {
    preview.value = await reportsApi.preview(reportId.value);
  } catch (e: any) {
    error.value = e?.response?.data?.message ?? e.message ?? 'Failed to load preview';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <Button icon="pi pi-arrow-left" severity="secondary" text size="small"
          @click="goBack" title="Back to reports" style="padding:0.3rem;" />
        <div>
          <h2 class="ares-page-title">{{ preview?.report?.title ?? 'Report Preview' }}</h2>
          <p class="ares-page-subtitle">In-app preview of the report data and findings.</p>
        </div>
      </div>
    </div>

    <div v-if="loading" style="display:flex; justify-content:center; padding:3rem;">
      <ProgressSpinner />
    </div>

    <div v-else-if="error" class="ares-card" style="color:var(--ares-error); padding:2rem; text-align:center;">
      <i class="pi pi-exclamation-triangle" style="font-size:1.5rem;" />
      <p style="margin:0.5rem 0 0;">{{ error }}</p>
    </div>

    <div v-else-if="preview" class="detail-grid" style="margin-bottom:1.5rem;">
      <!-- Left column: 2/3 — Findings + Detections -->
      <div class="detail-grid__data" style="display:flex; flex-direction:column; gap:1.25rem;">

        <!-- Findings sections -->
        <div v-for="section in preview.sections" :key="section.variable"
          class="ares-card" style="padding:0; overflow:hidden;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              {{ section.label }}
              <span style="font-weight:400; color:var(--ares-text-muted); margin-left:0.25rem;">
                ({{ section.findings.length }})
              </span>
            </span>
          </div>
          <div v-if="section.findings.length" style="padding:0;">
            <table class="ares-table">
              <thead>
                <tr>
                  <th style="width:80px;">Code</th>
                  <th>Title</th>
                  <th style="width:60px;">Priority</th>
                  <th style="width:80px;">Score</th>
                  <th style="width:100px;">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in section.findings" :key="f.id"
                  style="cursor:pointer;" @click="goToFinding(f.id)">
                  <td style="font-size:0.8rem; font-family:var(--ares-font-mono); color:var(--ares-text-muted);">
                    {{ f.code }}
                  </td>
                  <td style="font-weight:500;">{{ f.title }}</td>
                  <td>
                    <SeverityTag :level="f.severity" scale="priority" />
                  </td>
                  <td style="font-size:0.82rem; color:var(--ares-text-muted);">
                    <template v-if="f.defaultScore">
                      {{ f.defaultScore.score.toFixed(1) }}
                    </template>
                    <span v-else>—</span>
                  </td>
                  <td style="font-size:0.82rem;">{{ f.statusName }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else style="padding:1.5rem; text-align:center; color:var(--ares-text-muted); font-size:0.85rem;">
            No findings in this section.
          </div>
        </div>

        <!-- Detections (if present) -->
        <div v-if="preview.detections && preview.detections.length"
          class="ares-card" style="padding:0; overflow:hidden;">
          <div class="ares-card-section-header">
            <span class="section-header-label">
              Detections
              <span style="font-weight:400; color:var(--ares-text-muted); margin-left:0.25rem;">
                ({{ preview.detections.length }})
              </span>
            </span>
          </div>
          <table class="ares-table">
            <thead>
              <tr>
                <th>Title</th>
                <th style="width:60px;">Priority</th>
                <th style="width:100px;">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in preview.detections" :key="i">
                <td style="font-weight:500;">{{ (d as any).title ?? '—' }}</td>
                <td>
                  <SeverityTag :level="(d as any).severity" scale="priority" />
                </td>
                <td style="font-size:0.82rem;">{{ (d as any).status ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right column: 1/3 — Metadata, Charts, Fields, Team -->
      <div class="detail-grid__meta" style="display:flex; flex-direction:column; gap:1.25rem;">

        <!-- Report info -->
        <div class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Report Info</span>
          </div>
          <div class="detail-grid__body">
            <div class="field-row">
              <span class="field-label">Status</span>
              <AresBadge :value="reportStatusLabel(preview.report.status)"
                :severity="reportStatusSeverity(preview.report.status)" />
            </div>
            <div v-if="preview.project" class="field-row">
              <span class="field-label">Project</span>
              <RouterLink
                :to="{ name: 'org-project-dashboard', params: { orgId, engId: preview.project.id } }"
                style="color:var(--ares-link); font-size:0.85rem;">
                {{ preview.project.name }}
              </RouterLink>
            </div>
            <div v-if="preview.organization" class="field-row">
              <span class="field-label">Organization</span>
              <span style="font-size:0.85rem;">{{ preview.organization.name }}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Created</span>
              <span style="font-size:0.85rem; color:var(--ares-text-muted);">
                {{ preview.report.createdAt?.slice(0, 10) }}
              </span>
            </div>
            <div v-if="preview.project?.startDate" class="field-row">
              <span class="field-label">Project dates</span>
              <span style="font-size:0.85rem; color:var(--ares-text-muted);">
                {{ preview.project.startDate }} — {{ preview.project.endDate ?? '...' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Charts -->
        <div v-if="preview.charts.pie || preview.charts.bar"
          class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Charts</span>
          </div>
          <div style="padding:1rem; display:flex; flex-direction:column; gap:1rem; align-items:center;">
            <img v-if="preview.charts.pie"
              :src="'data:image/png;base64,' + preview.charts.pie"
              alt="Findings by priority (doughnut)" style="max-width:100%; height:auto;" />
            <img v-if="preview.charts.bar"
              :src="'data:image/png;base64,' + preview.charts.bar"
              alt="Findings by priority (bar)" style="max-width:100%; height:auto;" />
          </div>
        </div>

        <!-- Fields -->
        <div v-if="Object.keys(preview.resolvedFields).length"
          class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Report Fields</span>
          </div>
          <div style="padding:1rem; display:flex; flex-direction:column; gap:1rem;">
            <div v-for="(content, slug) in preview.resolvedFields" :key="slug">
              <div style="font-size:0.75rem; font-weight:600; color:var(--ares-text-muted); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.35rem;">
                {{ slug }}
              </div>
              <div class="markdown-body" v-html="renderMarkdown(content)" />
            </div>
          </div>
        </div>

        <!-- Team -->
        <div v-if="preview.team.length" class="ares-card" style="padding:0;">
          <div class="ares-card-section-header">
            <span class="section-header-label">Team</span>
          </div>
          <div style="padding:0;">
            <div v-for="m in preview.team" :key="m.userId"
              class="ref-row" style="padding:0.5rem 1rem;">
              <div>
                <span style="font-weight:500; font-size:0.85rem;">{{ m.displayName }}</span>
                <span style="font-size:0.75rem; color:var(--ares-text-muted); margin-left:0.5rem;">{{ m.role }}</span>
              </div>
              <span style="font-size:0.78rem; color:var(--ares-text-muted);">{{ m.email }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.25rem;
  align-items: start;
}
@media (max-width: 900px) {
  .detail-grid { grid-template-columns: 1fr; }
}

.field-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.45rem 1rem;
  border-bottom: 1px solid var(--ares-border-light, rgba(128,128,128,0.1));
}
.field-row:last-child { border-bottom: none; }
.field-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ares-text-muted);
}

.ref-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--ares-border-light, rgba(128,128,128,0.1));
}
.ref-row:last-child { border-bottom: none; }
</style>
