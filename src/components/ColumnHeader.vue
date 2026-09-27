<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = withDefaults(defineProps<{
  label: string;
  sortable?: boolean;
  sortDir?: 'asc' | 'desc' | null;
  sortAscLabel?: string;
  sortDescLabel?: string;
  filterOptions?: Array<{ label: string; value: string }>;
  filterValue?: string[];
  popupAlign?: 'left' | 'right';
}>(), {
  sortable: false,
  sortDir: null,
  sortAscLabel: 'Ascending',
  sortDescLabel: 'Descending',
  filterOptions: () => [],
  filterValue: () => [],
  popupAlign: 'left',
});

const emit = defineEmits<{
  'update:sortDir': ['asc' | 'desc' | null];
  'update:filterValue': [string[]];
}>();

const open = ref(false);
const popupStyle = ref<Record<string, string>>({});
const triggerRef = ref<HTMLButtonElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const optionSearch = ref('');

const hasFilter = computed(() => props.filterOptions.length > 0);
const showDivider = computed(() => props.sortable && hasFilter.value);
const filterActive = computed(() => (props.filterValue?.length ?? 0) > 0);

const visibleOptions = computed(() => {
  const q = optionSearch.value.trim().toLowerCase();
  if (!q) return props.filterOptions;
  return props.filterOptions.filter(o => o.label.toLowerCase().includes(q));
});

function openPopup() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const style: Record<string, string> = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    'z-index': '9999',
    'min-width': '200px',
  };
  if (props.popupAlign === 'right') {
    style.right = `${window.innerWidth - rect.right}px`;
  } else {
    style.left = `${rect.left}px`;
  }
  popupStyle.value = style;
  open.value = true;
}

function togglePopup() {
  if (open.value) {
    open.value = false;
    optionSearch.value = '';
  } else {
    openPopup();
    if (hasFilter.value) {
      setTimeout(() => searchRef.value?.focus(), 50);
    }
  }
}

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (triggerRef.value && triggerRef.value.contains(target)) return;
  const popup = document.getElementById('col-header-popup');
  if (popup && popup.contains(target)) return;
  open.value = false;
}

function selectSort(dir: 'asc' | 'desc') {
  emit('update:sortDir', props.sortDir === dir ? null : dir);
  open.value = false;
}

function toggleFilter(value: string) {
  const current = props.filterValue ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  emit('update:filterValue', next);
}

function clearFilter() {
  emit('update:filterValue', []);
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside));
</script>

<template>
  <span class="col-header">
    <span class="col-header__label">{{ label }}</span>
    <button
      v-if="sortable || hasFilter"
      ref="triggerRef"
      class="col-header__btn"
      :class="{ 'col-header__btn--active': open, 'col-header__btn--filtered': filterActive }"
      @click.stop="togglePopup"
    >
      <i
        v-if="sortable"
        :class="sortDir === 'asc' ? 'pi pi-arrow-up' : sortDir === 'desc' ? 'pi pi-arrow-down' : 'pi pi-sort'"
        class="col-header__icon"
        :style="sortDir ? {} : { opacity: '0.35' }"
      />
      <i v-else class="pi pi-filter col-header__icon" :style="{ opacity: filterActive ? '1' : '0.35' }" />
      <span v-if="filterActive" class="col-header__dot" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        id="col-header-popup"
        class="col-popup"
        :style="popupStyle"
      >
        <!-- Sort options -->
        <template v-if="sortable">
          <button
            class="col-popup__option"
            :class="{ 'col-popup__option--active': sortDir === 'asc' }"
            @click="selectSort('asc')"
          >
            <i class="pi pi-arrow-up col-popup__option-icon" />
            <span>{{ sortAscLabel }}</span>
            <i v-if="sortDir === 'asc'" class="pi pi-check col-popup__check" />
          </button>
          <button
            class="col-popup__option"
            :class="{ 'col-popup__option--active': sortDir === 'desc' }"
            @click="selectSort('desc')"
          >
            <i class="pi pi-arrow-down col-popup__option-icon" />
            <span>{{ sortDescLabel }}</span>
            <i v-if="sortDir === 'desc'" class="pi pi-check col-popup__check" />
          </button>
        </template>

        <div v-if="showDivider" class="col-popup__divider" />

        <!-- Multi-select filter options -->
        <template v-if="hasFilter">
          <div class="col-popup__search-wrap" @click.stop>
            <i class="pi pi-search col-popup__search-icon" />
            <input
              ref="searchRef"
              v-model="optionSearch"
              class="col-popup__search"
              placeholder="Search…"
              @keydown.escape.stop="open = false; optionSearch = ''"
            />
          </div>
          <div class="col-popup__divider" />
          <button
            v-if="filterActive"
            class="col-popup__clear"
            @click="clearFilter"
          >
            <i class="pi pi-times col-popup__option-icon" />
            <span>Clear ({{ (filterValue ?? []).length }} selected)</span>
          </button>
          <div v-if="filterActive" class="col-popup__divider" />
          <div v-if="!visibleOptions.length" class="col-popup__empty">No results</div>
          <label
            v-for="opt in visibleOptions"
            :key="opt.value"
            class="col-popup__check-row"
            :class="{ 'col-popup__check-row--active': (filterValue ?? []).includes(opt.value) }"
          >
            <input
              type="checkbox"
              class="col-popup__checkbox"
              :checked="(filterValue ?? []).includes(opt.value)"
              @change="toggleFilter(opt.value)"
            />
            <span>{{ opt.label }}</span>
          </label>
        </template>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.col-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.col-header__label {
  color: var(--ares-text-muted);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.col-header__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: transparent;
  border: none;
  border-radius: var(--ares-radius);
  cursor: pointer;
  padding: 0;
  color: var(--ares-text-muted);
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}
.col-header__btn:hover,
.col-header__btn--active { background: var(--ares-surface-2); color: var(--ares-text-1); }
.col-header__btn--filtered { color: var(--ares-accent); }
.col-header__icon { font-size: 11px; }
.col-header__dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--ares-accent);
  pointer-events: none;
}

.col-popup {
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  padding: 4px 0;
  overflow: hidden;
  max-height: 340px;
  overflow-y: auto;
}
.col-popup__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--ares-text-2);
  font-size: 0.8rem;
  font-family: inherit;
  text-align: left;
  padding: 0 10px;
  height: 30px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  white-space: nowrap;
}
.col-popup__option:hover { background: var(--ares-surface-2); color: var(--ares-text-1); }
.col-popup__option--active { color: var(--ares-accent); }
.col-popup__clear {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  color: var(--ares-text-muted);
  font-size: 0.75rem;
  font-family: inherit;
  text-align: left;
  padding: 0 10px;
  height: 26px;
  cursor: pointer;
  transition: color 0.12s;
}
.col-popup__clear:hover { color: var(--ares-text-1); }
.col-popup__check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 10px;
  height: 30px;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--ares-text-2);
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
}
.col-popup__check-row:hover { background: var(--ares-surface-2); color: var(--ares-text-1); }
.col-popup__check-row--active { color: var(--ares-text-1); }
.col-popup__checkbox {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  accent-color: var(--ares-accent);
  cursor: pointer;
}
.col-popup__option-icon { font-size: 10px; opacity: 0.7; flex-shrink: 0; }
.col-popup__check { font-size: 10px; margin-left: auto; color: var(--ares-accent); flex-shrink: 0; }
.col-popup__divider { height: 1px; background: var(--ares-border); margin: 4px 0; }

.col-popup__search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 4px;
}
.col-popup__search-icon {
  font-size: 11px;
  color: var(--ares-text-muted);
  flex-shrink: 0;
}
.col-popup__search {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ares-border);
  outline: none;
  font-size: 0.8rem;
  color: var(--ares-text-1);
  padding: 1px 0 3px;
  font-family: inherit;
}
.col-popup__search::placeholder { color: var(--ares-text-muted); }
.col-popup__empty {
  padding: 8px 12px;
  font-size: 0.78rem;
  color: var(--ares-text-muted);
  text-align: center;
}
</style>
