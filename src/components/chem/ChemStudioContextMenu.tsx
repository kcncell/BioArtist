import {
  ClipboardCopy,
  ClipboardPaste,
  Download,
  Scissors,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ContextMenu } from '../ui/ContextMenu';

export type ChemCtxMenuState = {
  x: number;
  y: number;
  /** True when sketcher has a molecule we can copy */
  hasStructure: boolean;
  /** When true, copy uses the current 3D ball-and-stick camera view */
  is3dView?: boolean;
};

type Props = {
  menu: ChemCtxMenuState | null;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onSaveSvg: () => void;
  onSendToFigure: () => void;
  onAddFavorite: () => void;
  onClear: () => void;
};

function Sep() {
  return <div className="ba-ctx-sep" role="separator" />;
}

export function ChemStudioContextMenu({
  menu,
  onClose,
  onCopy,
  onCut,
  onSaveSvg,
  onSendToFigure,
  onAddFavorite,
  onClear,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      const t = e.target as Node | null;
      if (root && t && root.contains(t)) return;
      onClose();
    };
    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const has = menu.hasStructure;
  const is3d = !!menu.is3dView;

  const go = (fn: () => void) => {
    try {
      fn();
    } finally {
      onClose();
    }
  };

  return (
    <ContextMenu ref={menuRef} x={menu.x} y={menu.y}>
      <button
        type="button"
        role="menuitem"
        disabled={!has}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(onCopy)}
        title={
          is3d
            ? 'Copy the current rotated 3D view (transparent PNG) for BioArtist paste'
            : 'Copy figure-ready structure (SVG + SMILES) for paste on BioArtist canvas'
        }
      >
        <ClipboardCopy size={14} />{' '}
        {is3d ? 'Copy this 3D view for figure' : 'Copy for figure'}
        <span className="ba-ctx-kbd">⌘C</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!has}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(onCut)}
        title="Copy for figure, then clear the sketcher"
      >
        <Scissors size={14} /> Cut for figure
        <span className="ba-ctx-kbd">⌘X</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!has}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(onSaveSvg)}
      >
        <Download size={14} /> Save as SVG
      </button>
      <Sep />
      <button
        type="button"
        role="menuitem"
        disabled={!has}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(onAddFavorite)}
        title="Save the selected molecule only (or the whole canvas if nothing is selected)"
      >
        <Star size={14} /> Add selected to favorites
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!has}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(onSendToFigure)}
      >
        <Send size={14} /> Send to figure
      </button>
      <Sep />
      <button
        type="button"
        role="menuitem"
        className="danger"
        disabled={!has}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(onClear)}
      >
        <Trash2 size={14} /> Clear sketcher
      </button>
      {!has && (
        <>
          <Sep />
          <button type="button" role="menuitem" disabled>
            Draw or select a structure first
          </button>
        </>
      )}
      <Sep />
      <button type="button" role="menuitem" disabled title="Paste into Ketcher uses its own tools">
        <ClipboardPaste size={14} /> Paste uses Ketcher tools
      </button>
    </ContextMenu>
  );
}
