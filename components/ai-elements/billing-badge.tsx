'use client';

import { AlertCircle, Cloud, KeyRound, Server, Sparkles, Triangle, Wallet } from 'lucide-react';
import type { BillingSource } from '@/lib/types';
import { cn } from '@/lib/utils';

export type BillingBadgeSource = BillingSource | 'user-vercel-credits';

export interface BillingBadgeProps {
  source: BillingBadgeSource;
  label?: string;
  providerName?: string;
  creditsRemaining?: number | null;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}

interface BillingMeta {
  defaultLabel: string;
  shortLabel: string;
  toneClass: string;
  dotClass: string;
  Icon: typeof Sparkles;
}

const BILLING_META: Record<BillingBadgeSource, BillingMeta> = {
  'custom-endpoint': {
    defaultLabel: 'Custom Endpoint',
    shortLabel: 'Custom',
    toneClass: 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--fg-primary)]',
    dotClass: 'bg-[var(--accent)]',
    Icon: Server,
  },
  'user-byok-gateway': {
    defaultLabel: 'Your API Key (Gateway)',
    shortLabel: 'Your Key',
    toneClass:
      'border-[var(--status-success)]/30 bg-[var(--status-success-soft)] text-[var(--status-success)]',
    dotClass: 'bg-[var(--status-success)]',
    Icon: KeyRound,
  },
  'user-byok-openai': {
    defaultLabel: 'Your API Key (OpenAI)',
    shortLabel: 'Your Key',
    toneClass:
      'border-[var(--status-success)]/30 bg-[var(--status-success-soft)] text-[var(--status-success)]',
    dotClass: 'bg-[var(--status-success)]',
    Icon: KeyRound,
  },
  'user-vercel-oauth': {
    defaultLabel: 'Your Vercel Credits',
    shortLabel: 'Vercel Credits',
    toneClass: 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]',
    dotClass: 'bg-[var(--accent)]',
    Icon: Wallet,
  },
  'user-vercel-credits': {
    defaultLabel: 'Your Vercel Credits',
    shortLabel: 'Vercel Credits',
    toneClass: 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]',
    dotClass: 'bg-[var(--accent)]',
    Icon: Wallet,
  },
  'sponsor-openai': {
    defaultLabel: 'Sponsored OpenAI',
    shortLabel: 'OpenAI',
    toneClass:
      'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--fg-secondary)]',
    dotClass: 'bg-[var(--status-success)]',
    Icon: Sparkles,
  },
  'sponsor-gateway': {
    defaultLabel: 'Sponsored AI Gateway',
    shortLabel: 'AI Gateway',
    toneClass:
      'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--fg-secondary)]',
    dotClass: 'bg-[var(--accent)]',
    Icon: Cloud,
  },
  'vercel-oidc': {
    defaultLabel: 'Vercel OIDC',
    shortLabel: 'Vercel OIDC',
    toneClass:
      'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--fg-secondary)]',
    dotClass: 'bg-[var(--fg-primary)]',
    Icon: Triangle,
  },
  unconfigured: {
    defaultLabel: 'Provider Unconfigured',
    shortLabel: 'Setup Provider',
    toneClass:
      'border-[var(--status-warning)]/35 bg-[var(--status-warning-soft)] text-[var(--status-warning)]',
    dotClass: 'bg-[var(--status-warning)]',
    Icon: AlertCircle,
  },
};

export function BillingBadge({
  source,
  label,
  creditsRemaining,
  compact = false,
  onClick,
  className,
}: BillingBadgeProps) {
  const meta = BILLING_META[source] ?? BILLING_META.unconfigured;
  const Icon = meta.Icon;
  const text = label ?? (compact ? meta.shortLabel : meta.defaultLabel);

  const content = (
    <>
      <span className={cn('size-1.5 shrink-0 rounded-full', meta.dotClass)} aria-hidden="true" />
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
      {creditsRemaining !== undefined && creditsRemaining !== null && !compact && (
        <span className="font-mono text-[10px] opacity-80">${creditsRemaining.toFixed(2)}</span>
      )}
    </>
  );

  const sharedClasses = cn(
    'inline-flex h-7 max-w-[230px] items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5',
    'text-[11px] font-medium select-none',
    meta.toneClass,
    onClick &&
      'cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    className,
  );

  if (onClick) {
    return (
      <button type="button" data-slot="billing-badge" onClick={onClick} className={sharedClasses}>
        {content}
      </button>
    );
  }

  return (
    <span data-slot="billing-badge" className={sharedClasses}>
      {content}
    </span>
  );
}
