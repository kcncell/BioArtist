import { Library } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { ProteinImportBox } from './ProteinImportBox';

export function PdbPanel() {
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);

  return (
    <aside className="ba-left-panel">
      <div className="ba-panel-header">PDB / UniProt</div>
      <div style={{ padding: '0 12px 10px' }}>
        <button
          className="ba-btn"
          style={{ width: '100%' }}
          onClick={() => {
            setTool('library');
            setLibraryTab('library');
          }}
        >
          <Library size={14} /> Back to icon library
        </button>
      </div>
      <div className="ba-panel-sub">
        Search RCSB for protein structures. Import a ribbon image with the white background removed so
        it layers over your figure.
      </div>
      <div className="ba-pdb-panel-body">
        <ProteinImportBox embedded />
      </div>
    </aside>
  );
}
