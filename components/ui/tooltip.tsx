'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export function TooltipProvider({
  delay = 250,
  closeDelay = 0,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Provider>) {
  return <BaseTooltip.Provider delay={delay} closeDelay={closeDelay} {...props} />;
}

export const Tooltip = BaseTooltip.Root;
export const TooltipTrigger = BaseTooltip.Trigger;

export interface TooltipContentProps
  extends Omit<React.ComponentProps<typeof BaseTooltip.Popup>, 'className'> {
  className?: string;
  side?: React.ComponentProps<typeof BaseTooltip.Positioner>['side'];
  align?: React.ComponentProps<typeof BaseTooltip.Positioner>['align'];
  sideOffset?: number;
  ref?: React.Ref<HTMLDivElement>;
}

export function TooltipContent({
  className,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  children,
  ref,
  ...props
}: TooltipContentProps) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        <BaseTooltip.Popup
          ref={ref}
          data-slot="tooltip-content"
          className={cn(
            'z-50 max-w-xs rounded-[var(--radius-inner)] border border-[var(--border-subtle)]',
            'bg-[var(--bg-popover)] px-2.5 py-1.5 text-xs font-medium text-[var(--fg-primary)]',
            'shadow-[var(--shadow-med)] select-none',
            // Instant dismiss per Astryx motion discipline; subtle entrance only
            'data-[starting-style]:opacity-0 transition-opacity duration-[var(--duration-fast)] data-[ending-style]:duration-0',
            className,
          )}
          {...props}
        >
          {children}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
