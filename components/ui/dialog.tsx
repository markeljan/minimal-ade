'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogPortal = BaseDialog.Portal;
export const DialogClose = BaseDialog.Close;

export type DialogBackdropProps = Omit<
  React.ComponentProps<typeof BaseDialog.Backdrop>,
  'className'
> & {
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
};

export function DialogBackdrop({ className, ref, ...props }: DialogBackdropProps) {
  return (
    <BaseDialog.Backdrop
      ref={ref}
      data-slot="dialog-backdrop"
      className={cn(
        'fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]',
        'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

export type DialogContentProps = Omit<
  React.ComponentProps<typeof BaseDialog.Popup>,
  'className'
> & {
  className?: string;
  showCloseButton?: boolean;
  ref?: React.Ref<HTMLDivElement>;
};

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ref,
  ...props
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <DialogBackdrop />
      <BaseDialog.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <BaseDialog.Popup
          ref={ref}
          data-slot="dialog-content"
          className={cn(
            'relative z-50 w-full max-w-lg overflow-hidden',
            'rounded-[var(--radius-container)] border border-[var(--border-subtle)]',
            'bg-[var(--bg-popover)] text-[var(--fg-primary)] shadow-[var(--shadow-high)]',
            'p-6 outline-none',
            'transition-[opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-entrance)]',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            'data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <BaseDialog.Close
              aria-label="Close dialog"
              data-slot="dialog-close-button"
              className={cn(
                'absolute top-4 right-4 inline-flex size-8 items-center justify-center',
                'rounded-[var(--radius-inner)] text-[var(--fg-muted)] cursor-pointer',
                'hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]',
                'active:bg-[var(--overlay-press)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              )}
            >
              <X className="size-4" aria-hidden="true" />
            </BaseDialog.Close>
          )}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-1.5 pr-8 text-left', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export type DialogTitleProps = Omit<React.ComponentProps<typeof BaseDialog.Title>, 'className'> & {
  className?: string;
  ref?: React.Ref<HTMLHeadingElement>;
};

export function DialogTitle({ className, ref, ...props }: DialogTitleProps) {
  return (
    <BaseDialog.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn('text-base font-semibold tracking-tight text-[var(--fg-primary)]', className)}
      {...props}
    />
  );
}

export type DialogDescriptionProps = Omit<
  React.ComponentProps<typeof BaseDialog.Description>,
  'className'
> & {
  className?: string;
  ref?: React.Ref<HTMLParagraphElement>;
};

export function DialogDescription({ className, ref, ...props }: DialogDescriptionProps) {
  return (
    <BaseDialog.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn('text-sm leading-relaxed text-[var(--fg-secondary)]', className)}
      {...props}
    />
  );
}
