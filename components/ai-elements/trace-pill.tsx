'use client';

import { Activity, ChevronRight } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';

export interface TracePillProps {
  stepCount?: number;
  toolCount?: number;
  latencyMs?: number;
  totalTokens?: number;
  isStreaming?: boolean;
  onOpenTrace?: () => void;
  className?: string;
}

export function TracePill({
  stepCount = 0,
  toolCount = 0,
  latencyMs,
  totalTokens,
  isStreaming = false,
  onOpenTrace,
  className,
}: TracePillProps) {
  const parts: string[] = [];
  if (stepCount > 0) {
    parts.push(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`);
  }
  if (toolCount > 0) {
    parts.push(`${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`);
  }
  if (latencyMs !== undefined && latencyMs > 0) {
    parts.push(formatDuration(latencyMs));
  }
  if (totalTokens !== undefined && totalTokens > 0) {
    parts.push(`${totalTokens.toLocaleString()} tok`);
  }

  const summary = parts.length > 0 ? parts.join(' · ') : isStreaming ? 'Tracing…' : 'Trace';

  return (
    <button
      type="button"
      data-slot="trace-pill"
      onClick={onOpenTrace}
      disabled={!onOpenTrace}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-full)]',
        'border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5',
        'text-[11px] font-medium text-[var(--fg-secondary)] shadow-[var(--shadow-low)]',
        onOpenTrace
          ? 'cursor-pointer hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]'
          : 'cursor-default',
        className,
      )}
    >
      <Activity
        className={cn(
          'size-3 shrink-0',
          isStreaming ? 'animate-pulse text-[var(--accent)]' : 'text-[var(--fg-muted)]',
        )}
        aria-hidden="true"
      />
      <span className="font-mono text-[11px]">{summary}</span>
      {onOpenTrace && (
        <ChevronRight className="size-3 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
      )}
    </button>
  );
}
