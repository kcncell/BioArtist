/**
 * Lazy Ketcher host — only loaded on /chem.
 * Selection UX: structure-select default, hover preview, ⌘/Ctrl+drag marquee.
 * Favorites can be dropped onto the canvas (add at drop position).
 */
import { CoordinateTransformation } from 'ketcher-core';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'ketcher-react/dist/index.css';
import {
  addStructureToKetcher,
  type AddStructureInput,
  type AddStructureResult,
} from './ketcherAddStructure';
import {
  addReactionArrowWithReagents,
  addReagentsToSelectedArrow,
  type ChemReactionResult,
} from './ketcherReaction';
import {
  activateStructureSelect,
  installKetcherSelectionEnhance,
  type SelectionEnhanceHandle,
} from './ketcherSelectionEnhance';
import { installKetcherStructureMove } from './ketcherStructureMove';

/** MIME type for favorite drag-and-drop onto the sketcher. */
export const CHEM_FAV_DRAG_MIME = 'application/x-bioartist-chem-fav';

export type ChemFavDragPayload = {
  smiles: string;
  molfile?: string;
  name?: string;
};

export type AddFragmentOptions = {
  /** Model coordinates for placement (from drop / click). */
  position?: { x: number; y: number };
  smiles?: string;
  molfile?: string;
};

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  setMolecule: (mol: string) => Promise<void>;
  /**
   * Append a structure without clearing the canvas.
   * Prefer calling with { smiles, molfile?, position? } via the object form,
   * or pass a SMILES/molfile string as the first argument.
   */
  addFragment: (
    molOrInput: string | AddStructureInput,
    opts?: AddFragmentOptions,
  ) => Promise<AddStructureResult>;
  /** Clear the sketcher */
  clear: () => Promise<void>;
  /** Straight reaction arrow + top/bottom reagent text labels */
  addReactionArrowWithReagents: (opts?: {
    topText?: string;
    bottomText?: string;
  }) => ChemReactionResult;
  /** Labels only, for a selected reaction arrow */
  addReagentsToSelectedArrow: (opts?: {
    topText?: string;
    bottomText?: string;
  }) => ChemReactionResult;
  setSelectStructure: () => void;
  /** @deprecated use setSelectStructure */
  setSelectRectangle: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
};

type Props = {
  initialSmiles?: string;
  onReady?: (api: KetcherApi) => void;
  onError?: (err: unknown) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onFragmentAdded?: (info: { name?: string; smiles: string }) => void;
};

export function KetcherHost({
  initialSmiles,
  onReady,
  onError,
  onContextMenu,
  onFragmentAdded,
}: Props) {
  const provider = useMemo(() => new StandaloneStructServiceProvider(), []);
  const initOnce = useRef(false);
  const smilesRef = useRef(initialSmiles);
  const hostRef = useRef<HTMLDivElement>(null);
  const onCtxRef = useRef(onContextMenu);
  onCtxRef.current = onContextMenu;
  const onFragAddedRef = useRef(onFragmentAdded);
  onFragAddedRef.current = onFragmentAdded;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ketcherRef = useRef<any>(null);
  const enhanceRef = useRef<SelectionEnhanceHandle | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    smilesRef.current = initialSmiles;
  }, [initialSmiles]);

  // Capture right-click over the Ketcher editor (including selection)
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onCtxRef.current?.(e);
    };
    el.addEventListener('contextmenu', handler, true);
    return () => el.removeEventListener('contextmenu', handler, true);
  }, []);

  // Selection enhance: hover, structure-click, ⌘/Ctrl marquee
  // Structure move: single-fragment drag + alignment snap guides
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const handle = installKetcherSelectionEnhance(el, () => ketcherRef.current);
    enhanceRef.current = handle;
    const disposeMove = installKetcherStructureMove(el, () => ketcherRef.current);
    return () => {
      handle.dispose();
      enhanceRef.current = null;
      disposeMove();
    };
  }, []);

  // Drag-and-drop favorites onto canvas
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const hasFavPayload = (dt: DataTransfer | null) => {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      return types.includes(CHEM_FAV_DRAG_MIME) || types.includes('text/plain');
    };

    const onDragEnter = (e: DragEvent) => {
      if (!hasFavPayload(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDropActive(true);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFavPayload(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDropActive(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFavPayload(e.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropActive(false);
      // relatedTarget check: leaving host entirely
      const related = e.relatedTarget as Node | null;
      if (related && el.contains(related)) return;
      dragDepth.current = 0;
      setDropActive(false);
    };

    const onDrop = (e: DragEvent) => {
      dragDepth.current = 0;
      setDropActive(false);
      if (!hasFavPayload(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();

      const ketcher = ketcherRef.current;
      if (!ketcher) return;

      let payload: ChemFavDragPayload | null = null;
      try {
        const raw = e.dataTransfer?.getData(CHEM_FAV_DRAG_MIME);
        if (raw) payload = JSON.parse(raw) as ChemFavDragPayload;
      } catch {
        /* fall through */
      }
      if (!payload?.smiles) {
        const smiles = e.dataTransfer?.getData('text/plain')?.trim();
        if (smiles) payload = { smiles };
      }
      if (!payload?.smiles) return;

      const mol = (payload.molfile || payload.smiles).trim();
      let position: { x: number; y: number } | undefined;
      try {
        const editor = ketcher.editor;
        if (editor?.render) {
          const model = CoordinateTransformation.pageToModel(e, editor.render);
          position = { x: model.x, y: model.y };
        }
      } catch {
        position = undefined;
      }

      void (async () => {
        const result = await addStructureToKetcher(ketcher, {
          smiles: payload!.smiles,
          molfile: payload!.molfile,
          position,
        });
        activateStructureSelect(ketcher);
        enhanceRef.current?.reassertDefaultTool();
        if (result.ok) {
          onFragAddedRef.current?.({
            name: payload?.name,
            smiles: result.smiles,
          });
        } else {
          console.warn('[Ketcher] drop add failed', result.error, mol);
        }
      })();
    };

    el.addEventListener('dragenter', onDragEnter);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', onDragEnter);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <div
      className={`ba-ketcher-host${dropActive ? ' ba-ketcher-host--drop-active' : ''}`}
      ref={hostRef}
    >
      {dropActive && (
        <div className="ba-ketcher-drop-hint" aria-hidden>
          Drop to add structure here
        </div>
      )}
      <Editor
        staticResourcesUrl=""
        structServiceProvider={provider}
        errorHandler={(message: string) => {
          console.warn('[Ketcher]', message);
          if (/failed|error/i.test(message) && !initOnce.current) {
            onError?.(new Error(message));
          }
        }}
        onInit={(ketcher) => {
          initOnce.current = true;
          ketcherRef.current = ketcher;

          const assertSelect = () => {
            activateStructureSelect(ketcher);
            enhanceRef.current?.reassertDefaultTool();
          };

          const api: KetcherApi = {
            getSmiles: () => ketcher.getSmiles(),
            getMolfile: () => ketcher.getMolfile(),
            setMolecule: async (m) => {
              await ketcher.setMolecule(m);
              assertSelect();
            },
            addFragment: async (molOrInput, opts) => {
              const input: AddStructureInput =
                typeof molOrInput === 'string'
                  ? {
                      smiles: molOrInput.includes('\n') || /M\s+END/i.test(molOrInput) ? undefined : molOrInput,
                      molfile:
                        molOrInput.includes('\n') || /M\s+END/i.test(molOrInput) ? molOrInput : undefined,
                      position: opts?.position,
                    }
                  : {
                      ...molOrInput,
                      position: opts?.position ?? molOrInput.position,
                      smiles: opts?.smiles ?? molOrInput.smiles,
                      molfile: opts?.molfile ?? molOrInput.molfile,
                    };
              // If string form was SMILES-only, ensure smiles is set
              if (typeof molOrInput === 'string' && !input.smiles && !input.molfile) {
                input.smiles = molOrInput;
              }
              const result = await addStructureToKetcher(ketcher, input);
              assertSelect();
              return result;
            },
            clear: async () => {
              try {
                await ketcher.setMolecule('');
              } catch {
                try {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (ketcher as any).editor?.clear?.();
                } catch {
                  /* ignore */
                }
              }
              assertSelect();
            },
            addReactionArrowWithReagents: (opts) => {
              const r = addReactionArrowWithReagents(ketcher, opts);
              assertSelect();
              return r;
            },
            addReagentsToSelectedArrow: (opts) => {
              const r = addReagentsToSelectedArrow(ketcher, opts);
              assertSelect();
              return r;
            },
            setSelectStructure: () => assertSelect(),
            setSelectRectangle: () => assertSelect(),
            raw: ketcher,
          };

          const seed = smilesRef.current;
          if (seed) {
            void ketcher
              .setMolecule(seed)
              .catch(() => {
                /* optional seed */
              })
              .finally(() => {
                assertSelect();
              });
          } else {
            assertSelect();
          }
          onReady?.(api);
        }}
      />
    </div>
  );
}
