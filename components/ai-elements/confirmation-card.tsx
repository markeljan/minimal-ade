'use client';

import { Check, ShieldAlert, ShieldCheck, ShieldX, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ApprovalRiskLevel } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface ConfirmationCardProps {
  approvalId: string;
  toolName: string;
  title?: string;
  description?: string;
  riskLevel?: ApprovalRiskLevel;
  input?: unknown;
  status?: 'pending' | 'approved' | 'denied';
  onApprove: (approvalId: string, options?: { alwaysAllow?: boolean; reason?: string }) => void;
  onDeny: (approvalId: string, reason?: string) => void;
  className?: string;
}

function formatInputPreview(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && 'command' in input && typeof input.command === 'string') {
    return input.command;
  }
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function ConfirmationCard({
  approvalId,
  toolName,
  title,
  description,
  riskLevel = 'medium',
  input,
  status = 'pending',
  onApprove,
  onDeny,
  className,
}: ConfirmationCardProps) {
  const preview = formatInputPreview(input);
  const riskVariant =
    riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'accent';

  return (
    <section
      data-slot="confirmation-card"
      aria-label={`Sentinel approval request for ${toolName}`}
      className={cn(
        'my-2.5 overflow-hidden rounded-[var(--radius-container)] border',
        status === 'pending'
          ? 'border-[var(--status-warning)]/40 bg-[var(--bg-surface)] shadow-[var(--shadow-med)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-inner)]',
              status === 'approved'
                ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]'
                : status === 'denied'
                  ? 'bg-[var(--status-danger-soft)] text-[var(--status-danger)]'
                  : 'bg-[var(--status-warning-soft)] text-[var(--status-warning)]',
            )}
          >
            {status === 'approved' ? (
              <ShieldCheck className="size-4" aria-hidden="true" />
            ) : status === 'denied' ? (
              <ShieldX className="size-4" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-4" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--fg-primary)]">
                {title ?? `Approve ${toolName}?`}
              </h4>
              <Badge variant={riskVariant}>{riskLevel} risk</Badge>
              <Badge variant="default" className="font-mono">
                {toolName}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--fg-secondary)]">
              {description ??
                'Sentinel paused this action for your confirmation before modifying the workspace or UI.'}
            </p>
          </div>
        </div>

        {status !== 'pending' && (
          <Badge variant={status === 'approved' ? 'success' : 'danger'} className="shrink-0">
            {status === 'approved' ? 'Approved' : 'Denied'}
          </Badge>
        )}
      </div>

      {preview && (
        <div className="px-4 pb-3">
          <pre className="max-h-40 overflow-auto rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--fg-primary)]">
            {preview}
          </pre>
        </div>
      )}

      {status === 'pending' && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeny(approvalId, 'User denied tool execution')}
          >
            Deny
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onApprove(approvalId, { alwaysAllow: true })}
          >
            <Sparkles className="size-3.5 text-[var(--accent)]" aria-hidden="true" />
            Always Allow for Session
          </Button>
          <Button variant="primary" size="sm" onClick={() => onApprove(approvalId)}>
            <Check className="size-3.5" aria-hidden="true" />
            Approve
          </Button>
        </div>
      )}
    </section>
  );
}
