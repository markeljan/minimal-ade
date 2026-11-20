'use client';

import { Input as BaseInput } from '@base-ui/react/input';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = Omit<React.ComponentProps<typeof BaseInput>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({ className, type = 'text', ref, ...props }: InputProps) {
  return (
    <BaseInput
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-[var(--radius-element)] border border-[var(--border-strong)]',
        'bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--fg-primary)]',
        'placeholder:text-[var(--fg-muted)]',
        'shadow-[var(--shadow-low)] transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'hover:border-[var(--fg-muted)]',
        'focus-visible:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)]',
        'aria-invalid:border-[var(--status-danger)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-[var(--fg-primary)]',
        className,
      )}
      {...props}
    />
  );
}

export type TextareaProps = React.ComponentProps<'textarea'>;

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        'flex min-h-[84px] w-full rounded-[var(--radius-element)] border border-[var(--border-strong)]',
        'bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--fg-primary)]',
        'placeholder:text-[var(--fg-muted)]',
        'shadow-[var(--shadow-low)] transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'hover:border-[var(--fg-muted)]',
        'focus-visible:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)]',
        'aria-invalid:border-[var(--status-danger)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
