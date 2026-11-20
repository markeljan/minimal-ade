'use client';

import { ArrowUpRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SourceItem {
  id?: string;
  url: string;
  title?: string;
  mediaType?: string;
}

export interface SourcesBarProps {
  sources: SourceItem[];
  className?: string;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SourcesBar({ sources, className }: SourcesBarProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  // Deduplicate by URL while preserving citation order
  const uniqueSources: SourceItem[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    if (!src.url || seen.has(src.url)) continue;
    seen.add(src.url);
    uniqueSources.push(src);
  }

  if (uniqueSources.length === 0) {
    return null;
  }

  return (
    <div data-slot="sources-bar" className={cn('my-2.5 flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
        <Globe className="size-3" aria-hidden="true" />
        <span>Sources ({uniqueSources.length})</span>
      </div>

      <div className="astryx-scroll-fade-x flex items-center gap-2 pb-1">
        {uniqueSources.map((src, index) => {
          const host = extractHost(src.url);
          return (
            <a
              key={src.id ?? `${src.url}-${index}`}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'group inline-flex max-w-[240px] shrink-0 items-center gap-2',
                'rounded-[var(--radius-element)] border border-[var(--border-subtle)]',
                'bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-low)]',
                'hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)]',
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--accent-soft)] font-mono text-[10px] font-semibold text-[var(--accent)]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--fg-primary)]">
                  {src.title ?? host}
                </span>
                <span className="block truncate text-[10px] text-[var(--fg-muted)]">{host}</span>
              </span>
              <ArrowUpRight
                className="size-3 shrink-0 text-[var(--fg-muted)] group-hover:text-[var(--fg-primary)]"
                aria-hidden="true"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
