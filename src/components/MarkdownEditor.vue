<script setup lang="ts">
/**
 * A real Markdown source editor (CodeMirror 6) — v-model is the raw Markdown
 * string, with no HTML translation layer in either direction. Replaces the
 * earlier Quill-based approach, which fought Markdown at every turn (Turndown
 * had to guess intent converting HTML back to Markdown, Quill's list model
 * didn't map onto Markdown lists, its toolbar applied WYSIWYG formatting
 * instead of inserting syntax, and its own theme hardcoded colors that broke
 * in dark mode) — see [[markdown_rich_text_migration]].
 *
 * Images: the toolbar button, image paste, and image drag-drop all upload to
 * /api/v1/editor-images and insert real ![alt](url) Markdown at the cursor/drop
 * position — there's no base64/data-URI embedding (that was Quill's old, storage-only
 * behavior; real uploads means images actually render in generated Word documents).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { editorImagesApi } from '@/api/editorImages';

const props = defineProps<{
  modelValue: string | null;
  editorStyle?: string;
  placeholder?: string;
  /** Scope uploaded images to this organization/project so only users with access to it can
   *  later view them — omit both only when this editor genuinely has no such context (a
   *  platform-wide KB form), where uploaded images fall back to MSSP-staff-only access. */
  organizationId?: number | null;
  projectId?: number | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const containerRef = ref<HTMLDivElement>();
const fileInputRef = ref<HTMLInputElement>();
const uploadStatus = ref('');
let view: EditorView | undefined;

// Set right before we emit our own change, so the watcher below doesn't reset
// the doc (and cursor/undo-history) from the value we ourselves just sent.
let suppressNextSync = false;

// Content copied from a PDF or Word doc almost always carries a literal
// newline at every one of the SOURCE's visual line-wrap points (PDF text
// layers in particular never reflow) — with `breaks:true` markdown-it
// rendering, that means every hard-wrapped line becomes its own <br>,
// splitting prose mid-sentence (and sometimes mid-word, when the source
// had hyphenated a wrapped word). Real single-paragraph prose has no
// legitimate reason to contain a lone newline, so on paste we rejoin lines
// within an unstructured paragraph into one flowing line, the same "paste
// and reflow" behavior most prose editors apply — typed Enter keys are
// completely untouched, only pasted clipboard text goes through this.
const LIST_LINE_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const HEADING_RE = /^\s*#{1,6}\s+/;
const QUOTE_RE = /^\s*>/;
const FENCE_RE = /^\s*```/;
const TABLE_RE = /^\s*\|/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const STRUCTURED_RE = new RegExp(
  `(?:${LIST_LINE_RE.source})|(?:${HEADING_RE.source})|(?:${QUOTE_RE.source})|(?:${TABLE_RE.source})|(?:${HR_RE.source})`,
);

function reflowPastedText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let inFence = false;

  const flush = () => {
    if (paragraph.length === 0) return;
    if (paragraph.some((l) => STRUCTURED_RE.test(l))) {
      out.push(paragraph.join('\n'));
    } else {
      // A line ending in a hyphen glued to the previous character (no space
      // before it) is a hyphenated word split across the source's original
      // line wrap — rejoin directly with no space. Anything else gets a
      // single space, same as normal prose reflow.
      let joined = '';
      for (const raw of paragraph) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (!joined) joined = trimmed;
        else joined += /\S-$/.test(joined) ? trimmed : ` ${trimmed}`;
      }
      out.push(joined);
    }
    paragraph = [];
  };

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      if (!inFence) { flush(); inFence = true; paragraph.push(line); }
      else { paragraph.push(line); inFence = false; out.push(paragraph.join('\n')); paragraph = []; }
      continue;
    }
    if (inFence) { paragraph.push(line); continue; }
    if (line.trim() === '') { flush(); out.push(''); continue; }
    paragraph.push(line);
  }
  flush();
  return out.join('\n');
}

// Maps CodeMirror's markdown syntax-tree tags onto the app's own --ares-* design
// tokens, so code spans/blocks are readable in both themes (fixing the dark-mode
// white-on-white bug that came from a third-party editor theme's hardcoded colors)
// and headings/emphasis/links get light visual weight while editing.
const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: 'bold', fontSize: '1.35em', color: 'var(--ares-text)' },
  { tag: tags.heading2, fontWeight: 'bold', fontSize: '1.2em', color: 'var(--ares-text)' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: 'bold', color: 'var(--ares-text)' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--p-primary-400)' },
  { tag: tags.url, color: 'var(--p-primary-400)' },
  { tag: tags.quote, color: 'var(--ares-text-muted)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--ares-accent)' },
  { tag: tags.processingInstruction, color: 'var(--ares-text-muted)' }, // syntax markers: **, _, #, > ...
  {
    tag: tags.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    backgroundColor: 'var(--ares-surface-sunken)',
    color: 'var(--ares-text)',
    borderRadius: '3px',
  },
]);

const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--ares-text-2)',
    backgroundColor: 'var(--ares-surface)',
    fontSize: '0.88rem',
    border: '1px solid var(--ares-border)',
    borderRadius: 'var(--ares-radius)',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--ares-accent-bg)' },
  '.cm-content': {
    caretColor: 'var(--ares-text)',
    fontFamily: 'inherit',
    padding: '0.6rem 0.75rem',
    // CodeMirror's own .cm-lineWrapping base style sets word-break: break-word
    // as a Safari fallback, which breaks plain prose mid-word even when the
    // word would fit by wrapping normally — override back to standard
    // wrapping behavior (only break a word if it can't fit on its own line).
    wordBreak: 'normal',
    overflowWrap: 'anywhere',
  },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6' },
  '.cm-placeholder': { color: 'var(--ares-text-muted)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--ares-accent-bg) !important',
    opacity: '0.35',
  },
  // drawSelection() hides the native caret (caret-color:transparent !important)
  // and draws its own .cm-cursor div, which defaults to a hardcoded black
  // border unless the theme is explicitly flagged dark — override directly
  // so the cursor matches the app's text color in both light and dark mode.
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
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(highlightStyle),
      editorTheme,
      placeholderExt(props.placeholder ?? ''),
      // markdownKeymap first so its Enter (continue list/blockquote markup) and
      // Backspace (delete markup backward) bindings take priority over the
      // generic ones — this is what makes typing "- " and pressing Enter keep
      // producing plain "- " continuation lines instead of anything else
      // reinterpreting the marker.
      keymap.of([...markdownKeymap, ...historyKeymap, ...defaultKeymap]),
      EditorView.domEventHandlers({
        paste: (event, editorView) => {
          const items = event.clipboardData?.items;
          if (items) {
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                  event.preventDefault();
                  uploadAndInsertImage(file);
                  return true;
                }
              }
            }
          }
          const text = event.clipboardData?.getData('text/plain');
          if (!text) return false;
          event.preventDefault();
          const reflowed = reflowPastedText(text);
          editorView.dispatch(editorView.state.replaceSelection(reflowed));
          return true;
        },
        dragover: (event) => {
          // Without this, the browser's own drag-over handling can reject the drop
          // (cursor shows "not allowed") before our drop handler ever gets a chance.
          if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
          return false;
        },
        drop: (event, editorView) => {
          const files = event.dataTransfer?.files;
          const imageFile = files && Array.from(files).find((f) => f.type.startsWith('image/'));
          if (!imageFile) return false;
          event.preventDefault();
          // Multiple dropped images: only the first is handled — sequencing inserts after
          // each async upload completes would require re-deriving the cursor position every
          // time, not worth the complexity for what's normally a single-image drop.
          const pos = editorView.posAtCoords({ x: event.clientX, y: event.clientY })
            ?? editorView.state.selection.main.from;
          uploadAndInsertImage(imageFile, pos);
          return true;
        },
      }),
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

/** Wraps the selection in `before`/`after` (replacing the selection and keeping
 * it selected), or — with no selection — inserts both markers with the cursor
 * placed between them. Matches GitHub's comment-box toolbar behavior. */
function wrapSelection(before: string, after: string = before) {
  if (!view) return;
  const changes = view.state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: [{ from: range.from, insert: before + after }],
        range: EditorSelection.cursor(range.from + before.length),
      };
    }
    return {
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: after },
      ],
      range: EditorSelection.range(range.from + before.length, range.to + before.length),
    };
  });
  view.dispatch(view.state.update(changes));
  view.focus();
}

/** Prepends `prefix` to every line touched by the selection (heading/list buttons). */
function prefixLines(prefix: string) {
  if (!view) return;
  const changes = view.state.changeByRange((range) => {
    const startLine = view!.state.doc.lineAt(range.from);
    const endLine = view!.state.doc.lineAt(range.to);
    const lineChanges = [];
    for (let n = startLine.number; n <= endLine.number; n++) {
      lineChanges.push({ from: view!.state.doc.line(n).from, insert: prefix });
    }
    return { changes: lineChanges, range: EditorSelection.range(range.from + prefix.length, range.to + prefix.length * (endLine.number - startLine.number + 1)) };
  });
  view.dispatch(view.state.update(changes));
  view.focus();
}

function insertCodeBlock() {
  if (!view) return;
  const changes = view.state.changeByRange((range) => {
    const selected = view!.state.sliceDoc(range.from, range.to);
    const insert = '```\n' + selected + '\n```';
    const cursorPos = range.from + 4 + selected.length;
    return { changes: [{ from: range.from, to: range.to, insert }], range: EditorSelection.cursor(cursorPos) };
  });
  view.dispatch(view.state.update(changes));
  view.focus();
}

/** Uploads an image file and inserts `![alt](url)` at `atPos` (defaults to the current
 *  cursor/selection start) — shared by the toolbar button, image paste, and image drop. */
async function uploadAndInsertImage(file: File, atPos?: number) {
  if (!view) return;
  const insertPos = atPos ?? view.state.selection.main.from;
  uploadStatus.value = `Uploading ${file.name}…`;
  try {
    const { url } = await editorImagesApi.upload(file, {
      organizationId: props.organizationId ?? undefined,
      projectId: props.projectId ?? undefined,
    });
    if (!view) return;
    const alt = file.name.replace(/\.[^./\\]+$/, '');
    const insert = `![${alt}](${url})`;
    view.dispatch({
      changes: { from: insertPos, to: insertPos, insert },
      selection: EditorSelection.cursor(insertPos + insert.length),
    });
    view.focus();
    uploadStatus.value = '';
  } catch {
    uploadStatus.value = `Failed to upload ${file.name}`;
    setTimeout(() => { uploadStatus.value = ''; }, 4000);
  }
}

function openImagePicker() {
  fileInputRef.value?.click();
}

function onImageFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-selecting the same file later
  if (file) uploadAndInsertImage(file);
}

function insertLink() {
  if (!view) return;
  const changes = view.state.changeByRange((range) => {
    const selected = view!.state.sliceDoc(range.from, range.to);
    const text = selected || 'text';
    const insert = `[${text}](url)`;
    const urlStart = range.from + text.length + 3;
    return {
      changes: [{ from: range.from, to: range.to, insert }],
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
  view.dispatch(view.state.update(changes));
  view.focus();
}
</script>

<template>
  <div class="markdown-editor" :style="editorStyle">
    <div class="markdown-editor__toolbar">
      <button type="button" title="Bold" @click="wrapSelection('**')"><b>B</b></button>
      <button type="button" title="Italic" @click="wrapSelection('_')"><i class="markdown-editor__italic-glyph">I</i></button>
      <button type="button" title="Inline code" @click="wrapSelection('`')"><i class="pi pi-code" /></button>
      <span class="markdown-editor__sep" />
      <button type="button" title="Heading" @click="prefixLines('## ')"><i class="pi pi-hashtag" /></button>
      <button type="button" title="Bulleted list" @click="prefixLines('- ')"><i class="pi pi-list" /></button>
      <button type="button" title="Numbered list" @click="prefixLines('1. ')"><i class="pi pi-sort-numeric-down" /></button>
      <span class="markdown-editor__sep" />
      <button type="button" title="Link" @click="insertLink"><i class="pi pi-link" /></button>
      <button type="button" title="Code block" @click="insertCodeBlock"><i class="pi pi-code" /></button>
      <span class="markdown-editor__sep" />
      <button type="button" title="Insert image" @click="openImagePicker"><i class="pi pi-image" /></button>
      <input
        ref="fileInputRef" type="file" accept="image/*"
        style="display:none" @change="onImageFileSelected"
      />
      <span v-if="uploadStatus" class="markdown-editor__upload-status">{{ uploadStatus }}</span>
    </div>
    <div ref="containerRef" class="markdown-editor__body" />
  </div>
</template>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.markdown-editor__toolbar {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--ares-border);
  border-bottom: none;
  border-radius: var(--ares-radius) var(--ares-radius) 0 0;
  background: var(--ares-surface-2);
}
.markdown-editor__toolbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border: none;
  background: transparent;
  border-radius: var(--ares-radius);
  color: var(--ares-text-2);
  cursor: pointer;
  font-size: 0.85rem;
}
.markdown-editor__toolbar button:hover {
  background: var(--ares-surface-sunken);
  color: var(--ares-text);
}
.markdown-editor__sep {
  width: 1px;
  height: 1.1rem;
  background: var(--ares-border);
  margin: 0 0.25rem;
}
.markdown-editor__italic-glyph {
  font-style: italic;
}
.markdown-editor__upload-status {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  color: var(--ares-text-muted);
}
.markdown-editor__body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.markdown-editor__body :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  border-radius: 0 0 var(--ares-radius) var(--ares-radius);
}
.markdown-editor__body :deep(.cm-editor.cm-focused) {
  border-radius: 0 0 var(--ares-radius) var(--ares-radius);
}
</style>
