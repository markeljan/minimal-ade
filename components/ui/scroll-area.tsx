'use client';

import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface ScrollAreaProps
  extends Omit<React.ComponentProps<typeof BaseScrollArea.Root>, 'className'> {
  className?: string;
  viewportClassName?: string;
  orientation?: 'vertical' | 'horizontal' | 'both';
  /** Enable CSS scrollability shadow hint on the viewport */
  scrollShadows?: boolean;
  viewportRef?: React.Ref<HTMLDivElement>;
  ref?: React.Ref<HTMLDivElement>;
}

export function ScrollArea({
  className,
  viewportClassName,
  orientation = 'vertical',
  scrollShadows = false,
  viewportRef,
  children,
  ref,
  ...props
}: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root
      ref={ref}
      data-slot="scroll-area"
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <BaseScrollArea.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          'size-full rounded-[inherit] focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
          scrollShadows && 'astryx-scroll-shadow',
          viewportClassName,
        )}
      >
        <BaseScrollArea.Content data-slot="scroll-area-content">{children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>

      {(orientation === 'vertical' || orientation === 'both') && (
        <BaseScrollArea.Scrollbar
          orientation="vertical"
          data-slot="scroll-area-scrollbar"
          className={cn(
            'flex w-2 touch-none select-none p-0.5',
            'opacity-0 transition-opacity duration-[var(--duration-fast)] data-[hovering]:opacity-100 data-[scrolling]:opacity-100',
          )}
        >
          <BaseScrollArea.Thumb
            data-slot="scroll-area-thumb"
            className="relative flex-1 rounded-[var(--radius-full)] bg-[var(--border-strong)]"
          />
        </BaseScrollArea.Scrollbar>
      )}

      {(orientation === 'horizontal' || orientation === 'both') && (
        <BaseScrollArea.Scrollbar
          orientation="horizontal"
          data-slot="scroll-area-scrollbar"
          className={cn(
            'flex h-2 touch-none select-none flex-col p-0.5',
            'opacity-0 transition-opacity duration-[var(--duration-fast)] data-[hovering]:opacity-100 data-[scrolling]:opacity-100',
          )}
        >
          <BaseScrollArea.Thumb
            data-slot="scroll-area-thumb"
            className="relative flex-1 rounded-[var(--radius-full)] bg-[var(--border-strong)]"
          />
        </BaseScrollArea.Scrollbar>
      )}

      {orientation === 'both' && <BaseScrollArea.Corner />}
    </BaseScrollArea.Root>
  );
}
