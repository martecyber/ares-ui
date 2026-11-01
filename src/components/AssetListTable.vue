<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, type RouteLocationRaw } from 'vue-router';
import AresBadge from '@/components/AresBadge.vue';
import ColumnHeader from '@/components/ColumnHeader.vue';
import TagChipList from '@/components/TagChipList.vue';
import { ASSET_TYPE_LABELS, type Asset } from '@/api/assets';
import {
  protocolOf, ipOf, portOf, subtypeOf, endpointPath, endpointApp, visibilitySeverity,
  SUBTYPE_FILTER_OPTIONS, PROTOCOL_FILTER_OPTIONS, VISIBILITY_FILTER_OPTIONS,
  type AssetListState,
} from '@/composables/useAssetList';

const props = withDefaults(defineProps<{
  list: AssetListState;
  assetRoute: (assetId: number) => RouteLocationRaw;
  /** Shows the checkbox + action columns (false for client users). */
  editable: boolean;
  /** Inline "3rd party" badge from Asset.thirdParty — off when the view shows a scope column instead. */
  showThirdPartyBadge?: boolean;
  /** Number of columns rendered through the extra-header/extra-cell slots. */
  extraColumns?: number;
  emptyText?: string;
}>(), {
  showThirdPartyBadge: false,
  extraColumns: 0,
  emptyText: 'No assets.',
});

const router = useRouter();

// Destructured so the template auto-unwraps the refs.
const {
  processedAssets, typeFilter, sortCol, sortDir, onSort,
  filterType, filterProtocol, filterVisibility, filterSubtype, typeFilterOptions,
  isServiceFilter, showSubtypeColumn, aggregateVisibility, serviceHosts,
  selectedIds, allVisibleSelected, toggleSelect, toggleSelectAll,
} = props.list;

function sortDirFor(col: string) {
  return sortCol.value === col ? sortDir.value : null;
}

const colspan = computed(() => {
  let n = 3 + props.extraColumns; // tags, code, created
  if (props.editable) n += 2;     // checkbox, actions
  if (typeFilter.value === null) n++;
  if (!isServiceFilter.value) n++;
  if (showSubtypeColumn.value) n++;
  if (typeFilter.value === 'web_endpoint') n++;
  if (isServiceFilter.value) n += 5;
  return n;
});
</script>

<template>
  <div class="ares-card" style="padding:0;">
    <table class="ares-table ares-table--clickable">
      <thead>
        <tr>
          <th v-if="editable" class="check-cell">
            <input type="checkbox" class="row-check" :checked="allVisibleSelected" @change="toggleSelectAll" />
          </th>
          <th v-if="typeFilter === null" style="width:140px;">
            <ColumnHeader label="Type" :sortable="true" :sort-dir="sortDirFor('type')"
              sort-asc-label="A → Z" sort-desc-label="Z → A"
              :filter-options="typeFilterOptions" :filter-value="filterType"
              @update:sort-dir="onSort('type', $event)"
              @update:filter-value="filterType = $event" />
          </th>
          <th v-if="!isServiceFilter">
            <ColumnHeader :label="typeFilter === 'web_endpoint' ? 'Endpoint' : 'Identifier'"
              :sortable="true" :sort-dir="sortDirFor('identifier')"
              sort-asc-label="A → Z" sort-desc-label="Z → A"
              @update:sort-dir="onSort('identifier', $event)" />
          </th>
          <th v-if="showSubtypeColumn" style="width:160px;">
            <ColumnHeader label="Subtype" :sortable="true" :sort-dir="sortDirFor('subtype')"
              sort-asc-label="A → Z" sort-desc-label="Z → A"
              :filter-options="SUBTYPE_FILTER_OPTIONS" :filter-value="filterSubtype"
              @update:sort-dir="onSort('subtype', $event)"
              @update:filter-value="filterSubtype = $event" />
          </th>
          <th v-if="typeFilter === 'web_endpoint'" style="width:250px;">
            <ColumnHeader label="Application" :sortable="true" :sort-dir="sortDirFor('application')"
              sort-asc-label="A → Z" sort-desc-label="Z → A"
              @update:sort-dir="onSort('application', $event)" />
          </th>
          <template v-if="isServiceFilter">
            <th style="width:140px;">
              <ColumnHeader label="IP" :sortable="true" :sort-dir="sortDirFor('ip')"
                sort-asc-label="Low → High" sort-desc-label="High → Low"
                @update:sort-dir="onSort('ip', $event)" />
            </th>
            <th style="width:70px;">
              <ColumnHeader label="Port" :sortable="true" :sort-dir="sortDirFor('port')"
                sort-asc-label="Low → High" sort-desc-label="High → Low"
                @update:sort-dir="onSort('port', $event)" />
            </th>
            <th>
              <ColumnHeader label="Host" :sortable="true" :sort-dir="sortDirFor('host')"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                @update:sort-dir="onSort('host', $event)" />
            </th>
            <th style="width:80px;">
              <ColumnHeader label="Protocol" :sortable="true" :sort-dir="sortDirFor('protocol')"
                sort-asc-label="A → Z" sort-desc-label="Z → A"
                :filter-options="PROTOCOL_FILTER_OPTIONS" :filter-value="filterProtocol"
                @update:sort-dir="onSort('protocol', $event)"
                @update:filter-value="filterProtocol = $event" />
            </th>
            <th style="width:110px;">
              <ColumnHeader label="Visibility"
                :filter-options="VISIBILITY_FILTER_OPTIONS" :filter-value="filterVisibility"
                @update:filter-value="filterVisibility = $event" />
            </th>
          </template>
          <slot name="extra-header" />
          <th style="width:160px;">Tags</th>
          <th style="width:150px;">
            <ColumnHeader label="Code" :sortable="true" :sort-dir="sortDirFor('code')"
              sort-asc-label="A → Z" sort-desc-label="Z → A"
              @update:sort-dir="onSort('code', $event)" />
          </th>
          <th style="width:110px;">
            <ColumnHeader label="Discovered" :sortable="true" :sort-dir="sortDirFor('createdAt')"
              sort-asc-label="Oldest first" sort-desc-label="Newest first"
              @update:sort-dir="onSort('createdAt', $event)" />
          </th>
          <th v-if="editable" style="width:48px;"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in processedAssets" :key="a.id"
            :class="{ 'row--selected': selectedIds.has(a.id) }"
            @click="router.push(assetRoute(a.id))">
          <td v-if="editable" class="check-cell" @click.stop>
            <input type="checkbox" class="row-check" :checked="selectedIds.has(a.id)" @change="toggleSelect(a.id)" />
          </td>
          <td v-if="typeFilter === null">
            <div style="display:flex; align-items:center; gap:0.35rem; flex-wrap:wrap;">
              <span class="type-badge">{{ ASSET_TYPE_LABELS[a.type] ?? a.type }}</span>
              <span v-if="showThirdPartyBadge && a.thirdParty" class="tp-badge">3rd party</span>
            </div>
          </td>
          <td v-if="!isServiceFilter" style="font-family:monospace; font-size:0.82rem;">
            <span v-if="showThirdPartyBadge && a.thirdParty && typeFilter !== null" class="tp-badge" style="margin-right:0.4rem;">3rd party</span>
            <template v-if="a.displayName">
              <span class="display-name">{{ a.displayName }}</span>
              <span class="secondary-identifier ident-clamp" :title="a.identifier">
                {{ a.type === 'web_endpoint' ? endpointPath(a.identifier) : a.identifier }}
              </span>
            </template>
            <template v-else-if="a.type === 'web_endpoint'">{{ endpointPath(a.identifier) }}</template>
            <span v-else class="ident-clamp" :title="a.identifier.length > 120 ? a.identifier : undefined">{{ a.identifier }}</span>
          </td>
          <td v-if="showSubtypeColumn" style="font-size:0.82rem;">{{ subtypeOf(a) ?? '—' }}</td>
          <td v-if="typeFilter === 'web_endpoint'" class="muted-mono">{{ endpointApp(a.identifier) }}</td>
          <template v-if="isServiceFilter">
            <td style="font-family:monospace; font-size:0.82rem;">{{ ipOf(a.identifier) ?? '—' }}</td>
            <td style="font-family:monospace; font-size:0.82rem; text-align:right;">{{ portOf(a.identifier) ?? '—' }}</td>
            <td @click.stop>
              <RouterLink v-if="serviceHosts[a.id]" :to="assetRoute(serviceHosts[a.id].hostId)" class="host-link">
                {{ serviceHosts[a.id].hostIdentifier }}
              </RouterLink>
              <span v-else class="dash">—</span>
            </td>
            <td>
              <span v-if="protocolOf(a.identifier)" class="proto-tag">{{ protocolOf(a.identifier) }}</span>
              <span v-else class="dash">—</span>
            </td>
            <td @click.stop>
              <AresBadge v-if="aggregateVisibility[a.id]"
                :value="aggregateVisibility[a.id]"
                :severity="visibilitySeverity(aggregateVisibility[a.id])" />
              <span v-else class="dash">—</span>
            </td>
          </template>
          <slot name="extra-cell" :asset="(a as Asset)" />
          <td @click.stop><TagChipList :tags="a.tags" /></td>
          <td><code style="font-size:0.72rem; color:var(--ares-text-muted);">{{ a.code }}</code></td>
          <td style="font-size:0.8rem; color:var(--ares-text-muted);">{{ a.createdAt.slice(0, 10) }}</td>
          <td v-if="editable" @click.stop>
            <slot name="row-action" :asset="(a as Asset)" />
          </td>
        </tr>
        <tr v-if="!processedAssets.length">
          <td :colspan="colspan" class="ares-table-empty">{{ emptyText }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ident-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.check-cell {
  width: 40px !important;
  padding: 0 0.5rem !important;
  text-align: center;
}
.row-check {
  accent-color: var(--p-primary-400);
  cursor: pointer;
  width: 15px;
  height: 15px;
}
tr.row--selected td { background: color-mix(in srgb, var(--p-primary-400) 9%, transparent) !important; }

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--ares-text-2);
}
.tp-badge {
  display: inline-flex;
  align-items: center;
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1em 0.5em;
  border-radius: var(--ares-radius);
  white-space: nowrap;
  background: color-mix(in srgb, #38bdf8 15%, transparent);
  color: #38bdf8;
  border: 1px solid color-mix(in srgb, #38bdf8 35%, transparent);
  letter-spacing: 0.01em;
}
.display-name {
  display: block;
  font-family: var(--ares-font, inherit);
  font-size: 0.85rem;
  color: var(--ares-text);
}
.secondary-identifier {
  display: block;
  font-size: 0.72rem;
  color: var(--ares-text-muted);
}
.muted-mono {
  font-size: 0.8rem;
  color: var(--ares-text-muted);
  font-family: monospace;
}
.host-link {
  color: var(--p-primary-400);
  text-decoration: none;
  font-size: 0.85rem;
}
.dash {
  color: var(--ares-text-muted);
  font-size: 0.78rem;
}
.proto-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: var(--ares-radius);
  font-family: monospace;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  color: var(--ares-text-2);
}
</style>
