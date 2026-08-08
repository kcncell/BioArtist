import { useEffect } from 'react';
import {
  addText,
  cancelTextBoxDraw,
  copySelectionToClipboard,
  cutSelectionToClipboard,
  deleteSelection,
  duplicateSelection,
  endCropMode,
  exportJSON,
  groupSelection,
  hasObjectClipboard,
  isCropModeActive,
  isTextBoxDrawActive,
  pasteObjectClipboard,
  redo,
  undo,
  ungroupSelection,
} from '../../lib/canvasController';
import {
  allTextCandidates,
  enrichSnapFromAsyncClipboard,
  extractSvgFromSnap,
  mergeSnapsPreferGraphic,
  pasteOntoCanvas,
  pasteResultToLibraryIcon,
  resolveChemStudioOrClipboard,
  snapshotClipboard,
} from '../../lib/clipboardPaste';
import { downloadText } from '../../lib/export';
import { useAppStore } from '../../store/appStore';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);
      const mod = e.metaKey || e.ctrlKey;

      if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelection();
        return;
      }

      if (!typing && (e.key === 'v' || e.key === 'V') && !mod) {
        useAppStore.getState().setTool('library');
        useAppStore.getState().setLibraryTab('library');
        return;
      }

      if (!typing && (e.key === 't' || e.key === 'T') && !mod) {
        useAppStore.getState().setTool('text');
        addText('Label');
        return;
      }

      if (!typing && (e.key === 's' || e.key === 'S') && !mod) {
        useAppStore.getState().setTool('shapes');
        return;
      }

      if (!typing && (e.key === 'l' || e.key === 'L') && !mod) {
        useAppStore.getState().setTool('lines');
        return;
      }

      if (!typing && (e.key === 'm' || e.key === 'M') && !mod) {
        useAppStore.getState().setTool('templates');
        return;
      }

      if (!typing && (e.key === 'p' || e.key === 'P') && !mod) {
        useAppStore.getState().setTool('pdb');
        return;
      }

      if (!typing && (e.key === 'a' || e.key === 'A') && !mod) {
        useAppStore.getState().setTool('ai');
        return;
      }

      if (!typing && (e.key === 'c' || e.key === 'C') && !mod) {
        useAppStore.getState().setTool('chem');
        return;
      }

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        void undo();
        return;
      }

      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        void redo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }

      // Cut / Copy canvas objects (⌘X / ⌘C)
      if (!typing && mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        void cutSelectionToClipboard().then((ok) => {
          useAppStore.getState().showToast(ok ? 'Cut' : 'Nothing to cut');
        });
        return;
      }
      if (!typing && mod && e.key.toLowerCase() === 'c' && !e.shiftKey) {
        e.preventDefault();
        void copySelectionToClipboard().then((ok) => {
          useAppStore.getState().showToast(ok ? 'Copied' : 'Nothing to copy');
        });
        return;
      }

      if (mod && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        e.preventDefault();
        groupSelection();
        return;
      }

      if (mod && e.key.toLowerCase() === 'g' && e.shiftKey) {
        e.preventDefault();
        ungroupSelection();
        return;
      }

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const data = exportJSON();
        const name = useAppStore.getState().projectName;
        if (data) {
          downloadText(
            `${name.replace(/[^\w\-]+/g, '_') || 'figure'}.ba`,
            JSON.stringify({ ...data, projectName: name }, null, 2),
            'application/json',
          );
          useAppStore.getState().showToast('Project saved');
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        useAppStore.getState().setExportOpen(true);
        return;
      }

      if (!typing && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        useAppStore.getState().setHelpOpen(true);
        return;
      }

      if (!typing && e.key === 'Escape') {
        if (isTextBoxDrawActive()) {
          e.preventDefault();
          cancelTextBoxDraw();
          useAppStore.getState().showToast('Text box draw cancelled');
          return;
        }
        if (isCropModeActive()) {
          e.preventDefault();
          endCropMode();
          useAppStore.getState().showToast('Crop applied');
          return;
        }
        useAppStore.getState().setHelpOpen(false);
        useAppStore.getState().setExportOpen(false);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;

      // Snapshot sync types first (clipboardData dies after this handler returns)
      let snap = snapshotClipboard(e);

      // Always handle paste on canvas so we can try async clipboard + RDKit
      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        try {
          useAppStore.getState().showToast('Pasting…');
          // Merge paste-event data with async Clipboard API.
          // Brave/Chrome: event text/plain can be stale while Bioicons SVG is on async API
          // (right-click already used async-only and worked — match that preference).
          const empty: typeof snap = {
            plain: '',
            html: '',
            extras: [],
            files: [],
            imageBlobs: [],
            svgBlobs: [],
            types: [],
          };
          const fromAsync = await enrichSnapFromAsyncClipboard(empty);
          const fromEvent = await enrichSnapFromAsyncClipboard(snap);
          // Prefer the snap that actually has SVG / image payload
          const snap2 =
            fromAsync.svgBlobs.length ||
            extractSvgFromSnap(fromAsync) ||
            fromAsync.imageBlobs.length
              ? mergeSnapsPreferGraphic(fromEvent, fromAsync)
              : fromEvent;

          let result = await resolveChemStudioOrClipboard(snap2);

          // Internal canvas object cut/copy only if OS clipboard empty
          if (result.kind === 'none' && hasObjectClipboard()) {
            const ok = await pasteObjectClipboard();
            if (ok) {
              useAppStore.getState().showToast('Pasted');
              return;
            }
          }

          if (result.kind === 'none') {
            result = await resolveChemStudioOrClipboard(
              mergeSnapsPreferGraphic(fromEvent, fromAsync),
            );
          }

          if (result.kind === 'none') {
            const hint = allTextCandidates(snap2)[0]?.slice(0, 60);
            useAppStore
              .getState()
              .showToast(
                hint
                  ? `Could not paste (“${hint}…”). Re-copy the icon on bioicons.com, then ⌘V.`
                  : 'Nothing to paste. Copy an icon on bioicons.com, then ⌘V here.',
              );
            return;
          }

          const placed = await pasteOntoCanvas(result);
          if (!placed) {
            useAppStore.getState().showToast('Could not paste from clipboard');
            return;
          }

          const icon = pasteResultToLibraryIcon(result);
          if (icon) {
            await useAppStore.getState().addUserIcons([icon]);
          }

          const label =
            result.kind === 'chem'
              ? `Pasted molecule “${result.name || 'structure'}” onto canvas`
              : result.kind === 'svg'
                ? `Pasted SVG “${result.name || 'icon'}” onto canvas (+ My Library)`
                : `Pasted image onto canvas (+ My Library)`;
          useAppStore.getState().showToast(label);
        } catch (err) {
          console.error(err);
          useAppStore
            .getState()
            .showToast(
              err instanceof Error
                ? `Paste failed: ${err.message}`
                : 'Paste failed — try Import SVG or re-copy on bioicons.com',
            );
        }
      })();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  return null;
}
