import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 whitespace-nowrap font-medium',
    'rounded-[var(--radius-full)] border px-2 py-0.5 text-[11px] leading-tight tracking-tight',
    'select-none [&_svg]:size-3 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--fg-secondary)]',
        secondary: 'border-transparent bg-[var(--bg-surface-subtle)] text-[var(--fg-secondary)]',
        accent: 'border-transparent bg-[var(--accent-soft)] text-[var(--accent)]',
        success: 'border-transparent bg-[var(--status-success-soft)] text-[var(--status-success)]',
        warning: 'border-transparent bg-[var(--status-warning-soft)] text-[var(--status-warning)]',
        danger: 'border-transparent bg-[var(--status-danger-soft)] text-[var(--status-danger)]',
        destructive:
          'border-transparent bg-[var(--status-danger-soft)] text-[var(--status-danger)]',
        outline: 'border-[var(--border-strong)] bg-transparent text-[var(--fg-primary)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ref, ...props }: BadgeProps) {
  return (
    <span
      ref={ref}
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
