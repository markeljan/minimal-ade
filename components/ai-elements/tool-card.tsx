'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  ExternalLink,
  FileCode2,
  Globe,
  ImageIcon,
  Loader2,
  ShieldAlert,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { WorkbenchTab } from '@/lib/types';
import { cn, formatDuration, truncateText } from '@/lib/utils';

export type ToolCardState =
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied'
  | 'running'
  | 'completed'
  | 'error';

export interface ToolCardProps {
  toolName: string;
  toolCallId?: string;
  state: ToolCardState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  durationMs?: number;
  defaultOpen?: boolean;
  onOpenWorkbench?: (tab: WorkbenchTab, target?: string) => void;
  className?: string;
}

function inferWorkbenchTarget(
  toolName: string,
  input?: unknown,
  output?: unknown,
): { tab: WorkbenchTab; label: string; target?: string } | null {
  const lower = toolName.toLowerCase();
  const inputObj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const outputObj = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;

  if (lower.includes('browser')) {
    const url =
      typeof inputObj.url === 'string'
        ? inputObj.url
        : typeof outputObj.url === 'string'
          ? outputObj.url
          : undefined;
    return { tab: 'browser', label: 'Open Browser', target: url };
  }
  if (
    lower === 'bash' ||
    lower.includes('shell') ||
    lower.includes('terminal') ||
    lower.includes('command')
  ) {
    return { tab: 'terminal', label: 'Open Terminal' };
  }
  if (lower.includes('artifact')) {
    const kind = String(inputObj.kind ?? outputObj.kind ?? '');
    const id = typeof outputObj.id === 'string' ? outputObj.id : undefined;
    if (kind === 'html') {
      return { tab: 'preview', label: 'Open Preview', target: id };
    }
    if (kind === 'genui') {
      return { tab: 'genui', label: 'Open GenUI Canvas', target: id };
    }
    return { tab: 'files', label: 'Open in Canvas', target: id };
  }
  if (lower.includes('file') || lower.includes('write') || lower.includes('edit')) {
    const path = typeof inputObj.path === 'string' ? inputObj.path : undefined;
    return { tab: 'files', label: 'Open Files', target: path };
  }
  return null;
}

function getToolIcon(toolName: string) {
  const lower = toolName.toLowerCase();
  if (lower.includes('browser')) return Globe;
  if (lower === 'bash' || lower.includes('shell') || lower.includes('terminal')) return Terminal;
  if (lower.includes('file') || lower.includes('artifact') || lower.includes('code'))
    return FileCode2;
  if (lower.includes('image')) return ImageIcon;
  if (lower.startsWith('ui_')) return Cpu;
  return Wrench;
}

function formatPreviewValue(val: unknown): string {
  if (val === undefined || val === null) {
    return '';
  }
  if (typeof val === 'string') {
    return val;
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function extractInlineArgSummary(input: unknown): string | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const obj = input as Record<string, unknown>;
  const candidate =
    obj.command ?? obj.path ?? obj.url ?? obj.title ?? obj.prompt ?? obj.query ?? obj.action;
  if (typeof candidate === 'string' && candidate.trim()) {
    return truncateText(candidate, 58);
  }
  return null;
}

export function ToolCard({
  toolName,
  state,
  input,
  output,
  errorText,
  durationMs,
  defaultOpen = false,
  onOpenWorkbench,
  className,
}: ToolCardProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();

  const Icon = getToolIcon(toolName);
  const argSummary = extractInlineArgSummary(input);
  const workbenchLink = inferWorkbenchTarget(toolName, input, output);

  const isRunning =
    state === 'input-streaming' ||
    state === 'input-available' ||
    state === 'approval-responded' ||
    state === 'running';
  const isSuccess = state === 'output-available' || state === 'completed';
  const isError = state === 'output-error' || state === 'error';
  const isDenied = state === 'output-denied';
  const isApproval = state === 'approval-requested';

  const formattedInput = formatPreviewValue(input);
  const formattedOutput = formatPreviewValue(output);

  return (
    <div
      data-slot="tool-card"
      className={cn(
        'my-2 overflow-hidden rounded-[var(--radius-element)] border border-[var(--border-subtle)]',
        'bg-[var(--bg-surface)] shadow-[var(--shadow-low)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-[6px]',
          )}
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
          )}

          <Icon className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />

          <span className="shrink-0 font-mono text-xs font-semibold text-[var(--fg-primary)]">
            {toolName}
          </span>

          {argSummary && (
            <span className="truncate font-mono text-[11px] text-[var(--fg-muted)]">
              {argSummary}
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {durationMs !== undefined && durationMs > 0 && (
            <span className="font-mono text-[11px] text-[var(--fg-muted)]">
              {formatDuration(durationMs)}
            </span>
          )}

          {isRunning && (
            <Badge variant="accent">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Running
            </Badge>
          )}
          {isSuccess && (
            <Badge variant="success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Done
            </Badge>
          )}
          {isError && (
            <Badge variant="danger">
              <XCircle className="size-3" aria-hidden="true" />
              Error
            </Badge>
          )}
          {isDenied && (
            <Badge variant="warning">
              <AlertTriangle className="size-3" aria-hidden="true" />
              Denied
            </Badge>
          )}
          {isApproval && (
            <Badge variant="warning">
              <ShieldAlert className="size-3" aria-hidden="true" />
              Approval
            </Badge>
          )}

          {workbenchLink && onOpenWorkbench && isSuccess && (
            <button
              type="button"
              onClick={() => onOpenWorkbench(workbenchLink.tab, workbenchLink.target)}
              className={cn(
                'inline-flex h-6 cursor-pointer items-center gap-1 rounded-[var(--radius-inner)]',
                'border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-2',
                'text-[11px] font-medium text-[var(--fg-primary)] hover:bg-[var(--overlay-hover)]',
              )}
            >
              <span>{workbenchLink.label}</span>
              <ExternalLink className="size-3 text-[var(--fg-muted)]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          id={panelId}
          className="flex flex-col gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-3"
        >
          {formattedInput && (
            <div>
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
                Input
              </div>
              <pre className="max-h-48 overflow-auto rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--fg-primary)]">
                {formattedInput}
              </pre>
            </div>
          )}

          {errorText && (
            <div
              role="alert"
              className="rounded-[var(--radius-inner)] border border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)] p-2.5 text-xs text-[var(--status-danger)]"
            >
              {errorText}
            </div>
          )}

          {formattedOutput && (
            <div>
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
                Output
              </div>
              <pre className="max-h-64 overflow-auto rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--fg-primary)]">
                {formattedOutput.length > 4000
                  ? `${formattedOutput.slice(0, 4000)}\n… (truncated)`
                  : formattedOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
