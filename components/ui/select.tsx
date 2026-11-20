'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const Select = BaseSelect.Root;
export const SelectGroup = BaseSelect.Group;
export const SelectValue = BaseSelect.Value;

export type SelectTriggerProps = Omit<
  React.ComponentProps<typeof BaseSelect.Trigger>,
  'className'
> & {
  className?: string;
  size?: 'sm' | 'md';
  ref?: React.Ref<HTMLElement>;
};

export function SelectTrigger({
  className,
  size = 'md',
  children,
  ref,
  ...props
}: SelectTriggerProps) {
  return (
    <BaseSelect.Trigger
      ref={ref}
      data-slot="select-trigger"
      className={cn(
        'inline-flex w-full cursor-pointer items-center justify-between gap-2',
        'rounded-[var(--radius-element)] border border-[var(--border-strong)]',
        'bg-[var(--bg-surface)] text-[var(--fg-primary)] shadow-[var(--shadow-low)]',
        'hover:border-[var(--fg-muted)] hover:bg-[var(--overlay-hover)]',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-2.5 text-xs rounded-[var(--radius-inner)]' : 'h-9 px-3 text-sm',
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      <BaseSelect.Icon className="shrink-0 text-[var(--fg-muted)]">
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

export interface SelectContentProps
  extends Omit<React.ComponentProps<typeof BaseSelect.Popup>, 'className'> {
  className?: string;
  side?: React.ComponentProps<typeof BaseSelect.Positioner>['side'];
  align?: React.ComponentProps<typeof BaseSelect.Positioner>['align'];
  sideOffset?: number;
  ref?: React.Ref<HTMLDivElement>;
}

export function SelectContent({
  className,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  children,
  ref,
  ...props
}: SelectContentProps) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <BaseSelect.Popup
          ref={ref}
          data-slot="select-content"
          className={cn(
            'z-50 max-h-72 min-w-[var(--anchor-width)] overflow-y-auto p-1',
            'rounded-[var(--radius-element)] border border-[var(--border-subtle)]',
            'bg-[var(--bg-popover)] text-[var(--fg-primary)] shadow-[var(--shadow-high)]',
            'outline-none',
            className,
          )}
          {...props}
        >
          <BaseSelect.List className="flex flex-col gap-0.5">{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export type SelectItemProps = Omit<React.ComponentProps<typeof BaseSelect.Item>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function SelectItem({ className, children, ref, ...props }: SelectItemProps) {
  return (
    <BaseSelect.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        'relative flex min-h-[32px] cursor-pointer items-center gap-2 rounded-[var(--radius-inner)]',
        'py-1.5 pr-3 pl-7 text-xs font-medium text-[var(--fg-primary)] select-none outline-none',
        'data-[highlighted]:bg-[var(--overlay-hover)]',
        'data-[selected]:font-semibold data-[selected]:text-[var(--accent)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemIndicator className="absolute left-2 inline-flex items-center justify-center text-[var(--accent)]">
        <Check className="size-3.5" aria-hidden="true" />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}

export type SelectLabelProps = React.ComponentProps<'div'>;

export function SelectLabel({ className, ref, ...props }: SelectLabelProps) {
  return (
    <div
      role="presentation"
      ref={ref}
      data-slot="select-label"
      className={cn(
        'px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function SelectSeparator({ className }: { className?: string }) {
  return (
    <BaseSelect.Separator
      data-slot="select-separator"
      className={cn('my-1 h-px bg-[var(--border-subtle)]', className)}
    />
  );
}
