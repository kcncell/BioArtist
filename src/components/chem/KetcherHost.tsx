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
};

type Props = {
  initialSmiles?: string;
  onReady?: (api: KetcherApi) => void;
  onError?: (err: unknown) => void;
};

export function KetcherHost({ initialSmiles, onReady, onError }: Props) {
  const provider = useMemo(() => new StandaloneStructServiceProvider(), []);
  const initOnce = useRef(false);
  const smilesRef = useRef(initialSmiles);

  useEffect(() => {
    smilesRef.current = initialSmiles;
  }, [initialSmiles]);

  return (
    <div className="ba-ketcher-host">
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
