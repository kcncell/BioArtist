/**
 * Compact bullet control: primary click = solid circle list;
 * chevron opens a small menu for other bullet glyphs.
 */
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  BULLET_STYLES,
  toggleBullets,
  type BulletStyle,
} from '../../lib/textStyle';

type Props = {
  /** Active when any bullet list is on */
  active?: boolean;
  /** Current bullet glyph style, if known */
  bulletStyle?: BulletStyle | null;
  /** Toolbar (compact) vs Properties (slightly larger) */
  variant?: 'toolbar' | 'props';
};

export function BulletListControl({
  active = false,
  bulletStyle = null,
  variant = 'toolbar',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isToolbar = variant === 'toolbar';
  const mainCls = isToolbar
    ? `ba-text-tb-btn ba-bullet-main ${active ? 'active' : ''}`
    : `ba-btn ba-btn-sm ba-bullet-main ${active ? 'active' : ''}`;
  const chevCls = isToolbar
    ? `ba-text-tb-btn ba-bullet-chevron ${open ? 'active' : ''}`
    : `ba-btn ba-btn-sm ba-bullet-chevron ${open ? 'active' : ''}`;

  return (
    <div className="ba-bullet-split" ref={rootRef}>
      <div className="ba-bullet-split-wrap">
        <button
          type="button"
          className={mainCls}
          title="Bullet list (solid circle) — click to toggle"
          aria-label="Bullet list solid circle"
          onClick={() => {
            setOpen(false);
            toggleBullets('disc');
          }}
        >
          <span className="ba-bullet-glyph" aria-hidden>
            •
          </span>
        </button>
        <button
          type="button"
          className={chevCls}
          title="Bullet style"
          aria-label="Choose bullet style"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <ChevronDown size={isToolbar ? 12 : 13} />
        </button>
      </div>

      {open && (
        <div
          id={menuId}
          className="ba-bullet-menu"
          role="menu"
          aria-label="Bullet styles"
        >
          {BULLET_STYLES.map((b) => (
            <button
              key={b.id}
              type="button"
              role="menuitem"
              className={`ba-bullet-menu-item ${
                active && bulletStyle === b.id ? 'active' : ''
              }`}
              title={b.label}
              onClick={() => {
                toggleBullets(b.id);
                setOpen(false);
              }}
            >
              <span className="ba-bullet-glyph" aria-hidden>
                {b.char}
              </span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
