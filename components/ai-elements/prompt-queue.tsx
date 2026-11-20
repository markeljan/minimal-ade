'use client';

import { ArrowUp, Clock, Paperclip, X } from 'lucide-react';
import { cn, truncateText } from '@/lib/utils';

export interface QueuedPromptItem {
  id: string;
  text: string;
  attachmentCount?: number;
  createdAt?: number;
}

export interface PromptQueueProps {
  items: QueuedPromptItem[];
  onRemove: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onClear?: () => void;
  className?: string;
}

export function PromptQueue({ items, onRemove, onMoveUp, onClear, className }: PromptQueueProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      data-slot="prompt-queue"
      aria-label={`Queued prompts (${items.length})`}
      className={cn(
        'mb-2 overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)]',
        'bg-[var(--bg-surface)] shadow-[var(--shadow-low)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--fg-secondary)]">
          <Clock className="size-3 text-[var(--accent)]" aria-hidden="true" />
          Queued ({items.length}) — sends automatically when current step finishes
        </span>
        {onClear && items.length > 1 && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-[11px] font-medium text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
          >
            Clear all
          </button>
        )}
      </div>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {items.map((item, idx) => (
          <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--bg-surface-subtle)] font-mono text-[10px] font-semibold text-[var(--fg-muted)]">
                {idx + 1}
              </span>
              <span className="truncate text-[var(--fg-primary)]">
                {truncateText(item.text || 'Attachment message', 90)}
              </span>
              {item.attachmentCount !== undefined && item.attachmentCount > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[var(--radius-full)] bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">
                  <Paperclip className="size-2.5" aria-hidden="true" />
                  {item.attachmentCount}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {onMoveUp && idx > 0 && (
                <button
                  type="button"
                  aria-label="Move queued prompt up"
                  onClick={() => onMoveUp(item.id)}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-[var(--fg-muted)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]"
                >
                  <ArrowUp className="size-3" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                aria-label="Remove queued prompt"
                onClick={() => onRemove(item.id)}
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-[6px] text-[var(--fg-muted)] hover:bg-[var(--overlay-hover)] hover:text-[var(--status-danger)]"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
