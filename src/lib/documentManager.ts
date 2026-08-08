/**
 * Multi-document (tab) manager: several open figures without replacing each other.
 * Snapshots live in the app store; canvas load/save uses canvasController.
 */
import {
  clearCanvas,
  exportJSON,
  fitToScreen,
  importJSON,
  setArtboardSize as setCanvasArtboard,
} from './canvasController';
import { useAppStore } from '../store/appStore';
import type { OpenDocument } from '../types';

function uid() {
  return `doc_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/** Capture current canvas + name into the active open document. */
export function snapshotActiveDocument(): void {
  const state = useAppStore.getState();
  const id = state.activeDocumentId;
  if (!id) return;
  const data = exportJSON();
  const nextDocs = state.openDocuments.map((d) =>
    d.id === id
      ? {
          ...d,
          name: state.projectName,
          artboardWidth: state.artboardWidth,
          artboardHeight: state.artboardHeight,
          snapshot: data
            ? {
                version: data.version,
                artboard: data.artboard,
                canvas: data.canvas,
                projectName: state.projectName,
              }
            : d.snapshot,
          updatedAt: new Date().toISOString(),
        }
      : d,
  );
  useAppStore.getState().setOpenDocuments(nextDocs);
}

/** Switch to an already-open document (snapshots current first). */
export async function switchToDocument(docId: string): Promise<boolean> {
  const state = useAppStore.getState();
  if (docId === state.activeDocumentId) return true;
  const target = state.openDocuments.find((d) => d.id === docId);
  if (!target) return false;

  snapshotActiveDocument();

  const snap = target.snapshot;
  if (snap?.canvas) {
    await importJSON({
      canvas: snap.canvas,
      artboard: snap.artboard || {
        width: target.artboardWidth,
        height: target.artboardHeight,
      },
    });
  } else {
    setCanvasArtboard(target.artboardWidth, target.artboardHeight);
    clearCanvas();
  }

  useAppStore.getState().setArtboardSize(target.artboardWidth, target.artboardHeight);
  useAppStore.getState().setProjectName(target.name);
  useAppStore.getState().setActiveDocumentId(docId);
  fitToScreen();
  window.dispatchEvent(new Event('resize'));
  return true;
}

/** Create a new blank document and make it active (keeps existing tabs). */
export async function createNewDocument(opts: {
  name?: string;
  width: number;
  height: number;
}): Promise<OpenDocument> {
  snapshotActiveDocument();

  const state = useAppStore.getState();
  const n = state.openDocuments.length + 1;
  const doc: OpenDocument = {
    id: uid(),
    name: opts.name || `Untitled ${n}`,
    artboardWidth: opts.width,
    artboardHeight: opts.height,
    snapshot: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  setCanvasArtboard(opts.width, opts.height);
  clearCanvas();
  useAppStore.getState().setArtboardSize(opts.width, opts.height);
  useAppStore.getState().setProjectName(doc.name);
  useAppStore.getState().setOpenDocuments([...state.openDocuments, doc]);
  useAppStore.getState().setActiveDocumentId(doc.id);
  fitToScreen();
  window.dispatchEvent(new Event('resize'));
  return doc;
}

/** Open a .ba file as a new tab (does not replace other open docs). */
export async function openDocumentFromFile(data: {
  projectName?: string;
  artboard?: { width: number; height: number };
  canvas?: unknown;
  version?: number;
}): Promise<OpenDocument | null> {
  if (!data.canvas) return null;
  snapshotActiveDocument();

  const w = data.artboard?.width || 900;
  const h = data.artboard?.height || 600;
  const state = useAppStore.getState();
  const doc: OpenDocument = {
    id: uid(),
    name: data.projectName || `Opened ${state.openDocuments.length + 1}`,
    artboardWidth: w,
    artboardHeight: h,
    snapshot: {
      version: data.version ?? 1,
      artboard: data.artboard || { width: w, height: h },
      canvas: data.canvas,
      projectName: data.projectName,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await importJSON({
    canvas: data.canvas,
    artboard: { width: w, height: h },
  });
  useAppStore.getState().setArtboardSize(w, h);
  useAppStore.getState().setProjectName(doc.name);
  useAppStore.getState().setOpenDocuments([...state.openDocuments, doc]);
  useAppStore.getState().setActiveDocumentId(doc.id);
  fitToScreen();
  window.dispatchEvent(new Event('resize'));
  return doc;
}

/** Close a tab; if active, switch to another. Cannot close the last tab. */
export async function closeDocument(docId: string): Promise<boolean> {
  const state = useAppStore.getState();
  if (state.openDocuments.length <= 1) return false;

  if (docId === state.activeDocumentId) {
    snapshotActiveDocument();
  }

  const remaining = state.openDocuments.filter((d) => d.id !== docId);
  if (remaining.length === state.openDocuments.length) return false;

  useAppStore.getState().setOpenDocuments(remaining);

  if (docId === state.activeDocumentId) {
    const next = remaining[remaining.length - 1];
    useAppStore.getState().setActiveDocumentId(next.id);
    const snap = next.snapshot;
    if (snap?.canvas) {
      await importJSON({
        canvas: snap.canvas,
        artboard: snap.artboard || {
          width: next.artboardWidth,
          height: next.artboardHeight,
        },
      });
    } else {
      setCanvasArtboard(next.artboardWidth, next.artboardHeight);
      clearCanvas();
    }
    useAppStore.getState().setArtboardSize(next.artboardWidth, next.artboardHeight);
    useAppStore.getState().setProjectName(next.name);
    fitToScreen();
    window.dispatchEvent(new Event('resize'));
  }
  return true;
}

/** Keep active tab name in sync when user renames the project field. */
export function syncActiveDocumentName(name: string): void {
  const state = useAppStore.getState();
  const id = state.activeDocumentId;
  if (!id) return;
  useAppStore.getState().setOpenDocuments(
    state.openDocuments.map((d) => (d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d)),
  );
}

export function createInitialDocument(): OpenDocument {
  return {
    id: uid(),
    name: 'Untitled figure',
    artboardWidth: 900,
    artboardHeight: 600,
    snapshot: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
