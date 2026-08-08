import { Copy, ImagePlus, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isMcpIcon } from '../../data/catalog';
import {
  AI_IMAGE_EXAMPLE_PROMPTS,
  AI_QUICK_PROMPTS,
  AI_SETUP_STEPS,
  MCP_CONFIG_SNIPPET,
} from '../../lib/aiPrompts';
import { loadMcpInboxIcons } from '../../lib/mcpInbox';
import { useAppStore } from '../../store/appStore';
import { PanelSplit } from '../layout/PanelSplit';
import {
  IconChatGPT,
  IconClaude,
  IconGemini,
  IconGrok,
} from './AiBrandIcons';
import {
  EXTERNAL_ART_SOURCES,
  ExternalArtDialog,
  openExternalArtTarget,
  type ExternalArtSourceKey,
  type ExternalArtTarget,
} from './ExternalArtDialog';

export function AiPanel() {
  const showToast = useAppStore((s) => s.showToast);
  const userLibrary = useAppStore((s) => s.userLibrary);
  const addUserIcons = useAppStore((s) => s.addUserIcons);

  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [pendingExternal, setPendingExternal] = useState<ExternalArtTarget | null>(null);

  const requestOpenExternal = (key: ExternalArtSourceKey) => {
    setPendingExternal(EXTERNAL_ART_SOURCES[key]);
  };

  const mcpCount = useMemo(() => userLibrary.filter(isMcpIcon).length, [userLibrary]);

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg);
    } catch {
      showToast('Could not copy — select text manually');
    }
  };

  const syncMcp = async () => {
    setBusy(true);
    try {
      const icons = await loadMcpInboxIcons();
      if (!icons.length) {
        showToast('Inbox empty — generate icons in an AI app first, then Sync');
        setShowSetup(true);
        return;
      }
      const ok = await addUserIcons(icons, { stayOnTool: true });
      if (ok) {
        showToast(
          `Synced ${icons.length} AI icon${icons.length > 1 ? 's' : ''} — open My Library to place`,
        );
      }
    } catch (e) {
      console.error(e);
      showToast('Could not read MCP inbox — open setup below for help');
      setShowSetup(true);
    } finally {
      setBusy(false);
    }
  };

  const aiToolsSection = (
    <div className="ba-ai-split-section">
      <div className="ba-ai-half-label">
        <ImagePlus size={12} /> AI image tools
      </div>
      <div className="ba-ai-tool-links">
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
      <div className="ba-ai-example-prompts">
        <div className="ba-ai-example-prompts-title">Copy example prompts</div>
        <div className="ba-ai-prompts ba-ai-prompts--image">
          {AI_IMAGE_EXAMPLE_PROMPTS.map((p) => (
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
      </div>
    </div>
  );

  const mcpSection = (
    <div className="ba-ai-split-section ba-ai-split-section--mcp">
      <div className="ba-ai-half-label">
        <Sparkles size={12} /> MCP (advanced)
      </div>
      <p className="ba-ai-half-desc">
        Desktop AI writes icons into a local inbox. Sync once to pull them in.
      </p>

      <button
        className="ba-btn ba-btn-primary ba-ai-sync-btn"
        disabled={busy}
        onClick={() => void syncMcp()}
      >
        {busy ? (
          <>
            <Loader2 size={15} className="ba-spin" /> Syncing…
          </>
        ) : (
          <>
            <Sparkles size={15} /> Sync MCP inbox
            {mcpCount > 0 ? ` (${mcpCount})` : ''}
          </>
        )}
      </button>

      <div className="ba-ai-prompts">
        {AI_QUICK_PROMPTS.slice(0, 4).map((p) => (
          <button
            key={p.id}
            type="button"
            className="ba-ai-prompt-chip"
            title={p.prompt}
            onClick={() => void copyText(p.prompt, `“${p.label}” prompt copied`)}
          >
            <Copy size={11} /> {p.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="ba-ai-section-toggle"
        onClick={() => setShowSetup((v) => !v)}
      >
        <span>MCP setup (once)</span>
        <span className="ba-ai-chevron">{showSetup ? '▾' : '▸'}</span>
      </button>
      {showSetup && (
        <div className="ba-ai-setup">
          <ol className="ba-ai-steps">
            {AI_SETUP_STEPS.map((s) => (
              <li key={s.n}>
                <strong>
                  {s.n}. {s.title}
                </strong>
                <span>{s.body}</span>
              </li>
            ))}
          </ol>
          <div className="ba-ai-config-block">
            <div className="ba-ai-config-head">
              <span>Server name: bioartist</span>
              <button
                type="button"
                className="ba-btn ba-btn-sm"
                onClick={() =>
                  void copyText(MCP_CONFIG_SNIPPET, 'Config copied — paste into your AI app')
                }
              >
                <Copy size={12} /> Copy config
              </button>
            </div>
            <pre className="ba-ai-config-pre">{MCP_CONFIG_SNIPPET}</pre>
            <p className="ba-ai-hint">
              Replace <code>PATH/TO/BioArtist</code> with your repo path. Run{' '}
              <code>npm run mcp:install</code> once.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <aside className="ba-left-panel ba-ai-panel">
      <div className="ba-panel-header">
        <span className="ba-ai-panel-title">
          <Sparkles size={16} strokeWidth={1.75} />
          AI image tools
        </span>
      </div>

      <div className="ba-ai-split ba-ai-split--flex">
        <PanelSplit
          storageKey="ba-ai-panel-split-v1"
          defaultRatio={0.38}
          topLabel="AI image tools"
          bottomLabel="MCP"
          top={aiToolsSection}
          bottom={mcpSection}
        />
      </div>

      <ExternalArtDialog
        target={pendingExternal}
        onCancel={() => setPendingExternal(null)}
        onApprove={(t) => {
          setPendingExternal(null);
          openExternalArtTarget(t);
          showToast(`Opened ${t.title} — generate, then paste or import on the canvas`);
        }}
      />
    </aside>
  );
}
