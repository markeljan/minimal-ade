'use client';

import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export type TabsProps = Omit<React.ComponentProps<typeof BaseTabs.Root>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function Tabs({ className, ref, ...props }: TabsProps) {
  return (
    <BaseTabs.Root
      ref={ref}
      data-slot="tabs"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  );
}

export type TabsListProps = Omit<React.ComponentProps<typeof BaseTabs.List>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function TabsList({ className, children, ref, ...props }: TabsListProps) {
  return (
    <BaseTabs.List
      ref={ref}
      data-slot="tabs-list"
      className={cn(
        'relative inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto',
        'rounded-[var(--radius-element)] border border-[var(--border-subtle)]',
        'bg-[var(--bg-surface-subtle)] p-1',
        'astryx-scroll-fade-x',
        className,
      )}
      {...props}
    >
      {children}
      <BaseTabs.Indicator
        data-slot="tabs-indicator"
        className={cn(
          'pointer-events-none absolute top-1 bottom-1 left-0 z-0 rounded-[var(--radius-inner)]',
          'bg-[var(--bg-surface)] shadow-[var(--shadow-low)] border border-[var(--border-subtle)]',
          'transition-[transform,width] duration-[var(--duration-fast)] ease-[var(--ease-move)]',
          '[transform:translateX(var(--active-tab-left))] [width:var(--active-tab-width)]',
        )}
      />
    </BaseTabs.List>
  );
}

export type TabsTriggerProps = Omit<React.ComponentProps<typeof BaseTabs.Tab>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLButtonElement>;
};

export function TabsTrigger({ className, ref, ...props }: TabsTriggerProps) {
  return (
    <BaseTabs.Tab
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(
        'relative z-10 inline-flex h-7 min-h-[28px] shrink-0 cursor-pointer items-center justify-center gap-1.5',
        'rounded-[var(--radius-inner)] px-3 text-xs font-medium whitespace-nowrap select-none',
        'text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]',
        'data-[selected]:text-[var(--fg-primary)] data-[active]:text-[var(--fg-primary)]',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]',
        'disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export type TabsContentProps = Omit<React.ComponentProps<typeof BaseTabs.Panel>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function TabsContent({ className, ref, ...props }: TabsContentProps) {
  return (
    <BaseTabs.Panel
      ref={ref}
      data-slot="tabs-content"
      className={cn('outline-none', className)}
      {...props}
    />
  );
}
