export type IconCategory =
  | 'cell'
  | 'dna'
  | 'protein'
  | 'lab'
  | 'arrows'
  | 'symbols'
  | 'all'
  | 'uploads'
  | 'mcp';

export interface LibraryIcon {
  id: string;
  name: string;
  /** Built-in categories or free-form pack categories */
  category: string;
  path: string;
  svgContent?: string;
  source?: 'builtin' | 'user' | 'bioicons' | 'nih' | 'mcp';
  license?: string;
  licenseLabel?: string;
  licenseUrl?: string;
  author?: string;
  attributionRequired?: boolean;
  pack?: string;
}

export const CATEGORIES: { id: IconCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cell', label: 'Cell' },
  { id: 'dna', label: 'DNA/RNA' },
  { id: 'protein', label: 'Protein' },
  { id: 'lab', label: 'Lab' },
  { id: 'arrows', label: 'Arrows' },
  { id: 'symbols', label: 'Symbols' },
  { id: 'mcp', label: 'MCP imported' },
];

/** Icons brought in via Sync MCP inbox */
export function isMcpIcon(icon: LibraryIcon): boolean {
  return icon.source === 'mcp' || icon.id.startsWith('mcp/');
}

/** User / MCP / pasted icons can be deleted; built-in and CDN pack catalogs cannot. */
export function isRemovableLibraryIcon(icon: LibraryIcon): boolean {
  if (icon.source === 'builtin' || icon.source === 'bioicons') return false;
  if (icon.pack === 'bioicons') return false;
  if (icon.source === 'user' || icon.source === 'mcp' || icon.source === 'nih') return true;
  // pasted / imported without source but with svg content
  if (icon.svgContent || icon.path.startsWith('data:')) return true;
  return false;
}

export const BUILTIN_ICONS: LibraryIcon[] = [
  {
    "id": "cell/animal-cell",
    "name": "Animal cell",
    "category": "cell",
    "path": "/library/cell/animal-cell.svg"
  },
  {
    "id": "cell/bacteria",
    "name": "Bacteria",
    "category": "cell",
    "path": "/library/cell/bacteria.svg"
  },
  {
    "id": "cell/er",
    "name": "ER",
    "category": "cell",
    "path": "/library/cell/er.svg"
  },
  {
    "id": "cell/golgi",
    "name": "Golgi",
    "category": "cell",
    "path": "/library/cell/golgi.svg"
  },
  {
    "id": "cell/lysosome",
    "name": "Lysosome",
    "category": "cell",
    "path": "/library/cell/lysosome.svg"
  },
  {
    "id": "cell/macrophage",
    "name": "Macrophage",
    "category": "cell",
    "path": "/library/cell/macrophage.svg"
  },
  {
    "id": "cell/membrane",
    "name": "Membrane",
    "category": "cell",
    "path": "/library/cell/membrane.svg"
  },
  {
    "id": "cell/mitochondria",
    "name": "Mitochondria",
    "category": "cell",
    "path": "/library/cell/mitochondria.svg"
  },
  {
    "id": "cell/nucleus",
    "name": "Nucleus",
    "category": "cell",
    "path": "/library/cell/nucleus.svg"
  },
  {
    "id": "cell/t-cell",
    "name": "T cell",
    "category": "cell",
    "path": "/library/cell/t-cell.svg"
  },
  {
    "id": "cell/virus",
    "name": "Virus",
    "category": "cell",
    "path": "/library/cell/virus.svg"
  },
  {
    "id": "dna/chromosome",
    "name": "Chromosome",
    "category": "dna",
    "path": "/library/dna/chromosome.svg"
  },
  {
    "id": "dna/crispr",
    "name": "CRISPR",
    "category": "dna",
    "path": "/library/dna/crispr.svg"
  },
  {
    "id": "dna/dna-strand",
    "name": "DNA strand",
    "category": "dna",
    "path": "/library/dna/dna-strand.svg"
  },
  {
    "id": "dna/double-helix",
    "name": "Double helix",
    "category": "dna",
    "path": "/library/dna/double-helix.svg"
  },
  {
    "id": "dna/mrna",
    "name": "mRNA",
    "category": "dna",
    "path": "/library/dna/mrna.svg"
  },
  {
    "id": "dna/nucleotide",
    "name": "Nucleotide",
    "category": "dna",
    "path": "/library/dna/nucleotide.svg"
  },
  {
    "id": "dna/plasmid",
    "name": "Plasmid",
    "category": "dna",
    "path": "/library/dna/plasmid.svg"
  },
  {
    "id": "protein/antibody",
    "name": "Antibody",
    "category": "protein",
    "path": "/library/protein/antibody.svg"
  },
  {
    "id": "protein/cytokine",
    "name": "Cytokine",
    "category": "protein",
    "path": "/library/protein/cytokine.svg"
  },
  {
    "id": "protein/enzyme",
    "name": "Enzyme",
    "category": "protein",
    "path": "/library/protein/enzyme.svg"
  },
  {
    "id": "protein/globular-protein",
    "name": "Protein",
    "category": "protein",
    "path": "/library/protein/globular-protein.svg"
  },
  {
    "id": "protein/ion-channel",
    "name": "Ion channel",
    "category": "protein",
    "path": "/library/protein/ion-channel.svg"
  },
  {
    "id": "protein/kinase",
    "name": "Kinase",
    "category": "protein",
    "path": "/library/protein/kinase.svg"
  },
  {
    "id": "protein/ligand",
    "name": "Ligand",
    "category": "protein",
    "path": "/library/protein/ligand.svg"
  },
  {
    "id": "protein/receptor",
    "name": "Receptor",
    "category": "protein",
    "path": "/library/protein/receptor.svg"
  },
  {
    "id": "protein/transcription-factor",
    "name": "TF",
    "category": "protein",
    "path": "/library/protein/transcription-factor.svg"
  },
  {
    "id": "lab/centrifuge",
    "name": "Centrifuge",
    "category": "lab",
    "path": "/library/lab/centrifuge.svg"
  },
  {
    "id": "lab/eppendorf",
    "name": "Eppendorf tube",
    "category": "lab",
    "path": "/library/lab/eppendorf.svg"
  },
  {
    "id": "lab/flask-blue",
    "name": "Flask (blue)",
    "category": "lab",
    "path": "/library/lab/flask-blue.svg"
  },
  {
    "id": "lab/flask-eppendorf-pipette-96well",
    "name": "Lab setup: pipette + plate",
    "category": "lab",
    "path": "/library/lab/flask-eppendorf-pipette-96well.svg"
  },
  {
    "id": "lab/flask",
    "name": "Flask",
    "category": "lab",
    "path": "/library/lab/flask.svg"
  },
  {
    "id": "lab/microscope",
    "name": "Microscope",
    "category": "lab",
    "path": "/library/lab/microscope.svg"
  },
  {
    "id": "lab/pcr",
    "name": "PCR tube",
    "category": "lab",
    "path": "/library/lab/pcr.svg"
  },
  {
    "id": "lab/petri-dish",
    "name": "Petri dish",
    "category": "lab",
    "path": "/library/lab/petri-dish.svg"
  },
  {
    "id": "lab/pipette-detail",
    "name": "Pipette",
    "category": "lab",
    "path": "/library/lab/pipette-detail.svg"
  },
  {
    "id": "lab/pipette",
    "name": "Pipette",
    "category": "lab",
    "path": "/library/lab/pipette.svg"
  },
  {
    "id": "lab/syringe",
    "name": "Syringe",
    "category": "lab",
    "path": "/library/lab/syringe.svg"
  },
  {
    "id": "lab/test-tube",
    "name": "Test tube",
    "category": "lab",
    "path": "/library/lab/test-tube.svg"
  },
  {
    "id": "lab/well-plate-96-blue",
    "name": "96-well plate (blue)",
    "category": "lab",
    "path": "/library/lab/well-plate-96-blue.svg"
  },
  {
    "id": "lab/well-plate",
    "name": "Well plate",
    "category": "lab",
    "path": "/library/lab/well-plate.svg"
  },
  {
    "id": "arrows/arrow-curved",
    "name": "Curved arrow",
    "category": "arrows",
    "path": "/library/arrows/arrow-curved.svg"
  },
  {
    "id": "arrows/arrow-dashed",
    "name": "Dashed arrow",
    "category": "arrows",
    "path": "/library/arrows/arrow-dashed.svg"
  },
  {
    "id": "arrows/arrow-double",
    "name": "Double arrow",
    "category": "arrows",
    "path": "/library/arrows/arrow-double.svg"
  },
  {
    "id": "arrows/arrow-inhibit",
    "name": "Inhibition",
    "category": "arrows",
    "path": "/library/arrows/arrow-inhibit.svg"
  },
  {
    "id": "arrows/arrow-right",
    "name": "Arrow",
    "category": "arrows",
    "path": "/library/arrows/arrow-right.svg"
  },
  {
    "id": "symbols/check",
    "name": "Check",
    "category": "symbols",
    "path": "/library/symbols/check.svg"
  },
  {
    "id": "symbols/cross",
    "name": "Cross",
    "category": "symbols",
    "path": "/library/symbols/cross.svg"
  },
  {
    "id": "symbols/label-box",
    "name": "Callout",
    "category": "symbols",
    "path": "/library/symbols/label-box.svg"
  },
  {
    "id": "symbols/legend-box",
    "name": "Legend",
    "category": "symbols",
    "path": "/library/symbols/legend-box.svg"
  },
  {
    "id": "symbols/plus",
    "name": "Plus",
    "category": "symbols",
    "path": "/library/symbols/plus.svg"
  },
  {
    "id": "symbols/scale-bar",
    "name": "Scale bar",
    "category": "symbols",
    "path": "/library/symbols/scale-bar.svg"
  },
  {
    "id": "symbols/star",
    "name": "Star",
    "category": "symbols",
    "path": "/library/symbols/star.svg"
  }
].map((i) => ({
  ...i,
  category: i.category as LibraryIcon['category'],
  source: 'builtin' as const,
}));
