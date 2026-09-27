import type { AqlFieldInfo } from '@/api/aql';

export type AqlSuggestionKind = 'field' | 'operator' | 'value' | 'keyword' | 'variable';

/** A workflow context reference (trigger field, assigned variable, step output) available for
 *  {@code {{...}}} templating inside AQL text — see {@link suggestVariables}. */
export interface AqlVariableRef { ref: string; label?: string; type?: string; }

export interface AqlSuggestion {
  kind: AqlSuggestionKind;
  label: string;
  detail?: string;
  insertText: string;
  replaceFrom: number;
  replaceTo: number;
  cursorAfter: number;
}

/** Wireshark-style standalone comparison operators (see AqlLexer/AqlOperator) — no colon prefix,
 *  field/operator/value are three separate tokens, optionally space-separated. */
const OPERATOR_INFO: { symbol: string; opName: string; label: string }[] = [
  { symbol: '==', opName: 'EQ', label: 'equals' },
  { symbol: '!=', opName: 'NEQ', label: 'not equal' },
  { symbol: '~=', opName: 'CONTAINS', label: 'contains' },
  { symbol: '>=', opName: 'GTE', label: 'greater or equal' },
  { symbol: '<=', opName: 'LTE', label: 'less or equal' },
  { symbol: '>', opName: 'GT', label: 'greater than' },
  { symbol: '<', opName: 'LT', label: 'less than' },
];
const VALID_OPERATOR_SYMBOLS = new Set(OPERATOR_INFO.map((o) => o.symbol));
// Longest-first so greedy matching in the tokenizer picks "==" over a lone "=", etc.
const OPERATOR_SYMBOLS_BY_LENGTH = [...OPERATOR_INFO.map((o) => o.symbol)].sort((a, b) => b.length - a.length);
const OPERATOR_CHARS = new Set(['=', '!', '~', '<', '>']);

const LOGICAL_KEYWORDS = ['AND', 'OR', 'NOT'];

type MiniTokenType = 'word' | 'op' | 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'comma' | 'string';

interface MiniToken {
  type: MiniTokenType;
  text: string;
  start: number;
  end: number;
}

/** A small, purpose-built tokenizer (not the real AqlLexer — this only needs to be good enough
 *  to find token boundaries for cursor-aware suggestions, not to fully validate the query) that
 *  splits {@code text.slice(0, end)} into field/operator/value-shaped tokens. Field, operator and
 *  value are always separate tokens regardless of whether the user put whitespace between them
 *  (operator characters are their own boundary, not just whitespace) — "priority==P0" and
 *  "priority == P0" tokenize identically. */
function tokenizeUpTo(text: string, end: number): MiniToken[] {
  const tokens: MiniToken[] = [];
  let i = 0;
  while (i < end) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', text: '(', start: i, end: i + 1 }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', text: ')', start: i, end: i + 1 }); i++; continue; }
    if (c === '[') { tokens.push({ type: 'lbracket', text: '[', start: i, end: i + 1 }); i++; continue; }
    if (c === ']') { tokens.push({ type: 'rbracket', text: ']', start: i, end: i + 1 }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', text: ',', start: i, end: i + 1 }); i++; continue; }
    if (c === '"') {
      let j = i + 1;
      while (j < end && text[j] !== '"') { if (text[j] === '\\') j++; j++; }
      const closeAt = Math.min(j + 1, end);
      tokens.push({ type: 'string', text: text.slice(i, closeAt), start: i, end: closeAt });
      i = closeAt;
      continue;
    }
    if (OPERATOR_CHARS.has(c)) {
      let matched = '';
      for (const op of OPERATOR_SYMBOLS_BY_LENGTH) {
        if (op.length > matched.length && op.length <= end - i && text.startsWith(op, i)) matched = op;
      }
      if (!matched) matched = c; // an operator being typed one character at a time (e.g. just "!")
      tokens.push({ type: 'op', text: matched, start: i, end: i + matched.length });
      i += matched.length;
      continue;
    }
    let j = i;
    while (j < end && !/\s/.test(text[j]) && !'()[],"'.includes(text[j]) && !OPERATOR_CHARS.has(text[j])) j++;
    if (j === i) { i++; continue; } // defensive: skip a stray character rather than looping forever
    tokens.push({ type: 'word', text: text.slice(i, j), start: i, end: j });
    i = j;
  }
  return tokens;
}

function stripLeadingDash(word: string): string {
  return word.startsWith('-') ? word.slice(1) : word;
}

/** True once the cursor is positioned inside an unclosed `[` — list-literal value editing isn't
 *  suggestion-aware, same conservative bail-out the old colon-based version had. */
function isInsideBrackets(tokens: MiniToken[]): boolean {
  let depth = 0;
  for (let k = tokens.length - 1; k >= 0; k--) {
    if (tokens[k].type === 'rbracket') depth++;
    else if (tokens[k].type === 'lbracket') {
      if (depth === 0) return true;
      depth--;
    }
  }
  return false;
}

/**
 * `{{...}}` is a {@code MessagingTemplate.render} placeholder — the whole AQL string is templated
 * against the run context *before* it's parsed (see {@code WorkflowRunService}'s countByAql/
 * runAssignVariableSource/executeConditionEntityMatch call sites), so it's valid anywhere in the
 * text, including inside a quoted string value (e.g. {@code identifier == "{{variables.host}}"}).
 * Checked first, ahead of the real tokenizer, for exactly that reason — it must still fire where
 * the tokenizer-based logic below deliberately bails out (quoted strings, list literals).
 * Returns {@code null} (not `[]`) when the cursor isn't inside an unclosed `{{`, so the caller can
 * tell "no open placeholder" apart from "open placeholder, nothing matches yet".
 */
function suggestVariables(text: string, cursor: number, variables: AqlVariableRef[]): AqlSuggestion[] | null {
  const upTo = text.slice(0, cursor);
  const openIdx = upTo.lastIndexOf('{{');
  if (openIdx === -1) return null;
  const closeIdx = upTo.lastIndexOf('}}');
  if (closeIdx > openIdx) return null; // already closed before the cursor — not inside a placeholder

  const replaceFrom = openIdx + 2;
  const typed = upTo.slice(replaceFrom).toLowerCase();
  const suggestions: AqlSuggestion[] = [];
  for (const v of variables) {
    if (typed.length > 0 && !v.ref.toLowerCase().includes(typed)) continue;
    suggestions.push({
      kind: 'variable', label: v.ref, detail: v.type ?? v.label,
      insertText: v.ref + '}}',
      replaceFrom, replaceTo: cursor,
      cursorAfter: replaceFrom + v.ref.length + 2,
    });
  }
  return suggestions.slice(0, 30);
}

const ITERATION_VARIABLE_NAMES = new Set(['current_iteration_start', 'current_iteration_end']);

// Ordered to put the names the AQL context-variables spec calls out explicitly first (days,
// hours, iterations), then the rest of the s/m/h/d/w/M/y family AqlDateLiterals already supports.
const OFFSET_UNIT_INFO: { letter: string; label: string; iterationOnly?: boolean }[] = [
  { letter: 'd', label: 'days' },
  { letter: 'h', label: 'hours' },
  { letter: 'i', label: 'iterations', iterationOnly: true },
  { letter: 'w', label: 'weeks' },
  { letter: 'M', label: 'months' },
  { letter: 'y', label: 'years' },
  { letter: 'm', label: 'minutes' },
  { letter: 's', label: 'seconds' },
];

/**
 * Detects the cursor sitting immediately after a just-referenced `{{variable}}` DATE-anchor
 * expression — `{{now}}`, `{{now}}-`, `{{now}}-7`, `{{now}}-7d` — and drives the rest of the
 * `{{var}}±N<unit>` build: offer the `+`/`-` operator right after the variable closes; once a sign
 * is typed, offer nothing (the amount is free-typed, never suggested, per the AQL context-
 * variables spec); once at least one digit follows, offer unit-letter completions (`i` —
 * iterations — only for the two iteration anchors, never for `now`).
 *
 * Returns `null` when the text immediately before the cursor doesn't have this shape at all (the
 * caller falls through to ordinary field/operator/value suggestions), and a — possibly empty —
 * array whenever it does; an empty array means "recognized this context, nothing to suggest right
 * now" (mid-digit-typing), which is distinct from "not in this context" and must not fall through.
 */
function suggestVariableOffset(text: string, cursor: number, variables: AqlVariableRef[]): AqlSuggestion[] | null {
  const upTo = text.slice(0, cursor);
  const m = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}([+-]?)(\d*)([a-zA-Z]*)$/.exec(upTo);
  if (!m) return null;
  const [, rawName, sign, digits, unitTyped] = m;
  const name = rawName.toLowerCase();
  const ref = variables.find((v) => v.ref.toLowerCase() === name);
  if (!ref || ref.type !== 'date') return null; // unknown, or a duration variable (no offset of its own)

  if (!sign) {
    return (['-', '+'] as const).map((s) => ({
      kind: 'operator',
      label: s,
      detail: s === '-' ? 'earlier' : 'later',
      insertText: s,
      replaceFrom: cursor,
      replaceTo: cursor,
      cursorAfter: cursor + 1,
    }));
  }

  if (digits.length === 0) return []; // amount is free-typed, never suggested

  const replaceFrom = cursor - unitTyped.length;
  const isIterationVar = ITERATION_VARIABLE_NAMES.has(name);
  const suggestions: AqlSuggestion[] = [];
  for (const u of OFFSET_UNIT_INFO) {
    if (u.iterationOnly && !isIterationVar) continue;
    if (unitTyped.length > 0 && !u.letter.toLowerCase().startsWith(unitTyped.toLowerCase())) continue;
    suggestions.push({
      kind: 'value',
      label: u.letter,
      detail: u.label,
      insertText: u.letter,
      replaceFrom,
      replaceTo: cursor,
      cursorAfter: replaceFrom + u.letter.length,
    });
  }
  return suggestions;
}

/**
 * Computes autocomplete suggestions for the AQL text at the given cursor position: field names
 * and AND/OR/NOT keywords when starting a new clause, comparison operators once a known field
 * name is complete, values (allowedValues, or true/false for booleans) once a comparison operator
 * is complete, and (checked first — see {@link suggestVariables}) `{{...}}` context-variable
 * references anywhere in the text, followed by their own `±N<unit>` offset build-out (see {@link
 * suggestVariableOffset}) once a variable reference has just closed. Otherwise deliberately
 * conservative: bails out inside list literals (`[...]`) and quoted strings, where cursor-aware
 * completion would need real nested tokenization to not produce nonsense.
 */
export function computeAqlSuggestions(
  text: string, cursor: number, fields: AqlFieldInfo[], variables: AqlVariableRef[] = [],
): AqlSuggestion[] {
  const variableSuggestions = suggestVariables(text, cursor, variables);
  if (variableSuggestions !== null) return variableSuggestions;

  const offsetSuggestions = suggestVariableOffset(text, cursor, variables);
  if (offsetSuggestions !== null) return offsetSuggestions;

  const tokens = tokenizeUpTo(text, cursor);
  const last = tokens[tokens.length - 1];
  const current = last && last.end === cursor ? last : null;
  const contextTokens = current ? tokens.slice(0, -1) : tokens;

  if (current?.type === 'string') return []; // typing inside a quoted literal — free text, no suggestions
  if (isInsideBrackets(contextTokens)) return [];

  const prevToken = contextTokens[contextTokens.length - 1];
  const prevPrevToken = contextTokens[contextTokens.length - 2];

  // ── "field OP <cursor>": suggest values ─────────────────────────────────────────────────
  if ((current === null || current.type === 'word')
    && prevToken?.type === 'op' && VALID_OPERATOR_SYMBOLS.has(prevToken.text)
    && prevPrevToken?.type === 'word') {
    const field = fields.find((f) => f.name === stripLeadingDash(prevPrevToken.text));
    if (field) {
      const typed = current?.type === 'word' ? current.text : '';
      return suggestValues(field, typed, current, cursor, variables);
    }
  }

  // ── "field <cursor>" (nothing typed yet): suggest operators ─────────────────────────────
  if (current === null && prevToken?.type === 'word') {
    const field = fields.find((f) => f.name === stripLeadingDash(prevToken.text));
    if (field) return suggestOperators(field, '', cursor, cursor);
  }

  // ── mid-operator ("field <cursor-being-typed>"): suggest operator completions ───────────
  if (current?.type === 'op' && prevToken?.type === 'word') {
    const field = fields.find((f) => f.name === stripLeadingDash(prevToken.text));
    if (field) return suggestOperators(field, current.text, current.start, cursor);
  }
  if (current?.type === 'op') return []; // operator typed with no preceding field — nothing sensible to suggest

  // ── otherwise: starting a new clause — suggest field names / AND / OR / NOT ─────────────
  return suggestFieldsAndKeywords(fields, current, contextTokens, cursor);
}

function suggestFieldsAndKeywords(
  fields: AqlFieldInfo[], current: MiniToken | null, contextTokens: MiniToken[], cursor: number,
): AqlSuggestion[] {
  const raw = current?.type === 'word' ? current.text : '';
  const dashLen = raw.startsWith('-') ? 1 : 0;
  const prefix = raw.slice(dashLen).toLowerCase();
  const replaceFrom = current ? current.start + dashLen : cursor;

  const atExpressionStart = contextTokens.length === 0
    || contextTokens[contextTokens.length - 1].type === 'lparen';

  const suggestions: AqlSuggestion[] = [];
  for (const kw of LOGICAL_KEYWORDS) {
    if (kw === 'NOT') {
      if (!atExpressionStart && prefix.length === 0) continue;
    } else if (atExpressionStart) {
      continue; // AND/OR make no sense as the very first token
    }
    if (prefix.length > 0 && !kw.toLowerCase().startsWith(prefix)) continue;
    suggestions.push({
      kind: 'keyword', label: kw,
      insertText: kw + ' ',
      replaceFrom, replaceTo: cursor,
      cursorAfter: replaceFrom + kw.length + 1,
    });
  }
  for (const f of fields) {
    if (prefix.length > 0 && !f.name.toLowerCase().includes(prefix)) continue;
    suggestions.push({
      kind: 'field', label: f.name, detail: f.type.toLowerCase(),
      insertText: f.name + ' ',
      replaceFrom, replaceTo: cursor,
      cursorAfter: replaceFrom + f.name.length + 1,
    });
  }
  return suggestions.slice(0, 30);
}

function suggestOperators(field: AqlFieldInfo, typed: string, replaceFrom: number, cursor: number): AqlSuggestion[] {
  const suggestions: AqlSuggestion[] = [];
  for (const info of OPERATOR_INFO) {
    if (!field.operators.includes(info.opName)) continue;
    if (typed.length > 0 && !info.symbol.startsWith(typed)) continue;
    suggestions.push({
      kind: 'operator', label: info.symbol, detail: info.label,
      insertText: info.symbol + ' ',
      replaceFrom, replaceTo: cursor,
      cursorAfter: replaceFrom + info.symbol.length + 1,
    });
  }
  return suggestions;
}

// Curated starting points for DATE fields' dynamic "now" family (now, now-Nd, now+Nd, ...) —
// free typing anything else (e.g. an ISO date, or a different unit/amount) still works, this
// just surfaces the most common relative offsets so users discover the syntax exists at all.
const DATE_VALUE_SUGGESTIONS = ['now', 'now-1h', 'now-1d', 'now-7d', 'now-30d', 'now+1d', 'now+7d'];

/** For a DATE field, `{{variable}}` suggestions are offered proactively here — the moment the
 *  cursor reaches the value slot, same as the plain `now`/`now-7d` literals already were, no need
 *  to type `{{` first to discover they exist (typing `{{` manually still works too, via {@link
 *  suggestVariables}). Deliberately no trailing space on the inserted text (unlike every other
 *  value suggestion here) — the cursor must land immediately after `}}` for {@link
 *  suggestVariableOffset} to recognize "a variable reference just closed" and offer the next
 *  `±N<unit>` build-out stage; a trailing space would break that detection. */
function suggestValues(
  field: AqlFieldInfo, typed: string, current: MiniToken | null, cursor: number, variables: AqlVariableRef[],
): AqlSuggestion[] {
  const prefix = typed.toLowerCase();
  const replaceFrom = current ? current.start : cursor;
  const suggestions: AqlSuggestion[] = [];

  if (field.type === 'DATE') {
    for (const v of variables) {
      if (v.type !== 'date') continue; // duration variables (SLA periods) aren't standalone date values
      if (prefix.length > 0 && !v.ref.toLowerCase().startsWith(prefix)) continue;
      const insertText = `{{${v.ref}}}`;
      suggestions.push({
        kind: 'variable', label: insertText, detail: v.label,
        insertText,
        replaceFrom, replaceTo: cursor,
        cursorAfter: replaceFrom + insertText.length,
      });
    }
  }

  const candidates = field.type === 'BOOLEAN' ? ['true', 'false']
    : field.type === 'DATE' ? DATE_VALUE_SUGGESTIONS
    : field.allowedValues;
  for (const v of candidates) {
    if (prefix.length > 0 && !v.toLowerCase().startsWith(prefix)) continue;
    suggestions.push({
      kind: 'value', label: v,
      insertText: v + ' ',
      replaceFrom, replaceTo: cursor,
      cursorAfter: replaceFrom + v.length + 1,
    });
  }
  return suggestions;
}

export function applyAqlSuggestion(text: string, suggestion: AqlSuggestion): { text: string; cursor: number } {
  const newText = text.slice(0, suggestion.replaceFrom) + suggestion.insertText + text.slice(suggestion.replaceTo);
  return { text: newText, cursor: suggestion.cursorAfter };
}
