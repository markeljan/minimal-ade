'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium',
    'select-none cursor-pointer',
    'rounded-[var(--radius-element)]',
    'transition-[box-shadow,border-color,color,opacity] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-low)] hover:bg-[var(--accent-hover)] active:opacity-90',
        default:
          'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow-low)] hover:bg-[var(--accent-hover)] active:opacity-90',
        secondary:
          'bg-[var(--bg-surface)] text-[var(--fg-primary)] border border-[var(--border-subtle)] shadow-[var(--shadow-low)] hover:bg-[var(--overlay-hover)] hover:border-[var(--border-strong)] active:bg-[var(--overlay-press)]',
        outline:
          'bg-transparent text-[var(--fg-primary)] border border-[var(--border-strong)] hover:bg-[var(--overlay-hover)] active:bg-[var(--overlay-press)]',
        ghost:
          'bg-transparent text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--overlay-hover)] active:bg-[var(--overlay-press)]',
        subtle:
          'bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-95 active:brightness-90',
        destructive:
          'bg-[var(--status-danger)] text-white shadow-[var(--shadow-low)] hover:opacity-90 active:opacity-85',
        link: 'bg-transparent text-[var(--accent)] underline-offset-4 hover:underline h-auto px-0',
      },
      size: {
        xs: 'h-7 min-h-[24px] px-2 text-xs rounded-[var(--radius-inner)]',
        sm: 'h-8 min-h-[32px] px-3 text-xs rounded-[var(--radius-inner)]',
        md: 'h-9 min-h-[36px] px-3.5 text-sm',
        default: 'h-9 min-h-[36px] px-3.5 text-sm',
        lg: 'h-11 min-h-[44px] px-5 text-sm',
        icon: 'size-8 min-h-[32px] min-w-[32px] p-0 rounded-[var(--radius-inner)]',
        'icon-sm': 'size-7 min-h-[28px] min-w-[28px] p-0 rounded-[var(--radius-inner)]',
        'icon-lg': 'size-10 min-h-[40px] min-w-[40px] p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export type ButtonProps = Omit<React.ComponentProps<typeof BaseButton>, 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    ref?: React.Ref<HTMLButtonElement>;
  };

export function Button({ className, variant, size, type = 'button', ref, ...props }: ButtonProps) {
  return (
    <BaseButton
      ref={ref}
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
