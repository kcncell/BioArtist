import { FileImage, FileText, FileType } from 'lucide-react';
import { exportAsPdf, exportAsPng, exportAsSvg } from '../../lib/export';
import { useAppStore } from '../../store/appStore';

export function ExportDialog() {
  const open = useAppStore((s) => s.exportOpen);
  const setExportOpen = useAppStore((s) => s.setExportOpen);
  const projectName = useAppStore((s) => s.projectName);
  const showToast = useAppStore((s) => s.showToast);

  if (!open) return null;

  const run = (fn: () => void, label: string) => {
    try {
      fn();
      showToast(`Exported ${label}`);
      setExportOpen(false);
    } catch {
      showToast('Export failed');
    }
  };

  return (
    <div className="ba-modal-backdrop" onClick={() => setExportOpen(false)}>
      <div className="ba-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Export figure</h3>
        <p>Download a publication-ready image of your current canvas artboard.</p>

        <div className="ba-export-options">
          <button
            className="ba-export-option"
            onClick={() => run(() => exportAsPng(projectName), 'PNG')}
          >
            <FileImage size={22} color="#8ec5ff" />
            <div>
              <strong>PNG (2× retina)</strong>
              <span>High-resolution raster for slides and manuscripts</span>
            </div>
          </button>
          <button
            className="ba-export-option"
            onClick={() => run(() => exportAsSvg(projectName), 'SVG')}
          >
            <FileType size={22} color="#16a34a" />
            <div>
              <strong>SVG</strong>
              <span>Vector format for editing in Illustrator or Inkscape</span>
            </div>
          </button>
          <button
            className="ba-export-option"
            onClick={() => run(() => exportAsPdf(projectName), 'PDF')}
          >
            <FileText size={22} color="#dc2626" />
            <div>
              <strong>PDF (raster page)</strong>
              <span>Single-page document with a flattened artboard image</span>
            </div>
          </button>
        </div>

        <div className="ba-modal-actions">
          <button className="ba-btn" onClick={() => setExportOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
