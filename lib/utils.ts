import { type ClassValue, clsx } from 'clsx';
import ms from 'ms';
import { nanoid } from 'nanoid';
import { twMerge } from 'tailwind-merge';

/** Merge conditional Tailwind CSS class names without style conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Generate a URL-safe unique identifier with an optional semantic prefix. */
export function generateId(prefix?: string, size = 12): string {
  const token = nanoid(size);
  return prefix ? `${prefix}_${token}` : token;
}

/** Format a timestamp into a compact, readable relative time label. */
export function formatRelativeTime(
  input: Date | string | number,
  now: number = Date.now(),
): string {
  const timestamp = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diffMs = now - timestamp;
  const absMs = Math.abs(diffMs);

  if (absMs < 10_000) {
    return 'just now';
  }

  if (absMs < 60_000) {
    const secs = Math.round(absMs / 1_000);
    return diffMs >= 0 ? `${secs}s ago` : `in ${secs}s`;
  }

  if (absMs < 7 * 24 * 60 * 60 * 1_000) {
    const compact = ms(absMs, { long: false });
    return diffMs >= 0 ? `${compact} ago` : `in ${compact}`;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  }).format(new Date(timestamp));
}

/** Format a byte count into a human-readable string (e.g. `1.4 KB`, `12.3 MB`). */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const base = 1024;
  const precision = Math.max(0, decimals);
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
  const value = bytes / base ** exponent;

  return `${exponent === 0 ? Math.round(value) : Number(value.toFixed(precision))} ${units[exponent]}`;
}

/** Sanitize a user-supplied filename, removing traversal segments and unsafe characters. */
export function sanitizeFilename(filename: string, maxLength = 120): string {
  const base = filename.replaceAll('\\', '/').split('/').filter(Boolean).pop();

  if (!base) {
    return 'untitled';
  }

  const withoutControlChars = Array.from(base.normalize('NFKC'), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? '-' : char;
  }).join('');

  const cleaned = withoutControlChars
    .replaceAll(/[<>:"/\\|?*]+/g, '-')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');

  if (!cleaned) {
    return 'untitled';
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const lastDot = cleaned.lastIndexOf('.');
  if (lastDot > 0 && cleaned.length - lastDot <= 12) {
    const ext = cleaned.slice(lastDot);
    const stem = cleaned.slice(0, Math.max(1, maxLength - ext.length));
    return `${stem}${ext}`;
  }

  return cleaned.slice(0, maxLength);
}

/** Format a millisecond duration cleanly for trace spans and latency badges. */
export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '0ms';
  }
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 2 : 1)}s`;
  }
  return ms(Math.round(durationMs), { long: false });
}

/** Truncate long text cleanly with an ellipsis for compact previews. */
export function truncateText(text: string, maxLength = 140): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
