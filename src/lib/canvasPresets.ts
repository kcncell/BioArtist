/**
 * Artboard size presets for New document.
 * Design canvas uses pixels; inches ↔ px via DESIGN_DPI (96 = CSS/PPT standard).
 * Publication sizes also listed at 300 DPI for journal-ready pixel counts.
 */

export const DESIGN_DPI = 96;
export const PRINT_DPI = 300;

export type SizeUnit = 'in' | 'px';

export type CanvasPreset = {
  id: string;
  label: string;
  /** Physical width in inches (0 if pure-pixel preset) */
  inchesW: number;
  inchesH: number;
  /** Canvas width in design pixels */
  w: number;
  /** Canvas height in design pixels */
  h: number;
  /** Optional note shown in the picker */
  note?: string;
};

export type CanvasPresetGroup = {
  id: string;
  label: string;
  description?: string;
  presets: CanvasPreset[];
};

export function inchesToPx(inches: number, dpi = DESIGN_DPI): number {
  return Math.max(1, Math.round(inches * dpi));
}

export function pxToInches(px: number, dpi = DESIGN_DPI): number {
  return Math.round((px / dpi) * 1000) / 1000;
}

function preset(
  id: string,
  label: string,
  inchesW: number,
  inchesH: number,
  opts?: { dpi?: number; note?: string },
): CanvasPreset {
  const dpi = opts?.dpi ?? DESIGN_DPI;
  return {
    id,
    label,
    inchesW,
    inchesH,
    w: inchesToPx(inchesW, dpi),
    h: inchesToPx(inchesH, dpi),
    note: opts?.note,
  };
}

function presetPx(
  id: string,
  label: string,
  w: number,
  h: number,
  note?: string,
): CanvasPreset {
  return {
    id,
    label,
    inchesW: pxToInches(w),
    inchesH: pxToInches(h),
    w,
    h,
    note,
  };
}

/** PowerPoint / Google Slides standard page sizes (inches @ 96 DPI). */
const POWERPOINT: CanvasPreset[] = [
  preset('ppt-16-9', 'Widescreen 16:9', 13.333, 7.5, {
    note: 'Default PowerPoint / Google Slides',
  }),
  preset('ppt-16-10', 'Widescreen 16:10', 13.333, 8.333, {
    note: 'Common laptop aspect',
  }),
  preset('ppt-4-3', 'Standard 4:3', 10, 7.5, { note: 'Classic PowerPoint' }),
  preset('ppt-a4-l', 'A4 Landscape', 11.69, 8.27, { note: 'ISO A4 landscape' }),
  preset('ppt-a4-p', 'A4 Portrait', 8.27, 11.69, { note: 'ISO A4 portrait' }),
  preset('ppt-letter-l', 'Letter Landscape', 11, 8.5, { note: 'US Letter' }),
  preset('ppt-letter-p', 'Letter Portrait', 8.5, 11, { note: 'US Letter' }),
  presetPx('ppt-1080p', 'Full HD 1920×1080', 1920, 1080, 'Pixels · 16:9'),
  presetPx('ppt-720p', 'HD 1280×720', 1280, 720, 'Pixels · 16:9'),
];

/** US conference posters (horizontal = landscape W×H, vertical = portrait). */
const POSTERS_US: CanvasPreset[] = [
  // Horizontal (landscape)
  preset('us-36x24-h', '36″ × 24″ Landscape', 36, 24, { note: 'Compact US poster' }),
  preset('us-48x36-h', '48″ × 36″ Landscape', 48, 36, {
    note: 'Most common US scientific poster',
  }),
  preset('us-42x30-h', '42″ × 30″ Landscape', 42, 30),
  preset('us-48x24-h', '48″ × 24″ Landscape', 48, 24),
  preset('us-60x36-h', '60″ × 36″ Landscape', 60, 36, { note: 'Wide banner poster' }),
  preset('us-72x36-h', '72″ × 36″ Landscape', 72, 36),
  preset('us-36x36', '36″ × 36″ Square', 36, 36),
  preset('us-42x42', '42″ × 42″ Square', 42, 42),
  // Vertical (portrait)
  preset('us-24x36-v', '24″ × 36″ Portrait', 24, 36),
  preset('us-36x48-v', '36″ × 48″ Portrait', 36, 48, { note: 'Tall US poster' }),
  preset('us-30x42-v', '30″ × 42″ Portrait', 30, 42),
  preset('us-36x60-v', '36″ × 60″ Portrait', 36, 60),
  preset('us-42x56-v', '42″ × 56″ Portrait', 42, 56),
];

/** Europe / ISO A-series (mm → inches). */
const POSTERS_EU: CanvasPreset[] = [
  // A0 841 × 1189 mm
  preset('eu-a0-p', 'A0 Portrait', 33.11, 46.81, { note: '841 × 1189 mm' }),
  preset('eu-a0-l', 'A0 Landscape', 46.81, 33.11, { note: '1189 × 841 mm' }),
  // A1 594 × 841 mm
  preset('eu-a1-p', 'A1 Portrait', 23.39, 33.11, { note: '594 × 841 mm' }),
  preset('eu-a1-l', 'A1 Landscape', 33.11, 23.39, { note: '841 × 594 mm' }),
  // A2 420 × 594 mm
  preset('eu-a2-p', 'A2 Portrait', 16.54, 23.39, { note: '420 × 594 mm' }),
  preset('eu-a2-l', 'A2 Landscape', 23.39, 16.54, { note: '594 × 420 mm' }),
  // A3
  preset('eu-a3-p', 'A3 Portrait', 11.69, 16.54, { note: '297 × 420 mm' }),
  preset('eu-a3-l', 'A3 Landscape', 16.54, 11.69, { note: '420 × 297 mm' }),
];

/**
 * Publication / journal figures (Nature-style columns + common pixel targets).
 * Pixel counts at 300 DPI match typical journal submission guidelines.
 */
const PUBLICATION: CanvasPreset[] = [
  // Nature-style at 300 DPI (design canvas = print pixels at 300 DPI)
  preset('pub-single', 'Single column (Nature-style)', 3.5, 3.5, {
    dpi: PRINT_DPI,
    note: '~89 mm · 300 DPI · square start',
  }),
  preset('pub-single-tall', 'Single column tall', 3.5, 5.0, {
    dpi: PRINT_DPI,
    note: '~89 × 127 mm · 300 DPI',
  }),
  preset('pub-1-5', '1.5 column', 4.72, 4.72, {
    dpi: PRINT_DPI,
    note: '~120 mm · 300 DPI',
  }),
  preset('pub-double', 'Double column', 7.2, 5.0, {
    dpi: PRINT_DPI,
    note: '~183 mm wide · 300 DPI',
  }),
  preset('pub-double-full', 'Double column full depth', 7.2, 9.72, {
    dpi: PRINT_DPI,
    note: '~183 × 247 mm · Nature page depth',
  }),
  // BioRender / digital figure friendly pixel canvases
  presetPx('pub-900x600', 'Figure 900×600', 900, 600, 'Default BioArtist figure'),
  presetPx('pub-1200x800', 'Figure 1200×800', 1200, 800, 'Wide figure'),
  presetPx('pub-1200x1200', 'Square 1200×1200', 1200, 1200, 'Abstract / social'),
  presetPx('pub-1500x1500', 'Square 1500×1500', 1500, 1500, 'High-res square'),
  presetPx('pub-2000x2000', 'Square 2000×2000', 2000, 2000, 'Publication square HD'),
  presetPx('pub-2400x1800', '2400×1800 (4:3 @ ~300 DPI)', 2400, 1800, '8″ × 6″ @ 300 DPI'),
  presetPx('pub-3600x2400', '3600×2400 landscape HD', 3600, 2400, '12″ × 8″ @ 300 DPI'),
];

export const CANVAS_PRESET_GROUPS: CanvasPresetGroup[] = [
  {
    id: 'powerpoint',
    label: 'PowerPoint / slides',
    description: 'Standard presentation page sizes',
    presets: POWERPOINT,
  },
  {
    id: 'posters-us',
    label: 'Posters — United States',
    description: 'Common conference poster sizes (inches)',
    presets: POSTERS_US,
  },
  {
    id: 'posters-eu',
    label: 'Posters — Europe / ISO',
    description: 'A-series (A0–A3), portrait & landscape',
    presets: POSTERS_EU,
  },
  {
    id: 'publication',
    label: 'Publication / journal figures',
    description: 'Nature-style columns @ 300 DPI + HD pixel canvases (BioRender-style)',
    presets: PUBLICATION,
  },
];

export function formatPresetSize(p: CanvasPreset, unit: SizeUnit): string {
  if (unit === 'in') {
    const w = p.inchesW > 0 ? p.inchesW.toFixed(p.inchesW >= 10 ? 1 : 2) : pxToInches(p.w).toFixed(2);
    const h = p.inchesH > 0 ? p.inchesH.toFixed(p.inchesH >= 10 ? 1 : 2) : pxToInches(p.h).toFixed(2);
    return `${w}″ × ${h}″`;
  }
  return `${p.w} × ${p.h} px`;
}

export function customSizeToPixels(
  w: number,
  h: number,
  unit: SizeUnit,
  dpi = DESIGN_DPI,
): { w: number; h: number } {
  if (unit === 'px') {
    return {
      w: Math.max(100, Math.min(12000, Math.round(w))),
      h: Math.max(100, Math.min(12000, Math.round(h))),
    };
  }
  return {
    w: Math.max(100, Math.min(12000, inchesToPx(w, dpi))),
    h: Math.max(100, Math.min(12000, inchesToPx(h, dpi))),
  };
}
