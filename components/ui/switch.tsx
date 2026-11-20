'use client';

import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export type SwitchProps = Omit<React.ComponentProps<typeof BaseSwitch.Root>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLElement>;
};

export function Switch({ className, ref, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      ref={ref}
      data-slot="switch"
      className={cn(
        'group inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-[var(--radius-full)] p-0.5',
        'border border-[var(--border-strong)] bg-[var(--bg-surface-subtle)]',
        'transition-[background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'data-[checked]:border-transparent data-[checked]:bg-[var(--accent)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-3.5 rounded-[var(--radius-full)] bg-white shadow-[var(--shadow-low)]',
          'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-move)]',
          'translate-x-0 group-data-[checked]:translate-x-4',
        )}
      />
    </BaseSwitch.Root>
  );
}
