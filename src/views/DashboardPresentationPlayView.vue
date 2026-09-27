<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import DashboardHost from '@/components/dashboard/DashboardHost.vue';
import { presentationsApi, type PresentationDto } from '@/api/dashboardPresentations';

/**
 * Fullscreen-capable rotating "SOC big screen" player — a standalone route with zero AppShell
 * nav chrome (see router/index.ts: registered as a top-level sibling of `/`, like `login`, not an
 * AppShell child), so there's nothing to hide besides this view's own small overlay controls.
 * Renders exactly one <DashboardHost>, swapping which dashboard it shows by changing its
 * `dashboard-id` prop every rotationSeconds — the component instance never unmounts between
 * slides, which is what lets fullscreen state (toggled via the same DashboardHost.toggleFullscreen
 * used by the single-dashboard fullscreen button) survive across rotations for free. No
 * <DashboardControls> is rendered at all, which is what keeps this inherently read-only — nothing
 * in DashboardHost's own template can enter edit mode without it.
 */
const route = useRoute();
const router = useRouter();

const presentation = ref<PresentationDto | null>(null);
const loadError = ref<string | null>(null);
const currentIndex = ref(0);
const paused = ref(false);
const hostRef = ref<InstanceType<typeof DashboardHost> | null>(null);

const current = computed(() => presentation.value?.items[currentIndex.value] ?? null);
const total = computed(() => presentation.value?.items.length ?? 0);

let rotateTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRotate() {
  if (rotateTimer) clearTimeout(rotateTimer);
  if (paused.value || !presentation.value || total.value <= 1) return;
  rotateTimer = setTimeout(() => {
    currentIndex.value = (currentIndex.value + 1) % total.value;
    scheduleRotate();
  }, presentation.value.rotationSeconds * 1000);
}

function goTo(index: number) {
  if (total.value === 0) return;
  currentIndex.value = ((index % total.value) + total.value) % total.value;
  scheduleRotate();
}
function next() { goTo(currentIndex.value + 1); }
function prev() { goTo(currentIndex.value - 1); }
function togglePause() { paused.value = !paused.value; scheduleRotate(); }

function toggleFullscreen() { hostRef.value?.toggleFullscreen(); }

function goBack() { router.push({ name: 'dashboard-presentations' }); }

// Minimal kiosk-style overlay: visible on load and on mouse movement, auto-fades after a few
// seconds of no activity so the screen shows only dashboard content most of the time — the same
// "no titles or buttons" spirit as the single-dashboard fullscreen button, just time-based here
// instead of relying on the Fullscreen API's own element-scoping (this view has no nav chrome
// to hide via fullscreen in the first place — see the class doc above).
const overlayVisible = ref(true);
let overlayTimer: ReturnType<typeof setTimeout> | null = null;
function showOverlay() {
  overlayVisible.value = true;
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { overlayVisible.value = false; }, 4000);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === ' ') { e.preventDefault(); togglePause(); }
  else return;
  showOverlay();
}

onMounted(async () => {
  const id = Number(route.params.id);
  try {
    presentation.value = await presentationsApi.get(id);
    if (!presentation.value.items.length) {
      loadError.value = 'This presentation has no dashboards yet.';
    } else {
      scheduleRotate();
    }
  } catch (e: any) {
    loadError.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to load presentation';
  }
  window.addEventListener('mousemove', showOverlay);
  window.addEventListener('keydown', onKeydown);
  showOverlay();
});
onUnmounted(() => {
  if (rotateTimer) clearTimeout(rotateTimer);
  if (overlayTimer) clearTimeout(overlayTimer);
  window.removeEventListener('mousemove', showOverlay);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="play-page">
    <div v-if="loadError" class="play-error">
      <i class="pi pi-exclamation-triangle" style="color:var(--ares-error); font-size:1.5rem;" />
      <span>{{ loadError }}</span>
      <Button label="Back to presentations" icon="pi pi-arrow-left" severity="secondary" @click="goBack" />
    </div>

    <template v-else-if="current">
      <!-- Deliberately NO :key here — this must stay the SAME component instance across rotations
           (only its dashboard-id prop changes) so fullscreen state survives each slide swap; see
           DashboardHost's own dashboardId prop/watch for how it reacts to this in place. -->
      <DashboardHost
        ref="hostRef"
        :level="current.level"
        :scope-id="current.scopeId"
        :org-id="current.organizationId"
        :dashboard-id="current.dashboardId"
        class="play-host"
      />

      <Transition name="fade">
        <div v-if="overlayVisible" class="play-overlay">
          <div class="play-overlay__left">
            <Button icon="pi pi-arrow-left" text rounded size="small" v-tooltip.bottom="'Back to presentations'" @click="goBack" />
            <div>
              <div class="play-overlay__title">{{ presentation?.name }}</div>
              <div class="play-overlay__subtitle">{{ current.dashboardName }} · {{ current.scopeLabel }}</div>
            </div>
          </div>
          <div class="play-overlay__center">
            <Button icon="pi pi-angle-left" text rounded @click="prev" />
            <span class="play-overlay__progress">{{ currentIndex + 1 }} / {{ total }}</span>
            <Button :icon="paused ? 'pi pi-play' : 'pi pi-pause'" text rounded @click="togglePause" />
            <Button icon="pi pi-angle-right" text rounded @click="next" />
          </div>
          <div class="play-overlay__right">
            <Button icon="pi pi-window-maximize" text rounded size="small" v-tooltip.bottom="'Fullscreen'" @click="toggleFullscreen" />
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.play-page {
  min-height: 100vh;
  background: var(--ares-bg);
  display: flex;
  flex-direction: column;
}
.play-host {
  flex: 1;
  padding: 1.25rem;
  box-sizing: border-box;
  overflow-y: auto;
}
.play-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--ares-text-muted);
}

.play-overlay {
  position: fixed;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 1rem;
  background: color-mix(in srgb, var(--ares-surface-raised) 92%, transparent);
  border-bottom: 1px solid var(--ares-border);
  backdrop-filter: blur(4px);
  z-index: 2000;
}
.play-overlay__left { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.play-overlay__title { font-size: 0.85rem; font-weight: 600; color: var(--ares-text-1); }
.play-overlay__subtitle { font-size: 0.72rem; color: var(--ares-text-muted); }
.play-overlay__center { display: flex; align-items: center; gap: 0.3rem; }
.play-overlay__progress { font-size: 0.75rem; color: var(--ares-text-muted); font-variant-numeric: tabular-nums; min-width: 3.5rem; text-align: center; }
.play-overlay__right { display: flex; align-items: center; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
