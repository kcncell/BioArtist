import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FlipHorizontal2,
  FlipVertical2,
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
import type { ReactNode } from 'react';
import { applyProps, fitTextBoxToContent } from '../../lib/canvasController';
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
  isBoldWeight,
  nestBulletIn,
  nestBulletOut,
  renumberList,
  toggleNumberedList,
  toggleScript,
  type TextAlign,
} from '../../lib/textStyle';
import { useAppStore } from '../../store/appStore';
import { BulletListControl } from '../text/BulletListControl';

/** Sentinel for no fill / no border */
export const COLOR_NONE = 'transparent';

/** 7 solid presets; first slot is none; last is system color picker */
const SWATCHES = [
  '#0b0c0f',
  '#f0f2f5',
  '#8ec5ff',
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
];

function isNoneColor(value: string | undefined | null): boolean {
  const v = (value || '').trim().toLowerCase();
  return (
    v === '' ||
    v === 'none' ||
    v === 'transparent' ||
    v === 'rgba(0,0,0,0)' ||
    v === 'rgba(0, 0, 0, 0)'
  );
}

type ColorRowProps = {
  label: string;
  value: string;
  onChange: (color: string) => void;
  noneTitle: string;
};

function ColorSwatchRow({ label, value, onChange, noneTitle }: ColorRowProps) {
  const none = isNoneColor(value);
  const current = toColorInput(value);

  return (
    <div className="ba-field">
      <label>{label}</label>
      <div className="ba-swatches ba-swatches-inline">
        <button
          type="button"
          className={`ba-swatch ba-swatch-none ${none ? 'active' : ''}`}
          title={noneTitle}
          aria-label={noneTitle}
          onClick={() => onChange(COLOR_NONE)}
        >
          <svg
            className="ba-swatch-none-icon"
            viewBox="0 0 22 22"
            width="22"
            height="22"
            aria-hidden
          >
            <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M6.2 6.2 L15.8 15.8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className={`ba-swatch ${!none && current.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
        <label
          className="ba-swatch ba-swatch-picker"
          title="Pick any color (system picker / screen eyedropper when available)"
        >
          <span
            className="ba-swatch-picker-face"
            style={{ background: none ? 'transparent' : current }}
          />
          <Pipette size={11} className="ba-swatch-picker-icon" aria-hidden />
          <input
            type="color"
            value={current}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Pick ${label} color`}
          />
        </label>
      </div>
    </div>
  );
}

function FontFamilySelect({
  value,
  onChange,
  compact,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const current = matchFontOption(value);
  return (
    <select
      className={compact ? 'ba-text-tb-select' : undefined}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      title="Font family"
      style={compact ? undefined : { width: '100%' }}
    >
      {FONT_GROUPS.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {FONT_OPTIONS.filter((f) => f.group === g.id).map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function AlignButtons({
  value,
  onChange,
  compact,
}: {
  value: TextAlign | undefined;
  onChange: (a: TextAlign) => void;
  compact?: boolean;
}) {
  const align = value || 'left';
  const btn = compact ? 'ba-text-tb-btn' : 'ba-btn ba-btn-sm';
  const items: { id: TextAlign; label: string; icon: ReactNode }[] = [
    { id: 'left', label: 'Left', icon: <AlignLeft size={14} /> },
    { id: 'center', label: 'Center', icon: <AlignCenter size={14} /> },
    { id: 'right', label: 'Right', icon: <AlignRight size={14} /> },
    { id: 'justify', label: 'Justify', icon: <AlignJustify size={14} /> },
  ];
  return (
    <div className={compact ? 'ba-text-tb-group' : 'ba-field-row'}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`${btn} ${align === it.id ? 'active' : ''}`}
          title={it.label}
          aria-label={it.label}
          onClick={() => onChange(it.id)}
        >
          {compact ? it.icon : it.label}
        </button>
      ))}
    </div>
  );
}

export function PropertiesPanel() {
  const props = useAppStore((s) => s.selectionProps);
  const count = useAppStore((s) => s.selectionCount);

  if (!props || count === 0) {
    return (
      <div className="ba-right-section props">
        <div className="ba-panel-header">Properties</div>
        <div className="ba-empty">
          Select an object to edit fill, stroke, opacity, position, and text styles.
        </div>
      </div>
    );
  }

  const lineSp = clampLineSpacing(props.lineHeight ?? 1.16);
  const angleNorm = ((props.angle % 360) + 360) % 360;
  const scriptMode = props.scriptMode || 'none';
  const bulletStyle = props.bulletStyle ?? null;

  return (
    <div className="ba-right-section props">
      <div className="ba-panel-header">
        Properties
        {count > 1 && (
          <span style={{ fontWeight: 400, color: 'var(--ba-text-secondary)', fontSize: 11 }}>
            {count} selected
          </span>
        )}
      </div>

      {count === 1 && (
        <div className="ba-field">
          <label>Name</label>
          <input
            type="text"
            value={props.name}
            onChange={(e) => applyProps({ name: e.target.value })}
          />
        </div>
      )}

      {props.isText && (
        <>
          <div className="ba-field">
            <label>Font family</label>
            <FontFamilySelect
              value={props.fontFamily}
              onChange={(fontFamily) => applyFontFamily(fontFamily)}
            />
          </div>
          <div className="ba-field">
            <label>Font size</label>
            <div className="ba-field-row">
              <input
                type="range"
                min={8}
                max={96}
                step={1}
                value={props.fontSize ?? 24}
                onChange={(e) => applyFontSize(Number(e.target.value))}
              />
              <input
                type="number"
                min={8}
                max={200}
                value={props.fontSize ?? 24}
                onChange={(e) => applyFontSize(Number(e.target.value))}
                style={{ width: 64 }}
              />
            </div>
          </div>
          <div className="ba-field">
            <label>Style</label>
            <div className="ba-field-row">
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${isBoldWeight(props.fontWeight) ? 'active' : ''}`}
                title="Bold"
                onClick={() =>
                  applyFontWeight(isBoldWeight(props.fontWeight) ? 'normal' : 'bold')
                }
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${props.fontStyle === 'italic' ? 'active' : ''}`}
                title="Italic"
                onClick={() =>
                  applyFontStyle(props.fontStyle === 'italic' ? 'normal' : 'italic')
                }
              >
                <Italic size={14} />
              </button>
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${props.underline ? 'active' : ''}`}
                title="Underline"
                onClick={() => applyUnderline(!props.underline)}
              >
                <Underline size={14} />
              </button>
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${props.linethrough ? 'active' : ''}`}
                title="Strikethrough"
                onClick={() => applyLinethrough(!props.linethrough)}
              >
                <Strikethrough size={14} />
              </button>
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${scriptMode === 'super' ? 'active' : ''}`}
                title="Superscript"
                onClick={() => toggleScript('super')}
              >
                <Superscript size={14} />
              </button>
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${scriptMode === 'sub' ? 'active' : ''}`}
                title="Subscript"
                onClick={() => toggleScript('sub')}
              >
                <Subscript size={14} />
              </button>
            </div>
          </div>
          <div className="ba-field">
            <label>Lists</label>
            <div className="ba-field-row" style={{ flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <BulletListControl
                variant="props"
                active={!!props.hasBullets}
                bulletStyle={bulletStyle}
              />
              <button
                type="button"
                className={`ba-btn ba-btn-sm ${props.hasNumbers ? 'active' : ''}`}
                title="Numbered list (1. 2. 3.) — edit any number in the text"
                aria-label="Numbered list"
                onClick={() => toggleNumberedList()}
              >
                <ListOrdered size={14} />
              </button>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                title="Renumber 1…n (resets manual sequence)"
                aria-label="Renumber list"
                onClick={() => renumberList()}
              >
                <RefreshCw size={13} />
              </button>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                title="Nest list item (indent)"
                aria-label="Nest list indent"
                onClick={() => nestBulletIn()}
              >
                <IndentIncrease size={14} />
              </button>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                title="Un-nest list item (outdent)"
                aria-label="Un-nest list outdent"
                onClick={() => nestBulletOut()}
              >
                <IndentDecrease size={14} />
              </button>
            </div>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 11,
                color: 'var(--ba-text-muted)',
                lineHeight: 1.4,
              }}
            >
              • inserts solid bullets; use the ▾ menu for circle/square styles. Numbers are plain
              text — edit <strong>1.</strong> freely, or Renumber for 1…n.
            </p>
          </div>
          <div className="ba-field">
            <label>Text align</label>
            <AlignButtons
              value={props.textAlign}
              onChange={(a) => applyTextAlign(a)}
            />
          </div>
          <div className="ba-field">
            <label>Line spacing · {lineSp.toFixed(1)}</label>
            <div className="ba-field-row">
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={lineSp}
                onChange={(e) => applyLineSpacing(Number(e.target.value))}
              />
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={lineSp}
                onChange={(e) => applyLineSpacing(Number(e.target.value))}
                style={{ width: 64 }}
                title="Line spacing (0–2)"
              />
            </div>
          </div>
        </>
      )}

      {props.isTextBox ? (
        <>
          <ColorSwatchRow
            label="Text color"
            value={props.fill}
            noneTitle="No text color"
            onChange={(fill) => applyTextFill(fill)}
          />
          <ColorSwatchRow
            label="Box fill"
            value={props.backgroundColor ?? COLOR_NONE}
            noneTitle="No box fill"
            onChange={(backgroundColor) => applyProps({ backgroundColor })}
          />
          <ColorSwatchRow
            label="Border outline"
            value={props.stroke}
            noneTitle="No border"
            onChange={(stroke) => applyProps({ stroke })}
          />
          <div className="ba-field">
            <label>Border thickness</label>
            <div className="ba-field-row">
              <input
                type="range"
                min={0}
                max={40}
                step={0.5}
                value={props.strokeWidth}
                onChange={(e) => applyProps({ strokeWidth: Number(e.target.value) })}
              />
              <input
                type="number"
                min={0}
                max={40}
                step={0.5}
                value={props.strokeWidth}
                onChange={(e) => applyProps({ strokeWidth: Number(e.target.value) })}
                style={{ width: 64 }}
                title="Border thickness"
              />
            </div>
          </div>
          <div className="ba-field">
            <label>Auto size</label>
            <button
              type="button"
              className="ba-btn ba-btn-sm"
              style={{ width: '100%' }}
              title="Shrink the box border to fit the current text"
              onClick={() => {
                fitTextBoxToContent();
              }}
            >
              Fit to text
            </button>
          </div>
        </>
      ) : (
        <>
          <ColorSwatchRow
            label={props.isText ? 'Text color' : 'Fill / recolor'}
            value={props.fill}
            noneTitle={props.isText ? 'No text color' : 'No fill'}
            onChange={(fill) =>
              props.isText ? applyTextFill(fill) : applyProps({ fill })
            }
          />

          {!props.isText && (
            <>
              <ColorSwatchRow
                label="Border / stroke"
                value={props.stroke}
                noneTitle="No border"
                onChange={(stroke) => applyProps({ stroke })}
              />

              <div className="ba-field">
                <label>Stroke width</label>
                <div className="ba-field-row">
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={0.5}
                    value={props.strokeWidth}
                    onChange={(e) => applyProps({ strokeWidth: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    min={0}
                    max={40}
                    step={0.5}
                    value={props.strokeWidth}
                    onChange={(e) => applyProps({ strokeWidth: Number(e.target.value) })}
                    style={{ width: 64 }}
                    title="Stroke width"
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="ba-field">
        <label>Position</label>
        <div className="ba-field-row">
          <input
            type="number"
            value={props.left}
            onChange={(e) => applyProps({ left: Number(e.target.value) })}
            title="X"
            style={{ width: '50%' }}
          />
          <input
            type="number"
            value={props.top}
            onChange={(e) => applyProps({ top: Number(e.target.value) })}
            title="Y"
            style={{ width: '50%' }}
          />
        </div>
      </div>

      <div className="ba-field">
        <label>Size (scaled)</label>
        <div className="ba-field-row">
          <span style={{ fontSize: 11, color: 'var(--ba-text-muted)' }}>
            {props.width} × {props.height} px
          </span>
        </div>
      </div>

      <div className="ba-field">
        <label>Opacity · {Math.round(props.opacity * 100)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.opacity}
          onChange={(e) => applyProps({ opacity: Number(e.target.value) })}
        />
      </div>

      <div className="ba-field">
        <label>Rotation</label>
        <div className="ba-field-row">
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={angleNorm}
            onChange={(e) => applyProps({ angle: Number(e.target.value) })}
          />
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            value={Math.round(angleNorm)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              applyProps({ angle: ((n % 360) + 360) % 360 });
            }}
            style={{ width: 64 }}
            title="Rotation angle (degrees)"
            aria-label="Rotation angle"
          />
          <span style={{ fontSize: 11, color: 'var(--ba-text-muted)' }}>°</span>
        </div>
      </div>

      <div className="ba-field">
        <label>Flip</label>
        <div className="ba-field-row">
          <button
            className={`ba-btn ${props.flipX ? 'active' : ''}`}
            onClick={() => applyProps({ flipX: !props.flipX })}
            title="Flip horizontal"
          >
            <FlipHorizontal2 size={15} /> H
          </button>
          <button
            className={`ba-btn ${props.flipY ? 'active' : ''}`}
            onClick={() => applyProps({ flipY: !props.flipY })}
            title="Flip vertical"
          >
            <FlipVertical2 size={15} /> V
          </button>
        </div>
      </div>
    </div>
  );
}

function toColorInput(color: string): string {
  if (isNoneColor(color)) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#000000';
}
