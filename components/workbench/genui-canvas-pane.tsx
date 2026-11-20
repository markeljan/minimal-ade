'use client';

import { collectActions, collectStatePaths, collectUsedComponents } from '@json-render/codegen';
import type { Spec } from '@json-render/react';
import { Braces, Check, Code2, Copy, Download, Eye, Layers, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { exportSpecToReactTsx, GenUIRenderer } from '@/components/genui/genui-renderer';
import type { GenUiActionHandler } from '@/components/genui/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatRelativeTime } from '@/lib/utils';

export interface PromotedGenUiSpec {
  id: string;
  title: string;
  spec: Spec;
  createdAt: string;
}

export interface GenUICanvasPaneProps {
  specs: PromotedGenUiSpec[];
  activeSpecId?: string | null;
  onSelectSpec?: (id: string) => void;
  onRemoveSpec?: (id: string) => void;
  onAction?: GenUiActionHandler;
  onAskSampleDashboard?: () => void;
}

type CanvasView = 'render' | 'tsx' | 'state';

export function GenUICanvasPane({
  specs,
  activeSpecId,
  onSelectSpec,
  onRemoveSpec,
  onAction,
  onAskSampleDashboard,
}: GenUICanvasPaneProps) {
  const [view, setView] = useState<CanvasView>('render');
  const [copiedTsx, setCopiedTsx] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const activeEntry = useMemo(() => {
    if (specs.length === 0) return null;
    if (activeSpecId) {
      return specs.find((s) => s.id === activeSpecId) ?? specs[0];
    }
    return specs[0];
  }, [specs, activeSpecId]);

  const analysis = useMemo(() => {
    if (!activeEntry) {
      return {
        components: [] as string[],
        actions: [] as string[],
        statePaths: [] as string[],
        tsx: '',
        json: '',
      };
    }
    try {
      const components = Array.from(collectUsedComponents(activeEntry.spec)).sort();
      const actions = Array.from(collectActions(activeEntry.spec)).sort();
      const statePaths = Array.from(collectStatePaths(activeEntry.spec)).sort();
      const safeName =
        activeEntry.title
          .replace(/[^a-zA-Z0-9]+/g, ' ')
          .trim()
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('') || 'GeneratedAdeWidget';
      const tsx = exportSpecToReactTsx(activeEntry.spec, safeName);
      const json = JSON.stringify(activeEntry.spec, null, 2);
      return { components, actions, statePaths, tsx, json };
    } catch {
      return {
        components: [],
        actions: [],
        statePaths: [],
        tsx: '// Unable to generate TSX for current spec',
        json: JSON.stringify(activeEntry.spec ?? {}, null, 2),
      };
    }
  }, [activeEntry]);

  const handleCopyTsx = async () => {
    if (!analysis.tsx) return;
    await navigator.clipboard.writeText(analysis.tsx);
    setCopiedTsx(true);
    toast.success('Copied React TSX component');
    setTimeout(() => setCopiedTsx(false), 1800);
  };

  const handleCopyJson = async () => {
    if (!analysis.json) return;
    await navigator.clipboard.writeText(analysis.json);
    setCopiedJson(true);
    toast.success('Copied json-render Spec & state JSON');
    setTimeout(() => setCopiedJson(false), 1800);
  };

  const handleDownloadTsx = () => {
    if (!activeEntry || !analysis.tsx) return;
    const filename = `${
      activeEntry.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'genui-widget'
    }.tsx`;
    const blob = new Blob([analysis.tsx], { type: 'text/typescript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeEntry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-surface)] px-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <Sparkles className="size-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">
            GenUI Canvas (json-render)
          </h3>
          <p className="max-w-sm text-xs leading-relaxed text-[var(--fg-muted)]">
            Promote any interactive widget streamed in chat to inspect it full-bleed, explore its
            live state JSON, or export clean React TSX via{' '}
            <code className="font-mono text-[11px]">@json-render/codegen</code>.
          </p>
        </div>
        {onAskSampleDashboard && (
          <Button variant="primary" size="sm" onClick={onAskSampleDashboard}>
            <Sparkles className="size-3.5" />
            Stream a live metrics dashboard
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-surface)] text-[var(--fg-primary)]">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[var(--fg-primary)]">
              {activeEntry.title}
            </div>
            <div className="text-[10px] text-[var(--fg-muted)]">
              {analysis.components.length} components · {formatRelativeTime(activeEntry.createdAt)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-0.5">
            {(
              [
                ['render', 'Canvas', Eye],
                ['tsx', 'React TSX', Code2],
                ['state', 'Spec & State', Braces],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors',
                  view === key
                    ? 'bg-[var(--bg-surface)] text-[var(--fg-primary)] shadow-xs'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg-primary)]',
                )}
              >
                <Icon className="size-3" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="xs"
            onClick={() => void handleCopyTsx()}
            title="Copy generated React TSX"
          >
            {copiedTsx ? (
              <Check className="size-3 text-[var(--status-success)]" />
            ) : (
              <Copy className="size-3" />
            )}
            <span className="hidden sm:inline">Copy TSX</span>
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDownloadTsx}
            title="Download .tsx file"
            aria-label="Download React TSX file"
          >
            <Download className="size-3.5" />
          </Button>

          {onRemoveSpec && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRemoveSpec(activeEntry.id)}
              title="Remove from Canvas"
              aria-label="Remove widget from Canvas"
            >
              <Trash2 className="size-3.5 text-[var(--fg-muted)] hover:text-[var(--status-danger)]" />
            </Button>
          )}
        </div>
      </div>

      {/* Spec Switcher Bar when multiple widgets promoted */}
      {specs.length > 1 && (
        <div className="astryx-scroll-fade-x flex items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]/50 px-3.5 py-1.5">
          <Layers className="size-3 shrink-0 text-[var(--fg-muted)]" />
          {specs.map((item) => {
            const active = item.id === activeEntry.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSpec?.(item.id)}
                className={cn(
                  'shrink-0 cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'bg-[var(--bg-surface)] text-[var(--fg-secondary)] hover:bg-[var(--overlay-hover)]',
                )}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Used Components & Actions Metadata Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]/35 px-3.5 py-1.5">
        {analysis.components.map((comp) => (
          <Badge key={comp} variant="default" className="font-mono text-[10px]">
            &lt;{comp} /&gt;
          </Badge>
        ))}
        {analysis.actions.map((act) => (
          <Badge key={act} variant="accent" className="font-mono text-[10px]">
            action:{act}
          </Badge>
        ))}
      </div>

      {/* Main Canvas Body */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {view === 'render' && (
          <GenUIRenderer
            spec={activeEntry.spec}
            onAction={onAction}
            showToolbar={false}
            className="my-0"
          />
        )}

        {view === 'tsx' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
              <span>Generated via @json-render/codegen</span>
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" size="xs" onClick={() => void handleCopyTsx()}>
                  {copiedTsx ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copiedTsx ? 'Copied' : 'Copy'}
                </Button>
                <Button variant="secondary" size="xs" onClick={handleDownloadTsx}>
                  <Download className="size-3" />
                  Download .tsx
                </Button>
              </div>
            </div>
            <pre className="astryx-dark-surface overflow-auto rounded-[var(--radius-element)] border border-[var(--border-subtle)] p-4 font-mono text-xs leading-relaxed">
              <code>{analysis.tsx}</code>
            </pre>
          </div>
        )}

        {view === 'state' && (
          <div className="space-y-4">
            {analysis.statePaths.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                  Bound State Paths
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.statePaths.map((p) => (
                    <Badge key={p} variant="secondary" className="font-mono text-[11px]">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                  Live Spec & State JSON
                </span>
                <Button variant="secondary" size="xs" onClick={() => void handleCopyJson()}>
                  {copiedJson ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copiedJson ? 'Copied JSON' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="astryx-dark-surface overflow-auto rounded-[var(--radius-element)] border border-[var(--border-subtle)] p-4 font-mono text-xs leading-relaxed">
                <code>{analysis.json}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
