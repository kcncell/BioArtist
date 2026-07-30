/**
 * Lazy Ketcher host — only loaded on /chem.
 */
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import { useEffect, useMemo, useRef } from 'react';
import 'ketcher-react/dist/index.css';

export type KetcherApi = {
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  setMolecule: (mol: string) => Promise<void>;
  /** Clear the sketcher */
  clear: () => Promise<void>;
  /** Raw ketcher instance for advanced ops */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
};

type Props = {
  initialSmiles?: string;
  onReady?: (api: KetcherApi) => void;
  onError?: (err: unknown) => void;
  /** Right-click on the editor surface (selection / empty). */
  onContextMenu?: (e: MouseEvent) => void;
};

export function KetcherHost({ initialSmiles, onReady, onError, onContextMenu }: Props) {
  const provider = useMemo(() => new StandaloneStructServiceProvider(), []);
  const initOnce = useRef(false);
  const smilesRef = useRef(initialSmiles);
  const hostRef = useRef<HTMLDivElement>(null);
  const onCtxRef = useRef(onContextMenu);
  onCtxRef.current = onContextMenu;

  useEffect(() => {
    smilesRef.current = initialSmiles;
  }, [initialSmiles]);

  // Capture right-click over the Ketcher editor (including lasso selection)
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      // Always prevent browser/Ketcher default so our menu wins
      e.preventDefault();
      e.stopPropagation();
      onCtxRef.current?.(e);
    };
    el.addEventListener('contextmenu', handler, true);
    return () => el.removeEventListener('contextmenu', handler, true);
  }, []);

  return (
    <div className="ba-ketcher-host" ref={hostRef}>
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
          const api: KetcherApi = {
            getSmiles: () => ketcher.getSmiles(),
            getMolfile: () => ketcher.getMolfile(),
            setMolecule: (m) => ketcher.setMolecule(m),
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
            },
            raw: ketcher,
          };
          const seed = smilesRef.current;
          if (seed) {
            void ketcher.setMolecule(seed).catch(() => {
              /* optional seed */
            });
          }
          onReady?.(api);
        }}
      />
    </div>
  );
}
