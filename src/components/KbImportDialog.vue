<script setup lang="ts">
/**
 * Shared import modal for the Knowledge Base — drag-and-drop file picker matching the
 * ares-file-drop style used in ProjectImportsView (scanner imports), so every KB
 * export/import mechanism in the app looks and feels the same.
 */
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

const props = defineProps<{
  visible: boolean;
  header: string;
  /** e.g. "template", "guide", "methodology" — used to build "Imported N <noun>(s)." */
  itemNounSingular: string;
  itemNounPlural: string;
  importFn: (files: File[]) => Promise<{ imported: number; errors: string[] }>;
}>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; imported: [] }>();

const files = ref<File[]>([]);
const importing = ref(false);
const result = ref<{ imported: number; errors: string[] } | null>(null);
const err = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

watch(() => props.visible, (open) => {
  if (!open) return;
  files.value = [];
  result.value = null;
  err.value = '';
});

function addFiles(list: FileList | null | undefined) {
  if (!list || !list.length) return;
  files.value = [...files.value, ...Array.from(list)];
}
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  addFiles(input.files);
  input.value = '';
}
function removeFile(idx: number) { files.value.splice(idx, 1); }

function close() { emit('update:visible', false); }

async function submit() {
  if (!files.value.length) return;
  importing.value = true;
  err.value = '';
  result.value = null;
  try {
    result.value = await props.importFn(files.value);
    if (result.value.imported > 0) emit('imported');
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? e.message ?? 'Import failed';
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <Dialog :visible="visible" :header="header" modal :style="{ width: 'min(520px, 96vw)' }" @update:visible="close">
    <div style="display:flex; flex-direction:column; gap:0.85rem;">
      <p v-if="$slots.default" style="font-size:0.82rem; color:var(--ares-text-muted); margin:0;">
        <slot />
      </p>

      <div
        class="ares-file-drop"
        :class="{ 'ares-file-drop--has-files': files.length }"
        @click="fileInputRef?.click()"
        @dragover.prevent
        @drop.prevent="(e) => addFiles(e.dataTransfer?.files)"
      >
        <template v-if="!files.length">
          <i class="pi pi-upload" style="font-size:1.4rem; color:var(--ares-text-muted);" />
          <div style="color:var(--ares-text-muted); margin-top:0.35rem; font-size:0.85rem;">
            Click or drag &amp; drop files here
          </div>
        </template>
        <template v-else>
          <div class="file-list">
            <div v-for="(f, i) in files" :key="i" class="file-entry" @click.stop>
              <div class="file-row">
                <i class="pi pi-file" />
                <span class="file-name">{{ f.name }}</span>
                <span class="file-size">{{ (f.size / 1024).toFixed(0) }} KB</span>
                <button v-if="!importing" type="button" class="file-remove" title="Remove" @click.stop="removeFile(i)">
                  <i class="pi pi-times" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="!importing" style="font-size:0.75rem; color:var(--ares-text-muted); margin-top:0.5rem; text-align:center;">
            Click or drop to add more files
          </div>
        </template>
      </div>
      <input ref="fileInputRef" type="file" multiple accept=".json,.zip,application/json,application/zip" style="display:none;" @change="onFileChange" />

      <div v-if="result" style="font-size:0.82rem;">
        <p style="margin:0;">
          Imported <strong>{{ result.imported }}</strong> {{ result.imported === 1 ? itemNounSingular : itemNounPlural }}.
        </p>
        <div v-if="result.errors.length" class="ares-alert ares-alert--error" style="margin-top:0.5rem; font-size:0.76rem;">
          <div v-for="(e, i) in result.errors" :key="i">{{ e }}</div>
        </div>
      </div>
      <div v-if="err" class="ares-alert ares-alert--error">{{ err }}</div>
    </div>
    <template #footer>
      <Button label="Close" severity="secondary" size="small" @click="close" />
      <Button label="Import" icon="pi pi-upload" size="small" :loading="importing" :disabled="!files.length" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.ares-file-drop {
  border: 2px dashed var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.ares-file-drop:hover { border-color: var(--p-primary-400); }
.ares-file-drop--has-files { padding: 0.75rem; text-align: left; }

.file-list { display: flex; flex-direction: column; gap: 0.2rem; max-height: 240px; overflow-y: auto; }
.file-entry {
  background: var(--ares-surface-sunken);
  border-radius: var(--ares-radius);
  padding: 0.4rem 0.6rem;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size {
  font-size: 0.72rem;
  color: var(--ares-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.file-remove {
  background: transparent;
  border: none;
  color: var(--ares-text-muted);
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  border-radius: var(--ares-radius);
  line-height: 1;
  flex-shrink: 0;
}
.file-remove:hover { color: var(--p-red-400); }
</style>
