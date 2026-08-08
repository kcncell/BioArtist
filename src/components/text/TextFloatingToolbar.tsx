/**
 * Text formatting dock — anchored to the top edge of the artboard (canvas stage)
 * when text is selected. Sits above the canvas and wraps upward into free space
 * so it never sits under Snap/Zoom or pushes the canvas down.
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  ListOrdered,
  Pipette,
  RefreshCw,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCanvas } from '../../lib/canvasController';
import { FONT_GROUPS, FONT_OPTIONS, matchFontOption } from '../../lib/textFonts';
import {
  applyFontFamily,
  applyFontSize,
  applyFontStyle,
  applyFontWeight,
  applyLineSpacing,
  applyLinethrough,
  applyTextAlign,
  applyTextFill,
  applyUnderline,
  clampLineSpacing,
  detectScriptMode,
  isBoldWeight,
  nestBulletIn,
  nestBulletOut,
  renumberList,
  toggleNumberedList,
  toggleScript,
  type TextAlign,
} from '../../lib/textStyle';
import { useAppStore } from '../../store/appStore';
import { BulletListControl } from './BulletListControl';

const SWATCHES = [
  '#0b0c0f',
  '#f0f2f5',
  '#8ec5ff',
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
];

function toHex(color: string | undefined): string {
  if (!color) return '#0b0c0f';
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (color === 'transparent' || color === 'none') return '#0b0c0f';
  return '#0b0c0f';
}

export function TextFloatingToolbar() {
  const props = useAppStore((s) => s.selectionProps);
  const count = useAppStore((s) => s.selectionCount);
  const [editing, setEditing] = useState(false);
  const [scriptMode, setScriptMode] = useState<'none' | 'super' | 'sub'>('none');

  const show = !!(props?.isText && count > 0);

  useEffect(() => {
    if (!show) return;
    const canvas = getCanvas();
    if (!canvas) return;

    const sync = () => {
      const obj = canvas.getActiveObject() as { isEditing?: boolean } | null;
      setEditing(!!obj?.isEditing);
      setScriptMode(detectScriptMode());
    };

    canvas.on('selection:created', sync);
    canvas.on('selection:updated', sync);
    canvas.on('selection:cleared', sync);
    canvas.on('object:modified', sync);
    canvas.on('text:changed', sync);
    canvas.on('text:editing:entered', sync);
    canvas.on('text:editing:exited', sync);
    sync();

    return () => {
      canvas.off('selection:created', sync);
      canvas.off('selection:updated', sync);
      canvas.off('selection:cleared', sync);
      canvas.off('object:modified', sync);
      canvas.off('text:changed', sync);
      canvas.off('text:editing:entered', sync);
      canvas.off('text:editing:exited', sync);
    };
  }, [show]);

  if (!show || !props) return null;

  const lineSp = clampLineSpacing(props.lineHeight ?? 1.16);
  const align = (props.textAlign || 'left') as TextAlign;
  const fillHex = toHex(props.fill);
  const bulletStyle = props.bulletStyle ?? null;
  const liveScript = scriptMode !== 'none' ? scriptMode : props.scriptMode || 'none';

  return (
    <div
      className="ba-text-dock"
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(e) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest('input, select, textarea, label')) return;
        e.preventDefault();
      }}
    >
      <div className="ba-text-float-tb ba-text-dock-inner">
        <select
          className="ba-text-tb-select ba-text-tb-font"
          value={matchFontOption(props.fontFamily)}
          onChange={(e) => applyFontFamily(e.target.value)}
          title="Font"
        >
          {FONT_GROUPS.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {FONT_OPTIONS.filter((f) => f.group === g.id).map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <input
          className="ba-text-tb-size"
          type="number"
          min={8}
          max={200}
          value={props.fontSize ?? 24}
          onChange={(e) => applyFontSize(Number(e.target.value))}
          title="Font size"
          aria-label="Font size"
        />

        <span className="ba-text-tb-sep" />

        <div className="ba-text-tb-group">
          <button
            type="button"
            className={`ba-text-tb-btn ${isBoldWeight(props.fontWeight) ? 'active' : ''}`}
            title="Bold"
            onClick={() => applyFontWeight(isBoldWeight(props.fontWeight) ? 'normal' : 'bold')}
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            className={`ba-text-tb-btn ${props.fontStyle === 'italic' ? 'active' : ''}`}
            title="Italic"
            onClick={() => applyFontStyle(props.fontStyle === 'italic' ? 'normal' : 'italic')}
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            className={`ba-text-tb-btn ${props.underline ? 'active' : ''}`}
            title="Underline"
            onClick={() => applyUnderline(!props.underline)}
          >
            <Underline size={15} />
          </button>
          <button
            type="button"
            className={`ba-text-tb-btn ${props.linethrough ? 'active' : ''}`}
            title="Strikethrough"
            onClick={() => applyLinethrough(!props.linethrough)}
          >
            <Strikethrough size={15} />
          </button>
          <button
            type="button"
            className={`ba-text-tb-btn ${liveScript === 'super' ? 'active' : ''}`}
            title="Superscript"
            onClick={() => {
              toggleScript('super');
              setScriptMode(detectScriptMode());
            }}
          >
            <Superscript size={15} />
          </button>
          <button
            type="button"
            className={`ba-text-tb-btn ${liveScript === 'sub' ? 'active' : ''}`}
            title="Subscript"
            onClick={() => {
              toggleScript('sub');
              setScriptMode(detectScriptMode());
            }}
          >
            <Subscript size={15} />
          </button>
        </div>

        <span className="ba-text-tb-sep" />

        <label className="ba-text-tb-color" title="Text color">
          <span className="ba-text-tb-color-swatch" style={{ background: fillHex }} />
          <Pipette size={12} aria-hidden />
          <input
            type="color"
            value={fillHex}
            onChange={(e) => applyTextFill(e.target.value)}
            aria-label="Text color"
          />
        </label>

        <div className="ba-text-tb-swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className="ba-text-tb-swatch"
              style={{ background: c }}
              title={c}
              onClick={() => applyTextFill(c)}
            />
          ))}
        </div>

        <span className="ba-text-tb-sep" />

        <div className="ba-text-tb-group">
          {(
            [
              ['left', AlignLeft, 'Left'],
              ['center', AlignCenter, 'Center'],
              ['right', AlignRight, 'Right'],
              ['justify', AlignJustify, 'Justify'],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={`ba-text-tb-btn ${align === id ? 'active' : ''}`}
              title={label}
              aria-label={label}
              onClick={() => applyTextAlign(id)}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>

        <span className="ba-text-tb-sep" />

        <div className="ba-text-tb-group" title="List style">
          <BulletListControl
            variant="toolbar"
            active={!!props.hasBullets}
            bulletStyle={bulletStyle}
          />
          <button
            type="button"
            className={`ba-text-tb-btn ${props.hasNumbers ? 'active' : ''}`}
            title="Numbered list (1. 2. 3.) — edit numbers in the text anytime"
            aria-label="Numbered list"
            onClick={() => toggleNumberedList()}
          >
            <ListOrdered size={15} />
          </button>
          <button
            type="button"
            className="ba-text-tb-btn"
            title="Renumber list 1…n (resets manual sequence)"
            aria-label="Renumber list"
            onClick={() => renumberList()}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="ba-text-tb-btn"
            title="Nest list item (indent)"
            aria-label="Nest list indent"
            onClick={() => nestBulletIn()}
          >
            <IndentIncrease size={15} />
          </button>
          <button
            type="button"
            className="ba-text-tb-btn"
            title="Un-nest list item (outdent)"
            aria-label="Un-nest list outdent"
            onClick={() => nestBulletOut()}
          >
            <IndentDecrease size={15} />
          </button>
        </div>

        <span className="ba-text-tb-sep" />

        <label className="ba-text-tb-lineh" title="Line spacing (0–2)">
          <span className="ba-text-tb-lineh-label">LS</span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={lineSp}
            onChange={(e) => applyLineSpacing(Number(e.target.value))}
            className="ba-text-tb-lineh-num"
            aria-label="Line spacing"
          />
        </label>

        {editing && <span className="ba-text-tb-hint">Editing</span>}
      </div>
    </div>
  );
}
