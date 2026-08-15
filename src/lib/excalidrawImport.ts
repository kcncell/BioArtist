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

function parseMaybeJson(raw: string): unknown {
  let t = raw.trim();
  // Strip markdown fences if AI wrapped the JSON
  const fence = t.match(/^```(?:json|excalidraw)?\s*([\s\S]*?)```$/i);
  if (fence) t = fence[1].trim();
  return JSON.parse(t);
}

function extractElements(data: unknown): ExElement[] {
  if (!data || typeof data !== 'object') return [];
  // Clipboard paste: { type: "excalidraw/clipboard", elements, files }
  // File export: { type: "excalidraw", elements, files }
  const o = data as ExScene & { elements?: ExElement[] };
  if (Array.isArray(o.elements)) return o.elements;
  // Clipboard paste sometimes is just the elements array
  if (Array.isArray(data)) return data as ExElement[];
  return [];
}

function extractFiles(data: unknown): Record<string, ExFile> {
  if (!data || typeof data !== 'object') return {};
  const files = (data as ExScene).files;
  return files && typeof files === 'object' ? files : {};
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

function elementSvg(el: ExElement, files: Record<string, ExFile> = {}): string {
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

  if (type === 'image' && el.fileId && files[el.fileId]?.dataURL) {
    const href = esc(files[el.fileId].dataURL || '');
    return `${gOpen}<image href="${href}" xlink:href="${href}" x="0" y="0" width="${Math.abs(w)}" height="${Math.abs(h)}" preserveAspectRatio="none" />${gClose}`;
  }

  if (type === 'text') {
    const size = el.fontSize ?? 20;
    const text = esc(el.text || '');
    const anchor =
      el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start';
    const tx = el.textAlign === 'center' ? w / 2 : el.textAlign === 'right' ? w : 0;
    const lines = text.split('\n');
    const tspans = lines
      .map((line, i) =>
        i === 0
          ? line
          : `<tspan x="${tx}" dy="${size * 1.25}">${line}</tspan>`,
      )
      .join('');
    return `${gOpen}<text x="${tx}" y="${size}" font-size="${size}" font-family="system-ui, sans-serif" fill="${stroke}" text-anchor="${anchor}">${tspans}</text>${gClose}`;
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
  return `${gOpen}${shape.replace(
    '/>',
    ` fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`,
  )}${gClose}`;
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

  const body = elements
    .map((el) =>
      elementSvg(
        {
          ...el,
          x: (el.x ?? 0) + ox,
          y: (el.y ?? 0) + oy,
        },
        files,
      ),
    )
    .join('\n');

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

/**
 * Place pasted Excalidraw JSON or SVG onto the canvas.
 */
export async function placeExcalidrawCode(
  raw: string,
  opts?: { name?: string; maxSize?: number },
): Promise<'svg' | 'excalidraw'> {
  const text = (raw || '').trim();
  if (!text) throw new Error('Paste Excalidraw JSON or SVG first');

  if (isSvgMarkup(text) || text.includes('<svg')) {
    const svg = ensureValidSvgDocument(text.includes('<svg') ? text : text);
    await addSvgToCanvas(svg, {
      name: opts?.name || 'Excalidraw figure',
      maxSize: opts?.maxSize ?? 520,
    });
    return 'svg';
  }

  // Data URL image (e.g. exported PNG from Excalidraw)
  if (text.startsWith('data:image/')) {
    await addImageFromDataUrl(text, {
      name: opts?.name || 'Excalidraw figure',
      maxSize: opts?.maxSize ?? 520,
    });
    return 'svg';
  }

  let data: unknown;
  try {
    data = parseMaybeJson(text);
  } catch {
    throw new Error('Not valid JSON or SVG — paste Excalidraw scene JSON or <svg>…</svg>');
  }

  const svg = excalidrawJsonToSvg(data);
  await addSvgToCanvas(svg, {
    name: opts?.name || 'Excalidraw figure',
    maxSize: opts?.maxSize ?? 520,
  });
  return 'excalidraw';
}

/** Example prompts for AI tools to generate Excalidraw-friendly JSON */
export const EXCALIDRAW_EXAMPLE_PROMPTS: { id: string; label: string; prompt: string }[] = [
  {
    id: 'pathway',
    label: 'Signaling pathway',
    prompt: `Create an Excalidraw scene JSON for a simple cell signaling pathway diagram.

Return ONLY valid JSON (no markdown) with this shape:
{
  "type": "excalidraw",
  "version": 2,
  "elements": [ ... ],
  "appState": { "viewBackgroundColor": "#ffffff" },
  "files": {}
}

Include elements of types: rectangle, ellipse, diamond, text, arrow, line.
Diagram: Ligand (ellipse) → Receptor (rectangle) → Kinase (diamond) → Transcription (rectangle) → DNA (ellipse).
Use clear labels, black strokes, light fills (#e8f4ff / #fff7e6), ~800×400 layout, left-to-right flow.`,
  },
  {
    id: 'lab-workflow',
    label: 'Lab workflow',
    prompt: `Generate Excalidraw JSON (type "excalidraw", elements array only as full scene JSON) for a lab workflow:
Sample collection → Extraction → PCR → Gel electrophoresis → Analysis.
Use rounded rectangles for steps, arrows between them, short text labels.
White background, flat colors, horizontal layout. Return ONLY JSON, no markdown fences.`,
  },
  {
    id: 'experimental-design',
    label: 'Experimental design',
    prompt: `Output Excalidraw scene JSON for an experimental design schematic:
Control group vs Treatment group, both feeding into "Assay readout", then "Statistics".
Boxes + arrows + labels. Scientific figure style, clean, high contrast.
Full scene: { "type":"excalidraw", "elements":[...], "appState":{...}, "files":{} }. JSON only.`,
  },
  {
    id: 'timeline',
    label: 'Study timeline',
    prompt: `Create Excalidraw JSON for a clinical/research study timeline with milestones:
Screening → Baseline → Intervention → Follow-up 1 → Follow-up 2 → Endpoint.
Horizontal timeline with diamond markers and text under each. JSON only, excalidraw format.`,
  },
  {
    id: 'venn',
    label: 'Venn / overlap',
    prompt: `Generate Excalidraw JSON with two overlapping ellipses labeled "Disease A" and "Disease B", overlap region labeled "Shared pathway". Simple figure-ready diagram. Return only Excalidraw scene JSON.`,
  },
  {
    id: 'flowchart',
    label: 'Methods flowchart',
    prompt: `Excalidraw scene JSON for a methods flowchart:
Input data → QC → Normalization → Differential analysis → Visualization → Interpretation.
Rectangles, arrows, text. Clean scientific style. JSON only (type excalidraw).`,
  },
  {
    id: 'svg-alt',
    label: 'As SVG instead',
    prompt: `Draw a simple scientific flowchart as a single self-contained SVG (xmlns, viewBox, no external CSS).
Boxes and arrows for: Hypothesis → Experiment → Data → Conclusion.
Flat design, white background, black text. Return ONLY the <svg>...</svg> markup.`,
  },
  {
    id: 'org-chart',
    label: 'Team / org chart',
    prompt: `Excalidraw JSON org chart: PI at top, then 3 postdocs, then students under one postdoc.
Rectangles + lines. Return full excalidraw scene JSON only.`,
  },
  {
    id: 'palette-nature',
    label: 'Palette · journal',
    prompt: `Create an Excalidraw scene JSON for a scientific figure using a publication-ready color palette.

Theme: Nature / Cell-style journal figure (muted, high contrast, print-safe).
Palette to use for fills (strokes stay dark charcoal #1e1e1e):
- Soft blue #A8C5DA
- Soft teal #7EB6A4
- Warm sand #E8D5B7
- Soft coral #E8A09A
- Light lavender #C5B4E3
- Pale gray #E8E8E8 for neutrals
- White or near-white background (#ffffff)

Diagram: a clean experimental workflow (Control → Treatment → Assay → Analysis) with labeled boxes and arrows.
Return ONLY valid Excalidraw scene JSON (type "excalidraw", elements, appState, files). No markdown.`,
  },
  {
    id: 'palette-cb',
    label: 'Palette · colorblind',
    prompt: `Generate Excalidraw scene JSON for a pathway diagram using a colorblind-friendly scientific palette (Okabe–Ito inspired).

Fills:
- Sky blue #56B4E9
- Bluish green #009E73
- Yellow #F0E442
- Vermillion #D55E00
- Reddish purple #CC79A7
- Orange #E69F00
Stroke: #000000 or #333333. Background: #ffffff.
Labels high-contrast black. Avoid pure red/green only coding.
Diagram: Ligand → Receptor → Cascade → Response (4–5 nodes).
JSON only, full excalidraw scene.`,
  },
  {
    id: 'palette-print',
    label: 'Palette · grayscale',
    prompt: `Create Excalidraw JSON for a methods flowchart optimized for black-and-white journal print.

Use only grayscale fills (#F5F5F5, #D9D9D9, #B0B0B0, #FFFFFF) and black (#111111) strokes/text.
No color reliance — structure and labels must read clearly in grayscale.
Flow: Sample prep → Measurement → QC → Statistics → Figure.
Return ONLY excalidraw scene JSON.`,
  },
  {
    id: 'palette-cool',
    label: 'Palette · cool blues',
    prompt: `Excalidraw scene JSON with a cool publication palette (cyan–blue–indigo):
fills #E0F2FE, #BAE6FD, #7DD3FC, #38BDF8, #0EA5E9; stroke #0C4A6E; text #0F172A; background #ffffff.
Diagram: multi-omics pipeline (Genomics / Transcriptomics / Proteomics → Integration → Insight).
Clean boxes, arrows, short labels. JSON only, type excalidraw.`,
  },
];
