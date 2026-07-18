import { Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { addImageFromDataUrl } from '../../lib/canvasController';
import {
  fetchStructureImageDataUrl,
  searchProteinStructures,
  type ProteinHit,
} from '../../lib/proteinImport';
import { useAppStore } from '../../store/appStore';

type Props = {
  /** When true, hide the outer label (used inside PdbPanel). */
  embedded?: boolean;
};

export function ProteinImportBox({ embedded = false }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<ProteinHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setHits([]);
    try {
      const results = await searchProteinStructures(q);
      if (!results.length) {
        setError('No structures found. Try a PDB ID (e.g. 4HHB) or UniProt (e.g. P69905).');
        return;
      }
      setHits(results);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  const importHit = async (hit: ProteinHit) => {
    setImportingId(hit.pdbId);
    try {
      const dataUrl = await fetchStructureImageDataUrl(hit.pdbId);
      const name = `${hit.pdbId} · ${hit.title}`.slice(0, 80);
      await addImageFromDataUrl(dataUrl, { name, maxSize: 280 });
      await addUserIcons([
        {
          id: `pdb/${hit.pdbId}-${Date.now()}`,
          name,
          category: 'protein',
          path: dataUrl,
          source: 'user',
          author: 'RCSB PDB',
          licenseLabel: 'RCSB image',
          attributionRequired: true,
        },
      ]);
      showToast(
        `Imported ${hit.pdbId} with transparent background — layer over other figures`,
      );
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : `Could not load image for ${hit.pdbId}`);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className={`ba-protein-box ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <span className="ba-quick-label">Protein ribbon (PDB / UniProt)</span>
      )}
      <p className="ba-protein-hint">
        Type a protein name, UniProt ID, or PDB ID. Imports an RCSB ribbon with the white background
        removed so it sits over other icons. Move, scale, flip, opacity in Properties. (Raster —
        full recolor is limited.)
      </p>
      <div className="ba-protein-row">
        <div className="ba-search" style={{ margin: 0, flex: 1 }}>
          <Search size={14} color="#9ca3af" />
          <input
            placeholder="e.g. hemoglobin, P69905, 4HHB"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
          />
        </div>
        <button
          className="ba-btn ba-btn-primary ba-btn-sm"
          disabled={busy || !query.trim()}
          onClick={() => void runSearch()}
        >
          {busy ? <Loader2 size={14} className="ba-spin" /> : 'Find'}
        </button>
      </div>

      {error && <div className="ba-protein-error">{error}</div>}

      {hits.length > 0 && (
        <div className={`ba-protein-hits ${embedded ? 'expanded' : ''}`}>
          {hits.map((hit) => (
            <button
              key={hit.pdbId + hit.title}
              className="ba-protein-hit"
              disabled={importingId === hit.pdbId}
              onClick={() => void importHit(hit)}
              title={hit.title}
            >
              <img
                src={hit.imageUrl}
                alt={hit.pdbId}
                loading="lazy"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset.fallback) {
                    el.dataset.fallback = '1';
                    const id = hit.pdbId.toLowerCase();
                    el.src = `https://cdn.rcsb.org/images/structures/${id.slice(1, 3)}/${id}/${id}_model-1.jpeg`;
                  }
                }}
              />
              <div className="ba-protein-hit-meta">
                <strong>{hit.pdbId}</strong>
                <span>{hit.title}</span>
                {hit.uniprotId && <em>UniProt {hit.uniprotId}</em>}
              </div>
              <span className="ba-protein-hit-action">
                {importingId === hit.pdbId ? '…' : 'Add'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
