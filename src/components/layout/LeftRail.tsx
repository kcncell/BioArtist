import { ChevronRight, LayoutTemplate, Shapes, Sparkles, Star, Type } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { ToolId } from '../../types';

/** 45° arrow only — Lines / connectors tool */
function LinesRailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M4 14 L14 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9 4 H14 V9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TOOLS: { id: ToolId; label: string; tip: string; icon: React.ReactNode }[] = [
  {
    id: 'ai',
    label: 'AI',
    tip: 'AI',
    icon: <Sparkles size={18} strokeWidth={1.75} />,
  },
  {
    id: 'templates',
    label: 'Templates',
    tip: 'Templates',
    icon: <LayoutTemplate size={18} />,
  },
  {
    id: 'pdb',
    label: 'PDB',
    tip: 'PDB',
    icon: (
      <span className="ba-rail-text-icon" aria-hidden>
        PDB
      </span>
    ),
  },
  { id: 'shapes', label: 'Shapes', tip: 'Shapes', icon: <Shapes size={18} /> },
  { id: 'lines', label: 'Lines', tip: 'Lines', icon: <LinesRailIcon /> },
  { id: 'text', label: 'Text', tip: 'Text', icon: <Type size={18} /> },
];

export function LeftRail() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const favoritesDockOpen = useAppStore((s) => s.favoritesDockOpen);
  const setFavoritesDockOpen = useAppStore((s) => s.setFavoritesDockOpen);
  const favoritesCount = useAppStore((s) => s.favorites.length);

  const onToolClick = (id: ToolId) => {
    if (tool === id) {
      setTool('library');
      setLibraryTab('library');
      return;
    }
    setTool(id);
  };

  return (
    <nav className="ba-rail" aria-label="Drawing tools">
      <div className="ba-rail-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`ba-rail-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => onToolClick(t.id)}
            aria-label={t.label}
            aria-pressed={tool === t.id}
          >
            {t.icon}
            <span className="tip">{t.tip}</span>
          </button>
        ))}
      </div>

      {!favoritesDockOpen && (
        <button
          type="button"
          className="ba-rail-fav-show"
          title="Show favorites dock"
          onClick={() => setFavoritesDockOpen(true)}
        >
          <Star size={14} fill="currentColor" />
          <span className="ba-rail-fav-show-arrow">
            <ChevronRight size={12} strokeWidth={2.5} />
            Show
          </span>
          {favoritesCount > 0 && (
            <span className="ba-rail-fav-count">{favoritesCount}</span>
          )}
          <span className="tip">Show favorites</span>
        </button>
      )}
    </nav>
  );
}
