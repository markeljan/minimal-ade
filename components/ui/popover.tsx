'use client';

import { Popover as BasePopover } from '@base-ui/react/popover';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;
export const PopoverTitle = BasePopover.Title;
export const PopoverDescription = BasePopover.Description;

export interface PopoverContentProps
  extends Omit<React.ComponentProps<typeof BasePopover.Popup>, 'className'> {
  className?: string;
  align?: React.ComponentProps<typeof BasePopover.Positioner>['align'];
  side?: React.ComponentProps<typeof BasePopover.Positioner>['side'];
  sideOffset?: number;
  alignOffset?: number;
  ref?: React.Ref<HTMLDivElement>;
}

export function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 8,
  alignOffset = 0,
  children,
  ref,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <BasePopover.Popup
          ref={ref}
          data-slot="popover-content"
          className={cn(
            'z-50 w-80 max-w-[calc(100vw-2rem)]',
            'rounded-[var(--radius-container)] border border-[var(--border-subtle)]',
            'bg-[var(--bg-popover)] p-4 text-[var(--fg-primary)] shadow-[var(--shadow-high)]',
            'outline-none',
            'transition-[opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-entrance)]',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            'data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
