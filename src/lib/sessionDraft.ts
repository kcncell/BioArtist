/**
 * Multi-document session autosave (IndexedDB) + optional same-file disk write.
 * Avoids importing documentManager to prevent circular deps.
 */
import { exportJSON } from './canvasController';
import { tryAutosaveToBoundFile } from './projectFile';
import { useAppStore } from '../store/appStore';
import type { OpenDocument, SessionDraft } from '../types';
import { idbLoadDraft, idbSaveDraft } from './storage';

/** Capture current canvas into the active open document (same as documentManager). */
function snapshotActiveIntoStore(): void {
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

function buildSessionPayload(): SessionDraft {
  snapshotActiveIntoStore();
  const state = useAppStore.getState();
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    activeDocumentId: state.activeDocumentId,
    documents: state.openDocuments,
  };
}

/** Sync localStorage write for beforeunload (IDB may not finish in time). */
export function flushSessionDraftSync(): void {
  try {
    const session = buildSessionPayload();
    localStorage.setItem('bioartist-draft', JSON.stringify(session));
    const active = session.documents.find((d) => d.id === session.activeDocumentId);
    useAppStore.getState().setAutosaveStatus({
      draftAt: session.savedAt,
      diskAt: active?.lastDiskSavedAt ?? useAppStore.getState().autosaveStatus.diskAt,
      fileName: active?.fileName ?? useAppStore.getState().autosaveStatus.fileName,
      message: active?.fileName ? null : 'Draft saved locally',
    });
  } catch (e) {
    console.warn('flushSessionDraftSync', e);
  }
}

/** Build and persist the full tab session (always — refresh recovery). */
export async function flushSessionDraft(): Promise<boolean> {
  try {
    const session = buildSessionPayload();
    // Sync LS first so a mid-flight refresh still has something
    try {
      localStorage.setItem('bioartist-draft', JSON.stringify(session));
    } catch {
      /* ignore */
    }
    const ok = await idbSaveDraft(session);
    if (ok) {
      const active = session.documents.find((d) => d.id === session.activeDocumentId);
      useAppStore.getState().setAutosaveStatus({
        draftAt: session.savedAt,
        diskAt: active?.lastDiskSavedAt ?? useAppStore.getState().autosaveStatus.diskAt,
        fileName: active?.fileName ?? useAppStore.getState().autosaveStatus.fileName,
        message: active?.fileName ? null : 'Draft saved locally',
      });
    }
    return ok;
  } catch (e) {
    console.warn('flushSessionDraft', e);
    return false;
  }
}

/** If the active doc is dirty and has a bound file with permission, rewrite it. */
export async function flushDiskAutosave(): Promise<boolean> {
  const state = useAppStore.getState();
  const id = state.activeDocumentId;
  const doc = state.openDocuments.find((d) => d.id === id);
  if (!doc?.fileName) return false;
  if (doc.dirty === false) return false;

  snapshotActiveIntoStore();
  const data = exportJSON();
  if (!data) return false;

  const payload = {
    ...data,
    projectName: state.projectName,
    savedAt: new Date().toISOString(),
  };

  const result = await tryAutosaveToBoundFile(id, payload);
  if (!result.ok) {
    if (result.error === 'need-permission') {
      useAppStore.getState().setAutosaveStatus({
        ...useAppStore.getState().autosaveStatus,
        message: 'Click Save to resume file autosave',
      });
    }
    return false;
  }

  const now = new Date().toISOString();
  const nextDocs = useAppStore.getState().openDocuments.map((d) =>
    d.id === id
      ? {
          ...d,
          dirty: false,
          lastDiskSavedAt: now,
          fileName: result.fileName || d.fileName,
          updatedAt: now,
        }
      : d,
  );
  useAppStore.getState().setOpenDocuments(nextDocs);
  useAppStore.getState().setAutosaveStatus({
    draftAt: useAppStore.getState().autosaveStatus.draftAt,
    diskAt: now,
    fileName: result.fileName || doc.fileName,
    message: null,
  });
  return true;
}

export function markActiveDocumentDirty(): void {
  const state = useAppStore.getState();
  const id = state.activeDocumentId;
  if (!id) return;
  const doc = state.openDocuments.find((d) => d.id === id);
  if (doc?.dirty) return;
  useAppStore.getState().setOpenDocuments(
    state.openDocuments.map((d) => (d.id === id ? { ...d, dirty: true } : d)),
  );
}

/** Normalize any stored draft into a SessionDraft (migrates v1 single-canvas). */
export function normalizeSessionDraft(raw: unknown): SessionDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.version === 2 && Array.isArray(o.documents) && typeof o.activeDocumentId === 'string') {
    return raw as SessionDraft;
  }

  // Legacy: single canvas draft { canvas, artboard, projectName, savedAt }
  if (o.canvas) {
    const name =
      (typeof o.projectName === 'string' && o.projectName) || 'Recovered figure';
    const artboard = (o.artboard as { width?: number; height?: number }) || {};
    const w = artboard.width || 900;
    const h = artboard.height || 600;
    const id = `doc_recovered_${Date.now().toString(36)}`;
    const doc: OpenDocument = {
      id,
      name,
      artboardWidth: w,
      artboardHeight: h,
      snapshot: {
        version: typeof o.version === 'number' ? o.version : 1,
        artboard: { width: w, height: h },
        canvas: o.canvas,
        projectName: name,
      },
      createdAt: new Date().toISOString(),
      updatedAt:
        typeof o.savedAt === 'string' ? o.savedAt : new Date().toISOString(),
      dirty: true,
      fileName: null,
      lastDiskSavedAt: null,
    };
    return {
      version: 2,
      savedAt: doc.updatedAt,
      activeDocumentId: id,
      documents: [doc],
    };
  }

  return null;
}

export async function loadNormalizedSessionDraft(): Promise<SessionDraft | null> {
  const raw = await idbLoadDraft<unknown>();
  return normalizeSessionDraft(raw);
}
