import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { languages } from '@codemirror/language-data';
import type { Language, LanguageDescription } from '@codemirror/language';
import { highlightCode, classHighlighter } from '@lezer/highlight';

// html:false means literal HTML typed/pasted into a field is escaped as visible
// text instead of being parsed and executed — this is the actual XSS fix (see
// [[markdown_rich_text_migration]]). linkify/breaks match the authoring experience
// users already expect from the rich-text editor.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// This app never intentionally produces an indented (4-space) code block — the only
// way to get a real code block through the editor is the toolbar's code-block button,
// which always emits a fenced ``` block. Any occurrence of 4+ leading spaces at the
// start of a block is unintentional (legacy whitespace that survived the old
// HTML->Markdown migration), so disable CommonMark's indented-code-block rule
// entirely — 'fence' (``` blocks) is a separate rule and stays enabled.
md.disable(['code']);

// DOMPurify's default ALLOWED_URI_REGEXP rejects data: URIs outright. Legacy
// fields migrated from the old rich-text editor's inline-image behavior may still
// contain `![alt](data:image/png;base64,...)`, so the image scheme is added back
// in — this is DOMPurify's own documented recipe for allowing data: URIs on <img>.
const DATA_IMAGE_URI = /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp);base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

// ── Code block rendering: header + copy button + (async) syntax highlighting ──
//
// markdown-it's `fence`/`code_block` renderer runs synchronously and produces
// plain escaped text — real syntax coloring needs a parsed syntax tree, and
// @codemirror/language-data's languages are lazy (`.load()` returns a Promise,
// dynamically importing the grammar on first use). So rendering happens in two
// passes: this module emits a wrapper with the language name in the header and
// plain escaped code immediately, then `enhanceCodeBlocks()` (called by
// MarkdownView after the HTML mounts) asynchronously loads the matching grammar
// and replaces the `<code>` contents with highlighted spans. No new dependency
// needed — @codemirror/language-data + @lezer/highlight are already installed
// for MarkdownEditor.vue's live editor highlighting.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyButtonHtml(): string {
  return '<button type="button" class="md-code-copy" title="Copy code" aria-label="Copy code"><i class="pi pi-copy"></i></button>';
}

function findLanguageDescription(name: string) {
  const lower = name.toLowerCase();
  return languages.find((l) => l.name.toLowerCase() === lower || l.alias.some((a) => a.toLowerCase() === lower));
}

function findLanguageDescriptionByExtension(ext: string) {
  const lower = ext.toLowerCase();
  return languages.find((l) => l.extensions.some((e) => e.toLowerCase() === lower));
}

function fenceRenderer(tokens: any[], idx: number): string {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const langName = info ? info.split(/\s+/)[0] : '';
  const escaped = escapeHtml(token.content);

  if (!langName) {
    return `<div class="md-code-block md-code-block--plain">${copyButtonHtml()}<pre class="md-code-block__pre"><code>${escaped}</code></pre></div>`;
  }

  const desc = findLanguageDescription(langName);
  const label = escapeHtml(desc?.name ?? langName);
  const dataLang = escapeHtml(langName.toLowerCase());
  return (
    `<div class="md-code-block" data-lang="${dataLang}">` +
    `<div class="md-code-block__header"><span class="md-code-block__lang">${label}</span>${copyButtonHtml()}</div>` +
    `<pre class="md-code-block__pre"><code>${escaped}</code></pre>` +
    `</div>`
  );
}

function indentedCodeRenderer(tokens: any[], idx: number): string {
  const escaped = escapeHtml(tokens[idx].content);
  return `<div class="md-code-block md-code-block--plain">${copyButtonHtml()}<pre class="md-code-block__pre"><code>${escaped}</code></pre></div>`;
}

md.renderer.rules.fence = fenceRenderer;

/** Renders stored Markdown to sanitized HTML, safe to pass to `v-html`. */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  const html = md.render(source);
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: DATA_IMAGE_URI });
}

// Separate instance for rendering externally-authored Markdown files (READMEs pulled
// from arbitrary git repos), as opposed to `md` above which is tuned for content
// produced by this app's own rich-text editor. Real README files are hard-wrapped
// CommonMark, where a single newline inside a paragraph is just a soft wrap, not a
// line break (breaks:false) — turning every newline into <br> (like `md` does for the
// editor's own soft-return semantics) mangles ordinary paragraphs. Indented 4-space
// code blocks are also real and common in READMEs, so 'code' is left enabled here.
const readmeMd = new MarkdownIt({ html: false, linkify: true, breaks: false });
readmeMd.renderer.rules.fence = fenceRenderer;
readmeMd.renderer.rules.code_block = indentedCodeRenderer;

/** Renders a raw external Markdown file (e.g. a README fetched from a git repo). */
export function renderReadme(source: string | null | undefined): string {
  if (!source) return '';
  const html = readmeMd.render(source);
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: DATA_IMAGE_URI });
}

// ── Async highlighting pass ───────────────────────────────────────────────
// Keyed by the resolved description's canonical name (stable identity) rather
// than the raw lookup string, so a fence's ```py and a file named foo.py share
// one cached load instead of fetching the Python grammar twice.
const languageCache = new Map<string, Promise<Language | null>>();

function loadLanguageDescription(desc: LanguageDescription | undefined): Promise<Language | null> {
  if (!desc) return Promise.resolve(null);
  let cached = languageCache.get(desc.name);
  if (!cached) {
    cached = desc.load().then((support) => support.language).catch(() => null);
    languageCache.set(desc.name, cached);
  }
  return cached;
}

/**
 * Syntax-highlights every not-yet-processed fenced code block under `root`
 * whose language could be matched to a CodeMirror grammar. Safe to call
 * repeatedly (already-processed blocks are skipped via a data attribute) —
 * call this after the rendered HTML mounts/updates, since it mutates the DOM
 * directly rather than going through Vue's reactivity.
 */
export async function enhanceCodeBlocks(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.md-code-block[data-lang]:not([data-highlighted])'));
  await Promise.all(blocks.map(async (block) => {
    const langName = block.dataset.lang;
    const codeEl = block.querySelector('code');
    if (!langName || !codeEl) return;
    const language = await loadLanguageDescription(findLanguageDescription(langName));
    block.dataset.highlighted = 'true';
    if (!language) return;

    const code = codeEl.textContent ?? '';
    const tree = language.parser.parse(code);
    let html = '';
    highlightCode(
      code, tree, classHighlighter,
      (text, classes) => { html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text); },
      () => { html += '\n'; },
    );
    codeEl.innerHTML = html;
  }));
}

export interface HighlightedFile {
  /** One highlighted (already HTML-escaped) string per source line. */
  lines: string[];
  /** Display name of the matched language, or null if the extension wasn't recognized
   *  (caller falls back to plain, unhighlighted text). */
  languageLabel: string | null;
}

/**
 * Syntax-highlights an arbitrary source file by its extension — for raw file previews
 * (e.g. the KB Exploits repo browser) rather than a markdown fence. Returns one HTML
 * string per line so callers can render a line-number gutter alongside the code.
 */
export async function highlightFile(code: string, filename: string): Promise<HighlightedFile> {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1) : '';
  const desc = ext ? findLanguageDescriptionByExtension(ext) : undefined;
  const language = await loadLanguageDescription(desc);
  if (!language) {
    return { lines: code.split('\n').map(escapeHtml), languageLabel: null };
  }

  const tree = language.parser.parse(code);
  const lines: string[] = [];
  let current = '';
  highlightCode(
    code, tree, classHighlighter,
    (text, classes) => { current += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text); },
    () => { lines.push(current); current = ''; },
  );
  lines.push(current);
  return { lines, languageLabel: desc!.name };
}

/** Sanitizes a full untrusted HTML document for display inside a sandboxed iframe
 *  (`sandbox=""`, no script execution) — used for previewing .html files pulled from
 *  exploit repos, which are of inherently uncertain provenance. `WHOLE_DOCUMENT` keeps
 *  the doctype/head/body structure so the preview looks like the real page. */
export function sanitizeHtmlDocument(source: string): string {
  return DOMPurify.sanitize(source, { ALLOWED_URI_REGEXP: DATA_IMAGE_URI, WHOLE_DOCUMENT: true });
}
