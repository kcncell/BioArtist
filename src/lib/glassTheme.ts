/** Apply live glass opacity + hue for light or dark liquid-glass themes. */

export type ThemeMode = 'dark' | 'light';

/** Glass opacity slider max — above this, panel text becomes hard to read. */
export const MAX_GLASS_OPACITY = 0.5;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Sharp frosted liquid glass.
 * opacity: 0–0.5 (0–50% frost) · hue: 0–359 · mode: dark | light
 * Both modes respond to opacity (frost) and hue (tint).
 */
export function applyGlassTheme(
  opacity: number,
  hue: number,
  mode: ThemeMode = 'dark',
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const o = clamp(opacity, 0, MAX_GLASS_OPACITY);
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const dark = mode === 'dark';

  root.style.setProperty('--ba-glass-opacity', String(o));
  root.style.setProperty('--ba-glass-hue', String(h));
  root.dataset.theme = mode;
  root.style.colorScheme = mode;

  if (dark) {
    // Midnight stage + cool ambient glow
    root.style.setProperty('--ba-bg', '#0b0c0f');
    root.style.setProperty(
      '--ba-bg-glow',
      [
        `radial-gradient(1200px 600px at 20% -10%, hsla(${h}, 28%, 55%, ${0.12 + o * 0.22}), transparent 55%)`,
        `radial-gradient(900px 500px at 100% 0%, hsla(${h}, 22%, 40%, ${0.08 + o * 0.16}), transparent 50%)`,
        '#0b0c0f',
      ].join(', '),
    );
    root.style.setProperty('--ba-canvas-bg', '#12141a');

    // Frosted panes — clear at 0, denser frost at 50% cap
    const surfaceA = 0.18 + o * 0.8; // 0.18 → 0.98
    root.style.setProperty(
      '--ba-surface',
      `hsla(${h}, ${10 + o * 18}%, ${12 + o * 8}%, ${clamp(surfaceA, 0.14, 0.98)})`,
    );
    root.style.setProperty('--ba-surface-solid', `hsl(${h}, 10%, 10%)`);
    root.style.setProperty(
      '--ba-surface-2',
      `hsla(${h}, 20%, 90%, ${0.04 + o * 0.28})`,
    );
    root.style.setProperty(
      '--ba-surface-3',
      `hsla(${h}, 22%, 92%, ${0.07 + o * 0.38})`,
    );
    root.style.setProperty(
      '--ba-border',
      `hsla(${h}, 30%, 90%, ${0.08 + o * 0.28})`,
    );
    root.style.setProperty(
      '--ba-border-strong',
      `hsla(${h}, 35%, 92%, ${0.14 + o * 0.36})`,
    );
    root.style.setProperty(
      '--ba-glass-highlight',
      `inset 0 1px 0 rgba(255, 255, 255, ${0.12 + o * 0.45}), inset 0 -0.5px 0 rgba(0, 0, 0, 0.35)`,
    );

    root.style.setProperty('--ba-text', '#f0f2f5');
    root.style.setProperty('--ba-text-secondary', '#9aa3b2');
    root.style.setProperty('--ba-text-muted', '#6b7280');
    root.style.setProperty('--ba-accent', `hsl(${h}, 85%, 76%)`);
    root.style.setProperty('--ba-accent-hover', `hsl(${h}, 90%, 86%)`);
    root.style.setProperty(
      '--ba-accent-soft',
      `hsla(${h}, 80%, 70%, ${0.1 + o * 0.22})`,
    );
    root.style.setProperty(
      '--ba-accent-border',
      `hsla(${h}, 80%, 72%, ${0.28 + o * 0.35})`,
    );

    root.style.setProperty(
      '--ba-shadow',
      '0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.06) inset',
    );
    root.style.setProperty(
      '--ba-shadow-md',
      '0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1) inset',
    );

    const blurPx = 14 + o * 42;
    root.style.setProperty(
      '--ba-blur',
      `blur(${blurPx}px) saturate(${120 + o * 70}%)`,
    );
    root.style.setProperty(
      '--ba-input-bg',
      `rgba(0, 0, 0, ${0.22 + o * 0.45})`,
    );
    root.style.setProperty('--ba-glass-sat', `${10 + o * 18}%`);
    root.style.setProperty('--ba-glass-light', `${12 + o * 8}%`);
  } else {
    /*
     * Light theme — opacity + hue must be obviously visible:
     *  - opacity: clear glass → denser frost (capped at 50%)
     *  - hue: tints stage glow, surfaces, accents, borders
     */
    const bgSat = 14 + o * 14;
    const bgL = 93 - o * 4;
    root.style.setProperty('--ba-bg', `hsl(${h}, ${bgSat}%, ${bgL}%)`);
    root.style.setProperty(
      '--ba-bg-glow',
      [
        `radial-gradient(1100px 560px at 16% -10%, hsla(${h}, 62%, 62%, ${0.28 + o * 0.24}), transparent 55%)`,
        `radial-gradient(900px 480px at 100% 0%, hsla(${h}, 50%, 68%, ${0.2 + o * 0.2}), transparent 50%)`,
        `linear-gradient(180deg, hsl(${h}, ${22 + o * 12}%, 97%) 0%, hsl(${h}, ${bgSat}%, ${bgL}%) 52%, hsl(${h}, ${bgSat + 2}%, ${bgL - 3}%) 100%)`,
      ].join(', '),
    );
    root.style.setProperty(
      '--ba-canvas-bg',
      `hsl(${h}, ${12 + o * 10}%, ${84 - o * 3}%)`,
    );

    // o=0 → airy (~14% alpha), o=1 → solid frost (~98%)
    const surfaceA = 0.14 + o * 0.84;
    const surfaceSat = 22 + o * 30;
    const surfaceL = 98 - o * 8;
    root.style.setProperty(
      '--ba-surface',
      `hsla(${h}, ${surfaceSat}%, ${surfaceL}%, ${clamp(surfaceA, 0.1, 0.98)})`,
    );
    root.style.setProperty(
      '--ba-surface-solid',
      `hsl(${h}, ${10 + o * 10}%, 99%)`,
    );
    root.style.setProperty(
      '--ba-surface-2',
      `hsla(${h}, ${28 + o * 22}%, 96%, ${0.2 + o * 0.7})`,
    );
    root.style.setProperty(
      '--ba-surface-3',
      `hsla(${h}, ${30 + o * 24}%, 94%, ${0.28 + o * 0.7})`,
    );
    root.style.setProperty(
      '--ba-border',
      `hsla(${h}, ${35 + o * 22}%, 28%, ${0.08 + o * 0.2})`,
    );
    root.style.setProperty(
      '--ba-border-strong',
      `hsla(${h}, ${40 + o * 22}%, 26%, ${0.12 + o * 0.24})`,
    );
    root.style.setProperty(
      '--ba-glass-highlight',
      `inset 0 1px 0 rgba(255, 255, 255, ${0.75 + o * 0.22}), inset 0 -0.5px 0 hsla(${h}, 30%, 20%, 0.06)`,
    );

    root.style.setProperty('--ba-text', '#1d1d1f');
    root.style.setProperty('--ba-text-secondary', '#3a3a3c');
    root.style.setProperty('--ba-text-muted', '#6e6e73');
    // Darker accent so labels on highlighted chips (Snap, Grid, active tabs) stay readable
    root.style.setProperty('--ba-accent', `hsl(${h}, ${64 + o * 6}%, ${28 - o * 2}%)`);
    root.style.setProperty('--ba-accent-hover', `hsl(${h}, 68%, 22%)`);
    // Soft highlight: enough tint to read as “selected”, not so pale it washes out text
    root.style.setProperty(
      '--ba-accent-soft',
      `hsla(${h}, 55%, 40%, ${0.16 + o * 0.14})`,
    );
    root.style.setProperty(
      '--ba-accent-border',
      `hsla(${h}, 50%, 32%, ${0.32 + o * 0.28})`,
    );

    root.style.setProperty(
      '--ba-shadow',
      `0 1px 2px hsla(${h}, 20%, 20%, ${0.05 + o * 0.06}), 0 1px 0 rgba(255, 255, 255, 0.85) inset`,
    );
    root.style.setProperty(
      '--ba-shadow-md',
      `0 10px 30px hsla(${h}, 25%, 20%, ${0.08 + o * 0.1}), 0 0 0 1px hsla(${h}, 20%, 20%, 0.05), 0 1px 0 rgba(255, 255, 255, 0.9) inset`,
    );

    const blurPx = 12 + o * 40;
    root.style.setProperty(
      '--ba-blur',
      `blur(${blurPx}px) saturate(${110 + o * 50}%)`,
    );
    root.style.setProperty(
      '--ba-input-bg',
      `hsla(${h}, ${18 + o * 12}%, 100%, ${0.35 + o * 0.5})`,
    );
    root.style.setProperty('--ba-glass-sat', `${surfaceSat}%`);
    root.style.setProperty('--ba-glass-light', `${surfaceL}%`);
  }
}
