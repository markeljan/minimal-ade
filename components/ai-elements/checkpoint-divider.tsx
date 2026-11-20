'use client';

import { BookmarkCheck, RotateCcw } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';

export interface CheckpointDividerProps {
  id: string;
  label?: string;
  timestamp?: string | number;
  messageCount?: number;
  onRestore?: (id: string) => void;
  className?: string;
}

export function CheckpointDivider({
  id,
  label = 'Checkpoint',
  timestamp,
  messageCount,
  onRestore,
  className,
}: CheckpointDividerProps) {
  return (
    <div data-slot="checkpoint-divider" className={cn('my-4 flex items-center gap-3', className)}>
      <hr className="h-px flex-1 border-0 bg-[var(--border-subtle)]" />
      <div className="inline-flex items-center gap-2 rounded-[var(--radius-full)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] text-[var(--fg-secondary)] shadow-[var(--shadow-low)]">
        <BookmarkCheck className="size-3 text-[var(--accent)]" aria-hidden="true" />
        <span className="font-medium text-[var(--fg-primary)]">{label}</span>
        {messageCount !== undefined && (
          <span className="font-mono text-[10px] text-[var(--fg-muted)]">
            {messageCount} {messageCount === 1 ? 'turn' : 'turns'}
          </span>
        )}
        {timestamp !== undefined && (
          <span className="text-[10px] text-[var(--fg-muted)]">
            {formatRelativeTime(timestamp)}
          </span>
        )}
        {onRestore && (
          <button
            type="button"
            onClick={() => onRestore(id)}
            className="ml-0.5 inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-full)] bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg-primary)] hover:bg-[var(--overlay-hover)]"
          >
            <RotateCcw className="size-2.5" aria-hidden="true" />
            Rewind
          </button>
        )}
      </div>
      <hr className="h-px flex-1 border-0 bg-[var(--border-subtle)]" />
    </div>
  );
}
