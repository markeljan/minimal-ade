'use client';

import { Separator as BaseSeparator } from '@base-ui/react/separator';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export type SeparatorProps = Omit<React.ComponentProps<typeof BaseSeparator>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function Separator({
  className,
  orientation = 'horizontal',
  ref,
  ...props
}: SeparatorProps) {
  return (
    <BaseSeparator
      ref={ref}
      orientation={orientation}
      data-slot="separator"
      className={cn(
        'shrink-0 bg-[var(--border-subtle)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
