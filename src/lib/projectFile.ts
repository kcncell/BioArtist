/**
 * .ba project files via the File System Access API (Chrome / Edge / Electron).
 * Falls back to download / <input type=file> when the API is unavailable.
 */
import {
  idbDeleteFileHandle,
  idbLoadFileHandle,
  idbSaveFileHandle,
} from './storage';
import { downloadText } from './export';

export type ProjectFilePayload = {
  version?: number;
  artboard?: { width: number; height: number };
  canvas?: unknown;
  projectName?: string;
  savedAt?: string;
};

const BA_ACCEPT: FilePickerAcceptType[] = [
  {
    description: 'BioArtist figure',
    accept: { 'application/json': ['.ba', '.bioartist', '.json'] },
  },
];

export function canUseFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showSaveFilePicker === 'function' &&
    typeof window.showOpenFilePicker === 'function'
  );
}

export async function ensureWritePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
  } catch (e) {
    console.warn('ensureWritePermission', e);
  }
  return false;
}

export async function ensureReadPermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const opts = { mode: 'read' as const };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
  } catch (e) {
    console.warn('ensureReadPermission', e);
  }
  return false;
}

export async function writeProjectToHandle(
  handle: FileSystemFileHandle,
  payload: ProjectFilePayload,
): Promise<void> {
  const ok = await ensureWritePermission(handle);
  if (!ok) throw new Error('Permission denied — click Save to re-link the file');
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

/** Save As: pick a file, write, return handle + name. */
export async function saveProjectAs(
  payload: ProjectFilePayload,
  suggestedName: string,
): Promise<{ handle: FileSystemFileHandle; fileName: string } | null> {
  const name =
    suggestedName.replace(/[^\w\-]+/g, '_').replace(/\.ba$/i, '') || 'figure';
  if (!canUseFileSystemAccess()) {
    downloadText(`${name}.ba`, JSON.stringify(payload, null, 2), 'application/json');
    return null;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `${name}.ba`,
      types: BA_ACCEPT,
    });
    await writeProjectToHandle(handle, payload);
    return { handle, fileName: handle.name || `${name}.ba` };
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
}

/** Open with a lasting handle when possible. */
export async function openProjectWithPicker(): Promise<{
  data: ProjectFilePayload;
  handle: FileSystemFileHandle | null;
  fileName: string;
} | null> {
  if (canUseFileSystemAccess()) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: BA_ACCEPT,
      });
      const ok = await ensureReadPermission(handle);
      if (!ok) throw new Error('Could not read the selected file');
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text) as ProjectFilePayload;
      return { data, handle, fileName: handle.name || file.name };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }

  // Legacy input — no handle for same-file autosave
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ba,.bioartist,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        const data = JSON.parse(text) as ProjectFilePayload;
        resolve({ data, handle: null, fileName: file.name });
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export async function bindHandleToDocument(
  docId: string,
  handle: FileSystemFileHandle,
): Promise<void> {
  await idbSaveFileHandle(docId, handle);
}

export async function getHandleForDocument(
  docId: string,
): Promise<FileSystemFileHandle | null> {
  return idbLoadFileHandle(docId);
}

export async function unbindHandleForDocument(docId: string): Promise<void> {
  await idbDeleteFileHandle(docId);
}

/** Try silent overwrite; returns false if no handle / permission / error. */
export async function tryAutosaveToBoundFile(
  docId: string,
  payload: ProjectFilePayload,
): Promise<{ ok: boolean; fileName?: string; error?: string }> {
  const handle = await idbLoadFileHandle(docId);
  if (!handle) return { ok: false, error: 'no-handle' };
  try {
    // Silent path: only write if permission already granted (no prompt mid-autosave)
    const opts = { mode: 'readwrite' as const };
    if ((await handle.queryPermission(opts)) !== 'granted') {
      return { ok: false, error: 'need-permission' };
    }
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return { ok: true, fileName: handle.name };
  } catch (e) {
    console.warn('tryAutosaveToBoundFile', e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'write-failed',
    };
  }
}
