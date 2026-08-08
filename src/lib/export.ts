/**
 * Professional figure export (Canva / BioRender-style).
 * Formats: PNG, JPG/JPEG, SVG, PDF · PPI control · web vs print intents.
 */
import { jsPDF } from 'jspdf';
import {
  exportRaster,
  exportSvg,
  getArtboardSize,
  withTransparentBackground,
} from './canvasController';
import { DESIGN_DPI } from './canvasPresets';

export type ExportFormat = 'png' | 'jpg' | 'jpeg' | 'svg' | 'pdf';
/** How the user intends to use the file — drives default PPI. */
export type ExportIntent = 'web' | 'print' | 'custom';

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
  description: string;
  supportsPpi: boolean;
  supportsQuality: boolean;
  supportsTransparent: boolean;
}[] = [
  {
    id: 'png',
    label: 'PNG',
    ext: 'png',
    description: 'Lossless raster · best for slides & transparency',
    supportsPpi: true,
    supportsQuality: false,
    supportsTransparent: true,
  },
  {
    id: 'jpg',
    label: 'JPG',
    ext: 'jpg',
    description: 'Compressed photo format · smaller files',
    supportsPpi: true,
    supportsQuality: true,
    supportsTransparent: false,
  },
  {
    id: 'jpeg',
    label: 'JPEG',
    ext: 'jpeg',
    description: 'Same as JPG · alternate extension',
    supportsPpi: true,
    supportsQuality: true,
    supportsTransparent: false,
  },
  {
    id: 'svg',
    label: 'SVG',
    ext: 'svg',
    description: 'Vector · Illustrator / Inkscape · resolution independent',
    supportsPpi: false,
    supportsQuality: false,
    supportsTransparent: false,
  },
  {
    id: 'pdf',
    label: 'PDF',
    ext: 'pdf',
    description: 'Print-ready single page · physical size preserved',
    supportsPpi: true,
    supportsQuality: false,
    supportsTransparent: false,
  },
];

/**
 * Web / online PPI.
 * 72–96 is classic email/web; 150–200 covers retina slides/screens;
 * 300 is optional “crisp HD web” (rarely needed for pure online use).
 */
export const WEB_PPI_OPTIONS = [72, 96, 150, 200, 300] as const;
/** Print / journal PPI. Default export is 300; 600 is available with a large-file warning. */
export const PRINT_PPI_OPTIONS = [150, 300, 600] as const;
export const ALL_PPI_OPTIONS = [72, 96, 150, 200, 300, 600] as const;

/** Soft warning when output may stress the browser (approx. RGBA megabytes). */
export const EXPORT_WARN_MEGAPIXELS = 25;
/** Stronger warning — likely to freeze or fail on many machines. */
export const EXPORT_DANGER_MEGAPIXELS = 50;

export function defaultPpiForIntent(intent: ExportIntent): number {
  if (intent === 'web') return 150; // retina-friendly default for slides / online
  if (intent === 'print') return 300; // journal / print standard
  return 150;
}

export function ppiOptionsForIntent(intent: ExportIntent): readonly number[] {
  if (intent === 'web') return WEB_PPI_OPTIONS;
  if (intent === 'print') return PRINT_PPI_OPTIONS;
  return ALL_PPI_OPTIONS;
}

export type ExportRiskLevel = 'ok' | 'warn' | 'danger';

export type ExportRisk = {
  level: ExportRiskLevel;
  /** Short banner title */
  title: string;
  /** Full message for the user */
  message: string;
  megapixels: number;
};

/**
 * Warn when high PPI + large artboard (e.g. posters @ 600 PPI) may hit browser memory limits.
 * Print default stays 300; anything above 300 on large canvases shows a warning.
 */
export function assessExportRisk(
  artboardW: number,
  artboardH: number,
  ppi: number,
  format: ExportFormat,
): ExportRisk | null {
  if (format === 'svg') return null; // vector — no raster memory spike

  const { w, h } = outputPixelSize(artboardW, artboardH, ppi);
  const megapixels = (w * h) / 1_000_000;
  const inches = artboardInches(artboardW, artboardH);
  const isLargeBoard = inches.w >= 20 || inches.h >= 20 || artboardW * artboardH > 2_500_000;
  const abovePrintDefault = ppi > 300;

  if (megapixels >= EXPORT_DANGER_MEGAPIXELS || (abovePrintDefault && isLargeBoard && megapixels >= 30)) {
    return {
      level: 'danger',
      title: 'Very large export — may fail in the browser',
      message: `About ${megapixels.toFixed(0)} megapixels (${w.toLocaleString()}×${h.toLocaleString()} px) at ${ppi} PPI. Large posters above 300 PPI often hit browser memory limits. Prefer 300 PPI for print, or export SVG/PDF at 300 PPI.`,
      megapixels,
    };
  }

  if (abovePrintDefault || megapixels >= EXPORT_WARN_MEGAPIXELS) {
    return {
      level: 'warn',
      title: abovePrintDefault
        ? 'High PPI on a large canvas'
        : 'Large export file',
      message: abovePrintDefault
        ? `${ppi} PPI produces ~${megapixels.toFixed(1)} MP (${w.toLocaleString()}×${h.toLocaleString()} px). For posters and big artboards, 300 PPI is the recommended default and is usually enough for print. 600 PPI can freeze or crash the tab.`
        : `Output is ~${megapixels.toFixed(1)} megapixels (${w.toLocaleString()}×${h.toLocaleString()} px). Export may be slow or use a lot of memory.`,
      megapixels,
    };
  }

  return null;
}

/** Short label for PPI chips (web intent). */
export function ppiChipLabel(ppi: number, intent: ExportIntent): string {
  if (intent === 'web') {
    if (ppi === 72) return '72';
    if (ppi === 96) return '96';
    if (ppi === 150) return '150';
    if (ppi === 200) return '200';
    if (ppi === 300) return '300';
  }
  return String(ppi);
}

export function ppiChipTitle(ppi: number, intent: ExportIntent): string {
  if (intent === 'web') {
    const map: Record<number, string> = {
      72: 'Classic web / email (smallest files)',
      96: 'Standard screen / CSS pixel density',
      150: 'Sharp slides & retina previews (recommended for web)',
      200: 'High-DPI displays & large monitors',
      300: 'Maximum web crispness (rarely needed online)',
    };
    return map[ppi] || `${ppi} PPI`;
  }
  if (intent === 'print') {
    const map: Record<number, string> = {
      150: 'Draft print / large-format proof',
      300: 'Journal & print standard (recommended)',
      600: 'Ultra-high print — heavy files; may fail on large posters',
    };
    return map[ppi] || `${ppi} PPI`;
  }
  return `${ppi} PPI`;
}

/**
 * Map export PPI → Fabric toDataURL multiplier.
 * Canvas is authored at DESIGN_DPI (96); multiplier = targetPpi / designDpi.
 */
export function ppiToMultiplier(ppi: number, designDpi = DESIGN_DPI): number {
  if (!Number.isFinite(ppi) || ppi <= 0) return 1;
  return Math.max(0.25, Math.min(10, ppi / designDpi));
}

export function outputPixelSize(
  artboardW: number,
  artboardH: number,
  ppi: number,
  designDpi = DESIGN_DPI,
): { w: number; h: number } {
  const m = ppiToMultiplier(ppi, designDpi);
  return {
    w: Math.max(1, Math.round(artboardW * m)),
    h: Math.max(1, Math.round(artboardH * m)),
  };
}

export function artboardInches(
  artboardW: number,
  artboardH: number,
  designDpi = DESIGN_DPI,
): { w: number; h: number } {
  return {
    w: Math.round((artboardW / designDpi) * 1000) / 1000,
    h: Math.round((artboardH / designDpi) * 1000) / 1000,
  };
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

function sanitize(name: string) {
  return (name || 'bioartist-figure').replace(/[^\w\-]+/g, '_').slice(0, 80);
}

export type ExportOptions = {
  projectName: string;
  format: ExportFormat;
  /** Pixels per inch for raster / PDF embed (ignored for SVG) */
  ppi: number;
  /** 0–1 JPEG quality */
  quality?: number;
  /** Transparent background (PNG only) */
  transparent?: boolean;
  intent?: ExportIntent;
};

/**
 * Run a full professional export and trigger a browser download.
 */
export async function exportFigure(opts: ExportOptions): Promise<{
  filename: string;
  widthPx: number;
  heightPx: number;
  ppi: number;
}> {
  const format = opts.format;
  const ppi = opts.ppi || 96;
  const quality = opts.quality ?? 0.92;
  const transparent = !!opts.transparent && format === 'png';
  const { width: aw, height: ah } = getArtboardSize();
  const mult = ppiToMultiplier(ppi);
  const out = outputPixelSize(aw, ah, ppi);
  const base = sanitize(opts.projectName);

  if (format === 'svg') {
    const svg = exportSvg();
    if (!svg) throw new Error('Canvas empty');
    const filename = `${base}.svg`;
    downloadText(filename, svg, 'image/svg+xml');
    return { filename, widthPx: aw, heightPx: ah, ppi: 0 };
  }

  if (format === 'pdf') {
    const dataUrl = transparent
      ? withTransparentBackground(() => exportRaster({ format: 'png', multiplier: mult }))
      : exportRaster({ format: 'png', multiplier: mult });
    if (!dataUrl) throw new Error('Canvas empty');

    const inches = artboardInches(aw, ah);
    // jsPDF max page dimension is large enough for posters; use inches
    const orientation = aw >= ah ? 'l' : 'p';
    const pdf = new jsPDF({
      orientation,
      unit: 'in',
      format: [inches.w, inches.h],
      compress: true,
    });
    // Page size already matches artboard inches
    pdf.addImage(dataUrl, 'PNG', 0, 0, inches.w, inches.h, undefined, 'FAST');
    const filename = `${base}.pdf`;
    pdf.save(filename);
    return { filename, widthPx: out.w, heightPx: out.h, ppi };
  }

  // Raster: png / jpg / jpeg
  const rasterFormat = format === 'png' ? 'png' : 'jpeg';
  const dataUrl = transparent
    ? withTransparentBackground(() =>
        exportRaster({ format: rasterFormat, multiplier: mult, quality }),
      )
    : exportRaster({ format: rasterFormat, multiplier: mult, quality });

  if (!dataUrl) throw new Error('Canvas empty');

  const ext = format === 'png' ? 'png' : format === 'jpeg' ? 'jpeg' : 'jpg';
  const filename = `${base}.${ext}`;
  downloadDataUrl(filename, dataUrl);
  return { filename, widthPx: out.w, heightPx: out.h, ppi };
}

/** @deprecated Use exportFigure — kept for any old call sites */
export function exportAsPng(projectName: string, multiplier = 2) {
  const dataUrl = exportRaster({ format: 'png', multiplier });
  if (!dataUrl) throw new Error('Canvas empty');
  downloadDataUrl(sanitize(projectName) + '.png', dataUrl);
}

/** @deprecated Use exportFigure */
export function exportAsSvg(projectName: string) {
  const svg = exportSvg();
  if (!svg) throw new Error('Canvas empty');
  downloadText(sanitize(projectName) + '.svg', svg, 'image/svg+xml');
}

/** @deprecated Use exportFigure */
export function exportAsPdf(projectName: string) {
  void exportFigure({
    projectName,
    format: 'pdf',
    ppi: 150,
    intent: 'print',
  });
}
