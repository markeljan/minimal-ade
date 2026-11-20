'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import type { TokenUsageSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface ContextMeterProps {
  usage?: Partial<TokenUsageSummary> | null;
  contextWindow?: number;
  modelName?: string;
  className?: string;
}

function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  }
  return String(Math.round(value));
}

export function ContextMeter({
  usage,
  contextWindow = 200_000,
  modelName,
  className,
}: ContextMeterProps) {
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const reasoningTokens = usage?.reasoningTokens ?? 0;
  const cacheReadTokens = usage?.cacheReadTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;

  const safeWindow = Math.max(1, contextWindow);
  const ratio = Math.min(1, totalTokens / safeWindow);
  const pct = Math.round(ratio * 100);

  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  const strokeColor =
    pct >= 85 ? 'var(--status-danger)' : pct >= 65 ? 'var(--status-warning)' : 'var(--accent)';

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Context window usage: ${pct}% (${totalTokens.toLocaleString()} of ${safeWindow.toLocaleString()} tokens)`}
        data-slot="context-meter"
        className={cn(
          'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-full)]',
          'border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-[11px] font-medium text-[var(--fg-secondary)]',
          'hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
          className,
        )}
      >
        <svg
          role="img"
          aria-label={`${pct}% context used`}
          viewBox="0 0 20 20"
          className="size-4 -rotate-90"
        >
          <title>{`${pct}% context window used`}</title>
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="2.2"
          />
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="font-mono text-[11px]">{pct}%</span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[var(--fg-primary)]">Context Window</p>
            {modelName && (
              <p className="truncate text-[11px] text-[var(--fg-muted)]">{modelName}</p>
            )}
          </div>
          <span className="font-mono text-xs font-semibold text-[var(--fg-primary)]">{pct}%</span>
        </div>

        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--bg-surface-subtle)]">
          <div
            className="h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-medium)]"
            style={{ width: `${Math.max(2, pct)}%`, backgroundColor: strokeColor }}
          />
        </div>

        <p className="mt-1.5 font-mono text-[11px] text-[var(--fg-muted)]">
          {formatCompactTokens(totalTokens)} / {formatCompactTokens(safeWindow)} tokens
        </p>

        <Separator className="my-2.5" />

        <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
          <dt className="text-[var(--fg-muted)]">Input</dt>
          <dd className="text-right font-mono text-[var(--fg-primary)]">
            {inputTokens.toLocaleString()}
          </dd>
          <dt className="text-[var(--fg-muted)]">Output</dt>
          <dd className="text-right font-mono text-[var(--fg-primary)]">
            {outputTokens.toLocaleString()}
          </dd>
          {reasoningTokens > 0 && (
            <>
              <dt className="text-[var(--fg-muted)]">Reasoning</dt>
              <dd className="text-right font-mono text-[var(--fg-primary)]">
                {reasoningTokens.toLocaleString()}
              </dd>
            </>
          )}
          {cacheReadTokens > 0 && (
            <>
              <dt className="text-[var(--fg-muted)]">Cache Read</dt>
              <dd className="text-right font-mono text-[var(--status-success)]">
                {cacheReadTokens.toLocaleString()}
              </dd>
            </>
          )}
          {usage?.estimatedCostUsd !== undefined && (
            <>
              <dt className="text-[var(--fg-muted)]">Est. Cost</dt>
              <dd className="text-right font-mono text-[var(--fg-primary)]">
                ${usage.estimatedCostUsd.toFixed(4)}
              </dd>
            </>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
