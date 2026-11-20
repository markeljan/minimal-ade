import type * as React from 'react';
import { cn } from '@/lib/utils';

export type KbdProps = React.ComponentProps<'kbd'>;

export function Kbd({ className, ref, ...props }: KbdProps) {
  return (
    <kbd
      ref={ref}
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center gap-0.5',
        'rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-surface-subtle)]',
        'px-1.5 font-mono text-[10px] font-medium leading-none text-[var(--fg-muted)]',
        'shadow-[inset_0_-1px_0_var(--border-subtle)] select-none',
        className,
      )}
      {...props}
    />
  );
}
