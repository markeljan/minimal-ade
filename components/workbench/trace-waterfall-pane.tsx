'use client';

import {
  visibleWaterfallRows,
  Waterfall,
  WaterfallAxis,
  WaterfallBar,
  WaterfallCell,
  WaterfallColumnHeader,
  type WaterfallDataItem,
  WaterfallHeaderRow,
  WaterfallIndicator,
  WaterfallRow,
  WaterfallRowHeader,
  WaterfallTick,
} from '@ui-sdk/react/waterfall';
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  type Cpu,
  Globe,
  Layers,
  MousePointerClick,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  BillingSourceInfo,
  HarnessMode,
  TokenUsageSummary,
  TraceSpan,
  TraceSpanKind,
  TraceSpanStatus,
} from '@/lib/types';
import { cn, formatDuration } from '@/lib/utils';

export interface TraceWaterfallPaneProps {
  spans: TraceSpan[];
  usage?: TokenUsageSummary | null;
  modelId?: string;
  harnessMode?: HarnessMode;
  billingSource?: BillingSourceInfo | null;
  isStreaming?: boolean;
  onSelectSpan?: (span: TraceSpan) => void;
  onClear?: () => void;
}

type SpanFilter = 'all' | 'llm' | 'reasoning' | 'tool' | 'runtime' | 'ui';

const KIND_META: Record<
  TraceSpanKind,
  { label: string; barClass: string; badgeClass: string; icon: typeof Cpu }
> = {
  llm: {
    label: 'Model',
    barClass: 'bg-[var(--accent)]',
    badgeClass: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    icon: Sparkles,
  },
  reasoning: {
    label: 'Reasoning',
    barClass: 'bg-violet-500',
    badgeClass: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    icon: Brain,
  },
  tool: {
    label: 'Tool',
    barClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    icon: Wrench,
  },
  sandbox: {
    label: 'Sandbox',
    barClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    icon: Terminal,
  },
  browser: {
    label: 'Browser',
    barClass: 'bg-sky-500',
    badgeClass: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    icon: Globe,
  },
  subagent: {
    label: 'Subagent',
    barClass: 'bg-indigo-500',
    badgeClass: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
    icon: Bot,
  },
  'workflow-step': {
    label: 'Workflow',
    barClass: 'bg-teal-500',
    badgeClass: 'bg-teal-500/12 text-teal-600 dark:text-teal-400',
    icon: Layers,
  },
  'ui-action': {
    label: 'UI Bridge',
    barClass: 'bg-pink-500',
    badgeClass: 'bg-pink-500/12 text-pink-600 dark:text-pink-400',
    icon: MousePointerClick,
  },
};

function matchesFilter(span: TraceSpan, filter: SpanFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'llm') return span.kind === 'llm';
  if (filter === 'reasoning') return span.kind === 'reasoning';
  if (filter === 'tool') return span.kind === 'tool' || span.kind === 'subagent';
  if (filter === 'runtime') {
    return span.kind === 'sandbox' || span.kind === 'browser' || span.kind === 'workflow-step';
  }
  return span.kind === 'ui-action';
}

function StatusIcon({ status }: { status: TraceSpanStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
    case 'error':
    case 'denied':
      return <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
    case 'awaiting-approval':
      return <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
    case 'running':
      return (
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
      );
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function buildWaterfallTree(
  spans: TraceSpan[],
  originMs: number,
  nowMs: number,
): WaterfallDataItem[] {
  const byId = new Map<string, WaterfallDataItem>();
  const childrenMap = new Map<string, WaterfallDataItem[]>();
  const roots: WaterfallDataItem[] = [];

  for (const span of spans) {
    const start = Math.max(0, span.startedAt - originMs);
    const rawDuration =
      span.durationMs ??
      (span.endedAt !== undefined
        ? Math.max(1, span.endedAt - span.startedAt)
        : Math.max(12, nowMs - span.startedAt));
    const item: WaterfallDataItem = {
      value: span.id,
      label: span.name,
      start,
      duration: Math.max(1, rawDuration),
    };
    byId.set(span.id, item);
  }

  for (const span of spans) {
    const item = byId.get(span.id);
    if (!item) continue;
    if (span.parentId && byId.has(span.parentId)) {
      const list = childrenMap.get(span.parentId) ?? [];
      list.push(item);
      childrenMap.set(span.parentId, list);
    } else {
      roots.push(item);
    }
  }

  for (const [parentId, kids] of childrenMap.entries()) {
    const parent = byId.get(parentId);
    if (parent && kids.length > 0) {
      parent.children = kids;
    }
  }

  return roots;
}

export function TraceWaterfallPane({
  spans,
  usage,
  modelId,
  harnessMode = 'ai-sdk',
  billingSource,
  isStreaming = false,
  onSelectSpan,
  onClear,
}: TraceWaterfallPaneProps) {
  const [filter, setFilter] = useState<SpanFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const hasRunningSpan = useMemo(
    () => isStreaming || spans.some((s) => s.status === 'running'),
    [isStreaming, spans],
  );

  useEffect(() => {
    if (!hasRunningSpan) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [hasRunningSpan]);

  const filteredSpans = useMemo(
    () => spans.filter((s) => matchesFilter(s, filter)),
    [spans, filter],
  );

  const spanMap = useMemo(() => {
    const map = new Map<string, TraceSpan>();
    for (const s of spans) {
      map.set(s.id, s);
    }
    return map;
  }, [spans]);

  // Auto-expand parents as new spans stream in
  useEffect(() => {
    const parentIds = new Set<string>();
    for (const s of spans) {
      if (s.parentId) parentIds.add(s.parentId);
    }
    if (parentIds.size > 0) {
      setExpandedIds((prev) => {
        const merged = new Set(prev);
        let changed = false;
        for (const pid of parentIds) {
          if (!merged.has(pid)) {
            merged.add(pid);
            changed = true;
          }
        }
        return changed ? Array.from(merged) : prev;
      });
    }
  }, [spans]);

  const { waterfallItems, totalDurationMs, range } = useMemo(() => {
    if (filteredSpans.length === 0) {
      return {
        waterfallItems: [] as WaterfallDataItem[],
        totalDurationMs: 0,
        range: [0, 1000] as [number, number],
      };
    }
    const origin = Math.min(...filteredSpans.map((s) => s.startedAt));
    const items = buildWaterfallTree(filteredSpans, origin, nowMs);
    let maxEnd = 100;
    for (const s of filteredSpans) {
      const start = Math.max(0, s.startedAt - origin);
      const dur =
        s.durationMs ??
        (s.endedAt !== undefined
          ? Math.max(1, s.endedAt - s.startedAt)
          : Math.max(12, nowMs - s.startedAt));
      maxEnd = Math.max(maxEnd, start + dur);
    }
    return {
      waterfallItems: items,
      totalDurationMs: maxEnd,
      range: [0, Math.ceil(maxEnd * 1.05)] as [number, number],
    };
  }, [filteredSpans, nowMs]);

  const visibleRows = useMemo(
    () => visibleWaterfallRows(waterfallItems, expandedIds),
    [waterfallItems, expandedIds],
  );

  const selectedSpan = selectedId ? (spanMap.get(selectedId) ?? null) : null;

  const aggregatedTokens = useMemo(() => {
    if (usage && usage.totalTokens > 0) {
      return usage;
    }
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let cacheReadTokens = 0;
    let estimatedCostUsd = 0;
    for (const s of spans) {
      inputTokens += s.tokens?.inputTokens ?? 0;
      outputTokens += s.tokens?.outputTokens ?? 0;
      reasoningTokens += s.tokens?.reasoningTokens ?? 0;
      cacheReadTokens += s.tokens?.cacheReadTokens ?? 0;
      estimatedCostUsd += s.tokens?.estimatedCostUsd ?? 0;
    }
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      reasoningTokens,
      cacheReadTokens,
      estimatedCostUsd,
    };
  }, [spans, usage]);

  const harnessLabel =
    harnessMode === 'fx' ? 'fx (libfx)' : harnessMode === 'workflow' ? 'Workflow 5' : 'AI SDK 7';

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--bg-surface)] text-foreground">
      {/* Telemetry Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span className="whitespace-nowrap">Trace Waterfall</span>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {spans.length} {spans.length === 1 ? 'span' : 'spans'}
            </span>
          </div>
          {totalDurationMs > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              {formatDuration(totalDurationMs)}
            </span>
          )}
          {hasRunningSpan && (
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-500/12 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
              Live
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {spans.length > 0 && onClear && (
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                onClear();
              }}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-inner,8px)] border border-border/70 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Clear trace spans"
            >
              <Trash2 className="h-3 w-3 shrink-0" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Model / Billing / Token Telemetry Cards */}
      <div className="@container border-b border-border/60 bg-muted/25 px-3.5 py-2.5">
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          <div className="min-w-0 rounded-[var(--radius-inner,8px)] border border-border/60 bg-background/70 px-2.5 py-1.5">
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Model & Harness
            </div>
            <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground">
              {modelId ?? 'auto'}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">{harnessLabel}</div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-inner,8px)] border border-border/60 bg-background/70 px-2.5 py-1.5">
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Billing Tier
            </div>
            <div className="mt-0.5 truncate text-xs font-medium text-foreground">
              {billingSource?.label ?? 'Resolving…'}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {billingSource?.providerName ?? '5-Tier Waterfall'}
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-inner,8px)] border border-border/60 bg-background/70 px-2.5 py-1.5">
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tokens (In / Out)
            </div>
            <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground">
              {aggregatedTokens.inputTokens.toLocaleString()} /{' '}
              {aggregatedTokens.outputTokens.toLocaleString()}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">
              Total {aggregatedTokens.totalTokens.toLocaleString()}
              {aggregatedTokens.reasoningTokens
                ? ` · ${aggregatedTokens.reasoningTokens.toLocaleString()} rsn`
                : ''}
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-inner,8px)] border border-border/60 bg-background/70 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="truncate">Est. Cost</span>
              <Coins className="h-3 w-3 shrink-0" />
            </div>
            <div className="mt-0.5 truncate font-mono text-xs font-medium text-foreground">
              {aggregatedTokens.estimatedCostUsd && aggregatedTokens.estimatedCostUsd > 0
                ? `$${aggregatedTokens.estimatedCostUsd.toFixed(4)}`
                : '$0.0000'}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">
              {aggregatedTokens.cacheReadTokens
                ? `${aggregatedTokens.cacheReadTokens.toLocaleString()} cached`
                : 'Live estimate'}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-3.5 py-1.5">
        {(
          [
            ['all', 'All'],
            ['llm', 'Model'],
            ['reasoning', 'Reasoning'],
            ['tool', 'Tools'],
            ['runtime', 'Sandbox & Browser'],
            ['ui', 'UI Bridge'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              filter === key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Waterfall Body powered by @ui-sdk/react/waterfall */}
      <div className="min-h-0 flex-1 overflow-auto">
        {waterfallItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-foreground">
              No execution spans recorded yet
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              Send a message or run a tool to inspect live step timelines, reasoning durations,
              sandbox commands, and token usage via{' '}
              <code className="font-mono text-[11px]">@ui-sdk/react/waterfall</code>.
            </p>
            {filter !== 'all' && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="mt-1 inline-flex items-center gap-1 rounded-[var(--radius-inner,8px)] border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
              >
                <RotateCcw className="h-3 w-3" />
                Reset filter
              </button>
            )}
          </div>
        ) : (
          <Waterfall
            items={waterfallItems}
            range={range}
            value={selectedId}
            onValueChange={(val) => {
              setSelectedId(val);
              if (val) {
                const found = spanMap.get(val);
                if (found) onSelectSpan?.(found);
              }
            }}
            expanded={expandedIds}
            onExpandedChange={(next) => setExpandedIds(next)}
            className="w-full min-w-[460px] text-xs select-none"
          >
            {/* Header Row + Time Axis */}
            <WaterfallHeaderRow className="sticky top-0 z-10 grid grid-cols-[minmax(150px,1.15fr)_84px_minmax(180px,2fr)] items-center border-b border-border/70 bg-background/95 backdrop-blur-sm">
              <WaterfallColumnHeader className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Span
              </WaterfallColumnHeader>
              <WaterfallColumnHeader className="whitespace-nowrap pl-2 pr-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Duration
              </WaterfallColumnHeader>
              <WaterfallAxis
                maxTicks={5}
                className="relative h-7 overflow-hidden border-l border-border/60 pl-3 pr-2.5"
              >
                {(state) => (
                  <div className="relative h-full w-full">
                    {state.ticks.map((tick) => (
                      <WaterfallTick
                        key={tick.time}
                        time={tick.time}
                        style={{ left: 'var(--waterfall-tick)' }}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-muted-foreground',
                          tick.position <= 2
                            ? 'translate-x-0'
                            : tick.position >= 98
                              ? '-translate-x-full'
                              : '-translate-x-1/2',
                        )}
                      >
                        {formatDuration(tick.time)}
                      </WaterfallTick>
                    ))}
                  </div>
                )}
              </WaterfallAxis>
            </WaterfallHeaderRow>

            {/* Span Rows */}
            <div className="divide-y divide-border/40">
              {visibleRows.map((row) => {
                const span = spanMap.get(row.item.value);
                if (!span) return null;
                const kindMeta = KIND_META[span.kind] ?? KIND_META.tool;
                const Icon = kindMeta.icon;
                const isSelected = selectedId === span.id;
                const isBranch = Boolean(row.item.children?.length);

                return (
                  <WaterfallRow
                    key={row.item.value}
                    value={row.item.value}
                    className={cn(
                      'grid grid-cols-[minmax(150px,1.15fr)_84px_minmax(180px,2fr)] items-center transition-colors cursor-pointer',
                      isSelected ? 'bg-[var(--accent)]/8' : 'hover:bg-muted/45',
                    )}
                  >
                    <WaterfallRowHeader
                      className="flex min-w-0 items-center gap-1.5 py-2 pr-2"
                      style={{ paddingLeft: `${12 + (row.level - 1) * 14}px` }}
                    >
                      {isBranch ? (
                        <WaterfallIndicator className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted data-[expanded]:rotate-90 transition-transform">
                          <ChevronRight className="h-3 w-3" />
                        </WaterfallIndicator>
                      ) : (
                        <span className="inline-block w-4 shrink-0" />
                      )}
                      <StatusIcon status={span.status} />
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">{span.name}</span>
                    </WaterfallRowHeader>

                    <WaterfallCell className="whitespace-nowrap pl-2 pr-3.5 py-2 text-right font-mono text-[11px] text-muted-foreground">
                      {formatDuration(row.item.duration)}
                    </WaterfallCell>

                    <WaterfallBar className="relative h-8 border-l border-border/50 pl-3 pr-2.5">
                      <div className="relative h-full w-full">
                        <div
                          className={cn(
                            'absolute top-1/2 h-3.5 -translate-y-1/2 rounded-[4px] opacity-90',
                            span.status === 'error' || span.status === 'denied'
                              ? 'bg-rose-500'
                              : span.status === 'awaiting-approval'
                                ? 'bg-amber-500'
                                : kindMeta.barClass,
                            span.status === 'running' && 'animate-pulse',
                          )}
                          style={{
                            left: 'var(--waterfall-start)',
                            width: 'max(4px, var(--waterfall-size))',
                          }}
                          title={`${span.name} (${formatDuration(row.item.duration)})`}
                        />
                      </div>
                    </WaterfallBar>
                  </WaterfallRow>
                );
              })}
            </div>
          </Waterfall>
        )}
      </div>

      {/* Selected Span Detail Inspector */}
      {selectedSpan && (
        <div className="max-h-[42%] shrink-0 overflow-auto border-t border-border bg-muted/20 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusIcon status={selectedSpan.status} />
                <span className="truncate text-xs font-semibold text-foreground">
                  {selectedSpan.name}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    (KIND_META[selectedSpan.kind] ?? KIND_META.tool).badgeClass,
                  )}
                >
                  {(KIND_META[selectedSpan.kind] ?? KIND_META.tool).label}
                </span>
                {selectedSpan.toolName && (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {selectedSpan.toolName}
                  </code>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
                <span>
                  Duration:{' '}
                  {formatDuration(
                    selectedSpan.durationMs ??
                      (selectedSpan.endedAt
                        ? selectedSpan.endedAt - selectedSpan.startedAt
                        : nowMs - selectedSpan.startedAt),
                  )}
                </span>
                {selectedSpan.modelId && <span>Model: {selectedSpan.modelId}</span>}
                {selectedSpan.tokens?.totalTokens ? (
                  <span>Tokens: {selectedSpan.tokens.totalTokens.toLocaleString()}</span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Close
            </button>
          </div>

          {selectedSpan.error && (
            <div className="mt-2.5 rounded-[var(--radius-inner,8px)] border border-rose-500/30 bg-rose-500/10 p-2 font-mono text-[11px] text-rose-600 dark:text-rose-400">
              {selectedSpan.error}
            </div>
          )}

          {selectedSpan.inputPreview && (
            <div className="mt-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Input
              </div>
              <pre className="max-h-28 overflow-auto rounded-[var(--radius-inner,8px)] border border-border/60 bg-background p-2 font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
                {selectedSpan.inputPreview}
              </pre>
            </div>
          )}

          {selectedSpan.outputPreview && (
            <div className="mt-2.5">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Output
              </div>
              <pre className="max-h-32 overflow-auto rounded-[var(--radius-inner,8px)] border border-border/60 bg-background p-2 font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
                {selectedSpan.outputPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
