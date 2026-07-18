/**
 * Resolve protein name / UniProt / PDB → ribbon-style structure image.
 * Sources: UniProt REST, RCSB Search API, RCSB CDN images.
 */

export interface ProteinHit {
  pdbId: string;
  title: string;
  uniprotId?: string;
  imageUrl: string;
  source: 'rcsb' | 'uniprot+rcsb';
}

function normalizePdbId(raw: string): string | null {
  const id = raw.trim().toUpperCase();
  if (/^[0-9][A-Z0-9]{3}$/.test(id)) return id;
  return null;
}

function normalizeUniprot(raw: string): string | null {
  const id = raw.trim().toUpperCase();
  // e.g. P69905, A0A024R1R8
  if (/^[A-NR-Z][0-9][A-Z0-9]{3}[0-9]$/.test(id) || /^[A-NR-Z][0-9][A-Z][A-Z0-9]{3}[0-9]$/.test(id)) {
    return id;
  }
  // newer UniProt accessions
  if (/^[OPQ][0-9][A-Z0-9]{3}[0-9]$/.test(id)) return id;
  if (/^[A-NR-Z][0-9][A-Z][A-Z0-9]{3}[0-9]$/.test(id)) return id;
  return null;
}

/** RCSB CDN path: 4HHB → hh/4hhb/4hhb_assembly-1.jpeg */
export function rcsbRibbonImageUrl(pdbId: string): string {
  const id = pdbId.toLowerCase();
  const mid = id.slice(1, 3);
  // Prefer assembly cartoon; fallbacks handled by caller
  return `https://cdn.rcsb.org/images/structures/${mid}/${id}/${id}_assembly-1.jpeg`;
}

export function rcsbModelImageUrl(pdbId: string): string {
  const id = pdbId.toLowerCase();
  const mid = id.slice(1, 3);
  return `https://cdn.rcsb.org/images/structures/${mid}/${id}/${id}_model-1.jpeg`;
}

async function rcsbSearch(query: string, rows = 8): Promise<string[]> {
  const body = {
    query: {
      type: 'terminal',
      service: 'full_text',
      parameters: { value: query },
    },
    return_type: 'entry',
    request_options: {
      paginate: { start: 0, rows },
      sort: [{ sort_by: 'score', direction: 'desc' }],
    },
  };

  // Prefer Vite proxy in dev to avoid CORS issues
  const urls = ['/api/rcsb-search/rcsbsearch/v2/query', 'https://search.rcsb.org/rcsbsearch/v2/query'];

  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        lastErr = new Error(`RCSB search ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        result_set?: { identifier: string }[];
      };
      return (data.result_set || []).map((r) => r.identifier.toUpperCase());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RCSB search failed');
}

async function rcsbEntryTitle(pdbId: string): Promise<string> {
  const id = pdbId.toLowerCase();
  const urls = [
    `/api/rcsb-data/rest/v1/core/entry/${id}`,
    `https://data.rcsb.org/rest/v1/core/entry/${id}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        struct?: { title?: string };
      };
      if (data.struct?.title) return data.struct.title;
    } catch {
      /* try next */
    }
  }
  return `PDB ${pdbId.toUpperCase()}`;
}

async function uniprotToPdbs(accession: string): Promise<{ title: string; pdbs: string[] }> {
  const acc = accession.toUpperCase();
  const urls = [
    `/api/uniprot/uniprotkb/${acc}.json?fields=accession,protein_name,xref_pdb`,
    `https://rest.uniprot.org/uniprotkb/${acc}.json?fields=accession,protein_name,xref_pdb`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        proteinDescription?: {
          recommendedName?: { fullName?: { value?: string } };
        };
        uniProtKBCrossReferences?: { database?: string; id?: string }[];
      };
      const title =
        data.proteinDescription?.recommendedName?.fullName?.value || `UniProt ${acc}`;
      const pdbs = (data.uniProtKBCrossReferences || [])
        .filter((x) => x.database === 'PDB' && x.id)
        .map((x) => String(x.id).toUpperCase());
      return { title, pdbs };
    } catch {
      /* next */
    }
  }
  throw new Error(`UniProt lookup failed for ${acc}`);
}

async function uniprotSearch(name: string): Promise<{ accession: string; title: string } | null> {
  const q = encodeURIComponent(`(${name}) AND (reviewed:true)`);
  const urls = [
    `/api/uniprot/uniprotkb/search?query=${q}&format=json&size=5&fields=accession,protein_name,xref_pdb`,
    `https://rest.uniprot.org/uniprotkb/search?query=${q}&format=json&size=5&fields=accession,protein_name,xref_pdb`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: {
          primaryAccession?: string;
          proteinDescription?: {
            recommendedName?: { fullName?: { value?: string } };
          };
        }[];
      };
      const hit = data.results?.[0];
      if (!hit?.primaryAccession) return null;
      return {
        accession: hit.primaryAccession,
        title:
          hit.proteinDescription?.recommendedName?.fullName?.value || hit.primaryAccession,
      };
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Resolve free text → list of structure hits with ribbon image URLs.
 */
export async function searchProteinStructures(query: string): Promise<ProteinHit[]> {
  const q = query.trim();
  if (!q) return [];

  // Direct PDB ID
  const pdbDirect = normalizePdbId(q);
  if (pdbDirect) {
    const title = await rcsbEntryTitle(pdbDirect);
    return [
      {
        pdbId: pdbDirect,
        title,
        imageUrl: rcsbRibbonImageUrl(pdbDirect),
        source: 'rcsb',
      },
    ];
  }

  // UniProt accession
  const up = normalizeUniprot(q);
  if (up) {
    const { title, pdbs } = await uniprotToPdbs(up);
    if (!pdbs.length) {
      throw new Error(`UniProt ${up} has no linked PDB structures`);
    }
    const hits: ProteinHit[] = [];
    for (const pdbId of pdbs.slice(0, 6)) {
      hits.push({
        pdbId,
        title: `${title} (${pdbId})`,
        uniprotId: up,
        imageUrl: rcsbRibbonImageUrl(pdbId),
        source: 'uniprot+rcsb',
      });
    }
    return hits;
  }

  // Free-text: UniProt first, then RCSB
  const uni = await uniprotSearch(q);
  if (uni) {
    try {
      const { title, pdbs } = await uniprotToPdbs(uni.accession);
      if (pdbs.length) {
        return pdbs.slice(0, 6).map((pdbId) => ({
          pdbId,
          title: `${title} (${pdbId})`,
          uniprotId: uni.accession,
          imageUrl: rcsbRibbonImageUrl(pdbId),
          source: 'uniprot+rcsb' as const,
        }));
      }
    } catch {
      /* fall through to RCSB */
    }
  }

  const ids = await rcsbSearch(q, 6);
  const hits: ProteinHit[] = [];
  for (const pdbId of ids) {
    const title = await rcsbEntryTitle(pdbId);
    hits.push({
      pdbId,
      title,
      imageUrl: rcsbRibbonImageUrl(pdbId),
      source: 'rcsb',
    });
  }
  return hits;
}

/** Fetch image as data URL (works around canvas taint / CORS when proxied). */
export async function fetchStructureImageDataUrl(
  pdbId: string,
  opts?: { transparentBg?: boolean },
): Promise<string> {
  const transparentBg = opts?.transparentBg !== false;
  const candidates = [
    // dev proxies first
    `/api/rcsb-img/images/structures/${pdbId.toLowerCase().slice(1, 3)}/${pdbId.toLowerCase()}/${pdbId.toLowerCase()}_assembly-1.jpeg`,
    `/api/rcsb-img/images/structures/${pdbId.toLowerCase().slice(1, 3)}/${pdbId.toLowerCase()}/${pdbId.toLowerCase()}_model-1.jpeg`,
    rcsbRibbonImageUrl(pdbId),
    rcsbModelImageUrl(pdbId),
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') && blob.size < 100) continue;
      const dataUrl = await blobToDataUrl(blob);
      if (transparentBg) {
        return await makeNearWhiteTransparent(dataUrl);
      }
      return dataUrl;
    } catch {
      /* try next */
    }
  }
  throw new Error(`No ribbon image for PDB ${pdbId}`);
}

/**
 * Punch out white / near-white backgrounds so ribbon cartoons layer over other figures.
 * Soft edge avoids jagged halos around the protein.
 */
export function makeNearWhiteTransparent(
  dataUrl: string,
  options?: { whiteThreshold?: number; softEdge?: number },
): Promise<string> {
  const whiteThreshold = options?.whiteThreshold ?? 248;
  const softEdge = options?.softEdge ?? 28;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Canvas not available'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        const floor = whiteThreshold - softEdge;

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const minC = Math.min(r, g, b);
          const maxC = Math.max(r, g, b);
          const chroma = maxC - minC;
          // Luma — white/gray backgrounds score high with low chroma
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;

          // Strong white / light gray plate
          if (luma >= whiteThreshold && chroma < 18) {
            d[i + 3] = 0;
            continue;
          }
          // Soft fringe around the structure
          if (luma >= floor && chroma < 35) {
            const t = Math.min(1, Math.max(0, (luma - floor) / softEdge));
            // More transparent as we approach pure white; keep colored pixels
            const chromaKeep = Math.min(1, chroma / 35);
            const fade = t * (1 - chromaKeep * 0.85);
            d[i + 3] = Math.round(d[i + 3] * (1 - fade));
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Could not decode structure image'));
    img.src = dataUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
