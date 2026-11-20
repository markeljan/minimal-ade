'use client';

import { ArrowUpRight } from 'lucide-react';
import type * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { WorkbenchTab } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface SuggestionItem {
  id: string;
  title: string;
  description?: string;
  prompt: string;
  badge?: string;
  icon?: React.ReactNode;
  targetTab?: WorkbenchTab;
}

export interface SuggestionGridProps {
  suggestions: SuggestionItem[];
  onSelect: (prompt: string, item: SuggestionItem) => void;
  columns?: 1 | 2 | 3;
  compact?: boolean;
  className?: string;
}

export function SuggestionGrid({
  suggestions,
  onSelect,
  columns = 3,
  compact = false,
  className,
}: SuggestionGridProps) {
  if (suggestions.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div
        data-slot="suggestion-grid"
        className={cn('astryx-scroll-fade-x flex items-center gap-2 pb-1', className)}
      >
        {suggestions.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.prompt, item)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-1.5',
              'rounded-[var(--radius-full)] border border-[var(--border-subtle)]',
              'bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg-secondary)]',
              'shadow-[var(--shadow-low)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]',
            )}
          >
            {item.icon && <span className="text-[var(--accent)]">{item.icon}</span>}
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    );
  }

  const gridCols =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div data-slot="suggestion-grid" className={cn('grid gap-2.5', gridCols, className)}>
      {suggestions.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.prompt, item)}
          className={cn(
            'group flex cursor-pointer flex-col justify-between gap-2.5 text-left',
            'rounded-[var(--radius-container)] border border-[var(--border-subtle)]',
            'bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-low)]',
            'transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            'hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-med)]',
            'active:bg-[var(--overlay-press)]',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {item.icon && (
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-inner)] bg-[var(--accent-soft)] text-[var(--accent)]">
                  {item.icon}
                </span>
              )}
              {item.badge && <Badge variant="secondary">{item.badge}</Badge>}
            </div>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-[var(--fg-muted)] transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--fg-primary)]"
              aria-hidden="true"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--fg-primary)]">{item.title}</p>
            {item.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--fg-secondary)]">
                {item.description}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
