/**
 * Lightweight Excalidraw scene JSON → SVG for placing on the BioArtist canvas.
 * Supports common shapes (rect, ellipse, diamond, text, line, arrow).
 * Also accepts raw SVG markup pasted by the user / AI.
 */
import { addImageFromDataUrl, addSvgToCanvas } from './canvasController';
import { ensureValidSvgDocument } from './svgImport';

type ExPoint = readonly [number, number];

type ExElement = {
  type?: string;
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: number | string;
  textAlign?: string;
  verticalAlign?: string;
  lineHeight?: number;
  containerId?: string | null;
  points?: ExPoint[];
  isDeleted?: boolean;
  roundness?: { type: number } | null;
  fileId?: string;
};

type ExFile = {
  mimeType?: string;
  id?: string;
  dataURL?: string;
};

type ExScene = {
  type?: string;
  version?: number;
  elements?: ExElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, ExFile>;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSvgMarkup(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith('<svg') || (t.startsWith('<?xml') && t.includes('<svg'));
}

/**
 * Parse JSON from AI replies that may include prose, markdown fences,
 * or multiple code blocks (common with Gemini / ChatGPT).
 */
function parseMaybeJson(raw: string): unknown {
  let t = raw.trim();

  // Prefer fenced ```json / ```excalidraw blocks (last match often has the scene)
  const fences = [...t.matchAll(/```(?:json|excalidraw)?\s*([\s\S]*?)```/gi)];
  if (fences.length) {
    for (let i = fences.length - 1; i >= 0; i--) {
      const body = fences[i][1].trim();
      try {
        const parsed = JSON.parse(body);
        if (extractElements(parsed).length) return parsed;
      } catch {
        /* try earlier fence / other strategies */
      }
    }
  }

  // Direct JSON
  if (t.startsWith('{') || t.startsWith('[')) {
    return JSON.parse(t);
  }

  // Prose + JSON: find an object that contains "elements"
  const marker = t.search(/\{\s*"(?:type|elements|version)"\s*:/);
  if (marker >= 0) {
    const slice = t.slice(marker);
    // Brace-match a JSON object
    let depth = 0;
    let end = -1;
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > 0) {
      return JSON.parse(slice.slice(0, end));
    }
  }

  return JSON.parse(t);
}

function extractElements(data: unknown): ExElement[] {
  if (!data || typeof data !== 'object') return [];
  // Clipboard paste: { type: "excalidraw/clipboard", elements, files }
  // File export: { type: "excalidraw", elements, files }
  const o = data as ExScene & { elements?: ExElement[] };
  if (Array.isArray(o.elements)) return o.elements;
  // Nested: { data: { elements } } or { scene: { elements } }
  for (const key of ['data', 'scene', 'drawing', 'payload'] as const) {
    const nested = (o as Record<string, unknown>)[key];
    if (nested && typeof nested === 'object' && Array.isArray((nested as ExScene).elements)) {
      return (nested as ExScene).elements || [];
    }
  }
  // Clipboard paste sometimes is just the elements array
  if (Array.isArray(data)) return data as ExElement[];
  return [];
}

function extractFiles(data: unknown): Record<string, ExFile> {
  if (!data || typeof data !== 'object') return {};
  const o = data as ExScene & Record<string, unknown>;
  if (o.files && typeof o.files === 'object') return o.files as Record<string, ExFile>;
  for (const key of ['data', 'scene', 'drawing', 'payload'] as const) {
    const nested = o[key];
    if (nested && typeof nested === 'object' && (nested as ExScene).files) {
      return (nested as ExScene).files || {};
    }
  }
  return {};
}

/** Find data:image/… URLs anywhere in a paste (Gemini often dumps them outside files{}). */
function extractDataUrlsFromText(raw: string): string[] {
  const out: string[] = [];
  const re = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const url = m[0].replace(/\s+/g, '');
    if (url.length > 64 && !out.includes(url)) out.push(url);
  }
  return out;
}

/**
 * Attach orphaned base64 images from the paste text to image elements that
 * lack files{}.dataURL (common Gemini habit: preview picture + empty files).
 */
function hydrateMissingImageFiles(data: unknown, raw: string): unknown {
  if (!data || typeof data !== 'object') return data;
  const elements = extractElements(data);
  const files = { ...extractFiles(data) };
  const missing = elements.filter((el) => {
    if (el.isDeleted) return false;
    if ((el.type || '').toLowerCase() !== 'image') return false;
    const id = el.fileId || '';
    return !id || !files[id]?.dataURL;
  });
  if (!missing.length) return data;

  const orphans = extractDataUrlsFromText(raw).filter((url) => {
    for (const f of Object.values(files)) {
      if (f?.dataURL && f.dataURL.replace(/\s+/g, '') === url) return false;
    }
    return true;
  });
  if (!orphans.length) return data;

  let oi = 0;
  for (const el of missing) {
    if (oi >= orphans.length) break;
    const id = el.fileId || `ba-hydrated-${oi}`;
    if (!el.fileId) el.fileId = id;
    const url = orphans[oi++];
    const mime = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);/)?.[1] || 'image/png';
    files[id] = { id, mimeType: mime, dataURL: url };
  }

  const root = data as ExScene & Record<string, unknown>;
  if (root.files && typeof root.files === 'object') {
    return { ...root, files };
  }
  return { ...root, files };
}

/** Count image elements that cannot be drawn (no embedded file data). */
export function countMissingExcalidrawImages(data: unknown): number {
  const elements = extractElements(data);
  const files = extractFiles(data);
  let n = 0;
  for (const el of elements) {
    if (el.isDeleted) continue;
    if ((el.type || '').toLowerCase() !== 'image') continue;
    const id = el.fileId || '';
    if (!id || !files[id]?.dataURL) n++;
  }
  return n;
}

/** Scene mentions DNA / helix (labels or file ids) — use geometric helix fallback. */
function sceneWantsDna(elements: ExElement[], el: ExElement): boolean {
  const idBlob = `${el.id || ''} ${el.fileId || ''}`.toLowerCase();
  if (/dna|helix|double.?strand|nucleic/.test(idBlob)) return true;
  const labelBlob = elements
    .filter((e) => !e.isDeleted && (e.type || '').toLowerCase() === 'text')
    .map((e) => e.text || '')
    .join(' ');
  if (/dna|helix|genome|nucleic|chromatin/i.test(labelBlob)) return true;
  // Pathway-style: single missing clip-art among signaling labels → DNA node
  const images = elements.filter(
    (e) => !e.isDeleted && (e.type || '').toLowerCase() === 'image',
  );
  return (
    images.length === 1 &&
    /ligand|receptor|kinase|transcription|pathway|signal|cascade/i.test(labelBlob)
  );
}

/**
 * Simple publication-style double helix (two sine strands + base-pair rungs).
 * Used when Gemini referenced a DNA picture but left files{} empty.
 */
/**
 * Publication-style double helix (two sine strands + base-pair rungs).
 * `framed`: draw a soft card behind (missing-image placeholder).
 * Otherwise draw helix only (overlay inside an existing DNA shape).
 */
function geometricDnaHelixSvg(
  w: number,
  h: number,
  opts?: { framed?: boolean; label?: boolean; horizontal?: boolean },
): string {
  const ww = Math.max(36, w);
  const hh = Math.max(36, h);
  const framed = opts?.framed ?? true;
  const showLabel = opts?.label ?? framed;
  const horizontal = opts?.horizontal ?? ww >= hh * 1.15;

  // Work in a local vertical-helix space, then rotate if the box is wide (pathway DNA node).
  const lw = horizontal ? hh : ww;
  const lh = horizontal ? ww : hh;
  const padY = lh * 0.1;
  const cx = lw / 2;
  const amp = Math.min(lw * 0.32, lh * 0.22);
  const turns = Math.max(2, Math.min(4.5, lh / 50));
  const steps = Math.max(28, Math.round(lh / 3));
  const y0 = padY;
  const y1 = lh - padY;

  const strand = (phase: number): string => {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = y0 + t * (y1 - y0);
      const x = cx + Math.sin(t * Math.PI * 2 * turns + phase) * amp;
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return pts.join(' ');
  };

  const rungs: string[] = [];
  const rungCount = Math.max(5, Math.round(turns * 4));
  for (let i = 0; i <= rungCount; i++) {
    const t = i / rungCount;
    const y = y0 + t * (y1 - y0);
    const x1 = cx + Math.sin(t * Math.PI * 2 * turns) * amp;
    const x2 = cx + Math.sin(t * Math.PI * 2 * turns + Math.PI) * amp;
    if (Math.abs(x1 - x2) < amp * 0.35) continue;
    rungs.push(
      `<line x1="${x1.toFixed(2)}" y1="${y.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#7C6BB5" stroke-width="1.5" stroke-linecap="round" opacity="0.85" />`,
    );
  }

  const helix = `
    <path d="${strand(0)}" fill="none" stroke="#6366F1" stroke-width="2.2" stroke-linecap="round" />
    <path d="${strand(Math.PI)}" fill="none" stroke="#A855F7" stroke-width="2.2" stroke-linecap="round" />
    ${rungs.join('\n')}
  `;

  const oriented = horizontal
    ? `<g transform="translate(${ww / 2} ${hh / 2}) rotate(-90) translate(${-lw / 2} ${-lh / 2})">${helix}</g>`
    : helix;

  const frame = framed
    ? `<rect x="0" y="0" width="${ww}" height="${hh}" fill="#F5F3FF" stroke="#C4B5FD" stroke-width="1" rx="8" ry="8" />`
    : '';
  const label = showLabel
    ? `<text x="${ww / 2}" y="${hh - 3}" text-anchor="middle" font-size="${Math.max(9, Math.min(11, ww / 12))}" fill="#64748B" font-family="system-ui, sans-serif">DNA</text>`
    : '';

  return `${frame}${oriented}${label}`.trim();
}

/** Approx. glyph width for system-ui / sans at this size (Excalidraw Virgil is similar). */
function estimateTextWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    if (ch === ' ') w += fontSize * 0.33;
    else if (/[iIlj1|']/.test(ch)) w += fontSize * 0.34;
    else if (/[mwMW@%]/.test(ch)) w += fontSize * 0.78;
    else if (ch === ch.toUpperCase() && /[A-Z]/.test(ch)) w += fontSize * 0.62;
    else w += fontSize * 0.55;
  }
  return w;
}

/**
 * Split on real newlines and literal "\\n", then word-wrap to maxWidth.
 */
function wrapTextLines(raw: string, maxWidth: number, fontSize: number): string[] {
  const normalized = (raw || '').replace(/\\n/g, '\n');
  const paragraphs = normalized.split(/\r?\n/);
  const out: string[] = [];
  const maxW = Math.max(fontSize * 2, maxWidth);

  for (const para of paragraphs) {
    const words = para.trim().length ? para.split(/\s+/) : [''];
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (line && estimateTextWidth(trial, fontSize) > maxW) {
        out.push(line);
        // Hard-break ultra-long tokens
        if (estimateTextWidth(word, fontSize) > maxW) {
          let chunk = '';
          for (const ch of word) {
            const t = chunk + ch;
            if (chunk && estimateTextWidth(t, fontSize) > maxW) {
              out.push(chunk);
              chunk = ch;
            } else chunk = t;
          }
          line = chunk;
        } else {
          line = word;
        }
      } else {
        line = trial;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

/** Shrink font until wrapped lines fit in box height (and single words fit width). */
function fitTextToBox(
  raw: string,
  boxW: number,
  boxH: number,
  preferredSize: number,
  lineHeight: number,
): { fontSize: number; lines: string[] } {
  const padX = Math.max(6, Math.min(14, boxW * 0.08));
  const padY = Math.max(4, Math.min(12, boxH * 0.1));
  const maxW = Math.max(12, boxW - padX * 2);
  const maxH = Math.max(12, boxH - padY * 2);
  let fontSize = preferredSize;
  let lines = wrapTextLines(raw, maxW, fontSize);

  for (let guard = 0; guard < 24; guard++) {
    const blockH = lines.length * fontSize * lineHeight;
    const widest = Math.max(0, ...lines.map((l) => estimateTextWidth(l, fontSize)));
    if (blockH <= maxH + 0.5 && widest <= maxW + 0.5) break;
    fontSize = Math.max(9, fontSize - 1);
    lines = wrapTextLines(raw, maxW, fontSize);
    if (fontSize <= 9) break;
  }
  return { fontSize, lines };
}

function usableTextBox(
  el: ExElement,
  allElements: ExElement[],
): { x: number; y: number; w: number; h: number; fromContainer: boolean } {
  const selfW = Math.abs(el.width ?? 0);
  const selfH = Math.abs(el.height ?? 0);
  const cid = el.containerId;
  if (cid) {
    const parent = allElements.find((e) => e.id === cid && !e.isDeleted);
    if (parent) {
      const pw = Math.abs(parent.width ?? 0);
      const ph = Math.abs(parent.height ?? 0);
      const pType = (parent.type || '').toLowerCase();
      // Diamonds/ellipses have less usable interior than their bbox
      const scale = pType === 'diamond' ? 0.62 : pType === 'ellipse' ? 0.78 : 0.9;
      const uw = pw * scale;
      const uh = ph * scale;
      return {
        x: (parent.x ?? 0) + (pw - uw) / 2,
        y: (parent.y ?? 0) + (ph - uh) / 2,
        w: uw,
        h: uh,
        fromContainer: true,
      };
    }
  }
  return {
    x: el.x ?? 0,
    y: el.y ?? 0,
    w: Math.max(selfW, 40),
    h: Math.max(selfH, (el.fontSize ?? 16) * 1.4),
    fromContainer: false,
  };
}

function isDnaShape(el: ExElement, allElements: ExElement[]): boolean {
  if (/dna|helix/i.test(`${el.id || ''} ${el.fileId || ''}`)) return true;
  // Nearby / bound label says DNA
  for (const t of allElements) {
    if (t.isDeleted || (t.type || '').toLowerCase() !== 'text') continue;
    if (!/^\s*dna\s*$/i.test(t.text || '') && !/dna|helix/i.test(t.text || '')) continue;
    if (t.containerId && t.containerId === el.id) return true;
    const tx = (t.x ?? 0) + (t.width ?? 0) / 2;
    const ty = (t.y ?? 0) + (t.height ?? 0) / 2;
    const ex = el.x ?? 0;
    const ey = el.y ?? 0;
    const ew = Math.abs(el.width ?? 0);
    const eh = Math.abs(el.height ?? 0);
    if (tx >= ex - 20 && tx <= ex + ew + 20 && ty >= ey - 40 && ty <= ey + eh + 40) {
      return true;
    }
  }
  return false;
}

/** True if text looks like Excalidraw scene or clipboard JSON. */
export function looksLikeExcalidrawJson(raw: string): boolean {
  const t = (raw || '').trim();
  if (t.length < 20) return false;
  // Strip markdown fences for detection
  let body = t;
  const fence = body.match(/^```(?:json|excalidraw)?\s*([\s\S]*?)```$/i);
  if (fence) body = fence[1].trim();
  if (!(body.startsWith('{') || body.startsWith('['))) return false;
  if (
    !/excalidraw/i.test(body) &&
    !/"elements"\s*:/.test(body) &&
    !/"type"\s*:\s*"rectangle"/.test(body)
  ) {
    return false;
  }
  try {
    const data = parseMaybeJson(body);
    return extractElements(data).length > 0;
  } catch {
    return false;
  }
}

function elementPath(el: ExElement): string {
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const type = (el.type || '').toLowerCase();

  if (type === 'ellipse') {
    return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.abs(w) / 2}" ry="${Math.abs(h) / 2}" />`;
  }
  if (type === 'diamond') {
    const pts = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
    return `<polygon points="${pts}" />`;
  }
  if (type === 'rectangle' || type === 'image' || type === 'frame' || type === 'magicframe') {
    const r = el.roundness ? Math.min(12, Math.min(Math.abs(w), Math.abs(h)) / 4) : 0;
    return `<rect x="0" y="0" width="${Math.abs(w)}" height="${Math.abs(h)}" rx="${r}" ry="${r}" />`;
  }
  return '';
}

function pointsPath(points: ExPoint[]): string {
  if (!points.length) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
    .join(' ');
}

function elementSvg(
  el: ExElement,
  files: Record<string, ExFile> = {},
  allElements: ExElement[] = [],
): string {
  if (el.isDeleted) return '';
  const type = (el.type || '').toLowerCase();
  const x = el.x ?? 0;
  const y = el.y ?? 0;
  const stroke = el.strokeColor || '#1e1e1e';
  const fillRaw = el.backgroundColor || 'transparent';
  const fill =
    !fillRaw || fillRaw === 'transparent' || el.fillStyle === 'hachure'
      ? 'none'
      : fillRaw;
  const sw = el.strokeWidth ?? 2;
  const opacity = (el.opacity ?? 100) / 100;
  const angle = el.angle ?? 0;
  const w = el.width ?? 0;
  const h = el.height ?? 0;
  const rot =
    angle && (w || h)
      ? ` rotate(${(angle * 180) / Math.PI} ${w / 2} ${h / 2})`
      : angle
        ? ` rotate(${(angle * 180) / Math.PI})`
        : '';

  const gOpen = `<g transform="translate(${x} ${y})${rot}" opacity="${opacity}">`;
  const gClose = '</g>';

  if (type === 'image') {
    const file = el.fileId ? files[el.fileId] : undefined;
    if (file?.dataURL) {
      const href = esc(file.dataURL);
      return `${gOpen}<image href="${href}" xlink:href="${href}" x="0" y="0" width="${Math.abs(w)}" height="${Math.abs(h)}" preserveAspectRatio="xMidYMid meet" />${gClose}`;
    }
    // Gemini/ChatGPT often emit image elements without embedding files{} —
    // draw a geometric DNA helix when the scene looks DNA-related, else a clear placeholder.
    const ww = Math.abs(w) || 80;
    const hh = Math.abs(h) || 80;
    if (sceneWantsDna(allElements, el)) {
      return `${gOpen}${geometricDnaHelixSvg(ww, hh)}${gClose}`;
    }
    return `${gOpen}
      <rect x="0" y="0" width="${ww}" height="${hh}" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="6 4" rx="6" ry="6" />
      <text x="${ww / 2}" y="${hh / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${Math.max(11, Math.min(14, ww / 8))}" fill="#64748B" font-family="system-ui, sans-serif">Image missing</text>
    ${gClose}`;
  }

  if (type === 'text') {
    const box = usableTextBox(el, allElements);
    const lineHeight = el.lineHeight && el.lineHeight > 0 ? el.lineHeight : 1.25;
    const preferred = el.fontSize ?? 20;
    const rawText = (el.text || '').replace(/\\n/g, '\n');
    const { fontSize, lines } = fitTextToBox(
      rawText,
      box.w,
      box.h,
      preferred,
      lineHeight,
    );
    const align = el.textAlign || 'left';
    const vAlign = el.verticalAlign || (box.fromContainer ? 'middle' : 'top');
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const blockH = lines.length * fontSize * lineHeight;

    // When bound to a container, paint in parent box coords (not the text element's own x/y,
    // which often disagree with system font metrics and cause overflow).
    let originX = x;
    let originY = y;
    let localW = Math.abs(w) || box.w;
    let localH = Math.abs(h) || box.h;
    if (box.fromContainer) {
      originX = box.x;
      originY = box.y;
      localW = box.w;
      localH = box.h;
    }

    const tx =
      align === 'center' ? localW / 2 : align === 'right' ? localW : 0;
    let firstBaseline: number;
    if (vAlign === 'middle') {
      firstBaseline = (localH - blockH) / 2 + fontSize * 0.85;
    } else if (vAlign === 'bottom') {
      firstBaseline = localH - (lines.length - 1) * fontSize * lineHeight - fontSize * 0.2;
    } else {
      firstBaseline = fontSize * 0.95;
    }

    const tspans = lines
      .map((line, i) => {
        const content = esc(line);
        if (i === 0) return content;
        return `<tspan x="${tx}" dy="${fontSize * lineHeight}">${content}</tspan>`;
      })
      .join('');

    // No clip-path: Fabric's SVG importer often ignores/mangles it and labels look
    // duplicated or still clipped wrong. Fitting font + wrap keeps text in-box.
    return `<g transform="translate(${originX} ${originY})" opacity="${opacity}">
      <text x="${tx}" y="${firstBaseline}" font-size="${fontSize}" font-family="system-ui, -apple-system, sans-serif" fill="${stroke}" text-anchor="${anchor}">${tspans}</text>
    </g>`;
  }

  if (type === 'line' || type === 'arrow' || type === 'freedraw') {
    const pts = el.points || [];
    if (pts.length < 2) return '';
    const d = pointsPath(pts);
    const marker =
      type === 'arrow'
        ? ` marker-end="url(#ba-excal-arrow)"`
        : '';
    return `${gOpen}<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${marker} />${gClose}`;
  }

  const shape = elementPath(el);
  if (!shape) return '';
  const shapeSvg = `${shape.replace(
    '/>',
    ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`,
  )}`;

  // Gemini often uses a plain lavender ellipse for DNA — draw a helix inside it.
  if (
    (type === 'ellipse' || type === 'rectangle' || type === 'diamond') &&
    isDnaShape(el, allElements)
  ) {
    const ww = Math.abs(w) || 80;
    const hh = Math.abs(h) || 60;
    const insetX = ww * 0.12;
    const insetY = hh * 0.14;
    const helix = geometricDnaHelixSvg(ww - insetX * 2, hh - insetY * 2, {
      framed: false,
      label: false,
      horizontal: ww >= hh,
    });
    return `${gOpen}${shapeSvg}<g transform="translate(${insetX} ${insetY})">${helix}</g>${gClose}`;
  }

  return `${gOpen}${shapeSvg}${gClose}`;
}

/** Bounds of visible elements */
function boundsOf(elements: ExElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (el.isDeleted) continue;
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const type = (el.type || '').toLowerCase();
    if (type === 'line' || type === 'arrow' || type === 'freedraw') {
      for (const p of el.points || []) {
        minX = Math.min(minX, x + p[0]);
        minY = Math.min(minY, y + p[1]);
        maxX = Math.max(maxX, x + p[0]);
        maxY = Math.max(maxY, y + p[1]);
      }
      continue;
    }
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    minX = Math.min(minX, x, x + w);
    minY = Math.min(minY, y, y + h);
    maxX = Math.max(maxX, x, x + w);
    maxY = Math.max(maxY, y, y + h);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Convert Excalidraw scene JSON (or elements array) to an SVG document string.
 * Accepts full scene, clipboard format (`excalidraw/clipboard`), or elements[].
 */
export function excalidrawJsonToSvg(data: unknown): string {
  const elements = extractElements(data).filter((e) => !e.isDeleted);
  if (!elements.length) {
    throw new Error('No Excalidraw elements found in JSON');
  }
  const files = extractFiles(data);

  const { minX, minY, maxX, maxY } = boundsOf(elements);
  const pad = 16;
  const width = Math.max(40, maxX - minX + pad * 2);
  const height = Math.max(40, maxY - minY + pad * 2);
  const ox = -minX + pad;
  const oy = -minY + pad;

  // Offset a working copy so container lookups use the same coordinate space as each element.
  const placed = elements.map((el) => ({
    ...el,
    x: (el.x ?? 0) + ox,
    y: (el.y ?? 0) + oy,
  }));
  const body = placed.map((el) => elementSvg(el, files, placed)).join('\n');

  return ensureValidSvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="ba-excal-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#1e1e1e" />
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="transparent"/>
  ${body}
</svg>`,
    width,
    height,
  );
}

/** Convert clipboard/scene text to SVG string, or null if not Excalidraw. */
export function tryExcalidrawTextToSvg(raw: string): string | null {
  if (!looksLikeExcalidrawJson(raw)) return null;
  try {
    const data = parseMaybeJson(raw);
    return excalidrawJsonToSvg(data);
  } catch {
    return null;
  }
}

export type PlaceExcalidrawResult = {
  kind: 'svg' | 'excalidraw';
  /** Image elements with no embedded files{}.dataURL (common from Gemini). */
  missingImages: number;
};

/**
 * Place pasted Excalidraw JSON or SVG onto the canvas.
 * Also accepts Gemini-style replies that wrap JSON in markdown / prose.
 *
 * Gemini often shows a pretty preview image AND incomplete Excalidraw JSON
 * (image elements with empty files{}). We hydrate orphaned base64 from the
 * paste, fall back to SVG/raster in the same reply, and draw a geometric
 * DNA helix when a DNA picture was referenced but not embedded.
 */
export async function placeExcalidrawCode(
  raw: string,
  opts?: { name?: string; maxSize?: number },
): Promise<PlaceExcalidrawResult> {
  const text = (raw || '').trim();
  if (!text) throw new Error('Paste Excalidraw JSON or SVG first');

  const svgMatch = text.match(/<svg\b[\s\S]*?<\/svg>/i);
  const mdImg = text.match(/\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)\)/);
  const looksJson = looksLikeExcalidrawJson(text);

  // Prefer SVG if the reply is SVG-only (or SVG without Excalidraw JSON).
  if (svgMatch && !looksJson) {
    const svg = ensureValidSvgDocument(svgMatch[0]);
    await addSvgToCanvas(svg, {
      name: opts?.name || 'AI figure (SVG)',
      maxSize: opts?.maxSize ?? 520,
    });
    return { kind: 'svg', missingImages: 0 };
  }
  if (isSvgMarkup(text) || (text.includes('<svg') && !/"elements"\s*:/.test(text))) {
    const svg = ensureValidSvgDocument(svgMatch?.[0] || text);
    await addSvgToCanvas(svg, {
      name: opts?.name || 'Excalidraw figure',
      maxSize: opts?.maxSize ?? 520,
    });
    return { kind: 'svg', missingImages: 0 };
  }

  // Data URL image (e.g. exported PNG from Excalidraw)
  if (text.startsWith('data:image/')) {
    await addImageFromDataUrl(text, {
      name: opts?.name || 'Excalidraw figure',
      maxSize: opts?.maxSize ?? 520,
    });
    return { kind: 'svg', missingImages: 0 };
  }

  // Markdown image without JSON
  if (mdImg && !looksJson) {
    await addImageFromDataUrl(mdImg[1].replace(/\s+/g, ''), {
      name: opts?.name || 'AI figure',
      maxSize: opts?.maxSize ?? 520,
    });
    return { kind: 'svg', missingImages: 0 };
  }

  let data: unknown;
  try {
    data = parseMaybeJson(text);
  } catch {
    throw new Error(
      'Not valid JSON or SVG — paste Excalidraw scene JSON, or a full <svg>…</svg> from the AI',
    );
  }

  // Wire any base64 blobs sitting outside files{} onto missing image elements
  data = hydrateMissingImageFiles(data, text);
  let missingImages = countMissingExcalidrawImages(data);

  // If JSON still can't render pictures but the same paste has SVG / a raster,
  // prefer the visual Gemini actually drew.
  if (missingImages > 0 && svgMatch) {
    const svg = ensureValidSvgDocument(svgMatch[0]);
    await addSvgToCanvas(svg, {
      name: opts?.name || 'AI figure (SVG)',
      maxSize: opts?.maxSize ?? 520,
    });
    return { kind: 'svg', missingImages: 0 };
  }
  if (missingImages > 0 && mdImg) {
    await addImageFromDataUrl(mdImg[1].replace(/\s+/g, ''), {
      name: opts?.name || 'AI figure',
      maxSize: opts?.maxSize ?? 520,
    });
    return { kind: 'svg', missingImages: 0 };
  }

  const svg = excalidrawJsonToSvg(data);
  // After helix substitution, report how many images still had no file data
  // (helix counts as a recovery, but user should know it wasn't Gemini's art).
  missingImages = countMissingExcalidrawImages(data);
  await addSvgToCanvas(svg, {
    name: opts?.name || 'Excalidraw figure',
    maxSize: opts?.maxSize ?? 520,
  });
  return { kind: 'excalidraw', missingImages };
}

/** Example prompts for AI tools to generate Excalidraw-friendly JSON */
/**
 * Short chip labels (UI). Full prompt text is copied on click.
 * Each prompt asks for publication-quality styling + an explicit color palette.
 */
export const EXCALIDRAW_EXAMPLE_PROMPTS: { id: string; label: string; prompt: string }[] = [
  {
    id: 'pathway',
    label: 'Pathway',
    prompt: `Create an Excalidraw scene JSON for a cell signaling pathway figure.

CRITICAL (read carefully — BioArtist imports JSON, not your chat preview image):
- Do NOT generate a separate illustration/picture. Do NOT use element type "image".
- Use ONLY: rectangle, ellipse, diamond, text, arrow, line, freedraw.
- For DNA: draw a geometric double helix yourself with two wavy freedraw/line strands and short base-pair lines between them. Color the helix lavender. Never reference an external DNA clip-art.
- files must be {} (empty). If you emit type:"image" without a base64 dataURL in files, the DNA will be missing in BioArtist.

Publication quality: Nature/Cell-style schematic — flat shapes, generous spacing, high-contrast labels, print-safe colors, no decorative shadows or 3D effects. Left-to-right flow, ~900×420.

Color palette (use these fills; strokes #1F2937; text #111827; background #FFFFFF):
- Soft blue #A8C5DA (ligand / signal)
- Soft teal #7EB6A4 (receptor / membrane step)
- Warm sand #E8D5B7 (kinase / cascade)
- Soft coral #E8A09A (transcription)
- Light lavender #C5B4E3 (DNA / response)
- Pale gray #E8E8E8 (neutral boxes)

Diagram: Ligand (ellipse) → Receptor (rounded rectangle) → Kinase (diamond) → Transcription (rectangle) → DNA (geometric helix made of lines). Short labels inside or under each node; arrows between steps.

Return ONLY valid JSON (no markdown, no preview image) as:
{ "type": "excalidraw", "version": 2, "elements": [...], "appState": { "viewBackgroundColor": "#ffffff" }, "files": {} }`,
  },
  {
    id: 'workflow',
    label: 'Lab workflow',
    prompt: `Create an Excalidraw scene JSON for a wet-lab experimental workflow.

Publication quality: clean methods flowchart suitable for a journal supplement — uniform rounded rectangles, aligned row, readable 14–16px labels, no clutter.

Color palette (fills; stroke #1E293B; text #0F172A; background #FFFFFF):
- Ice blue #DBEAFE (sample / input)
- Mint #A7F3D0 (extraction)
- Sky #7DD3FC (PCR)
- Soft amber #FDE68A (gel electrophoresis)
- Soft violet #DDD6FE (analysis)
- Neutral #F1F5F9 (optional notes)

Flow (horizontal): Sample collection → Extraction → PCR → Gel electrophoresis → Analysis. One short label per box; solid arrows between boxes.

Return ONLY excalidraw scene JSON (type "excalidraw", elements, appState, files). No markdown.`,
  },
  {
    id: 'cell-scheme',
    label: 'Cell scheme',
    prompt: `Create an Excalidraw scene JSON for a labeled cellular process overview (organelle / trafficking style figure).

CRITICAL (BioArtist imports JSON only — ignore chat preview pictures):
- Shapes + text + arrows only. No type:"image", no photographic clip-art.
- If you need DNA, draw it with lines/ellipses (simple helix), or return a complete <svg>…</svg> instead of Excalidraw JSON.
- Never emit type:"image" without embedding dataURL in files{}. files should be {}.

Publication quality: textbook/journal schematic — clear silhouettes, minimal detail, black/near-black outlines, soft pastel fills, white canvas, labels outside shapes with leader lines if needed.

Color palette (fills; stroke #1F2937; text #111827; background #FFFFFF):
- Cytoplasm wash #F8FAFC
- Membrane / vesicle #BFDBFE
- Nucleus #C4B5FD
- Mitochondrion / energy #FBCFE8
- ER / Golgi #BBF7D0
- Highlight / cargo #FDE68A

Content: one cell outline (large rounded rect or ellipse), nucleus, 2–3 vesicles or organelles, arrows showing a simple process (e.g. endocytosis → trafficking → nucleus). 4–6 short text labels.

Return ONLY valid Excalidraw scene JSON. No markdown fences.`,
  },
  {
    id: 'chem-scheme',
    label: 'Chem scheme',
    prompt: `Create an Excalidraw scene JSON for a chemical / reaction scheme layout (boxes and arrows, not atom structures).

Publication quality: ACS-like scheme spacing — reactant and product cards aligned, reaction arrow centered, reagents/conditions as small text above and below the arrow, high contrast for print.

Color palette (fills; stroke #111827; text #111827; background #FFFFFF):
- Reactant card #DBEAFE
- Product card #BBF7D0
- Intermediate (optional) #FDE68A
- Arrow / connectors #334155
- Reagent band #F1F5F9
- Accent for catalyst note #E9D5FF

Layout: Reactant A + Reactant B → Product (with optional intermediate). Use rectangles for compounds, a long reaction arrow, and two text labels (reagents above, conditions below). ~880×360.

Return ONLY excalidraw scene JSON (type "excalidraw"). No markdown.`,
  },
  {
    id: 'figure-plan',
    label: 'Figure plan',
    prompt: `Create an Excalidraw scene JSON for a multi-panel paper figure layout plan.

Publication quality: journal figure board — panel frames labeled A B C D, consistent margins, light grid feel, print-ready grayscale-friendly accents plus soft color for panel roles.

Color palette (fills; stroke #1F2937; text #111827; background #FFFFFF):
- Panel frame fill #F8FAFC
- Panel A accent #A8C5DA
- Panel B accent #7EB6A4
- Panel C accent #E8D5B7
- Panel D accent #C5B4E3
- Caption bar #E8E8E8

Layout: 2×2 panels (A top-left, B top-right, C bottom-left, D bottom-right), each a rounded rectangle with a bold letter and a one-line placeholder caption under the grid. ~900×700.

Return ONLY valid Excalidraw scene JSON. No markdown.`,
  },
];
