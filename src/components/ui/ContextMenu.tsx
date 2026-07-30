import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Props = {
  x: number;
  y: number;
  children: ReactNode;
  onClose?: () => void;
};

/**
 * Viewport-anchored context menu. Portaled to document.body so parent
 * overflow / backdrop-filter do not clip or offset it.
 */
export const ContextMenu = forwardRef<HTMLDivElement, Props>(function ContextMenu(
  { x, y, children },
  forwardedRef,
) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, x - rect.width);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, y - rect.height);
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setPos({ left, top, ready: true });
  }, [x, y]);

  return createPortal(
    <div
      ref={setRefs}
      className="ba-ctx-menu"
      style={{
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {children}
    </div>,
    document.body,
  );
});
