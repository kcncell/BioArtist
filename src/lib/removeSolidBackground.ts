/**
 * Phase 1: remove solid / near-white backgrounds from a raster image (hard edges).
 * Returns a PNG data URL with alpha, or null if nothing useful could be done.
 */

export type Rgb = { r: number; g: number; b: number };

export type RemoveBgOptions = {
  /** Color distance 0–255 (Euclidean-ish max channel delta). Default 28. */
  tolerance?: number;
  /** Target background color. Default white. */
  color?: Rgb;
  /**
   * If true, only remove pixels connected to the image border (flood from edges).
   * Default false — remove all near-color pixels (best for solid white plates).
   */
  borderConnectedOnly?: boolean;
};

function colorDist(r: number, g: number, b: number, c: Rgb): number {
  return Math.max(Math.abs(r - c.r), Math.abs(g - c.g), Math.abs(b - c.b));
}

function isBg(r: number, g: number, b: number, a: number, c: Rgb, tol: number): boolean {
  if (a < 8) return true; // already transparent
  return colorDist(r, g, b, c) <= tol;
}

/**
 * Process ImageData in place: set matching pixels to alpha 0.
 * Returns number of pixels made transparent.
 */
export function keyOutSolidColor(
  data: ImageData,
  opts: RemoveBgOptions = {},
): number {
  const tol = opts.tolerance ?? 28;
  const color = opts.color ?? { r: 255, g: 255, b: 255 };
  const { width, height } = data;
  const d = data.data;
  const n = width * height;

  if (!opts.borderConnectedOnly) {
    let removed = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const r = d[o]!;
      const g = d[o + 1]!;
      const b = d[o + 2]!;
      const a = d[o + 3]!;
      if (isBg(r, g, b, a, color, tol) && a > 0) {
        d[o + 3] = 0;
        removed++;
      }
    }
    return removed;
  }

  // Border-connected flood fill (4-connected)
  const mark = new Uint8Array(n); // 1 = bg candidate, 2 = flood keep (remove)
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (isBg(d[o]!, d[o + 1]!, d[o + 2]!, d[o + 3]!, color, tol)) mark[i] = 1;
  }

  const stack: number[] = [];
  const pushIf = (i: number) => {
    if (i < 0 || i >= n) return;
    if (mark[i] !== 1) return;
    mark[i] = 2;
    stack.push(i);
  };

  for (let x = 0; x < width; x++) {
    pushIf(x);
    pushIf((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    pushIf(y * width);
    pushIf(y * width + (width - 1));
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) pushIf(i - 1);
    if (x < width - 1) pushIf(i + 1);
    if (y > 0) pushIf(i - width);
    if (y < height - 1) pushIf(i + width);
  }

  let removed = 0;
  for (let i = 0; i < n; i++) {
    if (mark[i] === 2) {
      const o = i * 4;
      if (d[o + 3]! > 0) {
        d[o + 3] = 0;
        removed++;
      }
    }
  }
  return removed;
}

/**
 * Load an image source (HTMLImageElement / HTMLCanvasElement / data URL string)
 * into ImageData, key out background, return PNG data URL.
 */
export async function removeSolidBackgroundFromSource(
  source: HTMLImageElement | HTMLCanvasElement | string,
  opts: RemoveBgOptions = {},
): Promise<{ dataUrl: string; removed: number; width: number; height: number }> {
  let img: HTMLImageElement | HTMLCanvasElement;
  if (typeof source === 'string') {
    img = await loadImage(source);
  } else {
    img = source;
  }

  const width =
    img instanceof HTMLImageElement
      ? img.naturalWidth || img.width
      : img.width;
  const height =
    img instanceof HTMLImageElement
      ? img.naturalHeight || img.height
      : img.height;

  if (!width || !height) {
    throw new Error('Image has no dimensions');
  }

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get 2d context');

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    throw new Error(
      'Cannot read pixels (cross-origin image). Re-import the image, then try again.',
    );
  }

  const removed = keyOutSolidColor(imageData, opts);
  ctx.putImageData(imageData, 0, 0);
  const dataUrl = off.toDataURL('image/png');
  return { dataUrl, removed, width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
