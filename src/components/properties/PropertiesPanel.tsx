import { FlipHorizontal2, FlipVertical2, Pipette } from 'lucide-react';
import { applyProps, getCanvas } from '../../lib/canvasController';
import { useAppStore } from '../../store/appStore';

function applyTextAlign(align: 'left' | 'center' | 'right') {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.getActiveObjects().forEach((obj) => {
    if ('textAlign' in obj) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj as any).set({ textAlign: align });
      obj.setCoords();
    }
  });
  canvas.requestRenderAll();
}

/** 7 preset colors; 8th slot is the system color / eyedropper picker */
const SWATCHES = [
  '#0b0c0f',
  '#f0f2f5',
  '#8ec5ff',
  '#f87171',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
];

type ColorRowProps = {
  label: string;
  value: string;
  onChange: (color: string) => void;
};

function ColorSwatchRow({ label, value, onChange }: ColorRowProps) {
  const current = toColorInput(value);

  return (
    <div className="ba-field">
      <label>{label}</label>
      <div className="ba-swatches ba-swatches-inline">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className={`ba-swatch ${current.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => onChange(c)}
          />
        ))}
        <label
          className="ba-swatch ba-swatch-picker"
          title="Pick any color (system picker / screen eyedropper when available)"
        >
          <span className="ba-swatch-picker-face" style={{ background: current }} />
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
            <label>Font size</label>
            <div className="ba-field-row">
              <input
                type="range"
                min={8}
                max={96}
                step={1}
                value={props.fontSize ?? 24}
                onChange={(e) => applyProps({ fontSize: Number(e.target.value) })}
              />
              <input
                type="number"
                min={8}
                max={200}
                value={props.fontSize ?? 24}
                onChange={(e) => applyProps({ fontSize: Number(e.target.value) })}
                style={{ width: 64 }}
              />
            </div>
          </div>
          <div className="ba-field">
            <label>Font family</label>
            <select
              value={props.fontFamily || 'Inter, system-ui, sans-serif'}
              onChange={(e) => applyProps({ fontFamily: e.target.value })}
            >
              <option value="Inter, system-ui, sans-serif">Inter</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Courier New', monospace">Courier</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="system-ui, sans-serif">System UI</option>
            </select>
          </div>
          <div className="ba-field">
            <label>Font weight</label>
            <div className="ba-field-row">
              <button
                className={`ba-btn ba-btn-sm ${props.fontWeight === 'normal' || props.fontWeight === 400 || !props.fontWeight ? 'active' : ''}`}
                onClick={() => applyProps({ fontWeight: 'normal' })}
                style={{ fontWeight: 400 }}
              >
                Regular
              </button>
              <button
                className={`ba-btn ba-btn-sm ${props.fontWeight === 'bold' || props.fontWeight === 700 ? 'active' : ''}`}
                onClick={() => applyProps({ fontWeight: 'bold' })}
                style={{ fontWeight: 700 }}
              >
                Bold
              </button>
            </div>
          </div>
          <div className="ba-field">
            <label>Text align</label>
            <div className="ba-field-row">
              <button className="ba-btn ba-btn-sm" onClick={() => applyTextAlign('left')}>
                Left
              </button>
              <button className="ba-btn ba-btn-sm" onClick={() => applyTextAlign('center')}>
                Center
              </button>
              <button className="ba-btn ba-btn-sm" onClick={() => applyTextAlign('right')}>
                Right
              </button>
            </div>
          </div>
        </>
      )}

      <ColorSwatchRow
        label="Fill / recolor"
        value={props.fill}
        onChange={(fill) => applyProps({ fill })}
      />

      <ColorSwatchRow
        label="Border / stroke"
        value={props.stroke}
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
        <label>Rotation · {Math.round(props.angle)}°</label>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={((props.angle % 360) + 360) % 360}
          onChange={(e) => applyProps({ angle: Number(e.target.value) })}
        />
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
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#8ec5ff';
}
