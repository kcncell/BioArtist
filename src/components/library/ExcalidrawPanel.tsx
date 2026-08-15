/**
 * Excalidraw panel — clean layout matching other rail tools.
 * AI links → example prompts → paste JSON/SVG → place on canvas.
 */
import { Copy, ExternalLink, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  EXCALIDRAW_EXAMPLE_PROMPTS,
  placeExcalidrawCode,
} from '../../lib/excalidrawImport';
import { useAppStore } from '../../store/appStore';
import {
  IconChatGPT,
  IconClaude,
  IconGemini,
  IconGrok,
} from './AiBrandIcons';
import {
  ExternalArtDialog,
  excalidrawAiTarget,
  openExternalArtOrGate,
  openExternalArtTarget,
  type ExternalArtSourceKey,
  type ExternalArtTarget,
} from './ExternalArtDialog';

export function ExcalidrawPanel() {
  const showToast = useAppStore((s) => s.showToast);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);

  const requestOpenExternal = (key: ExternalArtSourceKey) => {
    openExternalArtOrGate(excalidrawAiTarget(key), setPendingExternal);
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg);
    } catch {
      showToast('Could not copy — select and copy manually');
    }
  };

  const onGenerate = async () => {
    if (!code.trim()) {
      showToast('Paste Excalidraw JSON or SVG into the box first');
      return;
    }
    setBusy(true);
    try {
      const kind = await placeExcalidrawCode(code);
      showToast(
        kind === 'excalidraw'
          ? 'Excalidraw figure placed on canvas'
          : 'SVG / image placed on canvas',
      );
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Could not place figure');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="ba-left-panel ba-excal-panel">
      <div className="ba-panel-header">
        <span className="ba-excal-title">
          <Pencil size={16} strokeWidth={1.75} />
          Excalidraw
        </span>
      </div>

      <div className="ba-excal-body">
        {/* ── Open AI ─────────────────────────────────────────────── */}
        <section className="ba-excal-block">
          <div className="ba-excal-block-label">Open AI</div>
          <div className="ba-ai-tool-links ba-excal-ai-links">
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--chatgpt"
              onClick={() => requestOpenExternal('chatgpt')}
            >
              <IconChatGPT /> ChatGPT
            </button>
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--claude"
              onClick={() => requestOpenExternal('claude')}
            >
              <IconClaude /> Claude
            </button>
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--gemini"
              onClick={() => requestOpenExternal('gemini')}
            >
              <IconGemini /> Gemini
            </button>
            <button
              type="button"
              className="ba-ai-brand-btn ba-ai-brand-btn--grok"
              onClick={() => requestOpenExternal('grok')}
            >
              <IconGrok /> Grok
            </button>
          </div>
          <a
            className="ba-excal-site-link"
            href="https://excalidraw.com"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={12} /> Open excalidraw.com
          </a>
        </section>

        {/* ── Prompts ─────────────────────────────────────────────── */}
        <section className="ba-excal-block">
          <div className="ba-excal-block-label">Copy example prompts</div>
          <div className="ba-ai-prompts ba-excal-prompts">
            {EXCALIDRAW_EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ba-ai-prompt-chip"
                title={p.prompt}
                onClick={() =>
                  void copyText(p.prompt, `“${p.label}” prompt copied — paste into AI`)
                }
              >
                <Copy size={11} /> {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Code ────────────────────────────────────────────────── */}
        <section className="ba-excal-block ba-excal-block--code">
          <div className="ba-excal-block-label">Code</div>
          <textarea
            className="ba-excal-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={`Paste Excalidraw JSON or SVG here…\n\n{\n  "type": "excalidraw/clipboard",\n  "elements": [ ... ]\n}`}
            spellCheck={false}
            aria-label="Excalidraw JSON or SVG code"
          />
          <div className="ba-excal-actions">
            <button
              type="button"
              className="ba-btn ba-btn-primary ba-btn-sm"
              disabled={busy || !code.trim()}
              onClick={() => void onGenerate()}
            >
              <Play size={14} /> {busy ? 'Placing…' : 'Place on canvas'}
            </button>
            <button
              type="button"
              className="ba-btn ba-btn-sm"
              disabled={!code}
              onClick={() => setCode('')}
              title="Clear box"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </section>
      </div>

      <ExternalArtDialog
        target={pendingExternal}
        onCancel={() => setPendingExternal(null)}
        onApprove={(t) => {
          setPendingExternal(null);
          openExternalArtTarget(t);
          showToast(`Opened ${t.title} — paste a prompt, then paste JSON/SVG here`);
        }}
      />
    </aside>
  );
}
