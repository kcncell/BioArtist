import {
  FlaskConical,
  Hexagon,
  Library,
  Loader2,
  Pencil,
  Star,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LibraryIcon } from '../../data/catalog';
import { addSvgToCanvas } from '../../lib/canvasController';
import {
  type ChemStructure,
  consumePendingPlace,
  loadChemLibrary,
  openChemStudio,
  pushRecentFromSmiles,
  subscribeChemLibrary,
  subscribeSendToFigure,
  upsertChemStructure,
} from '../../lib/chemLibrary';
import { setIconDragData } from '../../lib/iconDrag';
import {
  CHEM_MOTIFS,
  chemSvgToDataUrl,
  getRDKit,
  smilesToSvg,
  stripOpaqueBackgroundRects,
} from '../../lib/rdkit';
import { useAppStore } from '../../store/appStore';

type TabId = 'amino' | 'saved' | 'import' | 'recent';

type Card = {
  id: string;
  name: string;
  smiles: string;
  svg: string | null;
  source?: string;
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'amino', label: 'Amino acids' },
  { id: 'saved', label: 'Saved' },
  { id: 'import', label: 'Imported' },
  { id: 'recent', label: 'Recent / favorites' },
];

export function ChemPanel() {
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const showToast = useAppStore((s) => s.showToast);
  const addUserIcons = useAppStore((s) => s.addUserIcons);
  const addFavorite = useAppStore((s) => s.addFavorite);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('amino');
  const [aminoCards, setAminoCards] = useState<Card[]>([]);
  const [library, setLibrary] = useState<ChemStructure[]>([]);

  const refreshLibrary = useCallback(() => {
    setLibrary(loadChemLibrary());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await getRDKit();
        if (cancelled) return;
        setReady(true);
        const amino = CHEM_MOTIFS.filter((m) => m.group === 'amino');
        const cards: Card[] = [];
        for (const m of amino) {
          if (cancelled) return;
          const svg = await smilesToSvg(m.smiles, {
            width: 160,
            height: 120,
            acs: true,
            transparent: true,
          });
          cards.push({ id: m.id, name: m.name, smiles: m.smiles, svg });
        }
        if (!cancelled) setAminoCards(cards);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load RDKit');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshLibrary();
    return subscribeChemLibrary(refreshLibrary);
  }, [refreshLibrary]);

  // Place structures sent from Chem Studio (other tab)
  useEffect(() => {
    const place = async (s: ChemStructure) => {
      try {
        const clean = stripOpaqueBackgroundRects(s.svg);
        await addSvgToCanvas(clean, { name: s.name, maxSize: 200 });
        showToast(`Placed “${s.name}” from Chem Studio`);
        refreshLibrary();
      } catch (e) {
        console.error(e);
        showToast('Could not place structure from studio');
      }
    };
    const unsub = subscribeSendToFigure((s) => void place(s));
    const pending = consumePendingPlace();
    if (pending) void place(pending);
    return unsub;
  }, [showToast, refreshLibrary]);

  const cards: Card[] = useMemo(() => {
    if (tab === 'amino') return aminoCards;
    if (tab === 'saved') {
      return library
        .filter((s) => s.source === 'studio')
        .map((s) => ({ id: s.id, name: s.name, smiles: s.smiles, svg: s.svg, source: s.source }));
    }
    if (tab === 'import') {
      return library
        .filter((s) => s.source === 'import')
        .map((s) => ({ id: s.id, name: s.name, smiles: s.smiles, svg: s.svg, source: s.source }));
    }
    // recent + favorites
    return library
      .filter((s) => s.source === 'recent' || s.source === 'favorite')
      .map((s) => ({ id: s.id, name: s.name, smiles: s.smiles, svg: s.svg, source: s.source }));
  }, [tab, aminoCards, library]);

  const goLibrary = () => {
    setTool('library');
    setLibraryTab('library');
  };

  const placeSvg = async (name: string, svg: string, smilesStr: string) => {
    const clean = stripOpaqueBackgroundRects(svg);
    await addSvgToCanvas(clean, { name, maxSize: 200 });
    pushRecentFromSmiles(smilesStr, name, clean);
    const icon: LibraryIcon = {
      id: `chem/${smilesStr}-${Date.now()}`,
      name,
      category: 'symbols',
      path: '',
      svgContent: clean,
      source: 'user',
      author: 'RDKit',
      licenseLabel: 'RDKit',
    };
    await addUserIcons([icon], { stayOnTool: true });
    refreshLibrary();
    showToast(`Placed “${name}”`);
  };

  const onPlaceCard = async (card: Card) => {
    if (!card.svg) {
      showToast('Structure not ready');
      return;
    }
    try {
      await placeSvg(card.name, card.svg, card.smiles);
    } catch (e) {
      console.error(e);
      showToast('Could not place structure');
    }
  };

  const onImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,.mol,.sdf,.smi,.smiles,image/svg+xml,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const base = file.name.replace(/\.[^.]+$/, '');
        if (text.includes('<svg') || file.name.toLowerCase().endsWith('.svg')) {
          const svg = stripOpaqueBackgroundRects(text);
          upsertChemStructure({
            name: base,
            smiles: '',
            svg,
            source: 'import',
            style: '2d',
          });
          refreshLibrary();
          setTab('import');
          showToast(`Imported “${base}”`);
          return;
        }
        // Treat as SMILES / mol line
        const line = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith('#'));
        if (!line) {
          showToast('No structure found in file');
          return;
        }
        // If molfile (starts with blank line or has M  END)
        const isMol = /M\s+END/i.test(text);
        let smiles = line;
        if (isMol) {
          // RDKit get_mol accepts molfile
          smiles = text;
        }
        const svg = await smilesToSvg(smiles.includes('M  END') ? smiles : line, {
          width: 200,
          height: 160,
          acs: true,
          transparent: true,
        });
        if (!svg) {
          showToast('Could not parse structure');
          return;
        }
        upsertChemStructure({
          name: base,
          smiles: isMol ? base : line,
          svg,
          source: 'import',
          style: '2d',
          molfile: isMol ? text : undefined,
        });
        refreshLibrary();
        setTab('import');
        showToast(`Imported “${base}”`);
      } catch (e) {
        console.error(e);
        showToast('Import failed');
      }
    };
    input.click();
  };

  const toIcon = (card: Card): LibraryIcon | null => {
    if (!card.svg) return null;
    return {
      id: `chem/${card.id}`,
      name: card.name,
      category: 'symbols',
      path: '',
      svgContent: card.svg,
      source: 'user',
      author: 'Chem',
      licenseLabel: 'RDKit',
    };
  };

  return (
    <aside className="ba-left-panel ba-chem-panel">
      <div className="ba-panel-header">
        <span className="ba-ai-panel-title">
          <Pencil size={15} strokeWidth={1.75} />
          Chem
        </span>
      </div>

      <div style={{ padding: '0 12px 8px', display: 'grid', gap: 6 }}>
        <button className="ba-btn" style={{ width: '100%' }} onClick={goLibrary}>
          <Library size={14} /> Back to icon library
        </button>
        <button
          className="ba-btn ba-btn-primary"
          style={{ width: '100%' }}
          onClick={() => {
            openChemStudio();
            showToast('Chem Studio opened in a new tab');
          }}
          title="Full structure editor (Ketcher) — opens only when you ask"
        >
          <FlaskConical size={14} /> Open Chem Studio
        </button>
        <button className="ba-btn" style={{ width: '100%' }} onClick={onImportFile}>
          <Upload size={14} /> Import structure file
        </button>
      </div>

      <div className="ba-panel-sub">
        Figure-side chem is a library only: amino acids, studio saves, imports, and recent /
        favorites. Build molecules bond-by-bond in <strong>Chem Studio</strong> (separate tab),
        then send them here.
      </div>

      {!ready && !error && (
        <div className="ba-empty">
          <Loader2 size={18} className="ba-spin" /> Loading chemistry…
        </div>
      )}
      {error && (
        <div className="ba-empty" style={{ color: 'var(--ba-danger)' }}>
          {error}
        </div>
      )}

      {ready && (
        <>
          <div className="ba-cats" style={{ padding: '8px 12px 4px' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`ba-chip ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ba-panel-sub" style={{ paddingTop: 4 }}>
            {tab === 'amino' && 'All 20 standard amino acids · click to place'}
            {tab === 'saved' && 'Structures saved from Chem Studio'}
            {tab === 'import' && 'Files you imported (SVG / SMILES / mol)'}
            {tab === 'recent' && 'Recently placed or favorited SMILES structures'}
          </div>

          {cards.length === 0 ? (
            <div className="ba-empty">
              {tab === 'saved' && 'Nothing saved yet — open Chem Studio and Save.'}
              {tab === 'import' && 'No imports yet.'}
              {tab === 'recent' && 'Place or favorite a structure to see it here.'}
              {tab === 'amino' && 'Loading amino acids…'}
            </div>
          ) : (
            <div className="ba-icon-grid ba-chem-grid">
              {cards.map((card) => {
                const icon = toIcon(card);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="ba-icon-card"
                    draggable={!!icon}
                    title={`${card.name}${card.smiles ? ` · ${card.smiles}` : ''}`}
                    onDragStart={(e) => {
                      if (icon) setIconDragData(e, icon);
                    }}
                    onClick={() => void onPlaceCard(card)}
                  >
                    <div className="ba-icon-thumb">
                      {card.svg ? (
                        <img
                          src={chemSvgToDataUrl(card.svg)}
                          alt={card.name}
                          draggable={false}
                        />
                      ) : (
                        <Hexagon size={18} />
                      )}
                    </div>
                    <div className="ba-icon-label">{card.name}</div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'recent' && cards.length > 0 && (
            <div style={{ padding: '8px 12px 12px' }}>
              <button
                className="ba-btn ba-btn-sm"
                style={{ width: '100%' }}
                onClick={() => {
                  const first = cards[0];
                  if (!first?.svg) return;
                  addFavorite({
                    id: `chem/fav-${first.id}`,
                    name: first.name,
                    category: 'symbols',
                    path: '',
                    svgContent: first.svg,
                    source: 'user',
                    author: 'Chem',
                    licenseLabel: 'RDKit',
                  });
                  upsertChemStructure({
                    id: first.id,
                    name: first.name,
                    smiles: first.smiles,
                    svg: first.svg,
                    source: 'favorite',
                    style: '2d',
                  });
                  refreshLibrary();
                  showToast('Added to favorites');
                }}
              >
                <Star size={14} /> Favorite first in list
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
