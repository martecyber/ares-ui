<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { renderMarkdown, renderReadme, enhanceCodeBlocks } from '@/utils/markdown';

const props = defineProps<{
  source?: string | null;
  emptyText?: string;
  /** 'readme' renders externally-authored Markdown (e.g. a git repo's README) with
   *  standard CommonMark soft-wrap semantics instead of the app editor's breaks:true. */
  variant?: 'default' | 'readme';
}>();

const html = computed(() => {
  if (props.source) return props.variant === 'readme' ? renderReadme(props.source) : renderMarkdown(props.source);
  return `<p style="color:var(--ares-text-muted)">${props.emptyText ?? 'Empty'}</p>`;
});

const rootRef = ref<HTMLElement>();

// v-html content isn't part of Vue's vdom, so code-block syntax highlighting
// (async — grammars are lazy-loaded) and the copy button's click handling are
// wired up directly against the DOM after each re-render.
watch(html, () => {
  nextTick(() => { if (rootRef.value) enhanceCodeBlocks(rootRef.value); });
}, { immediate: true });

function onClick(event: MouseEvent) {
  const btn = (event.target as HTMLElement).closest('.md-code-copy') as HTMLElement | null;
  if (!btn) return;
  const code = btn.closest('.md-code-block')?.querySelector('code')?.textContent ?? '';
  navigator.clipboard.writeText(code).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="pi pi-check"></i>';
    btn.classList.add('md-code-copy--copied');
    setTimeout(() => { btn.innerHTML = original; btn.classList.remove('md-code-copy--copied'); }, 1500);
  });
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div ref="rootRef" class="rich-text" v-html="html" @click="onClick" />
</template>

<style scoped>
.rich-text {
  font-size: 0.88rem;
  line-height: 1.75;
  color: var(--ares-text-2);
  overflow-wrap: break-word;
  min-width: 0;
}
.rich-text :deep(p) { margin: 0 0 0.6em; }
.rich-text :deep(h1),
.rich-text :deep(h2),
.rich-text :deep(h3),
.rich-text :deep(h4),
.rich-text :deep(h5),
.rich-text :deep(h6) {
  color: var(--ares-text);
  font-weight: 700;
  line-height: 1.3;
  margin: 1.1em 0 0.5em;
}
.rich-text :deep(h1:first-child),
.rich-text :deep(h2:first-child),
.rich-text :deep(h3:first-child) { margin-top: 0; }
.rich-text :deep(h1) { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--ares-border); }
.rich-text :deep(h2) { font-size: 1.3em; padding-bottom: 0.25em; border-bottom: 1px solid var(--ares-border); }
.rich-text :deep(h3) { font-size: 1.15em; }
.rich-text :deep(h4) { font-size: 1.05em; }
.rich-text :deep(h5),
.rich-text :deep(h6) { font-size: 0.95em; color: var(--ares-text-muted); }
.rich-text :deep(hr) { border: none; border-top: 1px solid var(--ares-border); margin: 1em 0; }
.rich-text :deep(ul),
.rich-text :deep(ol) { padding-left: 1.4em; margin: 0 0 0.6em; }
.rich-text :deep(ul) { list-style: disc; }
.rich-text :deep(ol) { list-style: decimal; }
.rich-text :deep(li) { margin: 0.15em 0; }
.rich-text :deep(code) {
  font-family: monospace;
  font-size: 0.85em;
  background: var(--ares-surface-sunken);
  border-radius: var(--ares-radius);
  padding: 0.1em 0.35em;
}
.rich-text :deep(.md-code-block) {
  position: relative;
  margin: 0 0 0.6em;
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  overflow: hidden;
  background: var(--ares-surface-sunken);
}
.rich-text :deep(.md-code-block__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.65rem;
  background: var(--ares-surface-raised);
  border-bottom: 1px solid var(--ares-border);
}
.rich-text :deep(.md-code-block__lang) {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ares-text-muted);
}
.rich-text :deep(.md-code-block__pre) {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-size: 0.82rem;
  background: none;
  border: none;
  border-radius: 0;
}
.rich-text :deep(.md-code-block__pre code) {
  background: none;
  padding: 0;
}
.rich-text :deep(.md-code-block--plain .md-code-copy) {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  z-index: 1;
  background: var(--ares-surface-raised);
}
.rich-text :deep(.md-code-copy) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  border-radius: var(--ares-radius);
  background: transparent;
  color: var(--ares-text-muted);
  cursor: pointer;
  font-size: 0.78rem;
  flex-shrink: 0;
}
.rich-text :deep(.md-code-copy:hover) {
  background: color-mix(in srgb, var(--ares-text) 10%, transparent);
  color: var(--ares-text);
}
.rich-text :deep(.md-code-copy--copied) { color: var(--ares-success); }

/* Syntax-highlight token colors (.tok-*) are global — see main.css. */
.rich-text :deep(blockquote) {
  border-left: 3px solid var(--ares-border);
  margin: 0 0 0.6em;
  padding-left: 1em;
  color: var(--ares-text-muted);
}
.rich-text :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--ares-radius);
}
.rich-text :deep(a) {
  color: var(--p-primary-400);
}
.rich-text :deep(table) {
  border-collapse: collapse;
  margin: 0 0 0.6em;
  font-size: 0.85em;
}
.rich-text :deep(th),
.rich-text :deep(td) {
  border: 1px solid var(--ares-border);
  padding: 0.3em 0.6em;
}
</style>
