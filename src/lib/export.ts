import { jsPDF } from 'jspdf';
import { exportPng, exportSvg, getArtboardSize } from './canvasController';

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

export function exportAsPng(projectName: string, multiplier = 2) {
  const dataUrl = exportPng(multiplier);
  if (!dataUrl) throw new Error('Canvas empty');
  const name = sanitize(projectName) + '.png';
  downloadDataUrl(name, dataUrl);
}

export function exportAsSvg(projectName: string) {
  const svg = exportSvg();
  if (!svg) throw new Error('Canvas empty');
  downloadText(sanitize(projectName) + '.svg', svg, 'image/svg+xml');
}

export function exportAsPdf(projectName: string) {
  const dataUrl = exportPng(2);
  if (!dataUrl) throw new Error('Canvas empty');
  const { width, height } = getArtboardSize();
  // Convert px to mm roughly at 96dpi: 1px = 0.264583mm
  const wMm = width * 0.264583;
  const hMm = height * 0.264583;
  const orientation = width >= height ? 'l' : 'p';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [wMm, hMm],
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, wMm, hMm);
  pdf.save(sanitize(projectName) + '.pdf');
}

function sanitize(name: string) {
  return (name || 'bioartist-figure').replace(/[^\w\-]+/g, '_').slice(0, 80);
}
