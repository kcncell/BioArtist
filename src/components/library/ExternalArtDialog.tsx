/**
 * Gate before opening external art / AI sites.
 * Portaled to document.body so it is never clipped by the left panel.
 */
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type ExternalArtKind = 'library' | 'ai' | 'excalidraw';

export type ExternalArtTarget = {
  title: string;
  url: string;
  /** Short note for this source (license or AI caution) */
  licenseNote: string;
  /** library = Bioicons/NIH/Servier; ai = image generators; excalidraw = diagram/code AI */
  kind?: ExternalArtKind;
};

const DISMISS_PREFIX = 'bioartist-ext-gate-dismiss-v1-';

export function isExternalArtGateDismissed(kind: ExternalArtKind = 'library'): boolean {
  try {
    return localStorage.getItem(DISMISS_PREFIX + kind) === '1';
  } catch {
    return false;
  }
}

export function setExternalArtGateDismissed(kind: ExternalArtKind, dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(DISMISS_PREFIX + kind, '1');
    else localStorage.removeItem(DISMISS_PREFIX + kind);
  } catch {
    /* ignore */
  }
}

/** Shared targets for external links. */
export const EXTERNAL_ART_SOURCES = {
  bioicons: {
    title: 'Bioicons',
    url: 'https://bioicons.com/',
    kind: 'library' as const,
    licenseNote:
      'Bioicons: each icon has its own license (CC0, CC BY, MIT, etc.). Check the label on every icon you use.',
  },
  nih: {
    title: 'NIH BioArt',
    url: 'https://bioart.niaid.nih.gov/',
    kind: 'library' as const,
    licenseNote:
      'NIH BioArt Source: free for research, educational, and commercial use per NIAID terms — verify attribution on each entry.',
  },
  servier: {
    title: 'Servier Medical Art',
    url: 'https://smart.servier.com/',
    kind: 'library' as const,
    licenseNote:
      'Servier Medical Art (SMART): free under CC BY 4.0 — you must credit Servier and note if you modified the image.',
  },
  chatgpt: {
    title: 'ChatGPT',
    url: 'https://chatgpt.com/',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons — not publication-grade anatomy. Your account terms apply; you own checking use rights.',
  },
  claude: {
    title: 'Claude',
    url: 'https://claude.ai/',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons — not publication-grade anatomy. Your Anthropic account terms apply; you own checking use rights.',
  },
  gemini: {
    title: 'Gemini',
    url: 'https://gemini.google.com/app',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons — not publication-grade anatomy. Your Google account terms apply; you own checking use rights.',
  },
  grok: {
    title: 'Grok',
    url: 'https://grok.com/',
    kind: 'ai' as const,
    licenseNote:
      'AI can invent wrong anatomy, labels, and proportions. Best for simple lab icons — not publication-grade anatomy. Your xAI account terms apply; you own checking use rights.',
  },
} as const satisfies Record<string, ExternalArtTarget>;

export type ExternalArtSourceKey = keyof typeof EXTERNAL_ART_SOURCES;

/** AI targets tuned for the Excalidraw panel (diagram / JSON / SVG code). */
export function excalidrawAiTarget(key: ExternalArtSourceKey): ExternalArtTarget {
  const base = EXTERNAL_ART_SOURCES[key];
  return {
    title: base.title,
    url: base.url,
    kind: 'excalidraw',
    licenseNote:
      'AI-generated diagrams and code can be wrong, incomplete, or invalid JSON/SVG. Always review the output before placing it on your figure or using it in a paper.',
  };
}

interface Props {
  target: ExternalArtTarget | null;
  onCancel: () => void;
  onApprove: (target: ExternalArtTarget) => void;
}

export function ExternalArtDialog({ target, onCancel, onApprove }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!target) return;
    setDontShowAgain(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [target, onCancel]);

  if (!target || typeof document === 'undefined') return null;

  const kind: ExternalArtKind = target.kind || 'library';
  const isAi = kind === 'ai';
  const isExcal = kind === 'excalidraw';

  const title =
    isExcal
      ? 'Open AI for Excalidraw'
      : isAi
        ? 'Open AI image tool'
        : 'Open external art source';

  const onAccept = () => {
    if (dontShowAgain) setExternalArtGateDismissed(kind, true);
    onApprove(target);
  };

  return createPortal(
    <div
      className="ba-ext-art-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ba-ext-art-title"
      onClick={onCancel}
    >
      <div className="ba-ext-art-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="ba-ext-art-title">{title}</h3>
        <p>
          You are about to open <strong>{target.title}</strong> in a new tab
          {isAi || isExcal ? ' (sign in with your own account if needed)' : ''}.
        </p>
        <div className="ba-ext-art-box">
          <p className="ba-ext-art-box-lead">
            {isExcal ? 'Excalidraw / AI caution' : isAi ? 'AI caution' : 'Your responsibility'}
          </p>
          {isExcal ? (
            <>
              <p>
                AI may produce <strong>incorrect science</strong>, messy layouts, or{' '}
                <strong>invalid Excalidraw JSON / SVG</strong>. Treat outputs as drafts — check
                structure, labels, and code before placing them on your canvas or using them in a
                publication.
              </p>
              <p>
                Use the <strong>example prompts in the Excalidraw panel</strong> (not in this
                dialog), then paste the AI&apos;s JSON or SVG into the code box and click{' '}
                <strong>Place on canvas</strong>.
              </p>
              <p className="ba-ext-art-license">{target.licenseNote}</p>
            </>
          ) : isAi ? (
            <>
              <p>
                AI models often make mistakes (wrong proportions, fake labels, messy backgrounds).
                They work best for <strong>simple lab icons</strong> — e.g. pipette, 96-well plate,
                plate reader, flask, centrifuge — not detailed anatomy or publication-critical
                structures. Prefer Bioicons / NIH / Servier for professional medical art.
              </p>
              <p className="ba-ext-art-license">{target.licenseNote}</p>
            </>
          ) : (
            <>
              <p>
                BioArtist does not host or license third-party art. It is{' '}
                <strong>your responsibility</strong> to verify each image&apos;s terms before using
                it in a paper, talk, or product — including whether attribution is required,
                whether commercial use is allowed, and whether you must note modifications.
              </p>
              <p className="ba-ext-art-license">{target.licenseNote}</p>
            </>
          )}
        </div>

        <p className="ba-ext-art-hint">
          {isExcal ? (
            <>
              After the AI replies: copy the JSON or <code>&lt;svg&gt;</code> → paste into the
              Excalidraw panel → <strong>Place on canvas</strong>.
            </>
          ) : isAi ? (
            <>
              Ask for <strong>flat vector / SVG-style</strong>,{' '}
              <strong>transparent or pure white background</strong>,{' '}
              <strong>no text, no watermark, no logo</strong>. Then download or copy →{' '}
              <strong>Import</strong> or <kbd>⌘V</kbd> on the canvas. Example prompts are in the AI
              panel.
            </>
          ) : (
            <>
              After download or copy: use <strong>Import SVG / Image</strong> in My Library, or paste
              onto the canvas with <kbd>⌘V</kbd> / right-click → Paste.
            </>
          )}
        </p>

        <label className="ba-ext-art-dismiss">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don&apos;t show this again</span>
        </label>

        <div className="ba-ext-art-actions">
          <button type="button" className="ba-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ba-btn ba-btn-primary" onClick={onAccept}>
            <ExternalLink size={14} /> I accept — open site
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Open after approval — shared by PackCards / panels. */
export function openExternalArtTarget(target: ExternalArtTarget): void {
  window.open(target.url, '_blank', 'noopener,noreferrer');
}

/**
 * Open external target, skipping the gate if the user already accepted
 * “don’t show again” for that kind.
 */
export function openExternalArtOrGate(
  target: ExternalArtTarget,
  setPending: (t: ExternalArtTarget | null) => void,
): void {
  const kind = target.kind || 'library';
  if (isExternalArtGateDismissed(kind)) {
    openExternalArtTarget(target);
    return;
  }
  setPending(target);
}
