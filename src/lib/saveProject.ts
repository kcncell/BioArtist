/**
 * User-facing Save / Save As for the active figure tab.
 */
import { exportJSON } from './canvasController';
import { snapshotActiveDocument } from './documentManager';
import {
  bindHandleToDocument,
  getHandleForDocument,
  saveProjectAs,
  writeProjectToHandle,
} from './projectFile';
import { flushSessionDraft } from './sessionDraft';
import { useAppStore } from '../store/appStore';

function buildPayload() {
  snapshotActiveDocument();
  const data = exportJSON();
  if (!data) return null;
  const projectName = useAppStore.getState().projectName;
  return {
    ...data,
    projectName,
    savedAt: new Date().toISOString(),
  };
}

function markSaved(fileName: string) {
  const state = useAppStore.getState();
  const id = state.activeDocumentId;
  const now = new Date().toISOString();
  useAppStore.getState().setOpenDocuments(
    state.openDocuments.map((d) =>
      d.id === id
        ? {
            ...d,
            dirty: false,
            fileName,
            lastDiskSavedAt: now,
            updatedAt: now,
          }
        : d,
    ),
  );
  useAppStore.getState().setAutosaveStatus({
    draftAt: state.autosaveStatus.draftAt,
    diskAt: now,
    fileName,
    message: null,
  });
  void flushSessionDraft();
}

/** Save to bound file, or Save As if none. */
export async function saveActiveProject(opts?: {
  forcePicker?: boolean;
}): Promise<boolean> {
  const payload = buildPayload();
  if (!payload) {
    useAppStore.getState().showToast('Nothing to save');
    return false;
  }

  const state = useAppStore.getState();
  const id = state.activeDocumentId;
  const doc = state.openDocuments.find((d) => d.id === id);
  const suggested =
    doc?.fileName?.replace(/\.ba$/i, '') ||
    state.projectName ||
    'figure';

  try {
    if (!opts?.forcePicker && id) {
      const handle = await getHandleForDocument(id);
      if (handle) {
        await writeProjectToHandle(handle, payload);
        markSaved(handle.name || doc?.fileName || `${suggested}.ba`);
        useAppStore.getState().showToast(`Saved ${handle.name || 'figure.ba'}`);
        return true;
      }
    }

    const result = await saveProjectAs(payload, suggested);
    if (!result) {
      // Download fallback already happened, or user cancelled
      if (!('showSaveFilePicker' in window)) {
        markSaved(`${suggested}.ba`);
        useAppStore.getState().showToast('Project downloaded');
        return true;
      }
      return false;
    }
    await bindHandleToDocument(id, result.handle);
    markSaved(result.fileName);
    useAppStore.getState().showToast(`Saved ${result.fileName}`);
    return true;
  } catch (e) {
    console.error(e);
    useAppStore.getState().showToast(
      e instanceof Error ? e.message : 'Could not save project',
    );
    return false;
  }
}

export async function saveActiveProjectAs(): Promise<boolean> {
  return saveActiveProject({ forcePicker: true });
}
