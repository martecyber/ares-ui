<script setup lang="ts">
import Dialog from 'primevue/dialog';
import { useThemeStore } from '@/stores/theme';

export interface PickerOption {
  id: string;
  label: string;
  /** Logo to use in dark mode (or the only logo if logoLight is absent) — undefined when no
   *  square icon mark is available for this option (e.g. a vendor with only a wide wordmark);
   *  the picker falls back to a generic plug icon in that case. */
  logo: string | undefined;
  /** Logo to use in light mode; falls back to logo if not provided */
  logoLight?: string;
  /** White-filled copy of the same icon, stacked directly behind it — for icons whose colored
   *  path carves an inner glyph out as a transparent hole (e.g. Qualys's Q), so that hole reads
   *  as white instead of this card's own dark background showing through. */
  logoBacking?: string;
  disabled?: boolean;
}

defineProps<{
  visible: boolean;
  header: string;
  options: ReadonlyArray<PickerOption>;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  'select': [id: string];
}>();

const theme = useThemeStore();

function logoFor(opt: PickerOption): string | undefined {
  return (theme.theme === 'light' && opt.logoLight) ? opt.logoLight : opt.logo;
}

function pick(opt: PickerOption) {
  if (opt.disabled) return;
  emit('select', opt.id);
  emit('update:visible', false);
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="header"
    modal
    :style="{ width: 'min(560px, 96vw)' }"
    :pt="{ content: { style: 'padding: 1.25rem' } }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="picker-grid">
      <button
        v-for="opt in options"
        :key="opt.id"
        type="button"
        :class="['picker-card', { 'picker-card--disabled': opt.disabled }]"
        :title="opt.disabled ? `${opt.label} — Coming soon` : opt.label"
        @click="pick(opt)"
      >
        <div class="picker-logo" style="position:relative;">
          <span v-if="logoFor(opt)?.startsWith('<')" v-html="logoFor(opt)" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;" />
          <template v-else-if="logoFor(opt)">
            <img v-if="opt.logoBacking" :src="opt.logoBacking" alt="" aria-hidden="true"
              style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius: var(--ares-radius);" />
            <img :src="logoFor(opt)" :alt="opt.label"
              style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;border-radius: var(--ares-radius);" />
          </template>
          <i v-else class="pi pi-plug" style="font-size:1.5rem;color:var(--ares-text-muted);" />
        </div>
        <span class="picker-label">{{ opt.label }}</span>
        <span v-if="opt.disabled" class="picker-soon">Coming soon</span>
      </button>
    </div>
  </Dialog>
</template>

<style scoped>
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.75rem;
}

.picker-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 0.75rem 0.75rem;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  background: var(--ares-surface-raised);
  color: var(--ares-text-2);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  transition: border-color 0.12s, background 0.12s, transform 0.1s;
  width: 100%;
}

.picker-card:not(.picker-card--disabled):hover {
  border-color: var(--p-primary-400);
  background: color-mix(in srgb, var(--p-primary-500) 8%, var(--ares-surface-raised));
  transform: translateY(-1px);
}

.picker-card--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.picker-logo {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.picker-logo :deep(svg) {
  width: 100%;
  height: 100%;
}

.picker-label {
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

.picker-soon {
  font-size: 0.68rem;
  color: var(--ares-text-muted);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
</style>
