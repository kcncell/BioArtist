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

/** Pull a full <svg>…</svg> block out of plain text or HTML. */
export function extractSvgMarkup(raw: string): string | null {
  if (!raw || !raw.includes('<svg')) return null;
  const match = raw.match(/<svg\b[\s\S]*?<\/svg>/i);
  if (match) return match[0].trim();
  if (/<svg\b/i.test(raw) && /<\/svg>/i.test(raw)) {
    const start = raw.search(/<svg\b/i);
    const end = raw.toLowerCase().lastIndexOf('</svg>');
    if (start >= 0 && end > start) return raw.slice(start, end + 6).trim();
  }
  return null;
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
  // HTML sometimes wraps SMILES as plain body text
  if (snap.html && !extractSvgMarkup(snap.html)) {
    const stripped = snap.html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    push(stripped);
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
  if (readChemClipboard()?.svg || readChemClipboard()?.smiles) return true;
  if (snap.files.length || snap.imageBlobs.length || snap.svgBlobs.length) return true;
  if (extractSvgMarkup(snap.plain) || extractSvgMarkup(snap.html)) return true;
  if (/^data:image\//i.test(snap.plain.trim())) return true;
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
  // Files (Finder / Explorer copy)
  for (const file of snap.files) {
    const lower = file.name.toLowerCase();
    if (file.type === 'image/svg+xml' || lower.endsWith('.svg')) {
      const text = await file.text();
      const svg = extractSvgMarkup(text);
      if (svg) {
        return {
          kind: 'svg',
          name: file.name.replace(/\.svg$/i, '') || guessNameFromSvg(svg),
          svgContent: svg,
        };
      }
    }
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
      // Last resort: try whole file as SMILES
      const drawn = await chemTextToPasteResult(text.trim(), file.name.replace(/\.[^.]+$/, ''));
      if (drawn.kind !== 'none') return drawn;
    }
    if (file.type.startsWith('image/')) {
      return {
        kind: 'image',
        name: file.name.replace(/\.[^.]+$/, '') || 'Pasted image',
        dataUrl: await fileToDataUrl(file),
      };
    }
  }

  for (const blob of snap.svgBlobs) {
    const text = await blob.text();
    const svg = extractSvgMarkup(text);
    if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: svg };
  }

  const fromPlain = extractSvgMarkup(snap.plain);
  if (fromPlain) {
    return { kind: 'svg', name: guessNameFromSvg(fromPlain), svgContent: fromPlain };
  }
  const fromHtml = extractSvgMarkup(snap.html);
  if (fromHtml) {
    return { kind: 'svg', name: guessNameFromSvg(fromHtml), svgContent: fromHtml };
  }

  const dataSvg = snap.plain.trim().match(/^data:image\/svg\+xml[^,]*,([\s\S]+)$/i);
  if (dataSvg) {
    try {
      let decoded = dataSvg[1];
      if (/^charset=/i.test(decoded)) {
        const comma = snap.plain.indexOf(',');
        decoded = snap.plain.slice(comma + 1);
      }
      decoded = decodeURIComponent(decoded);
      const svg = extractSvgMarkup(decoded) || (decoded.includes('<svg') ? decoded : null);
      if (svg) return { kind: 'svg', name: guessNameFromSvg(svg), svgContent: svg };
    } catch {
      /* ignore */
    }
  }

  // Chem Studio / Ketcher: try every text candidate with RDKit
  const chem = extractChemFromSnap(snap);
  if (chem) {
    const drawn = await chemTextToPasteResult(chem.text);
    if (drawn.kind !== 'none') return drawn;
  }
  for (const t of allTextCandidates(snap)) {
    if (t.length > 2000) continue;
    const drawn = await chemTextToPasteResult(t);
    if (drawn.kind !== 'none') return drawn;
  }

  for (const { blob } of snap.imageBlobs) {
    return {
      kind: 'image',
      name: 'Pasted image',
      dataUrl: await fileToDataUrl(blob),
    };
  }

  // Chem Studio → figure bridge (localStorage). Used when system clipboard is empty
  // or browser blocked clipboard write in the studio tab.
  const fromStudio = pasteFromChemStudioClipboard();
  if (fromStudio) return fromStudio;

  // Last resort: SMILES only from Chem Studio clipboard
  const chemClip = readChemClipboard();
  if (chemClip?.smiles) {
    const drawn = await chemTextToPasteResult(chemClip.smiles, chemClip.name);
    if (drawn.kind !== 'none') return drawn;
  }

  return { kind: 'none' };
}

/**
 * Prefer Chem Studio bridge first (Copy for figure / Ketcher copy interceptor).
 * Call this from figure paste so studio → figure always wins when a recent
 * structure was copied in Chem Studio.
 */
export async function resolveChemStudioOrClipboard(
  snap: ClipboardSnap,
): Promise<PasteResult> {
  const clip = readChemClipboard();
  if (clip?.svg) {
    const fromStudio = pasteFromChemStudioClipboard();
    if (fromStudio) return fromStudio;
  }
  if (clip?.smiles) {
    const drawn = await chemTextToPasteResult(clip.smiles, clip.name);
    if (drawn.kind !== 'none') return drawn;
  }
  // System clipboard (SVG / SMILES / images)
  const system = await resolveClipboardSnapshot(snap);
  if (system.kind !== 'none') return system;
  // resolveClipboardSnapshot already tries chem bridge at the end; try once more
  return pasteFromChemStudioClipboard() || { kind: 'none' };
}

/**
 * Async fallback when paste event has empty plain text (some browsers / apps).
 * Must be called from a user-gesture paste handler.
 */
export async function enrichSnapFromAsyncClipboard(snap: ClipboardSnap): Promise<ClipboardSnap> {
  if (snap.plain.trim() || snap.extras.length) return snap;
  try {
    if (navigator.clipboard?.readText) {
      const t = await navigator.clipboard.readText();
      if (t?.trim()) {
        return { ...snap, plain: t };
      }
    }
  } catch {
    /* permission / not available */
  }
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const extras = [...snap.extras];
      let plain = snap.plain;
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('text/') || type.startsWith('chemical/')) {
            const blob = await item.getType(type);
            const text = await blob.text();
            if (!text.trim()) continue;
            if (type === 'text/plain' || type === 'text') plain = text;
            else extras.push(text);
          }
        }
      }
      return { ...snap, plain, extras };
    }
  } catch {
    /* ignore */
  }
  return snap;
}

export async function pasteOntoCanvas(result: PasteResult): Promise<boolean> {
  if ((result.kind === 'svg' || result.kind === 'chem') && result.svgContent) {
    await addSvgToCanvas(result.svgContent, {
      name: result.name || (result.kind === 'chem' ? 'Molecule' : 'Pasted SVG'),
      maxSize: result.kind === 'chem' ? 200 : undefined,
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
