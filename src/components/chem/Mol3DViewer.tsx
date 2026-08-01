/**
 * Interactive 3D CPK ball-and-stick viewer (MolView-style) powered by 3Dmol.js.
 * - Drag to rotate, scroll to zoom, right-drag to pan
 * - capturePng() freezes the *current* camera as a transparent PNG
 * - resetView() restores the initial fit after load
 *
 * Important: the model is only rebuilt when `structure` changes — not when the
 * parent re-renders (e.g. on Copy). Otherwise the camera resets before capture.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { resolveMol3D, type Mol3DSource } from '../../lib/mol3dCoords';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Viewer3D = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThreeDmolNS = any;

export type Mol3DViewerHandle = {
  /** PNG data URL of the *current* camera view, transparent background. */
  capturePng: () => string | null;
  /** Restore the initial fit view from when the model was loaded. */
  resetView: () => void;
  /** True once a model is on screen. */
  isReady: () => boolean;
};

type Props = {
  structure: string;
  className?: string;
  onReady?: (info: { source: Mol3DSource; is3d: boolean }) => void;
  onError?: (message: string) => void;
};

let threeDmolPromise: Promise<ThreeDmolNS> | null = null;
function load3Dmol(): Promise<ThreeDmolNS> {
  if (!threeDmolPromise) {
    threeDmolPromise = import('3dmol/build/3Dmol.es6.js').then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = mod as any;
      return m.$3Dmol || m.default || m;
    });
  }
  return threeDmolPromise;
}

/** Capture WebGL canvas after a forced render (preserves current rotation). */
function captureViewerPng(viewer: Viewer3D, host: HTMLElement): string | null {
  try {
    // Do NOT call zoomTo / setView here — that would wipe the user's rotation.
    if (typeof viewer.setBackgroundColor === 'function') {
      try {
        viewer.setBackgroundColor(0xffffff, 0);
      } catch {
        try {
          viewer.setBackgroundColor('white', 0);
        } catch {
          /* ignore */
        }
      }
    }
    // Render current camera into the preserved drawing buffer
    viewer.render?.();

    if (typeof viewer.pngURI === 'function') {
      const uri = viewer.pngURI();
      if (uri && uri.startsWith('data:image/png') && uri.length > 100) {
        return uri;
      }
    }

    const canvas =
      (typeof viewer.getCanvas === 'function' && viewer.getCanvas()) ||
      host.querySelector('canvas');
    if (canvas && typeof canvas.toDataURL === 'function') {
      const uri = canvas.toDataURL('image/png');
      if (uri && uri.length > 100) return uri;
    }
  } catch (err) {
    console.warn('[Mol3D] capture failed', err);
  }
  return null;
}

export const Mol3DViewer = forwardRef<Mol3DViewerHandle, Props>(function Mol3DViewer(
  { structure, className, onReady, onError },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer3D | null>(null);
  /** Camera snapshot after first zoomTo — used by Reset view */
  const initialViewRef = useRef<unknown[] | null>(null);
  const readyRef = useRef(false);
  // Keep latest callbacks without re-loading the model when parent re-renders
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Building 3D model…');
  const [meta, setMeta] = useState<{ source: Mol3DSource; is3d: boolean } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      capturePng: () => {
        const viewer = viewerRef.current;
        const host = hostRef.current;
        if (!viewer || !host || !readyRef.current) {
          console.warn('[Mol3D] capturePng: viewer not ready');
          return null;
        }
        return captureViewerPng(viewer, host);
      },
      resetView: () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        try {
          if (initialViewRef.current && typeof viewer.setView === 'function') {
            // Clone array — setView may mutate
            viewer.setView([...initialViewRef.current]);
          } else {
            viewer.zoomTo?.();
          }
          viewer.render?.();
        } catch (err) {
          console.warn('[Mol3D] resetView failed', err);
          try {
            viewer.zoomTo?.();
            viewer.render?.();
          } catch {
            /* ignore */
          }
        }
      },
      isReady: () => readyRef.current && !!viewerRef.current,
    }),
    [],
  );

  // Only rebuild when the chemical structure string changes — never on parent re-render
  useEffect(() => {
    let cancelled = false;
    let viewer: Viewer3D | null = null;
    readyRef.current = false;
    initialViewRef.current = null;

    const run = async () => {
      setStatus('loading');
      setMessage('Building 3D model…');
      const host = hostRef.current;
      if (!host || !structure.trim()) {
        setStatus('error');
        setMessage('No structure to display');
        return;
      }

      try {
        const $3Dmol = await load3Dmol();
        if (cancelled) return;

        host.innerHTML = '';
        viewerRef.current = null;

        const resolved = await resolveMol3D(structure);
        if (cancelled) return;
        if (!resolved) {
          setStatus('error');
          setMessage('Could not generate a 3D model for this structure');
          onErrorRef.current?.('Could not generate a 3D model for this structure');
          return;
        }

        setMessage(
          resolved.is3d
            ? `Loading CPK ball & stick (${resolved.source})…`
            : '3D embed unavailable — showing flat coords (still rotatable)',
        );

        const createViewer =
          $3Dmol.createViewer ||
          $3Dmol.default?.createViewer ||
          (window as unknown as { $3Dmol?: ThreeDmolNS }).$3Dmol?.createViewer;
        if (typeof createViewer !== 'function') {
          throw new Error('3Dmol.createViewer not found');
        }

        viewer = createViewer(host, {
          backgroundColor: 'white',
          backgroundAlpha: 0,
          antialias: true,
          preserveDrawingBuffer: true,
          premultipliedAlpha: false,
          id: `ba-mol3d-${Date.now()}`,
        });
        viewerRef.current = viewer;

        viewer.clear();
        viewer.addModel(resolved.sdf, 'sdf');
        viewer.setStyle(
          {},
          {
            stick: { radius: 0.14, colorscheme: 'Jmol' },
            sphere: { scale: 0.28, colorscheme: 'Jmol' },
          },
        );
        viewer.setBackgroundColor('white', 0);
        viewer.zoomTo();
        viewer.render();

        try {
          if (typeof viewer.getView === 'function') {
            const v = viewer.getView();
            initialViewRef.current = Array.isArray(v) ? [...v] : v;
          }
        } catch {
          initialViewRef.current = null;
        }

        if (cancelled) return;
        readyRef.current = true;
        setMeta({ source: resolved.source, is3d: resolved.is3d });
        setStatus('ready');
        setMessage(
          resolved.is3d
            ? 'Drag to rotate · scroll to zoom · right-drag to pan'
            : 'Flat geometry (no 3D embed) · drag to rotate in plane · try a common molecule for full 3D',
        );
        onReadyRef.current?.({ source: resolved.source, is3d: resolved.is3d });
      } catch (err) {
        console.error('[Mol3D]', err);
        if (cancelled) return;
        readyRef.current = false;
        const msg = err instanceof Error ? err.message : '3D viewer failed';
        setStatus('error');
        setMessage(msg);
        onErrorRef.current?.(msg);
      }
    };

    void run();

    return () => {
      cancelled = true;
      readyRef.current = false;
      // Keep initialViewRef until next successful load so a mid-capture remount is less likely
      try {
        viewer?.clear?.();
      } catch {
        /* ignore */
      }
      viewerRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [structure]); // structure only — do not list onReady/onError

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      try {
        viewerRef.current?.resize?.();
        viewerRef.current?.render?.();
      } catch {
        /* ignore */
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`ba-mol3d ${className || ''}`}>
      <div ref={hostRef} className="ba-mol3d-host" />
      {status === 'loading' && (
        <div className="ba-mol3d-overlay">
          <Loader2 size={18} className="ba-spin" /> {message}
        </div>
      )}
      {status === 'error' && (
        <div className="ba-mol3d-overlay ba-mol3d-overlay--error">{message}</div>
      )}
      {status === 'ready' && (
        <div className="ba-mol3d-hint">
          {message}
          {meta && (
            <span className="ba-mol3d-source">
              {meta.is3d ? ' · 3D' : ' · 2D coords'} · {meta.source}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
