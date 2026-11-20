'use client';

import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = BaseMenu.Root;
export const DropdownMenuTrigger = BaseMenu.Trigger;
export const DropdownMenuGroup = BaseMenu.Group;
export const DropdownMenuRadioGroup = BaseMenu.RadioGroup;
export const DropdownMenuSub = BaseMenu.SubmenuRoot;

export interface DropdownMenuContentProps
  extends Omit<React.ComponentProps<typeof BaseMenu.Popup>, 'className'> {
  className?: string;
  align?: React.ComponentProps<typeof BaseMenu.Positioner>['align'];
  side?: React.ComponentProps<typeof BaseMenu.Positioner>['side'];
  sideOffset?: number;
  ref?: React.Ref<HTMLDivElement>;
}

export function DropdownMenuContent({
  className,
  align = 'end',
  side = 'bottom',
  sideOffset = 6,
  children,
  ref,
  ...props
}: DropdownMenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner align={align} side={side} sideOffset={sideOffset} className="z-50">
        <BaseMenu.Popup
          ref={ref}
          data-slot="dropdown-menu-content"
          className={cn(
            'z-50 min-w-[11rem] overflow-hidden p-1',
            'rounded-[var(--radius-element)] border border-[var(--border-subtle)]',
            'bg-[var(--bg-popover)] text-[var(--fg-primary)] shadow-[var(--shadow-high)]',
            'outline-none',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            'transition-[opacity,transform] duration-[var(--duration-fast)] data-[ending-style]:duration-0',
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export type DropdownMenuItemProps = Omit<
  React.ComponentProps<typeof BaseMenu.Item>,
  'className'
> & {
  className?: string;
  destructive?: boolean;
  ref?: React.Ref<HTMLDivElement>;
};

export function DropdownMenuItem({
  className,
  destructive = false,
  ref,
  ...props
}: DropdownMenuItemProps) {
  return (
    <BaseMenu.Item
      ref={ref}
      data-slot="dropdown-menu-item"
      className={cn(
        'relative flex min-h-[32px] cursor-pointer items-center gap-2 rounded-[var(--radius-inner)]',
        'px-2.5 py-1.5 text-xs font-medium select-none outline-none',
        // Instant highlight per Astryx motion rules
        destructive
          ? 'text-[var(--status-danger)] data-[highlighted]:bg-[var(--status-danger-soft)]'
          : 'text-[var(--fg-primary)] data-[highlighted]:bg-[var(--overlay-hover)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-[var(--fg-muted)]',
        className,
      )}
      {...props}
    />
  );
}

export type DropdownMenuCheckboxItemProps = Omit<
  React.ComponentProps<typeof BaseMenu.CheckboxItem>,
  'className'
> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function DropdownMenuCheckboxItem({
  className,
  children,
  ref,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <BaseMenu.CheckboxItem
      ref={ref}
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        'relative flex min-h-[32px] cursor-pointer items-center gap-2 rounded-[var(--radius-inner)]',
        'py-1.5 pr-2.5 pl-7 text-xs font-medium text-[var(--fg-primary)] select-none outline-none',
        'data-[highlighted]:bg-[var(--overlay-hover)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      <BaseMenu.CheckboxItemIndicator className="absolute left-2 inline-flex items-center justify-center text-[var(--accent)]">
        <Check className="size-3.5" aria-hidden="true" />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  );
}

export type DropdownMenuLabelProps = React.ComponentProps<'div'>;

export function DropdownMenuLabel({ className, ref, ...props }: DropdownMenuLabelProps) {
  return (
    <div
      role="presentation"
      ref={ref}
      data-slot="dropdown-menu-label"
      className={cn(
        'px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <BaseMenu.Separator
      data-slot="dropdown-menu-separator"
      className={cn('my-1 h-px bg-[var(--border-subtle)]', className)}
    />
  );
}
