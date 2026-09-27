<script setup lang="ts">
/**
 * HTML source editor (CodeMirror 6) for KB email templates — v-model is the raw HTML string.
 * Unlike MarkdownEditor.vue this is a thin wrapper: no Markdown-specific paste-reflow, no
 * formatting toolbar (email HTML is table/inline-style layout, not prose). Adds a Preview toggle
 * that renders the current source in a sandboxed iframe via sanitizeHtmlDocument() — the same
 * mechanism KbExploitDetailView.vue uses to preview untrusted HTML — so the author can see what
 * survives sanitization before saving (the real sanitization boundary is server-side, see
 * EmailTemplateService — this preview is a UX convenience, not a security control).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { sanitizeHtmlDocument } from '@/utils/markdown';

const props = defineProps<{
  modelValue: string | null;
  editorStyle?: string;
  placeholder?: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const containerRef = ref<HTMLDivElement>();
let view: EditorView | undefined;
let suppressNextSync = false;

const previewing = ref(false);
const previewHtml = computed(() => sanitizeHtmlDocument(props.modelValue ?? ''));

const highlightStyle = HighlightStyle.define([
  { tag: tags.angleBracket, color: 'var(--ares-text-muted)' },
  { tag: tags.tagName, color: 'var(--ares-accent)', fontWeight: 'bold' },
  { tag: tags.attributeName, color: 'var(--p-primary-400)' },
  { tag: tags.attributeValue, color: 'var(--ares-text)' },
  { tag: tags.comment, color: 'var(--ares-text-muted)', fontStyle: 'italic' },
  {
    tag: tags.string,
    color: 'var(--ares-text)',
  },
]);

const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--ares-text-2)',
    backgroundColor: 'var(--ares-surface)',
    fontSize: '0.85rem',
    border: '1px solid var(--ares-border)',
    borderRadius: 'var(--ares-radius)',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--ares-accent-bg)' },
  '.cm-content': {
    caretColor: 'var(--ares-text)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    padding: '0.6rem 0.75rem',
  },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
  '.cm-placeholder': { color: 'var(--ares-text-muted)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--ares-accent-bg) !important',
    opacity: '0.35',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ares-text)' },
});

function createState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      EditorView.lineWrapping,
      html(),
      syntaxHighlighting(highlightStyle),
      editorTheme,
      placeholderExt(props.placeholder ?? ''),
      keymap.of([...historyKeymap, ...defaultKeymap]),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        suppressNextSync = true;
        emit('update:modelValue', update.state.doc.toString());
      }),
    ],
  });
}

onMounted(() => {
  if (!containerRef.value) return;
  view = new EditorView({ state: createState(props.modelValue ?? ''), parent: containerRef.value });
});

onBeforeUnmount(() => {
  view?.destroy();
});

watch(() => props.modelValue, (newVal) => {
  if (suppressNextSync) { suppressNextSync = false; return; }
  if (!view) return;
  const next = newVal ?? '';
  if (view.state.doc.toString() === next) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
});
</script>

<template>
  <div class="html-email-editor" :style="editorStyle">
    <div class="html-email-editor__toolbar">
      <button type="button" :class="{ active: !previewing }" @click="previewing = false">Source</button>
      <button type="button" :class="{ active: previewing }" @click="previewing = true">Preview</button>
    </div>
    <div v-show="!previewing" ref="containerRef" class="html-email-editor__body" />
    <iframe v-if="previewing" class="html-email-editor__preview" sandbox="" :srcdoc="previewHtml" />
  </div>
</template>

<style scoped>
.html-email-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.html-email-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--ares-border);
  border-bottom: none;
  border-radius: var(--ares-radius) var(--ares-radius) 0 0;
  background: var(--ares-surface-2);
}
.html-email-editor__toolbar button {
  border: none;
  background: transparent;
  border-radius: var(--ares-radius);
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
}
.html-email-editor__toolbar button:hover { color: var(--ares-text); }
.html-email-editor__toolbar button.active {
  background: var(--ares-surface-sunken);
  color: var(--ares-text);
}
.html-email-editor__body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.html-email-editor__body :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  border-radius: 0 0 var(--ares-radius) var(--ares-radius);
}
.html-email-editor__preview {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--ares-border);
  border-radius: 0 0 var(--ares-radius) var(--ares-radius);
  background: #fff;
}
</style>
