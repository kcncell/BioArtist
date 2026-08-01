import type { LibraryIcon } from '../data/catalog';
import { addImageFromDataUrl, addSvgToCanvas } from './canvasController';
import { pushRecentFromSmiles, readChemClipboard } from './chemLibrary';
import { smilesToSvg, stripOpaqueBackgroundRects } from './rdkit';

export interface PasteResult {
  kind: 'svg' | 'image' | 'chem' | 'none';
  name?: string;
  svgContent?: string;
  dataUrl?: string;
  /** When kind is chem — SMILES or short label */
  smiles?: string;
}

/** Decode common HTML entities so entity-escaped SVG in text/html can be parsed. */
function decodeHtmlEntities(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

/** Pull a full <svg>…</svg> block out of plain text, HTML, or entity-escaped markup. */
export function extractSvgMarkup(raw: string): string | null {
  if (!raw) return null;
  const candidates = [raw];
  if (raw.includes('&lt;') || raw.includes('&LT;')) {
    candidates.push(decodeHtmlEntities(raw));
  }
  for (const text of candidates) {
    if (!/<svg\b/i.test(text)) continue;
    const match = text.match(/<svg\b[\s\S]*?<\/svg>/i);
    if (match) return match[0].trim();
    if (/<\/svg>/i.test(text)) {
      const start = text.search(/<svg\b/i);
      const end = text.toLowerCase().lastIndexOf('</svg>');
      if (start >= 0 && end > start) return text.slice(start, end + 6).trim();
    }
  }
  return null;
}

/** True when the snap has *extractable* graphic payload (not merely a type string). */
export function snapHasSystemGraphic(snap: ClipboardSnap): boolean {
  if (snap.svgBlobs.length > 0 || snap.imageBlobs.length > 0) return true;
  if (
    snap.files.some(
      (f) =>
        f.type.startsWith('image/') ||
        f.type === 'image/svg+xml' ||
        f.name.toLowerCase().endsWith('.svg'),
    )
  ) {
    return true;
  }
  if (extractSvgMarkup(snap.plain) || extractSvgMarkup(snap.html)) return true;
  for (const x of snap.extras) {
    if (extractSvgMarkup(x)) return true;
  }
  const plain = snap.plain.trim();
  if (/^data:image\//i.test(plain)) return true;
  if (/\.svg(\?|#|$)/i.test(plain) && /^https?:\/\//i.test(plain)) return true;
  return false;
}

/** Prefer candidates that contain real SVG markup (Bioicons text representation). */
function preferSvgText(a: string, b: string): string {
  const aSvg = !!extractSvgMarkup(a);
  const bSvg = !!extractSvgMarkup(b);
  if (bSvg && !aSvg) return b;
  if (aSvg && !bSvg) return a;
  // Both SVG or neither: prefer the longer non-empty string (full icon file vs stub)
  if ((bSvg && aSvg) || (!aSvg && !bSvg)) {
    if (b.trim().length > a.trim().length) return b;
  }
  return a || b;
}

/** First SVG markup found in a snap (plain / html / extras). */
export function extractSvgFromSnap(snap: ClipboardSnap): string | null {
  return (
    extractSvgMarkup(snap.plain) ||
    extractSvgMarkup(snap.html) ||
    snap.extras.map((x) => extractSvgMarkup(x)).find(Boolean) ||
    null
  );
}

/**
 * Merge two snaps, preferring whichever side has real SVG / image blobs.
 * Used so Cmd+V (event + async) matches right-click (async-only) behavior.
 */
export function mergeSnapsPreferGraphic(eventSnap: ClipboardSnap, asyncSnap: ClipboardSnap): ClipboardSnap {
  const asyncHasSvg =
    asyncSnap.svgBlobs.length > 0 || !!extractSvgFromSnap(asyncSnap);
  const eventHasSvg =
    eventSnap.svgBlobs.length > 0 || !!extractSvgFromSnap(eventSnap);
  const asyncHasImg = asyncSnap.imageBlobs.length > 0 || asyncSnap.files.some((f) => f.type.startsWith('image/'));
  const eventHasImg = eventSnap.imageBlobs.length > 0 || eventSnap.files.some((f) => f.type.startsWith('image/'));

  // Prefer async when it has SVG and event does not (common Brave Cmd+V case)
  const preferAsync = (asyncHasSvg && !eventHasSvg) || (!eventHasSvg && !eventHasImg && (asyncHasSvg || asyncHasImg));

  const primary = preferAsync ? asyncSnap : eventSnap;
  const secondary = preferAsync ? eventSnap : asyncSnap;

  return {
    plain: preferSvgText(primary.plain, secondary.plain),
    html: preferSvgText(primary.html, secondary.html),
    extras: [...primary.extras, ...secondary.extras],
    files: [...primary.files, ...secondary.files],
    imageBlobs: [...primary.imageBlobs, ...secondary.imageBlobs],
    svgBlobs: [...primary.svgBlobs, ...secondary.svgBlobs],
    types: [...new Set([...primary.types, ...secondary.types])],
  };
}

/**
 * Light cleanup so Fabric can load Inkscape / Bioicons SVGs more reliably.
 * Strips XML prologue only; keeps drawing content.
 */
export function prepareSvgForCanvas(svg: string): string {
  let s = svg.trim();
  // Drop XML / DOCTYPE so the parser starts at <svg>
  s = s.replace(/^<\?xml[\s\S]*?\?>/i, '').trim();
  s = s.replace(/<!DOCTYPE[\s\S]*?>/i, '').trim();
  // Ensure root has xmlns (some clipboard payloads omit it)
  if (/^<svg\b/i.test(s) && !/\sxmlns\s*=/i.test(s.slice(0, 400))) {
    s = s.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return s;
}

function guessNameFromSvg(svg: string): string {
  const titled = svg.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titled?.[1]) return titled[1].trim().slice(0, 60);
  const id = svg.match(/\bid=["']([^"']+)["']/i);
  if (id?.[1] && id[1].length > 2) return id[1].replace(/[-_]/g, ' ').slice(0, 60);
  return `Pasted SVG ${new Date().toLocaleTimeString()}`;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export type ClipboardSnap = {
  plain: string;
  html: string;
  /** Extra text flavors (Ketcher may use chemical/* or text/*) */
  extras: string[];
  files: File[];
  imageBlobs: { type: string; blob: Blob }[];
  svgBlobs: Blob[];
  types: string[];
};

/**
 * Snapshot clipboard payloads synchronously (must run before async gaps —
 * browsers invalidate clipboardData after the handler returns).
 */
export function snapshotClipboard(e: ClipboardEvent): ClipboardSnap {
  const cd = e.clipboardData;
  const types = cd?.types ? Array.from(cd.types) : [];
  const plain = cd?.getData('text/plain') || cd?.getData('text') || '';
  const html = cd?.getData('text/html') || '';
  const extras: string[] = [];
  if (cd) {
    for (const t of types) {
      if (t === 'text/plain' || t === 'text/html' || t === 'text' || t === 'Files') continue;
      try {
        const data = cd.getData(t);
        if (data && data.trim()) extras.push(data);
      } catch {
        /* some types are not readable as string */
      }
    }
  }
  const files = cd?.files ? Array.from(cd.files) : [];
  const imageBlobs: { type: string; blob: Blob }[] = [];
  const svgBlobs: Blob[] = [];

  if (cd?.items) {
    for (const item of Array.from(cd.items)) {
      if (item.type === 'image/svg+xml') {
        const f = item.getAsFile();
        if (f) svgBlobs.push(f);
      } else if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageBlobs.push({ type: item.type, blob: f });
      } else if (
        item.type.startsWith('text/') ||
        item.type.startsWith('chemical/') ||
        item.kind === 'string'
      ) {
        // Also pull as file if browser exposes it
        try {
          const f = item.getAsFile();
          if (f && (f.size > 0 || f.name)) {
            /* prefer getData above; file read is async later if needed */
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { plain, html, extras, files, imageBlobs, svgBlobs, types };
}

/** All text candidates from a snap (plain + extras + html text-ish). */
export function allTextCandidates(snap: ClipboardSnap): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(snap.plain);
  for (const x of snap.extras) push(x);
  // Prefer raw HTML (may contain <svg> or entity-escaped SVG from Bioicons)
  if (snap.html) {
    push(snap.html);
    const decoded = decodeHtmlEntities(snap.html);
    if (decoded !== snap.html) push(decoded);
    // Also stripped body text for SMILES-only pastes
    if (!extractSvgMarkup(snap.html) && !extractSvgMarkup(decoded)) {
      const stripped = decoded
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      push(stripped);
    }
  }
  return out;
}

/** Molfile / SDF from Ketcher or other sketcher (contains M  END). */
export function looksLikeMolfile(text: string): boolean {
  const t = text.trim();
  return t.length > 20 && /M\s+END/i.test(t);
}

/**
 * Loose SMILES / CXSMILES check. RDKit is the final validator.
 * Ketcher often copies CXSMILES with spaces, pipes, carets, etc.
 */
export function looksLikeSmiles(text: string): boolean {
  let t = text.trim();
  if (!t || t.length > 2000) return false;
  if (looksLikeMolfile(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (t.includes('<svg') || t.includes('</svg>')) return false;
  t = t.replace(/^(smiles|daylight|cxsmiles)\s*[:=]\s*/i, '').trim();
  // Reject long English sentences
  if (t.split(/\s+/).length > 12 && !/[A-Za-z]{1,2}\d/.test(t) && !t.includes('(')) {
    return false;
  }
  // Must look chemistry-ish: elements + bonds / rings / branches
  if (!/[CNOSPFcnopsBI]/.test(t)) return false;
  // Allow CXSMILES extras: | ^ : * ~
  if (!/^[A-Za-z0-9@+\-\[\]\(\)=#$%/\\.|^*:~,\s]+$/.test(t)) return false;
  // Prefer compact strings (SMILES rarely has many spaces except CX extensions)
  return true;
}

/** Extract chem payload (molfile or SMILES) from any text blob. */
export function extractChemText(plain: string): { kind: 'smiles' | 'molfile'; text: string } | null {
  const raw = plain.trim();
  if (!raw) return null;
  if (looksLikeMolfile(raw)) return { kind: 'molfile', text: raw };

  // Prefer first non-empty line that looks like SMILES
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  for (const line of lines) {
    const cleaned = line.replace(/^(smiles|daylight|cxsmiles)\s*[:=]\s*/i, '').trim();
    // Strip CXSMILES extensions for RDKit if present: "c1ccccc1 |f:0.1|" → try full first
    if (looksLikeSmiles(cleaned)) return { kind: 'smiles', text: cleaned };
  }

  const cleaned = raw.replace(/^(smiles|daylight|cxsmiles)\s*[:=]\s*/i, '').trim();
  if (looksLikeSmiles(cleaned)) return { kind: 'smiles', text: cleaned };
  return null;
}

/** For paste: try several text candidates until one is chem-like. */
export function extractChemFromSnap(snap: ClipboardSnap): { kind: 'smiles' | 'molfile'; text: string } | null {
  for (const t of allTextCandidates(snap)) {
    const chem = extractChemText(t);
    if (chem) return chem;
  }
  return null;
}

export function clipboardLooksPasteable(snap: ClipboardSnap): boolean {
  // Chem Studio "Copy for figure" bridge (localStorage) — works even when system clipboard is empty
  {
    const c = readChemClipboard();
    if (c?.svg || c?.pngDataUrl || c?.smiles) return true;
  }
  if (snapHasSystemGraphic(snap)) return true;
  if (extractChemFromSnap(snap)) return true;
  // Any non-empty plain text: we will try RDKit later (Ketcher formats vary)
  if (snap.plain.trim().length > 0 && snap.plain.trim().length < 2000) return true;
  if (snap.extras.some((x) => x.trim().length > 0 && x.trim().length < 2000)) return true;
  for (const f of snap.files) {
    const n = f.name.toLowerCase();
    if (n.endsWith('.smi') || n.endsWith('.smiles') || n.endsWith('.mol') || n.endsWith('.sdf')) {
      return true;
    }
  }
  return false;
}

/** Draw SMILES or molfile with RDKit → transparent SVG for the artboard. */
async function chemTextToPasteResult(
  chemText: string,
  nameHint?: string,
): Promise<PasteResult> {
  // Try full string first (CXSMILES), then base SMILES before first space/pipe
  const attempts = [chemText.trim()];
  const base = chemText.trim().split(/\s+/)[0]?.split('|')[0]?.trim();
  if (base && base !== attempts[0]) attempts.push(base);

  for (const attempt of attempts) {
    const svg = await smilesToSvg(attempt, {
      width: 280,
      height: 220,
      acs: true,
      transparent: true,
    });
    if (!svg) continue;
    const clean = stripOpaqueBackgroundRects(svg);
    const label =
      nameHint ||
      (looksLikeMolfile(chemText) ? 'Pasted structure' : attempt.slice(0, 40));
    if (!looksLikeMolfile(chemText)) {
      try {
        pushRecentFromSmiles(attempt, label, clean);
      } catch {
        /* ignore */
      }
    }
    return {
      kind: 'chem',
      name: label,
      svgContent: clean,
      smiles: looksLikeMolfile(chemText) ? undefined : attempt,
    };
  }
  return { kind: 'none' };
}

function pasteFromChemStudioClipboard(): PasteResult | null {
  const chemClip = readChemClipboard();
  if (!chemClip) return null;
  // Prefer transparent 3D PNG snapshot when present (ball-and-stick export)
  if (chemClip.pngDataUrl?.startsWith('data:image/')) {
    return {
      kind: 'image',
      name: chemClip.name || 'Molecule 3D',
      dataUrl: chemClip.pngDataUrl,
    };
  }
  if (chemClip.svg) {
    const svg = stripOpaqueBackgroundRects(chemClip.svg);
    try {
      pushRecentFromSmiles(chemClip.smiles || chemClip.name, chemClip.name, svg);
    } catch {
      /* ignore */
    }
    return {
      kind: 'chem',
      name: chemClip.name,
      svgContent: svg,
      smiles: chemClip.smiles || undefined,
    };
  }
  return null;
}

export async function resolveClipboardSnapshot(snap: ClipboardSnap): Promise<PasteResult> {
  // --- Graphics first (Bioicons copies image + SVG text) ---

  // Files (Finder / Explorer / site "copy as file")
  for (const file of snap.files) {
    const lower = file.name.toLowerCase();
    if (file.type === 'image/svg+xml' || lower.endsWith('.svg') || /svg/i.test(file.type)) {
      const text = await file.text();
      const svg = extractSvgMarkup(text) || (text.includes('<svg') ? text.trim() : null);
      if (svg) {
        return {
          kind: 'svg',
          name: file.name.replace(/\.svg$/i, '') || guessNameFromSvg(svg),
          svgContent: prepareSvgForCanvas(svg),
        };
      }
    }
  }

  for (const blob of snap.svgBlobs) {
    const text = await blob.text();
    const svg = extractSvgMarkup(text) || (text.includes('<svg') ? text.trim() : null);
    if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: prepareSvgForCanvas(svg) };
  }

  // Text / HTML candidates (Bioicons: text representation of the SVG)
  for (const t of allTextCandidates(snap)) {
    const svg = extractSvgMarkup(t);
    if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: prepareSvgForCanvas(svg) };
  }

  const dataSvg = snap.plain.trim().match(/^data:image\/svg\+xml[^,]*,([\s\S]+)$/i);
  if (dataSvg) {
    try {
      let decoded = dataSvg[1];
      if (/^charset=/i.test(decoded) || snap.plain.includes(';base64,')) {
        const comma = snap.plain.indexOf(',');
        decoded = snap.plain.slice(comma + 1);
      }
      if (/;base64,/i.test(snap.plain.slice(0, 80))) {
        decoded = atob(decoded);
      } else {
        decoded = decodeURIComponent(decoded);
      }
      const svg = extractSvgMarkup(decoded) || (decoded.includes('<svg') ? decoded : null);
      if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: prepareSvgForCanvas(svg) };
    } catch {
      /* ignore */
    }
  }

  // URL pointing at an SVG (CDN link / bioicons path)
  const urlPlain = snap.plain.trim();
  if (/^https?:\/\//i.test(urlPlain) && /\.svg(\?|#|$)/i.test(urlPlain)) {
    try {
      const res = await fetch(urlPlain);
      if (res.ok) {
        const text = await res.text();
        const svg = extractSvgMarkup(text) || (text.includes('<svg') ? text.trim() : null);
        if (svg) {
          const base = urlPlain.split('/').pop()?.replace(/\.svg$/i, '') || 'icon';
          return {
            kind: 'svg',
            name: decodeURIComponent(base).replace(/[-_]+/g, ' '),
            svgContent: prepareSvgForCanvas(svg),
          };
        }
      }
    } catch {
      /* CORS or network */
    }
  }

  // Raster image from Bioicons (they put PNG alongside SVG text — use if no SVG)
  for (const file of snap.files) {
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      return {
        kind: 'image',
        name: file.name.replace(/\.[^.]+$/, '') || 'Pasted image',
        dataUrl: await fileToDataUrl(file),
      };
    }
  }
  for (const { blob } of snap.imageBlobs) {
    return {
      kind: 'image',
      name: 'Pasted image',
      dataUrl: await fileToDataUrl(blob),
    };
  }

  // Chem files / SMILES after graphics so path data in SVG never steals the paste
  for (const file of snap.files) {
    const lower = file.name.toLowerCase();
    if (
      lower.endsWith('.smi') ||
      lower.endsWith('.smiles') ||
      lower.endsWith('.mol') ||
      lower.endsWith('.sdf') ||
      file.type === 'chemical/x-mdl-molfile' ||
      file.type.startsWith('chemical/')
    ) {
      const text = await file.text();
      const chem =
        extractChemText(text) || (looksLikeMolfile(text) ? { kind: 'molfile' as const, text } : null);
      if (chem) {
        const drawn = await chemTextToPasteResult(
          chem.text,
          file.name.replace(/\.[^.]+$/, ''),
        );
        if (drawn.kind !== 'none') return drawn;
      }
      const drawn = await chemTextToPasteResult(text.trim(), file.name.replace(/\.[^.]+$/, ''));
      if (drawn.kind !== 'none') return drawn;
    }
  }

  const chem = extractChemFromSnap(snap);
  if (chem) {
    const drawn = await chemTextToPasteResult(chem.text);
    if (drawn.kind !== 'none') return drawn;
  }
  for (const t of allTextCandidates(snap)) {
    if (t.length > 2000 || extractSvgMarkup(t)) continue;
    const drawn = await chemTextToPasteResult(t);
    if (drawn.kind !== 'none') return drawn;
  }

  // Chem Studio → figure bridge (localStorage) only when OS clipboard had nothing graphic
  const fromStudio = pasteFromChemStudioClipboard();
  if (fromStudio) return fromStudio;

  const chemClip = readChemClipboard();
  if (chemClip?.smiles) {
    const drawn = await chemTextToPasteResult(chemClip.smiles, chemClip.name);
    if (drawn.kind !== 'none') return drawn;
  }

  return { kind: 'none' };
}

/**
 * Resolve paste for the figure canvas.
 * System SVG/image (Bioicons, Finder, …) always wins over a stale Chem Studio bridge.
 */
export async function resolveChemStudioOrClipboard(
  snap: ClipboardSnap,
): Promise<PasteResult> {
  const system = await resolveClipboardSnapshot(snap);
  // SVG / raster from OS clipboard (Bioicons, etc.)
  if (system.kind === 'svg' || system.kind === 'image') return system;
  // SMILES/molfile only when we did not also have a graphic payload
  if (system.kind === 'chem') return system;

  // Chem Studio localStorage bridge — last resort when OS clipboard is empty
  if (!snapHasSystemGraphic(snap)) {
    const fromStudio = pasteFromChemStudioClipboard();
    if (fromStudio) return fromStudio;
    const clip = readChemClipboard();
    if (clip?.smiles) {
      const drawn = await chemTextToPasteResult(clip.smiles, clip.name);
      if (drawn.kind !== 'none') return drawn;
    }
  }

  return { kind: 'none' };
}

/**
 * Merge async Clipboard API into the paste-event snap.
 *
 * Always reads when possible: Cmd+V event data in Brave/Chrome can lag behind
 * or carry stale text/plain while image/svg+xml lives only on the async API
 * (right-click paste already used async-only and worked).
 */
export async function enrichSnapFromAsyncClipboard(snap: ClipboardSnap): Promise<ClipboardSnap> {
  let plain = snap.plain;
  let html = snap.html;
  const extras = [...snap.extras];
  const files = [...snap.files];
  const imageBlobs = [...snap.imageBlobs];
  const svgBlobs = [...snap.svgBlobs];
  const types = new Set(snap.types);

  // readText: prefer async when it has SVG and event plain does not
  try {
    if (navigator.clipboard?.readText) {
      const t = await navigator.clipboard.readText();
      if (t?.trim()) {
        plain = preferSvgText(plain, t);
        if (t !== plain && extractSvgMarkup(t)) {
          // keep non-svg event plain as extra for chem fallback
          if (snap.plain.trim() && !extractSvgMarkup(snap.plain)) extras.push(snap.plain);
        } else if (plain !== t && t.trim()) {
          extras.push(t);
        }
      }
    }
  } catch {
    /* permission / not available */
  }

  // Full ClipboardItem read — always merge (do not skip when event looks non-empty)
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          types.add(type);
          try {
            const blob = await item.getType(type);
            if (type === 'image/svg+xml' || type === 'image/svg') {
              svgBlobs.push(blob);
            } else if (type.startsWith('image/')) {
              imageBlobs.push({ type, blob });
            } else if (type.startsWith('text/') || type.startsWith('chemical/')) {
              const text = await blob.text();
              if (!text.trim()) continue;
              if (type === 'text/plain' || type === 'text') {
                const merged = preferSvgText(plain, text);
                if (merged !== plain && plain.trim() && !extractSvgMarkup(plain)) {
                  extras.push(plain);
                }
                plain = merged;
                if (text !== plain && extractSvgMarkup(text) === null) extras.push(text);
              } else if (type === 'text/html') {
                html = preferSvgText(html, text);
                if (text !== html) extras.push(text);
              } else {
                extras.push(text);
              }
            }
          } catch {
            /* per-type read may fail */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  return {
    plain,
    html,
    extras,
    files,
    imageBlobs,
    svgBlobs,
    types: [...types],
  };
}

export async function pasteOntoCanvas(result: PasteResult): Promise<boolean> {
  if ((result.kind === 'svg' || result.kind === 'chem') && result.svgContent) {
    const svg =
      result.kind === 'svg' ? prepareSvgForCanvas(result.svgContent) : result.svgContent;
    await addSvgToCanvas(svg, {
      name: result.name || (result.kind === 'chem' ? 'Molecule' : 'Pasted SVG'),
      maxSize: result.kind === 'chem' ? 200 : 220,
    });
    return true;
  }
  if (result.kind === 'image' && result.dataUrl) {
    await addImageFromDataUrl(result.dataUrl, {
      name: result.name || 'Pasted image',
    });
    return true;
  }
  return false;
}

export function pasteResultToLibraryIcon(result: PasteResult): LibraryIcon | null {
  if ((result.kind === 'svg' || result.kind === 'chem') && result.svgContent) {
    const name = result.name || (result.kind === 'chem' ? 'Molecule' : 'Pasted SVG');
    return {
      id: `user/paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      category: 'symbols',
      path: '',
      svgContent: result.svgContent,
      source: 'user',
      author: result.kind === 'chem' ? 'RDKit' : undefined,
      licenseLabel: result.kind === 'chem' ? 'RDKit' : undefined,
    };
  }
  if (result.kind === 'image' && result.dataUrl) {
    const name = result.name || 'Pasted image';
    return {
      id: `user/paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      category: 'symbols',
      path: result.dataUrl,
      source: 'user',
    };
  }
  return null;
}
