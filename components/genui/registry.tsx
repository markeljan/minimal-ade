'use client';

import { defineRegistry } from '@json-render/react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileDiff,
  Info,
  Minus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Table2,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs as AstryxTabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type AdeActionName, type AdeComponentProps, adeCatalog } from '@/lib/ai/catalog';
import { cn } from '@/lib/utils';

export type GenUiActionHandler = (
  actionName: AdeActionName | string,
  params?: Record<string, unknown>,
) => void | Promise<void>;

const GenUiActionCallbackContext = React.createContext<GenUiActionHandler | null>(null);

export function GenUiActionBridgeProvider({
  onAction,
  children,
}: {
  onAction?: GenUiActionHandler;
  children: React.ReactNode;
}) {
  return (
    <GenUiActionCallbackContext.Provider value={onAction ?? null}>
      {children}
    </GenUiActionCallbackContext.Provider>
  );
}

function useDispatchGenUiAction() {
  const directCallback = React.useContext(GenUiActionCallbackContext);

  return React.useCallback(
    async (actionName: AdeActionName, params?: Record<string, unknown>) => {
      if (directCallback) {
        await directCallback(actionName, params);
      }
    },
    [directCallback],
  );
}

const ASTRYX_CHART_COLORS = [
  'var(--accent)',
  'var(--status-success)',
  'var(--status-warning)',
  '#6366f1',
  'var(--status-danger)',
  '#0ea5e9',
];

function formatTableCell(
  value: string | number | boolean | null | undefined,
  format?: 'text' | 'number' | 'currency' | 'percent' | 'badge' | 'mono',
): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-[var(--fg-muted)]">—</span>;
  }
  if (typeof value === 'boolean') {
    return <Badge variant={value ? 'success' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
  }
  const num = typeof value === 'number' ? value : Number(value);
  switch (format) {
    case 'currency':
      return Number.isFinite(num)
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
        : String(value);
    case 'percent':
      return Number.isFinite(num) ? `${num.toFixed(1)}%` : String(value);
    case 'number':
      return Number.isFinite(num) ? num.toLocaleString() : String(value);
    case 'badge':
      return <Badge variant="secondary">{String(value)}</Badge>;
    case 'mono':
      return <span className="font-mono text-xs">{String(value)}</span>;
    default:
      return String(value);
  }
}

/* ==========================================================================
   Stateful Sub-Components (keeps hooks clean inside defineRegistry)
   ========================================================================== */

function AstryxDataTable({
  title,
  description,
  columns,
  rows,
  searchable = false,
  compact = false,
}: {
  title?: string;
  description?: string;
  columns: Array<{
    key: string;
    label: string;
    align?: 'left' | 'center' | 'right';
    format?: 'text' | 'number' | 'currency' | 'percent' | 'badge' | 'mono';
  }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  searchable?: boolean;
  compact?: boolean;
}) {
  const [query, setQuery] = React.useState('');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const searchId = React.useId();

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((row) =>
          columns.some((col) =>
            String(row[col.key] ?? '')
              .toLowerCase()
              .includes(q),
          ),
        )
      : rows;

    if (!sortKey) return base;
    return [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, columns, query, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-low)]">
      {(title || description || searchable) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <div>
            {title && <h4 className="text-sm font-semibold text-[var(--fg-primary)]">{title}</h4>}
            {description && <p className="text-xs text-[var(--fg-secondary)]">{description}</p>}
          </div>

          {searchable && (
            <search className="relative w-full sm:w-56">
              <label htmlFor={searchId} className="visually-hidden">
                Filter table rows
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--fg-muted)]"
                aria-hidden="true"
              />
              <Input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter rows…"
                className="h-8 pl-8 text-xs"
              />
            </search>
          )}
        </div>
      )}

      <div className="astryx-scroll-fade-x overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          {title && <caption className="visually-hidden">{title}</caption>}
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'font-semibold text-[var(--fg-secondary)] whitespace-nowrap',
                    compact ? 'px-3 py-2' : 'px-4 py-2.5',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1 hover:text-[var(--fg-primary)]',
                      col.align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    <span>{col.label}</span>
                    <ArrowUpDown className="size-3 opacity-60" aria-hidden="true" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, columns.length)}
                  className="px-4 py-6 text-center text-xs text-[var(--fg-muted)]"
                >
                  No matching records
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-[var(--overlay-hover)]">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'text-[var(--fg-primary)]',
                        compact ? 'px-3 py-1.5' : 'px-4 py-2.5',
                        col.align === 'right' && 'text-right tabular-nums',
                        col.align === 'center' && 'text-center',
                      )}
                    >
                      {formatTableCell(row[col.key], col.format)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AstryxChart({
  title,
  description,
  type,
  data,
  xKey,
  series,
  height = 240,
  showLegend = true,
}: {
  title?: string;
  description?: string;
  type: 'bar' | 'line' | 'area' | 'pie';
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
  showLegend?: boolean;
}) {
  const [showDataTable, setShowDataTable] = React.useState(false);

  return (
    <figure className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-low)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <figcaption className="min-w-0">
          {title && (
            <span className="block text-sm font-semibold text-[var(--fg-primary)]">{title}</span>
          )}
          {description && (
            <span className="mt-0.5 block text-xs text-[var(--fg-secondary)]">{description}</span>
          )}
        </figcaption>
        <button
          type="button"
          onClick={() => setShowDataTable((prev) => !prev)}
          aria-pressed={showDataTable}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-2 text-[11px] font-medium text-[var(--fg-secondary)] hover:bg-[var(--overlay-hover)] hover:text-[var(--fg-primary)]"
        >
          <Table2 className="size-3" aria-hidden="true" />
          {showDataTable ? 'Chart' : 'Table'}
        </button>
      </div>

      {showDataTable ? (
        <div className="overflow-x-auto rounded-[var(--radius-inner)] border border-[var(--border-subtle)]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]">
                <th scope="col" className="px-3 py-2 font-semibold text-[var(--fg-secondary)]">
                  {xKey}
                </th>
                {series.map((s) => (
                  <th
                    key={s.key}
                    scope="col"
                    className="px-3 py-2 text-right font-semibold text-[var(--fg-secondary)]"
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-1.5 text-[var(--fg-primary)]">
                    {String(row[xKey] ?? '')}
                  </td>
                  {series.map((s) => (
                    <td
                      key={s.key}
                      className="px-3 py-1.5 text-right font-mono text-[var(--fg-primary)]"
                    >
                      {String(row[s.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                  vertical={false}
                />
                <XAxis
                  dataKey={xKey}
                  tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-popover)',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--fg-primary)',
                    fontSize: '12px',
                    boxShadow: 'var(--shadow-med)',
                  }}
                />
                {showLegend && series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color ?? ASTRYX_CHART_COLORS[i % ASTRYX_CHART_COLORS.length]}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
              </BarChart>
            ) : type === 'line' ? (
              <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                  vertical={false}
                />
                <XAxis
                  dataKey={xKey}
                  tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-popover)',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--fg-primary)',
                    fontSize: '12px',
                  }}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {series.map((s, i) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color ?? ASTRYX_CHART_COLORS[i % ASTRYX_CHART_COLORS.length]}
                    strokeWidth={2.2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            ) : type === 'area' ? (
              <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle)"
                  vertical={false}
                />
                <XAxis
                  dataKey={xKey}
                  tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-popover)',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--fg-primary)',
                    fontSize: '12px',
                  }}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {series.map((s, i) => {
                  const color = s.color ?? ASTRYX_CHART_COLORS[i % ASTRYX_CHART_COLORS.length];
                  return (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  );
                })}
              </AreaChart>
            ) : (
              <PieChart>
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-popover)',
                    borderColor: 'var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--fg-primary)',
                    fontSize: '12px',
                  }}
                />
                {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Pie
                  data={data}
                  dataKey={series[0]?.key ?? 'value'}
                  nameKey={xKey}
                  innerRadius="48%"
                  outerRadius="78%"
                  paddingAngle={2}
                >
                  {data.map((_, idx) => (
                    <Cell key={idx} fill={ASTRYX_CHART_COLORS[idx % ASTRYX_CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

function AstryxCodePreview({
  title,
  filename,
  language,
  code,
  caption,
  promotable = true,
}: {
  title?: string;
  filename?: string;
  language?: string;
  code: string;
  caption?: string;
  promotable?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const dispatchAction = useDispatchGenUiAction();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Unable to copy code');
    }
  };

  const handlePromote = () => {
    const kind = language === 'html' ? 'html' : 'code';
    void dispatchAction('promote_artifact', {
      title: title ?? filename ?? 'Code Snippet',
      kind,
      content: code,
      language: language ?? 'typescript',
    });
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-low)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs font-semibold text-[var(--fg-primary)]">
            {filename ?? title ?? 'snippet'}
          </span>
          {language && <Badge variant="secondary">{language}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {promotable && (
            <Button variant="ghost" size="xs" onClick={handlePromote}>
              <Sparkles className="size-3 text-[var(--accent)]" aria-hidden="true" />
              Promote
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={handleCopy}>
            {copied ? (
              <Check className="size-3 text-[var(--status-success)]" aria-hidden="true" />
            ) : (
              <Copy className="size-3" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      <pre className="astryx-dark-surface max-h-80 overflow-auto p-3.5 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>

      {caption && (
        <div className="border-t border-[var(--border-subtle)] px-3.5 py-2 text-[11px] text-[var(--fg-muted)]">
          {caption}
        </div>
      )}
    </div>
  );
}

function AstryxActionBar({
  label,
  align = 'end',
  actions,
}: {
  label?: string;
  align?: 'start' | 'end' | 'between';
  actions: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    actionName: AdeActionName;
    params?: Record<string, unknown>;
  }>;
}) {
  const dispatchAction = useDispatchGenUiAction();

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-[var(--radius-element)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3.5 py-2.5',
        align === 'end' && 'justify-end',
        align === 'start' && 'justify-start',
        align === 'between' && 'justify-between',
      )}
    >
      {label && <span className="text-xs font-medium text-[var(--fg-secondary)]">{label}</span>}
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((item, idx) => (
          <Button
            key={`${item.actionName}-${idx}`}
            size="sm"
            variant={item.variant === 'danger' ? 'destructive' : (item.variant ?? 'secondary')}
            onClick={() => void dispatchAction(item.actionName, item.params)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AstryxForm({
  id,
  title,
  description,
  submitLabel = 'Submit',
  fields,
}: {
  id?: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: Array<{
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'select' | 'toggle';
    placeholder?: string;
    required?: boolean;
    defaultValue?: string | number | boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
}) {
  const dispatchAction = useDispatchGenUiAction();
  const headingId = React.useId();
  const [submitted, setSubmitted] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const f of fields) {
      if (f.type === 'toggle') {
        initial[f.name] = Boolean(f.defaultValue);
      } else if (f.defaultValue !== undefined) {
        initial[f.name] = String(f.defaultValue);
      } else if (f.type === 'select') {
        initial[f.name] = f.options?.[0]?.value ?? '';
      } else {
        initial[f.name] = '';
      }
    }
    return initial;
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedValues: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (f.type === 'number') {
        const trimmed = typeof raw === 'string' ? raw.trim() : '';
        if (trimmed === '') {
          normalizedValues[f.name] = undefined;
        } else {
          const parsed = Number(trimmed);
          normalizedValues[f.name] = Number.isFinite(parsed) ? parsed : trimmed;
        }
      } else {
        normalizedValues[f.name] = raw;
      }
    }
    setSubmitted(true);
    await dispatchAction('submit_form', {
      formId: id,
      title,
      values: normalizedValues,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-low)]"
    >
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        <h4 id={headingId} className="text-sm font-semibold text-[var(--fg-primary)]">
          {title}
        </h4>
        {description && <p className="mt-0.5 text-xs text-[var(--fg-secondary)]">{description}</p>}
      </div>

      <div className="flex flex-col gap-3.5 p-4">
        {fields.map((field) => {
          const fieldId = `genui-field-${id ?? 'form'}-${field.name}`;
          const val = values[field.name];

          if (field.type === 'toggle') {
            return (
              <div key={field.name} className="flex items-center justify-between gap-3">
                <label
                  htmlFor={fieldId}
                  className="text-xs font-medium text-[var(--fg-primary)] cursor-pointer"
                >
                  {field.label}
                </label>
                <Switch
                  id={fieldId}
                  checked={Boolean(val)}
                  onCheckedChange={(checked) =>
                    setValues((prev) => ({ ...prev, [field.name]: checked }))
                  }
                />
              </div>
            );
          }

          return (
            <div key={field.name} className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="text-xs font-medium text-[var(--fg-primary)]">
                {field.label}
                {field.required && (
                  <span className="ml-0.5 text-[var(--status-danger)]" aria-hidden="true">
                    *
                  </span>
                )}
              </label>

              {field.type === 'textarea' ? (
                <Textarea
                  id={fieldId}
                  name={field.name}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={String(val ?? '')}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                />
              ) : field.type === 'select' ? (
                <select
                  id={fieldId}
                  name={field.name}
                  required={field.required}
                  value={String(val ?? '')}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className="h-9 rounded-[var(--radius-element)] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  {(field.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={fieldId}
                  name={field.name}
                  type="text"
                  inputMode={field.type === 'number' ? 'decimal' : undefined}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => {
                    setSubmitted(false);
                    setValues((prev) => ({
                      ...prev,
                      [field.name]: e.target.value,
                    }));
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2.5">
        {submitted && (
          <span role="status" className="mr-auto text-xs font-medium text-[var(--status-success)]">
            Submitted
          </span>
        )}
        <Button type="submit" variant="primary" size="sm">
          <Send className="size-3.5" aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function AstryxApprovalCard({
  actionId,
  title,
  description,
  riskLevel = 'medium',
  commandPreview,
  approveLabel = 'Approve',
  denyLabel = 'Deny',
}: {
  actionId: string;
  title: string;
  description: string;
  riskLevel?: 'low' | 'medium' | 'high';
  commandPreview?: string;
  approveLabel?: string;
  denyLabel?: string;
}) {
  const dispatchAction = useDispatchGenUiAction();
  const [decision, setDecision] = React.useState<'pending' | 'approved' | 'denied'>('pending');

  const handleDecision = async (approved: boolean) => {
    setDecision(approved ? 'approved' : 'denied');
    await dispatchAction('approve_action', {
      actionId,
      approved,
    });
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--status-warning)]/35 bg-[var(--bg-surface)] shadow-[var(--shadow-low)]">
      <div className="flex items-start justify-between gap-2.5 p-4 pb-3">
        <div className="flex items-start gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-inner)] bg-[var(--status-warning-soft)] text-[var(--status-warning)]">
            <ShieldAlert className="size-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--fg-primary)]">{title}</h4>
              <Badge
                variant={
                  riskLevel === 'high' ? 'danger' : riskLevel === 'medium' ? 'warning' : 'accent'
                }
              >
                {riskLevel} risk
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--fg-secondary)]">{description}</p>
          </div>
        </div>
        {decision !== 'pending' && (
          <Badge variant={decision === 'approved' ? 'success' : 'danger'}>
            {decision === 'approved' ? 'Approved' : 'Denied'}
          </Badge>
        )}
      </div>

      {commandPreview && (
        <div className="px-4 pb-3">
          <pre className="overflow-x-auto rounded-[var(--radius-inner)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3 py-2 font-mono text-xs text-[var(--fg-primary)]">
            {commandPreview}
          </pre>
        </div>
      )}

      {decision === 'pending' && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => void handleDecision(false)}>
            {denyLabel}
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleDecision(true)}>
            <Check className="size-3.5" aria-hidden="true" />
            {approveLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

function AstryxAskUserWidget({
  title,
  prompt,
  multiSelect = false,
  options,
}: {
  questionId?: string;
  title?: string;
  prompt: string;
  multiSelect?: boolean;
  options: Array<{ id: string; label: string; description?: string }>;
}) {
  const dispatchAction = useDispatchGenUiAction();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [sent, setSent] = React.useState(false);

  const toggle = (label: string) => {
    if (sent) return;
    if (multiSelect) {
      setSelected((prev) =>
        prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label],
      );
    } else {
      setSelected([label]);
    }
  };

  const handleConfirm = async () => {
    if (selected.length === 0 || sent) return;
    setSent(true);
    await dispatchAction('send_prompt', {
      prompt: `${prompt} -> ${selected.join(', ')}`,
    });
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-low)]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        {title && (
          <p className="text-[11px] font-semibold tracking-wide text-[var(--accent)] uppercase">
            {title}
          </p>
        )}
        <h4 className="text-sm font-semibold text-[var(--fg-primary)]">{prompt}</h4>
      </div>

      <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.label);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={sent}
              aria-pressed={isSelected}
              onClick={() => toggle(opt.label)}
              className={cn(
                'flex cursor-pointer items-start justify-between gap-2 rounded-[var(--radius-element)] border p-3 text-left',
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-inset-selected)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)]',
              )}
            >
              <span>
                <span className="block text-xs font-semibold text-[var(--fg-primary)]">
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="mt-0.5 block text-[11px] text-[var(--fg-secondary)]">
                    {opt.description}
                  </span>
                )}
              </span>
              {isSelected && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)]" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2.5">
        {sent ? (
          <Badge variant="success">Response sent</Badge>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => void handleConfirm()}
          >
            <Send className="size-3.5" aria-hidden="true" />
            Send Choice
          </Button>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Main Catalog Registry via @json-render/react defineRegistry
   ========================================================================== */

export function MetricCard(props: AdeComponentProps<'MetricCard'>) {
  const toneBorder =
    props.tone === 'accent'
      ? 'border-[var(--accent)]/35'
      : props.tone === 'positive'
        ? 'border-[var(--status-success)]/35'
        : props.tone === 'warning'
          ? 'border-[var(--status-warning)]/35'
          : props.tone === 'danger'
            ? 'border-[var(--status-danger)]/35'
            : 'border-[var(--border-subtle)]';

  const deltaVariant =
    props.trend === 'up' || props.tone === 'positive'
      ? 'success'
      : props.trend === 'down' || props.tone === 'danger'
        ? 'danger'
        : 'secondary';

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-[var(--radius-element)] border bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-low)]',
        toneBorder,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
        <span className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
          {props.label}
        </span>
        {props.delta && (
          <Badge variant={deltaVariant} className="shrink-0 font-mono text-[10px]">
            {props.trend === 'up' && <ArrowUpRight className="size-3" aria-hidden="true" />}
            {props.trend === 'down' && <ArrowDownRight className="size-3" aria-hidden="true" />}
            {props.trend === 'neutral' && <Minus className="size-3" aria-hidden="true" />}
            {props.delta}
          </Badge>
        )}
      </div>
      <div className="min-w-0 break-words text-2xl font-semibold tracking-tight text-[var(--fg-primary)] tabular-nums">
        {props.value}
      </div>
      {props.caption && (
        <p className="min-w-0 break-words text-[11px] text-[var(--fg-secondary)]">
          {props.caption}
        </p>
      )}
    </div>
  );
}

export function MetricGrid({
  title,
  description,
  columns = 3,
  children,
}: AdeComponentProps<'MetricGrid'> & { children?: React.ReactNode }) {
  const gridClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 @sm:grid-cols-2'
        : columns === 4
          ? 'grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-4'
          : 'grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-3';

  return (
    <section className="@container flex min-w-0 flex-col gap-3 rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-4">
      {(title || description) && (
        <div className="min-w-0">
          {title && <h4 className="text-sm font-semibold text-[var(--fg-primary)]">{title}</h4>}
          {description && (
            <p className="mt-0.5 text-xs text-[var(--fg-secondary)]">{description}</p>
          )}
        </div>
      )}
      <div className={cn('grid min-w-0 gap-2.5', gridClass)}>{children}</div>
    </section>
  );
}

export function Callout({
  title,
  message,
  tone = 'info',
  children,
}: AdeComponentProps<'Callout'> & { children?: React.ReactNode }) {
  const toneMap = {
    info: {
      container: 'border-[var(--status-info)]/30 bg-[var(--status-info-soft)]',
      iconColor: 'text-[var(--status-info)]',
      Icon: Info,
    },
    success: {
      container: 'border-[var(--status-success)]/30 bg-[var(--status-success-soft)]',
      iconColor: 'text-[var(--status-success)]',
      Icon: CheckCircle2,
    },
    warning: {
      container: 'border-[var(--status-warning)]/30 bg-[var(--status-warning-soft)]',
      iconColor: 'text-[var(--status-warning)]',
      Icon: AlertTriangle,
    },
    danger: {
      container: 'border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)]',
      iconColor: 'text-[var(--status-danger)]',
      Icon: AlertCircle,
    },
    neutral: {
      container: 'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]',
      iconColor: 'text-[var(--fg-secondary)]',
      Icon: Info,
    },
  }[tone];

  const Icon = toneMap.Icon;
  return (
    <div
      className={cn('flex gap-3 rounded-[var(--radius-element)] border p-3.5', toneMap.container)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', toneMap.iconColor)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <h4 className="text-xs font-semibold text-[var(--fg-primary)]">{title}</h4>}
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-secondary)]">{message}</p>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </div>
  );
}

export function Tabs({
  defaultValue,
  items,
  children,
}: AdeComponentProps<'Tabs'> & { children?: React.ReactNode }) {
  const first = defaultValue ?? items[0]?.value ?? 'tab-0';
  return (
    <AstryxTabs
      defaultValue={first}
      className="rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 shadow-[var(--shadow-low)]"
    >
      <TabsList>
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            <span>{item.label}</span>
            {item.badge && (
              <Badge variant="secondary" className="text-[10px]">
                {item.badge}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {items.map((item) => (
        <TabsContent key={item.value} value={item.value} className="pt-1">
          {item.content && (
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--fg-secondary)]">
              {item.content}
            </p>
          )}
        </TabsContent>
      ))}

      {children && <div className="pt-1">{children}</div>}
    </AstryxTabs>
  );
}

export function Timeline({ title, items }: AdeComponentProps<'Timeline'>) {
  return (
    <div className="rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-low)]">
      {title && <h4 className="mb-3 text-sm font-semibold text-[var(--fg-primary)]">{title}</h4>}
      <ol className="relative flex flex-col gap-3 pl-5 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-[var(--border-strong)]">
        {items.map((item, idx) => {
          const status = item.status ?? 'pending';
          return (
            <li key={item.id ?? idx} className="relative">
              <span
                className={cn(
                  'absolute -left-5 top-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--bg-surface)]',
                  status === 'completed' && 'text-[var(--status-success)]',
                  status === 'active' && 'text-[var(--accent)]',
                  status === 'error' && 'text-[var(--status-danger)]',
                  status === 'pending' && 'text-[var(--fg-muted)]',
                )}
              >
                {status === 'completed' ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : status === 'active' ? (
                  <Clock className="size-3.5 animate-pulse" aria-hidden="true" />
                ) : status === 'error' ? (
                  <XCircle className="size-3.5" aria-hidden="true" />
                ) : (
                  <Circle className="size-3" aria-hidden="true" />
                )}
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--fg-primary)]">
                    {item.title}
                  </span>
                  {item.badge && <Badge variant="secondary">{item.badge}</Badge>}
                </div>
                {item.timestamp && (
                  <span className="font-mono text-[11px] text-[var(--fg-muted)]">
                    {item.timestamp}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
                  {item.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function DiffCard(props: AdeComponentProps<'DiffCard'>) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-low)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3.5 py-2">
        <div className="flex items-center gap-2">
          <FileDiff className="size-3.5 text-[var(--accent)]" aria-hidden="true" />
          <span className="font-mono text-xs font-semibold text-[var(--fg-primary)]">
            {props.filename}
          </span>
          {props.language && <Badge variant="secondary">{props.language}</Badge>}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          {props.additions !== undefined && (
            <span className="text-[var(--status-success)]">+{props.additions}</span>
          )}
          {props.deletions !== undefined && (
            <span className="text-[var(--status-danger)]">-{props.deletions}</span>
          )}
        </div>
      </div>
      {props.summary && (
        <p className="border-b border-[var(--border-subtle)] px-3.5 py-2 text-xs text-[var(--fg-secondary)]">
          {props.summary}
        </p>
      )}
      <div className="max-h-80 overflow-auto font-mono text-[11px] leading-relaxed">
        {props.hunks.map((hunk, hIdx) => (
          <div key={hIdx}>
            {hunk.header && (
              <div className="bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-medium text-[var(--accent)]">
                {hunk.header}
              </div>
            )}
            {hunk.lines.map((line, lIdx) => (
              <div
                key={lIdx}
                className={cn(
                  'flex gap-2 px-3 py-0.5 whitespace-pre',
                  line.type === 'add' &&
                    'bg-[var(--status-success-soft)] text-[var(--status-success)]',
                  line.type === 'remove' &&
                    'bg-[var(--status-danger-soft)] text-[var(--status-danger)]',
                  line.type === 'context' && 'text-[var(--fg-secondary)]',
                )}
              >
                <span className="w-7 shrink-0 select-none text-right opacity-55">
                  {line.lineNumber ?? ''}
                </span>
                <span className="w-3 shrink-0 select-none">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="min-w-0 flex-1">{line.content}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export {
  AstryxActionBar as ActionBar,
  AstryxApprovalCard as ApprovalCard,
  AstryxAskUserWidget as AskUserCard,
  AstryxChart as Chart,
  AstryxCodePreview as CodePreview,
  AstryxDataTable as DataTable,
  AstryxForm as Form,
};

const defined = defineRegistry(adeCatalog, {
  components: {
    MetricCard: ({ props }) => <MetricCard {...props} />,
    MetricGrid: ({ props, children }) => <MetricGrid {...props}>{children}</MetricGrid>,
    DataTable: ({ props }) => <AstryxDataTable {...props} />,
    Chart: ({ props }) => <AstryxChart {...props} />,
    Callout: ({ props, children }) => <Callout {...props}>{children}</Callout>,
    Tabs: ({ props, children }) => <Tabs {...props}>{children}</Tabs>,
    Timeline: ({ props }) => <Timeline {...props} />,
    DiffCard: ({ props }) => <DiffCard {...props} />,
    CodePreview: ({ props }) => <AstryxCodePreview {...props} />,
    ActionBar: ({ props }) => <AstryxActionBar {...props} />,
    Form: ({ props }) => <AstryxForm {...props} />,
    ApprovalCard: ({ props }) => <AstryxApprovalCard {...props} />,
    AskUserCard: ({ props }) => <AstryxAskUserWidget {...props} />,
  },

  actions: {
    send_prompt: async () => {},
    open_workbench: async () => {},
    promote_artifact: async () => {},
    run_command: async () => {},
    approve_action: async () => {},
    submit_form: async () => {},
  },
});

export const adeRegistry = defined.registry;

export function createAdeActionHandlers(
  onAction?: GenUiActionHandler,
): Record<string, (params: Record<string, unknown>) => Promise<void>> {
  const wrap =
    (name: AdeActionName) =>
    async (params: Record<string, unknown>): Promise<void> => {
      if (onAction) {
        await onAction(name, params);
      }
    };

  return {
    send_prompt: wrap('send_prompt'),
    open_workbench: wrap('open_workbench'),
    promote_artifact: wrap('promote_artifact'),
    run_command: wrap('run_command'),
    approve_action: wrap('approve_action'),
    submit_form: wrap('submit_form'),
  };
}
