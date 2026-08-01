/**
 * One-click reaction arrow + top/bottom reagent labels in Ketcher Chem Studio.
 * Uses native Ketcher entities (rxnArrow + text) so they export with the drawing.
 */
import {
  Action,
  RxnArrowMode,
  Vec2,
  fromArrowAddition,
  fromTextCreation,
} from 'ketcher-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KetcherLike = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorLike = any;

/**
 * Arrow length in model units (Ketcher’s click-default is ~1).
 * Longer so “reagent” / “condition” sit comfortably over the middle of the shaft.
 */
const ARROW_LEN = 5.5;
/** Vertical distance from arrow midline to each label (model units). */
const LABEL_GAP = 0.95;

/**
 * Lexical SerializedEditorState for plain italic-ish reagent text.
 * Ketcher text content MUST be a stringified Lexical editor state.
 */
function lexicalPlainText(text: string): string {
  return JSON.stringify({
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 2, // italic in Lexical bit flags (often used for reagents)
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
}

function getEditor(ketcher: KetcherLike): EditorLike | null {
  return ketcher?.editor ?? null;
}

/** Center of current viewport in model coords, or origin. */
function viewportCenterModel(editor: EditorLike): Vec2 {
  try {
    const render = editor.render;
    const vb = render.viewBox;
    if (vb && Number.isFinite(vb.minX) && Number.isFinite(vb.width)) {
      // Approximate center of visible canvas → model
      const mid = {
        clientX:
          (render.clientArea?.getBoundingClientRect?.().left ?? 0) +
          (render.clientArea?.clientWidth ?? vb.width) / 2,
        clientY:
          (render.clientArea?.getBoundingClientRect?.().top ?? 0) +
          (render.clientArea?.clientHeight ?? vb.height) / 2,
      };
      // CoordinateTransformation not needed if we use molecule bbox; fall through
      void mid;
    }
    const mol = render.ctab?.molecule;
    if (mol?.atoms?.size > 0 && typeof mol.getCoordBoundingBox === 'function') {
      const bb = mol.getCoordBoundingBox();
      if (bb?.min && bb?.max) {
        // Place to the right of existing content
        return new Vec2(bb.max.x + ARROW_LEN / 2 + 1.2, (bb.min.y + bb.max.y) / 2);
      }
    }
  } catch {
    /* fall through */
  }
  return new Vec2(0, 0);
}

function arrowCenterFromSelection(editor: EditorLike): Vec2 | null {
  try {
    const sel = editor.selection?.();
    const ids: number[] = sel?.rxnArrows || [];
    if (!ids.length) return null;
    const arrow = editor.render.ctab.molecule.rxnArrows.get(ids[0]);
    if (!arrow) return null;
    if (typeof arrow.center === 'function') return arrow.center();
    const [a, b] = arrow.pos || [];
    if (a && b) return new Vec2((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (a) return new Vec2(a.x, a.y);
  } catch {
    /* ignore */
  }
  return null;
}

function addLabelsAt(
  editor: EditorLike,
  cx: number,
  cy: number,
  topText: string,
  bottomText: string,
): Action {
  const restruct = editor.render.ctab;
  const topPos = new Vec2(cx, cy - LABEL_GAP);
  const botPos = new Vec2(cx, cy + LABEL_GAP);
  // pos array: empty for new text (same as Ketcher text tool click)
  const emptyPos: Vec2[] = [];

  const action = new Action();
  const top = fromTextCreation(restruct, lexicalPlainText(topText), topPos, emptyPos);
  const bot = fromTextCreation(restruct, lexicalPlainText(bottomText), botPos, emptyPos);
  action.mergeWith(top);
  action.mergeWith(bot);
  return action;
}

export type ChemReactionResult = {
  ok: boolean;
  error?: string;
  mode: 'new-arrow' | 'labels-only';
};

/**
 * Insert a straight reaction arrow with top + bottom reagent text labels,
 * centered and equidistant above/below the arrow.
 */
export function addReactionArrowWithReagents(
  ketcher: KetcherLike,
  opts?: { topText?: string; bottomText?: string },
): ChemReactionResult {
  const editor = getEditor(ketcher);
  if (!editor?.render?.ctab || typeof editor.update !== 'function') {
    return { ok: false, error: 'Ketcher not ready', mode: 'new-arrow' };
  }

  const topText = opts?.topText ?? 'reagent';
  const bottomText = opts?.bottomText ?? 'condition';
  const restruct = editor.render.ctab;

  try {
    const center = viewportCenterModel(editor);
    const half = ARROW_LEN / 2;
    const p0 = new Vec2(center.x - half, center.y);
    const p1 = new Vec2(center.x + half, center.y);

    const action = new Action();
    const arrowAct = fromArrowAddition(restruct, [p0, p1], RxnArrowMode.OpenAngle);
    action.mergeWith(arrowAct);
    action.mergeWith(addLabelsAt(editor, center.x, center.y, topText, bottomText));

    editor.update(action);
    editor.selection?.(null);
    // Leave the active toolbar tool alone (caller may reassertLastTool)
    return { ok: true, mode: 'new-arrow' };
  } catch (err) {
    console.error('[ChemStudio] addReactionArrowWithReagents', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to add reaction arrow',
      mode: 'new-arrow',
    };
  }
}

/**
 * Add top/bottom reagent labels to the currently selected reaction arrow.
 */
export function addReagentsToSelectedArrow(
  ketcher: KetcherLike,
  opts?: { topText?: string; bottomText?: string },
): ChemReactionResult {
  const editor = getEditor(ketcher);
  if (!editor?.render?.ctab) {
    return { ok: false, error: 'Ketcher not ready', mode: 'labels-only' };
  }

  const center = arrowCenterFromSelection(editor);
  if (!center) {
    return {
      ok: false,
      error: 'Select a reaction arrow first (or use “Reaction arrow + reagents”)',
      mode: 'labels-only',
    };
  }

  try {
    const action = addLabelsAt(
      editor,
      center.x,
      center.y,
      opts?.topText ?? 'reagent',
      opts?.bottomText ?? 'condition',
    );
    editor.update(action);
    // Leave the active toolbar tool alone (caller may reassertLastTool)
    return { ok: true, mode: 'labels-only' };
  } catch (err) {
    console.error('[ChemStudio] addReagentsToSelectedArrow', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to add labels',
      mode: 'labels-only',
    };
  }
}
