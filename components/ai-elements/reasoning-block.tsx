'use client';

import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn, formatDuration } from '@/lib/utils';

export interface ReasoningBlockProps {
  content: string;
  isStreaming?: boolean;
  durationMs?: number;
  defaultOpen?: boolean;
  label?: string;
  className?: string;
}

export function ReasoningBlock({
  content,
  isStreaming = false,
  durationMs,
  defaultOpen = false,
  label,
  className,
}: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(defaultOpen || isStreaming);
  const [elapsedMs, setElapsedMs] = React.useState<number>(durationMs ?? 0);
  const startRef = React.useRef<number | null>(null);
  const contentId = React.useId();

  // Auto-open while actively streaming if user hasn't explicitly collapsed, and track live timer
  React.useEffect(() => {
    if (isStreaming) {
      if (startRef.current === null) {
        startRef.current = Date.now();
      }
      const timer = window.setInterval(() => {
        if (startRef.current !== null) {
          setElapsedMs(Date.now() - startRef.current);
        }
      }, 150);
      return () => window.clearInterval(timer);
    }

    if (durationMs !== undefined) {
      setElapsedMs(durationMs);
    } else if (startRef.current !== null) {
      setElapsedMs(Date.now() - startRef.current);
      startRef.current = null;
    }
  }, [isStreaming, durationMs]);

  const displayDuration = durationMs ?? elapsedMs;
  const heading =
    label ??
    (isStreaming
      ? 'Thinking'
      : displayDuration > 0
        ? `Thought for ${formatDuration(displayDuration)}`
        : 'Reasoning');

  return (
    <div
      data-slot="reasoning-block"
      className={cn(
        'my-2 overflow-hidden rounded-[var(--radius-element)] border border-[var(--border-subtle)]',
        'bg-[var(--bg-surface-subtle)]',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left',
          'text-xs font-medium text-[var(--fg-secondary)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]',
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Brain
            className={cn(
              'size-3.5 shrink-0',
              isStreaming ? 'animate-pulse text-[var(--accent)]' : 'text-[var(--fg-muted)]',
            )}
            aria-hidden="true"
          />
          <span className="truncate">{heading}</span>
          {isStreaming && displayDuration > 0 && (
            <span className="font-mono text-[11px] text-[var(--fg-muted)]">
              {formatDuration(displayDuration)}
            </span>
          )}
        </span>
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          id={contentId}
          className="border-t border-[var(--border-subtle)] px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-[var(--fg-secondary)]"
        >
          {content || (isStreaming ? 'Working through the problem…' : '')}
        </div>
      )}
    </div>
  );
}
