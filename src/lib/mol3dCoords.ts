/**
 * Resolve a SMILES (or molfile) into a 3D SDF/molblock for ball-and-stick viewing.
 * Primary: PubChem 3D conformers. Fallback: NCI/CADD CIR 3D SDF.
 * Last resort: RDKit 2D molblock (flat — still viewable/rotatable in plane).
 */
import { getRDKit } from './rdkit';

export type Mol3DSource = 'pubchem' | 'cir' | 'rdkit-2d' | 'input-molfile';

export type Mol3DResult = {
  sdf: string;
  source: Mol3DSource;
  /** True when Z coords are non-zero (real 3D). */
  is3d: boolean;
};

function molblockHas3D(mb: string): boolean {
  const lines = mb.replace(/\r\n/g, '\n').split('\n');
  let countsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('V2000') || lines[i].includes('V3000')) {
      countsIdx = i;
      break;
    }
  }
  if (countsIdx < 0) return false;
  const m = lines[countsIdx].match(/^\s*(\d+)/);
  const nAtoms = m ? Number(m[1]) : 0;
  if (!nAtoms) return false;
  let maxAbsZ = 0;
  for (let i = 0; i < nAtoms; i++) {
    const line = (lines[countsIdx + 1 + i] || '').padEnd(40, ' ');
    let z = Number(line.slice(20, 30).trim());
    if (!Number.isFinite(z)) {
      const parts = line.trim().split(/\s+/);
      z = Number(parts[2]);
    }
    if (Number.isFinite(z)) maxAbsZ = Math.max(maxAbsZ, Math.abs(z));
  }
  return maxAbsZ > 0.01;
}

async function fetchPubChem3D(smiles: string): Promise<string | null> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes('V2000') && !text.includes('V3000')) return null;
    return text;
  } catch {
    return null;
  }
}

async function fetchCir3D(smiles: string): Promise<string | null> {
  // NCI Chemical Identifier Resolver
  const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/file?format=sdf&get3d=True`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes('V2000') && !text.includes('V3000') && !/\$\$\$\$/.test(text)) {
      // CIR may return plain mol without M END in rare cases
      if (!/^\s*-?\d/.test(text.split('\n').find((l) => l.trim()) || '')) return null;
    }
    if (text.toLowerCase().includes('page not found') || text.length < 40) return null;
    return text;
  } catch {
    return null;
  }
}

async function rdkit2DMolblock(smiles: string): Promise<string | null> {
  try {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol(smiles);
    if (!mol) return null;
    try {
      if (typeof mol.add_hs === 'function') {
        try {
          mol.add_hs();
        } catch {
          /* optional */
        }
      }
      if (typeof mol.set_new_coords === 'function') {
        try {
          mol.set_new_coords(true);
        } catch {
          try {
            mol.set_new_coords();
          } catch {
            /* keep */
          }
        }
      }
      const mb = typeof mol.get_molblock === 'function' ? mol.get_molblock() : '';
      return mb || null;
    } finally {
      mol.delete();
    }
  } catch {
    return null;
  }
}

/**
 * Obtain 3D (preferred) or 2D molblock for interactive ball-and-stick viewing.
 */
export async function resolveMol3D(
  smilesOrMol: string,
  opts?: { preferMolfile3d?: string },
): Promise<Mol3DResult | null> {
  const input = smilesOrMol.trim();
  if (!input) return null;

  // Explicit 3D molfile from caller
  if (opts?.preferMolfile3d && molblockHas3D(opts.preferMolfile3d)) {
    return { sdf: opts.preferMolfile3d, source: 'input-molfile', is3d: true };
  }

  // Input already looks like a molfile with 3D
  if ((input.includes('V2000') || input.includes('V3000')) && molblockHas3D(input)) {
    return { sdf: input, source: 'input-molfile', is3d: true };
  }

  // SMILES path
  const smiles = input.includes('V2000') || input.includes('V3000') ? null : input;

  if (smiles) {
    // Trust PubChem / CIR records as 3D even when planar (e.g. benzene z≈0)
    const pub = await fetchPubChem3D(smiles);
    if (pub) {
      return {
        sdf: pub,
        source: 'pubchem',
        is3d: molblockHas3D(pub) || /3D/i.test(pub.slice(0, 200)),
      };
    }
    const cir = await fetchCir3D(smiles);
    if (cir) {
      return {
        sdf: cir,
        source: 'cir',
        is3d: molblockHas3D(cir) || /3D/i.test(cir.slice(0, 200)),
      };
    }
    // 2D fallback so something still shows
    const flat = await rdkit2DMolblock(smiles);
    if (flat) {
      return { sdf: flat, source: 'rdkit-2d', is3d: false };
    }
  }

  // Molfile 2D fallback
  if (input.includes('V2000') || input.includes('V3000')) {
    return { sdf: input, source: 'input-molfile', is3d: molblockHas3D(input) };
  }

  return null;
}
