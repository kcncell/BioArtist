/**
 * Right-click menu for a saved favorite structure in Chem Studio.
 */
import {
  ClipboardCopy,
  Copy,
  Download,
  FlaskConical,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ChemStructure } from '../../lib/chemLibrary';
import { ContextMenu } from '../ui/ContextMenu';

export type ChemFavMenuState = {
  x: number;
  y: number;
  fav: ChemStructure;
};

type Props = {
  menu: ChemFavMenuState | null;
  onClose: () => void;
  /** Add into Ketcher without clearing existing drawing */
  onOpenInSketcher: (fav: ChemStructure) => void;
  /** Copy to chem bridge for paste on BioArtist figure */
  onCopyForFigure: (fav: ChemStructure) => void;
  /** Send/place on BioArtist figure editor */
  onSendToBioArtist: (fav: ChemStructure) => void;
  onRename: (fav: ChemStructure) => void;
  onSaveSvg: (fav: ChemStructure) => void;
  onCopySmiles: (fav: ChemStructure) => void;
  onDuplicate: (fav: ChemStructure) => void;
  onDelete: (fav: ChemStructure) => void;
};

function Sep() {
  return <div className="ba-ctx-sep" role="separator" />;
}

export function ChemFavoriteContextMenu({
  menu,
  onClose,
  onOpenInSketcher,
  onCopyForFigure,
  onSendToBioArtist,
  onRename,
  onSaveSvg,
  onCopySmiles,
  onDuplicate,
  onDelete,
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

  const { fav } = menu;

  const go = (fn: () => void) => {
    try {
      fn();
    } finally {
      onClose();
    }
  };

  return (
    <ContextMenu ref={menuRef} x={menu.x} y={menu.y}>
      <div className="ba-ctx-heading" title={fav.smiles}>
        {fav.name}
      </div>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onOpenInSketcher(fav))}
        title="Add this structure to the sketcher without clearing what is already there"
      >
        <FlaskConical size={14} /> Add to canvas
      </button>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onSendToBioArtist(fav))}
        title="Send to BioArtist figure editor for placement"
      >
        <Send size={14} /> Add to BioArtist
      </button>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onCopyForFigure(fav))}
        title="Copy so you can Paste (⌘V) on the BioArtist canvas"
      >
        <ClipboardCopy size={14} /> Copy for figure
      </button>
      <Sep />
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onRename(fav))}
      >
        <Pencil size={14} /> Rename…
      </button>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onDuplicate(fav))}
        title="Create another favorite with the same structure"
      >
        <Copy size={14} /> Duplicate
      </button>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onSaveSvg(fav))}
      >
        <Download size={14} /> Save as SVG
      </button>
      <button
        type="button"
        role="menuitem"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onCopySmiles(fav))}
        title={fav.smiles}
      >
        <ClipboardCopy size={14} /> Copy SMILES
      </button>
      <Sep />
      <button
        type="button"
        role="menuitem"
        className="danger"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => go(() => onDelete(fav))}
      >
        <Trash2 size={14} /> Delete favorite
      </button>
    </ContextMenu>
  );
}
