import { ProteinImportBox } from './ProteinImportBox';

export function PdbPanel() {
  return (
    <aside className="ba-left-panel">
      <div className="ba-panel-header">PDB / UniProt</div>
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
