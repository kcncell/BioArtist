/**
 * Shared text styling helpers used by Properties panel and floating toolbar.
 * Keeps both UIs applying the same Fabric mutations.
 */
import type { IText, Textbox } from 'fabric';
import { getCanvas } from './canvasController';
import type { SelectionProps } from '../types';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Bullet glyph styles (prefix on each line). */
export type BulletStyle = 'disc' | 'circle' | 'square' | 'filled-square';

export type ScriptMode = 'none' | 'super' | 'sub';

export const BULLET_STYLES: {
  id: BulletStyle;
  char: string;
  label: string;
}[] = [
  { id: 'disc', char: '•', label: 'Filled circle' },
  { id: 'circle', char: '○', label: 'Empty circle' },
  { id: 'square', char: '□', label: 'Empty square' },
  { id: 'filled-square', char: '■', label: 'Filled square' },
];

const BULLET_LINE_RE = /^(\s*)([•○□■])\s?/;
/** Numbered markers as plain text so users can edit "3." → "7." freely. */
const NUMBER_LINE_RE = /^(\s*)(\d+)([.)])(\s+)/;
const NEST_INDENT = '  '; // 2 spaces per nest level
/** Default numbered marker punctuation (editable as part of the text). */
const NUMBER_PUNCT = '.';

type TextObj = IText | Textbox;

function isTextObject(obj: unknown): obj is TextObj {
  if (!obj || typeof obj !== 'object') return false;
  const t = String((obj as { type?: string }).type || '').toLowerCase();
  return t === 'i-text' || t === 'textbox' || t === 'text';
}

function activeTextObjects(): TextObj[] {
  const canvas = getCanvas();
  if (!canvas) return [];
  return canvas.getActiveObjects().filter(isTextObject);
}

function notifyAndHistory() {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.requestRenderAll();
  const target = canvas.getActiveObject();
  if (target) {
    canvas.fire('object:modified', { target });
  }
}

/**
 * Character-level styles (when editing with a highlight).
 * Object-only props (align, lineHeight) always apply to the whole object.
 */
function applyCharOrObject(style: Record<string, unknown>) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = activeTextObjects();
  if (!objs.length) return;

  objs.forEach((obj) => {
    const editing = !!(obj as IText).isEditing;
    const start = (obj as IText).selectionStart ?? 0;
    const end = (obj as IText).selectionEnd ?? 0;
    if (editing && end > start && typeof (obj as IText).setSelectionStyles === 'function') {
      (obj as IText).setSelectionStyles(style, start, end);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj as any).set(style);
      if (typeof (obj as Textbox).initDimensions === 'function') {
        (obj as Textbox).initDimensions();
      }
    }
    obj.setCoords();
    obj.dirty = true;
  });
  notifyAndHistory();
}

function applyObjectOnly(style: Record<string, unknown>) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = activeTextObjects();
  if (!objs.length) return;
  objs.forEach((obj) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (obj as any).set(style);
    if (typeof (obj as Textbox).initDimensions === 'function') {
      (obj as Textbox).initDimensions();
    }
    obj.setCoords();
    obj.dirty = true;
  });
  notifyAndHistory();
}

export function applyTextAlign(align: TextAlign) {
  applyObjectOnly({ textAlign: align });
}

export function applyFontFamily(fontFamily: string) {
  applyCharOrObject({ fontFamily });
}

export function applyFontSize(fontSize: number) {
  const size = Math.max(8, Math.min(200, Math.round(fontSize)));
  applyCharOrObject({ fontSize: size });
}

export function applyFontWeight(fontWeight: 'normal' | 'bold' | number) {
  applyCharOrObject({ fontWeight });
}

export function applyFontStyle(fontStyle: 'normal' | 'italic') {
  applyCharOrObject({ fontStyle });
}

export function applyUnderline(underline: boolean) {
  applyCharOrObject({ underline });
}

export function applyLinethrough(linethrough: boolean) {
  applyCharOrObject({ linethrough });
}

export function applyTextFill(fill: string) {
  applyCharOrObject({ fill });
}

/** Line spacing (Fabric lineHeight multiplier). Clamped 0–2, step 0.1. */
export function applyLineSpacing(lineHeight: number) {
  applyObjectOnly({ lineHeight: clampLineSpacing(lineHeight) });
}

/** @deprecated use applyLineSpacing */
export function applyLineHeight(lineHeight: number) {
  applyLineSpacing(lineHeight);
}

export function clampLineSpacing(v: number): number {
  if (!Number.isFinite(v)) return 1.16;
  const stepped = Math.round(v * 10) / 10;
  return Math.max(0, Math.min(2, stepped));
}

/** @deprecated use clampLineSpacing */
export function clampLineHeight(v: number): number {
  return clampLineSpacing(v);
}

// ── Super / subscript ──────────────────────────────────────────────────────

function baseFontSize(obj: TextObj): number {
  return typeof obj.fontSize === 'number' && obj.fontSize > 0 ? obj.fontSize : 20;
}

/**
 * Apply superscript / subscript / normal to the selection (or whole object).
 * Uses smaller fontSize + deltaY (Fabric char styles).
 */
export function applyScript(mode: ScriptMode) {
  const canvas = getCanvas();
  if (!canvas) return;
  const objs = activeTextObjects();
  if (!objs.length) return;

  objs.forEach((obj) => {
    const base = baseFontSize(obj);
    const small = Math.max(8, Math.round(base * 0.62));
    let style: Record<string, unknown>;
    if (mode === 'super') {
      style = { fontSize: small, deltaY: -Math.round(base * 0.32) };
    } else if (mode === 'sub') {
      style = { fontSize: small, deltaY: Math.round(base * 0.18) };
    } else {
      style = { fontSize: base, deltaY: 0 };
    }

    const editing = !!(obj as IText).isEditing;
    const start = (obj as IText).selectionStart ?? 0;
    const end = (obj as IText).selectionEnd ?? 0;
    if (editing && end > start && typeof (obj as IText).setSelectionStyles === 'function') {
      (obj as IText).setSelectionStyles(style, start, end);
    } else if (editing && typeof (obj as IText).setSelectionStyles === 'function') {
      // Caret only — style next typed chars via selection of zero? Apply to whole object
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj as any).set(style);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj as any).set(style);
      if (typeof (obj as Textbox).initDimensions === 'function') {
        (obj as Textbox).initDimensions();
      }
    }
    obj.setCoords();
    obj.dirty = true;
  });
  notifyAndHistory();
}

export function toggleScript(mode: 'super' | 'sub') {
  const current = detectScriptMode();
  applyScript(current === mode ? 'none' : mode);
}

/** Best-effort detect super/sub from selection or object. */
export function detectScriptMode(obj?: TextObj | null): ScriptMode {
  const canvas = getCanvas();
  const target = obj || (canvas?.getActiveObject() as TextObj | undefined);
  if (!target || !isTextObject(target)) return 'none';
  try {
    const it = target as IText;
    let deltaY = 0;
    let fontSize = baseFontSize(target);
    if (it.isEditing && typeof it.getSelectionStyles === 'function') {
      const start = it.selectionStart ?? 0;
      const end = Math.max(start + 1, it.selectionEnd ?? start);
      const styles = it.getSelectionStyles(start, end) || [];
      const s = styles[0] as { deltaY?: number; fontSize?: number } | undefined;
      if (s) {
        if (typeof s.deltaY === 'number') deltaY = s.deltaY;
        if (typeof s.fontSize === 'number') fontSize = s.fontSize;
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const any = target as any;
      if (typeof any.deltaY === 'number') deltaY = any.deltaY;
    }
    const base = baseFontSize(target);
    if (deltaY < -1 || (fontSize < base * 0.85 && deltaY < 0)) return 'super';
    if (deltaY > 1 || (fontSize < base * 0.85 && deltaY > 0)) return 'sub';
  } catch {
    /* ignore */
  }
  return 'none';
}

// ── Bullets & numbered lists ───────────────────────────────────────────────
// Markers are plain text prefixes (• / 1. ) so users can edit them in place.
// Auto-number runs only when applying or re-numbering — never on every keystroke.

function styleFromChar(ch: string): BulletStyle {
  const hit = BULLET_STYLES.find((b) => b.char === ch);
  return hit?.id || 'disc';
}

function charFromStyle(style: BulletStyle): string {
  return BULLET_STYLES.find((b) => b.id === style)?.char || '•';
}

function lineHasBullet(line: string): boolean {
  return BULLET_LINE_RE.test(line);
}

function lineHasNumber(line: string): boolean {
  return NUMBER_LINE_RE.test(line);
}

function lineHasListMarker(line: string): boolean {
  return lineHasBullet(line) || lineHasNumber(line);
}

function stripBullet(line: string): string {
  return line.replace(BULLET_LINE_RE, '$1');
}

function stripNumber(line: string): string {
  return line.replace(NUMBER_LINE_RE, '$1');
}

/** Strip any list marker (bullet or number), keep indent. */
function stripListMarker(line: string): string {
  if (lineHasBullet(line)) return stripBullet(line);
  if (lineHasNumber(line)) return stripNumber(line);
  return line;
}

function getLineIndent(line: string): string {
  const stripped = stripListMarker(line);
  const m = stripped.match(/^(\s*)/);
  return m?.[1] ?? '';
}

function lineBody(line: string): string {
  return stripListMarker(line).replace(/^\s*/, '');
}

function setLineBullet(line: string, style: BulletStyle): string {
  if (!line.trim()) return line;
  const indent = getLineIndent(line);
  const body = lineBody(line);
  return `${indent}${charFromStyle(style)} ${body}`;
}

function setLineNumber(line: string, n: number, punct = NUMBER_PUNCT): string {
  if (!line.trim()) return line;
  const indent = getLineIndent(line);
  const body = lineBody(line);
  return `${indent}${n}${punct} ${body}`;
}

export function textHasBullets(text: string | undefined | null): boolean {
  if (!text) return false;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return false;
  return lines.every(lineHasBullet);
}

export function textHasNumbers(text: string | undefined | null): boolean {
  if (!text) return false;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return false;
  return lines.every(lineHasNumber);
}

/** Dominant bullet style on non-empty lines, or null if none. */
export function detectBulletStyle(text: string | undefined | null): BulletStyle | null {
  if (!text) return null;
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (!lines.length) return null;
  const styles: BulletStyle[] = [];
  for (const line of lines) {
    const m = line.match(BULLET_LINE_RE);
    if (!m) return null;
    styles.push(styleFromChar(m[2]));
  }
  return styles[0] || null;
}

function rewriteText(obj: TextObj, next: string) {
  obj.set('text', next);
  if (typeof (obj as Textbox).initDimensions === 'function') {
    (obj as Textbox).initDimensions();
  }
  if ((obj as IText).isEditing) {
    const len = next.length;
    (obj as IText).selectionStart = Math.min((obj as IText).selectionStart ?? 0, len);
    (obj as IText).selectionEnd = Math.min((obj as IText).selectionEnd ?? 0, len);
  }
  obj.setCoords();
  obj.dirty = true;
}

/**
 * Auto-number non-empty lines 1…n (preserves indent). Empty lines stay empty.
 * Does not run on typing — only when user applies numbered list or clicks Renumber.
 */
function autoNumberLines(lines: string[]): string[] {
  let n = 0;
  return lines.map((l) => {
    if (!l.trim()) return l;
    n += 1;
    return setLineNumber(l, n);
  });
}

/**
 * Toggle bullets. If already bulleted with the same style → strip.
 * If bulleted with another style → convert. If plain/numbered → add style.
 */
export function toggleBullets(style: BulletStyle = 'disc'): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = activeTextObjects();
  if (!objs.length) return false;

  objs.forEach((obj) => {
    const text = obj.text ?? '';
    const lines = text.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allBulleted = nonEmpty.length > 0 && nonEmpty.every(lineHasBullet);
    const current = detectBulletStyle(text);
    let next: string;
    if (allBulleted && current === style) {
      next = lines.map(stripListMarker).join('\n');
    } else {
      next = lines.map((l) => setLineBullet(l, style)).join('\n');
    }
    rewriteText(obj, next);
  });
  notifyAndHistory();
  return true;
}

/**
 * Toggle numbered list. Auto-sequences 1. 2. 3. when applying.
 * Markers are plain text — double-click a number and type a different value anytime.
 * Toggle off when already fully numbered.
 */
export function toggleNumberedList(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = activeTextObjects();
  if (!objs.length) return false;

  objs.forEach((obj) => {
    const text = obj.text ?? '';
    const lines = text.split('\n');
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    const allNumbered = nonEmpty.length > 0 && nonEmpty.every(lineHasNumber);
    const next = allNumbered
      ? lines.map(stripListMarker).join('\n')
      : autoNumberLines(lines).join('\n');
    rewriteText(obj, next);
  });
  notifyAndHistory();
  return true;
}

/**
 * Re-apply sequential 1…n on non-empty lines (fixes manual edits if desired).
 * Empty lines stay blank. Indent + body preserved.
 */
export function renumberList(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = activeTextObjects();
  if (!objs.length) return false;

  objs.forEach((obj) => {
    const lines = (obj.text ?? '').split('\n');
    // Only renumber if there is at least one list-like or plain content line
    const next = autoNumberLines(lines).join('\n');
    rewriteText(obj, next);
  });
  notifyAndHistory();
  return true;
}

/** Convert existing bullets (or apply) to a style without toggling off. */
export function setBulletStyle(style: BulletStyle): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = activeTextObjects();
  if (!objs.length) return false;
  objs.forEach((obj) => {
    const lines = (obj.text ?? '').split('\n');
    const next = lines.map((l) => setLineBullet(l, style)).join('\n');
    rewriteText(obj, next);
  });
  notifyAndHistory();
  return true;
}

/** Nest deeper: add indent (keeps bullet/number marker). */
export function nestBulletIn(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = activeTextObjects();
  if (!objs.length) return false;
  objs.forEach((obj) => {
    const lines = (obj.text ?? '').split('\n');
    const next = lines
      .map((l) => {
        if (!l.trim()) return l;
        // Keep existing marker; if none, add disc
        const withMarker = lineHasListMarker(l) ? l : setLineBullet(l, 'disc');
        return NEST_INDENT + withMarker;
      })
      .join('\n');
    rewriteText(obj, next);
  });
  notifyAndHistory();
  return true;
}

/** Nest shallower: remove one indent level (2 spaces). */
export function nestBulletOut(): boolean {
  const canvas = getCanvas();
  if (!canvas) return false;
  const objs = activeTextObjects();
  if (!objs.length) return false;
  objs.forEach((obj) => {
    const lines = (obj.text ?? '').split('\n');
    const next = lines
      .map((l) => {
        if (l.startsWith(NEST_INDENT)) return l.slice(NEST_INDENT.length);
        if (l.startsWith(' ')) return l.replace(/^ +/, (s) => s.slice(Math.min(2, s.length)));
        return l;
      })
      .join('\n');
    rewriteText(obj, next);
  });
  notifyAndHistory();
  return true;
}

export function isBoldWeight(w: string | number | undefined): boolean {
  return w === 'bold' || w === 700 || w === '700';
}

export type TextToolbarProps = Pick<
  SelectionProps,
  | 'fontSize'
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'underline'
  | 'linethrough'
  | 'textAlign'
  | 'lineHeight'
  | 'fill'
  | 'hasBullets'
  | 'hasNumbers'
  | 'bulletStyle'
  | 'scriptMode'
  | 'isText'
  | 'isTextBox'
>;
