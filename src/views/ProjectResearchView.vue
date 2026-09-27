<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';
import AresLoadingState from '@/components/AresLoadingState.vue';
import CreateResearchBoardDialog from '@/components/CreateResearchBoardDialog.vue';
import { researchBoardsApi, type ResearchBoardSummary } from '@/api/researchBoards';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.engId));
const orgId = computed(() => Number(route.params.orgId));

function goToFinding(findingId: number, e: Event) {
  e.stopPropagation();
  router.push({ name: 'org-project-finding-detail', params: { orgId: orgId.value, engId: projectId.value, id: findingId } });
}

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'active'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});

const activeBoards = ref<ResearchBoardSummary[]>([]);
const archivedBoards = ref<ResearchBoardSummary[]>([]);
const loading = ref(true);

const showCreate = ref(false);

async function load() {
  loading.value = true;
  try {
    const [active, archived] = await Promise.all([
      researchBoardsApi.list(projectId.value, false),
      researchBoardsApi.list(projectId.value, true),
    ]);
    activeBoards.value = active;
    archivedBoards.value = archived;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(projectId, load);

function openBoard(id: number) {
  router.push({ name: 'org-project-research-board', params: { orgId: orgId.value, engId: projectId.value, boardId: id } });
}

function onCreated(id: number) {
  openBoard(id);
}

function initials(displayName: string | null, email: string | null): string {
  const n = displayName || email || '?';
  return n.split(/\s+/).map((w) => w[0]?.toUpperCase()).slice(0, 2).join('');
}
function avatarUrl(userId: number) { return `/api/v1/profile/${userId}/avatar`; }
const failedAvatars = ref(new Set<number>());
function onAvatarError(userId: number) { failedAvatars.value = new Set([...failedAvatars.value, userId]); }
</script>

<template>
  <div>
    <div class="ares-page-header" style="margin-bottom:1.5rem;">
      <div>
        <h2 class="ares-page-title">Research</h2>
        <p class="ares-page-subtitle">Investigate detections and correlate evidence before deciding whether assets are affected.</p>
      </div>
      <Button label="New board" icon="pi pi-plus" size="small" @click="showCreate = true" />
    </div>

    <Tabs v-model:value="activeTab">
      <TabList>
        <Tab value="active">Active</Tab>
        <Tab value="archived">Archived</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="active">
          <AresLoadingState v-if="loading" />
          <template v-else>
            <div v-if="!activeBoards.length" class="rb-empty">
              No active Research Boards. Create one to start investigating a group of detections.
            </div>
            <div v-else class="rb-list">
              <button v-for="b in activeBoards" :key="b.id" class="rb-row ares-card" @click="openBoard(b.id)">
                <div class="rb-row-main">
                  <span class="rb-row-title">{{ b.title }}</span>
                  <span class="rb-row-sub">
                    {{ b.detectionCount }} detection{{ b.detectionCount !== 1 ? 's' : '' }}
                    · updated {{ new Date(b.updatedAt).toLocaleDateString() }}
                  </span>
                </div>
                <div class="rb-row-members">
                  <div v-for="m in b.members" :key="m.userId" class="rb-row-avatar" v-tooltip.top="m.displayName ?? m.email ?? ''">
                    <img v-if="!failedAvatars.has(m.userId)" :src="avatarUrl(m.userId)" @error="onAvatarError(m.userId)" alt="" />
                    <template v-else>{{ initials(m.displayName, m.email) }}</template>
                  </div>
                </div>
              </button>
            </div>
          </template>
        </TabPanel>

        <TabPanel value="archived">
          <AresLoadingState v-if="loading" />
          <template v-else>
            <div v-if="!archivedBoards.length" class="rb-empty">No archived Research Boards yet.</div>
            <div v-else class="rb-list">
              <button v-for="b in archivedBoards" :key="b.id" class="rb-row ares-card" @click="openBoard(b.id)">
                <div class="rb-row-main">
                  <span class="rb-row-title">{{ b.title }}</span>
                  <span class="rb-row-sub">
                    {{ b.detectionCount }} detection{{ b.detectionCount !== 1 ? 's' : '' }}
                    · archived {{ b.archivedAt ? new Date(b.archivedAt).toLocaleDateString() : '' }}
                  </span>
                </div>
                <span
                  v-if="b.verdict === 'affected' && b.resultFindingId"
                  class="rb-row-finding-link"
                  role="link" tabindex="0"
                  @click="goToFinding(b.resultFindingId, $event)"
                  @keydown.enter="goToFinding(b.resultFindingId, $event)"
                >View finding <i class="pi pi-arrow-up-right" style="font-size:0.65rem;" /></span>
                <AresBadge
                  v-if="b.verdict"
                  :value="b.verdict === 'affected' ? 'Affected' : 'Not affected'"
                  :severity="b.verdict === 'affected' ? 'warn' : 'secondary'"
                />
              </button>
            </div>
          </template>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <CreateResearchBoardDialog v-model:visible="showCreate" :project-id="projectId" @created="onCreated" />
  </div>
</template>

<style scoped>
.rb-empty {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--ares-text-muted);
  font-size: 0.85rem;
}

.rb-list { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1rem; }

.rb-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.85rem 1.1rem;
  text-align: left;
  cursor: pointer;
  background: var(--ares-surface);
  transition: border-color 0.12s;
}
.rb-row:hover { border-color: var(--p-primary-400); }

.rb-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.rb-row-title { font-size: 0.9rem; font-weight: 600; color: var(--ares-text-1); }
.rb-row-sub { font-size: 0.76rem; color: var(--ares-text-muted); }

.rb-row-members { display: flex; align-items: center; flex-shrink: 0; }
.rb-row-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--ares-accent-bg); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.64rem; font-weight: 700;
  border: 2px solid var(--ares-surface);
  margin-left: -8px;
  overflow: hidden;
}
.rb-row-avatar:first-child { margin-left: 0; }
.rb-row-avatar img { width: 100%; height: 100%; object-fit: cover; }

.rb-row-finding-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.76rem;
  color: var(--ares-accent);
  cursor: pointer;
  flex-shrink: 0;
}
.rb-row-finding-link:hover { text-decoration: underline; }
</style>
