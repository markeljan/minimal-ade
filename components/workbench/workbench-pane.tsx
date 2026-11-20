'use client';

import { Activity, Code2, Eye, Globe, Sparkles, Terminal, X } from 'lucide-react';
import type { GenUiActionHandler } from '@/components/genui/registry';
import { Button } from '@/components/ui/button';
import { BrowserPane } from '@/components/workbench/browser-pane';
import {
  FilesEditorPane,
  type InlineAiEditRequest,
} from '@/components/workbench/files-editor-pane';
import { GenUICanvasPane, type PromotedGenUiSpec } from '@/components/workbench/genui-canvas-pane';
import { TerminalPane } from '@/components/workbench/terminal-pane';
import { TraceWaterfallPane } from '@/components/workbench/trace-waterfall-pane';
import type {
  ArtifactRecord,
  BillingSourceInfo,
  BrowserControlState,
  BrowserStreamMode,
  HarnessMode,
  SandboxTier,
  TokenUsageSummary,
  TraceSpan,
  WorkbenchTab,
  WorkspaceFileEntry,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export interface WorkbenchPaneProps {
  chatId: string;
  activeTab: WorkbenchTab;
  onSelectTab: (tab: WorkbenchTab) => void;
  onClose: () => void;
  // Preview / Browser
  browserMode: BrowserStreamMode;
  browserUrl: string;
  previewHtmlSrcDoc?: string | null;
  previewUrl?: string | null;
  browserRefreshKey?: number;
  isHumanInControl?: boolean;
  onBrowserStateChange?: (state: BrowserControlState) => void;
  onSendPrompt: (prompt: string) => void;
  // Terminal
  sandboxTier: SandboxTier;
  onChangeSandboxTier: (tier: SandboxTier) => void;
  workspaceFileMap?: Record<string, string>;
  queuedTerminalCommand?: { id: string; command: string } | null;
  // Files & Artifacts
  artifacts: ArtifactRecord[];
  activeArtifactId?: string | null;
  onSelectArtifact?: (id: string) => void;
  onUpdateArtifact?: (artifact: ArtifactRecord) => void;
  workspaceFiles: WorkspaceFileEntry[];
  onWorkspaceFilesChange: (files: WorkspaceFileEntry[]) => void;
  onAskAiEdit?: (req: InlineAiEditRequest) => void;
  onOpenHtmlInPreview?: (html: string, title?: string) => void;
  resolvedTheme: 'light' | 'dark';
  // GenUI Canvas
  genUiSpecs: PromotedGenUiSpec[];
  activeGenUiSpecId?: string | null;
  onSelectGenUiSpec?: (id: string) => void;
  onRemoveGenUiSpec?: (id: string) => void;
  onGenUiAction?: GenUiActionHandler;
  // Trace Waterfall
  traceSpans: TraceSpan[];
  usage?: TokenUsageSummary | null;
  modelId: string;
  harnessMode: HarnessMode;
  billingInfo: BillingSourceInfo;
  isStreaming: boolean;
  onClearTraces?: () => void;
}

const WORKBENCH_TABS: Array<{
  id: WorkbenchTab;
  label: string;
  icon: typeof Eye;
}> = [
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'browser', label: 'Browser', icon: Globe },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'files', label: 'Files', icon: Code2 },
  { id: 'genui', label: 'GenUI', icon: Sparkles },
  { id: 'trace', label: 'Trace', icon: Activity },
];

export function WorkbenchPane({
  chatId,
  activeTab,
  onSelectTab,
  onClose,
  browserMode,
  browserUrl,
  previewHtmlSrcDoc,
  previewUrl,
  browserRefreshKey = 0,
  isHumanInControl,
  onBrowserStateChange,
  onSendPrompt,
  sandboxTier,
  onChangeSandboxTier,
  workspaceFileMap,
  queuedTerminalCommand,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onUpdateArtifact,
  workspaceFiles,
  onWorkspaceFilesChange,
  onAskAiEdit,
  onOpenHtmlInPreview,
  resolvedTheme,
  genUiSpecs,
  activeGenUiSpecId,
  onSelectGenUiSpec,
  onRemoveGenUiSpec,
  onGenUiAction,
  traceSpans,
  usage,
  modelId,
  harnessMode,
  billingInfo,
  isStreaming,
  onClearTraces,
}: WorkbenchPaneProps) {
  const badgeForTab = (tab: WorkbenchTab): number | null => {
    if (tab === 'files' && artifacts.length > 0) return artifacts.length;
    if (tab === 'genui' && genUiSpecs.length > 0) return genUiSpecs.length;
    if (tab === 'trace' && traceSpans.length > 0) return traceSpans.length;
    return null;
  };

  return (
    <section
      aria-label="Workspace Workbench"
      className="flex h-full min-w-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]"
    >
      {/* Tabbed Header */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]/65 px-2">
        <div
          role="tablist"
          aria-label="Workbench panes"
          className="astryx-scroll-fade-x flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1"
        >
          {WORKBENCH_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            const count = badgeForTab(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-inner)] px-2 text-xs font-medium transition-colors',
                  selected
                    ? 'bg-[var(--bg-surface)] text-[var(--fg-primary)] shadow-[var(--shadow-low)] ring-1 ring-[var(--border-subtle)]'
                    : 'text-[var(--fg-secondary)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]',
                )}
              >
                <Icon
                  className={cn(
                    'size-3.5 shrink-0',
                    selected ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)]',
                  )}
                />
                <span>{tab.label}</span>
                {count !== null && (
                  <span className="shrink-0 rounded-full bg-[var(--bg-surface-subtle)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--fg-muted)]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close Workbench"
          title="Close Workbench (⌘.)"
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Active Pane Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {(activeTab === 'preview' || activeTab === 'browser') && (
          <BrowserPane
            chatId={chatId}
            mode={activeTab === 'preview' ? 'preview' : browserMode}
            url={browserUrl}
            htmlSrcDoc={previewHtmlSrcDoc}
            previewUrl={previewUrl}
            isHumanInControl={isHumanInControl}
            onStateChange={onBrowserStateChange}
            onSendPrompt={onSendPrompt}
            refreshKey={browserRefreshKey}
            className="h-full"
          />
        )}

        {activeTab === 'terminal' && (
          <TerminalPane
            chatId={chatId}
            tier={sandboxTier}
            files={workspaceFileMap}
            queuedCommand={queuedTerminalCommand}
            onFilesChanged={onWorkspaceFilesChange}
            onTierChange={onChangeSandboxTier}
            onOpenTab={onSelectTab}
            className="h-full"
          />
        )}

        {activeTab === 'files' && (
          <FilesEditorPane
            chatId={chatId}
            artifacts={artifacts}
            activeArtifactId={activeArtifactId}
            onSelectArtifact={onSelectArtifact}
            onUpdateArtifact={onUpdateArtifact}
            workspaceFiles={workspaceFiles}
            onWorkspaceFilesChange={onWorkspaceFilesChange}
            onAskAiEdit={onAskAiEdit}
            onOpenHtmlInPreview={onOpenHtmlInPreview}
            themeMode={resolvedTheme}
          />
        )}

        {activeTab === 'genui' && (
          <GenUICanvasPane
            specs={genUiSpecs}
            activeSpecId={activeGenUiSpecId}
            onSelectSpec={onSelectGenUiSpec}
            onRemoveSpec={onRemoveGenUiSpec}
            onAction={onGenUiAction}
            onAskSampleDashboard={() =>
              onSendPrompt(
                'Stream a live interactive json-render metrics dashboard comparing Q4 AI model latency, cost per million tokens, and throughput across Anthropic, OpenAI, Google, and SpaceXAI.',
              )
            }
          />
        )}

        {activeTab === 'trace' && (
          <TraceWaterfallPane
            spans={traceSpans}
            usage={usage}
            modelId={modelId}
            harnessMode={harnessMode}
            billingSource={billingInfo}
            isStreaming={isStreaming}
            onClear={onClearTraces}
          />
        )}
      </div>
    </section>
  );
}
