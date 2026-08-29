/**
 * Fast hover hints for Ketcher toolbar icons (top / left / right / bottom).
 * Native `title` tooltips are slow and often miss SVG children; this shows a
 * short BioArtist-styled tip almost immediately.
 */

const FALLBACK_BY_TESTID: Record<string, string> = {
  'polymer-toggler': 'Switch Molecules / Macromolecules mode',
  'zoom-selector': 'Zoom level',
  'fullscreen-mode-button': 'Fullscreen',
  'hand': 'Hand tool — pan the canvas',
  'select-rectangle': 'Select rectangle',
  'select-lasso': 'Select lasso',
  'select-fragment': 'Select structure',
  erase: 'Erase',
  'single-bond': 'Single bond',
  'double-bond': 'Double bond',
  'triple-bond': 'Triple bond',
  'any-bond': 'Any bond',
  'aromatic-bond': 'Aromatic bond',
  chain: 'Chain',
  'enhanced-stereo': 'Enhanced stereo',
  charge: 'Charge',
  sgroup: 'S-Group',
  rgroup: 'R-Group',
  'shape-ellipse': 'Ellipse',
  'shape-rectangle': 'Rectangle',
  'shape-line': 'Line',
  text: 'Text',
  'reaction-arrow-open-angle': 'Reaction arrow',
  'reaction-plus': 'Reaction plus',
  'reaction-mapping-tools': 'Reaction mapping',
  'clear-canvas': 'Clear canvas',
  undo: 'Undo',
  redo: 'Redo',
  'open-file-button': 'Open file',
  'save-file-button': 'Save as…',
  'copy-button': 'Copy',
  'paste-button': 'Paste',
  'cut-button': 'Cut',
  'help-button': 'Help',
  'about-button': 'About',
  'settings-button': 'Settings',
};

const FALLBACK_BY_CLASS: Record<string, string> = {
  hand: 'Hand tool — pan the canvas',
  erase: 'Erase',
  eraser: 'Erase',
  chain: 'Chain',
  charge: 'Charge',
  sgroup: 'S-Group',
  rgroup: 'R-Group',
  text: 'Text',
  undo: 'Undo',
  redo: 'Redo',
  clear: 'Clear canvas',
  open: 'Open file',
  save: 'Save as…',
  'bond-single': 'Single bond',
  'bond-double': 'Double bond',
  'bond-triple': 'Triple bond',
  'bond-any': 'Any bond',
  'bond-aromatic': 'Aromatic bond',
  'select-rectangle': 'Select rectangle',
  'select-lasso': 'Select lasso',
  'select-fragment': 'Select structure',
};

function humanizeId(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function resolveHint(el: HTMLElement): string | null {
  const title = (el.getAttribute('title') || '').trim();
  if (title) return title;
  const aria = (el.getAttribute('aria-label') || '').trim();
  if (aria) return aria;
  const testid = (el.getAttribute('data-testid') || '').trim();
  if (testid && FALLBACK_BY_TESTID[testid]) return FALLBACK_BY_TESTID[testid];
  if (testid) return humanizeId(testid.replace(/\s+button$/i, ''));

  const classes = (el.className || '').toString().split(/\s+/);
  for (const c of classes) {
    if (FALLBACK_BY_CLASS[c]) return FALLBACK_BY_CLASS[c];
  }
  // Ketcher often puts the tool name as the first simple class
  for (const c of classes) {
    if (
      c &&
      !c.startsWith('css-') &&
      !c.startsWith('Mui') &&
      !c.includes('module_') &&
      !c.includes('Styled') &&
      c.length < 40
    ) {
      return humanizeId(c);
    }
  }
  return null;
}

function isToolbarButton(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') return false;
  // Ignore BioArtist chrome outside Ketcher if somehow nested
  if (el.closest('.ba-chem-studio-bar, .ba-chem-studio-side, .ba-ctx-menu')) return false;
  return true;
}

function findToolbarButton(target: EventTarget | null): HTMLElement | null {
  let el = target as Element | null;
  while (el && el !== document.body) {
    if (isToolbarButton(el)) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Attach fast hover tooltips inside a Ketcher host root.
 * Returns a disposer.
 */
export function installKetcherToolbarTooltips(host: HTMLElement): () => void {
  const tip = document.createElement('div');
  tip.className = 'ba-ketcher-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);

  let showTimer = 0;
  let hideTimer = 0;
  let currentBtn: HTMLElement | null = null;

  const hide = () => {
    window.clearTimeout(showTimer);
    window.clearTimeout(hideTimer);
    tip.hidden = true;
    tip.textContent = '';
    currentBtn = null;
  };

  const place = (btn: HTMLElement) => {
    const rect = btn.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 8;
    const pad = 8;
    // Prefer above; flip below if needed. Prefer centered on button.
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    let top = rect.top - tipRect.height - gap;
    if (top < pad) top = rect.bottom + gap;
    if (left < pad) left = pad;
    if (left + tipRect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - tipRect.width - pad);
    }
    if (top + tipRect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - tipRect.height - pad);
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  };

  const showFor = (btn: HTMLElement) => {
    const text = resolveHint(btn);
    if (!text) {
      hide();
      return;
    }
    // Ensure native title exists for accessibility / fallback
    if (!btn.getAttribute('title')) btn.setAttribute('title', text);
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', text);

    currentBtn = btn;
    tip.textContent = text;
    tip.hidden = false;
    // Measure then place
    place(btn);
    // Re-place after layout (font metrics)
    requestAnimationFrame(() => {
      if (currentBtn === btn) place(btn);
    });
  };

  const onOver = (e: Event) => {
    const btn = findToolbarButton(e.target);
    if (!btn || !host.contains(btn)) {
      // Moving to non-button inside host — delay hide so tip doesn't flicker
      window.clearTimeout(showTimer);
      hideTimer = window.setTimeout(hide, 80) as unknown as number;
      return;
    }
    if (btn === currentBtn && !tip.hidden) return;
    window.clearTimeout(hideTimer);
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => showFor(btn), 220) as unknown as number;
  };

  const onOut = (e: MouseEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && host.contains(related)) {
      const nextBtn = findToolbarButton(related);
      if (nextBtn) return; // moving to another toolbar button
    }
    window.clearTimeout(showTimer);
    hideTimer = window.setTimeout(hide, 100) as unknown as number;
  };

  const onScrollOrDown = () => hide();

  host.addEventListener('mouseover', onOver, true);
  host.addEventListener('mouseout', onOut, true);
  host.addEventListener('mousedown', onScrollOrDown, true);
  window.addEventListener('scroll', onScrollOrDown, true);
  window.addEventListener('blur', hide);

  // Seed missing titles once Ketcher finishes mounting buttons
  const seedTitles = () => {
    host.querySelectorAll('button, [role="button"]').forEach((node) => {
      const btn = node as HTMLElement;
      if (!isToolbarButton(btn)) return;
      const hint = resolveHint(btn);
      if (!hint) return;
      if (!btn.getAttribute('title')) btn.setAttribute('title', hint);
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', hint);
    });
  };
  seedTitles();
  const mo = new MutationObserver(() => seedTitles());
  mo.observe(host, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    window.clearTimeout(showTimer);
    window.clearTimeout(hideTimer);
    host.removeEventListener('mouseover', onOver, true);
    host.removeEventListener('mouseout', onOut, true);
    host.removeEventListener('mousedown', onScrollOrDown, true);
    window.removeEventListener('scroll', onScrollOrDown, true);
    window.removeEventListener('blur', hide);
    tip.remove();
  };
}
