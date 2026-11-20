'use client';

import {
  collectActions,
  collectUsedComponents,
  serializeProps,
  traverseSpec,
} from '@json-render/codegen';
import {
  buildSpecFromParts,
  JSONUIProvider,
  Renderer,
  type Spec,
  useJsonRenderMessage,
} from '@json-render/react';
import { Check, Code2, Copy, Maximize2, Sparkles } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  adeRegistry,
  createAdeActionHandlers,
  GenUiActionBridgeProvider,
  type GenUiActionHandler,
} from './registry';

export { buildSpecFromParts, type Spec, useJsonRenderMessage };

/**
 * Generate clean, copyable React TSX from any `@json-render/core` Spec
 * using `@json-render/codegen` (`collectUsedComponents`, `collectActions`, `traverseSpec`, `serializeProps`).
 */
export function exportSpecToReactTsx(spec: Spec, componentName = 'GeneratedAdeWidget'): string {
  const usedComponents = Array.from(collectUsedComponents(spec)).sort();
  const usedActions = Array.from(collectActions(spec)).sort();

  const lines: string[] = [];

  if (usedComponents.length > 0) {
    lines.push(`import { ${usedComponents.join(', ')} } from '@/components/genui/components';`);
    lines.push('');
  }

  if (usedActions.length > 0) {
    lines.push('export interface GeneratedWidgetProps {');
    lines.push(
      `  onAction?: (action: ${usedActions.map((a) => `'${a}'`).join(' | ')}, params?: Record<string, unknown>) => void;`,
    );
    lines.push('}');
    lines.push('');
  }

  lines.push(
    usedActions.length > 0
      ? `export function ${componentName}({ onAction }: GeneratedWidgetProps) {`
      : `export function ${componentName}() {`,
  );

  // Build hierarchical JSX lines using traverseSpec metadata
  const childrenMap = new Map<string, string[]>();
  const elementMap = new Map<string, { type: string; props: Record<string, unknown> }>();

  traverseSpec(spec, (element, key) => {
    elementMap.set(key, {
      type: element.type,
      props: (element.props ?? {}) as Record<string, unknown>,
    });
    if (Array.isArray(element.children) && element.children.length > 0) {
      childrenMap.set(key, element.children);
    }
  });

  const renderNode = (key: string, indentLevel: number): string[] => {
    const node = elementMap.get(key);
    if (!node) return [];
    const pad = '  '.repeat(indentLevel);
    const propsStr = serializeProps(node.props, { quotes: 'single', indent: 2 });
    const openTag = propsStr ? `<${node.type} ${propsStr}` : `<${node.type}`;
    const childKeys = childrenMap.get(key) ?? [];

    if (childKeys.length === 0) {
      return [`${pad}${openTag} />`];
    }

    const innerLines: string[] = [`${pad}${openTag}>`];
    for (const childKey of childKeys) {
      innerLines.push(...renderNode(childKey, indentLevel + 1));
    }
    innerLines.push(`${pad}</${node.type}>`);
    return innerLines;
  };

  lines.push('  return (');
  if (spec.root && elementMap.has(spec.root)) {
    lines.push(...renderNode(spec.root, 2));
  } else {
    lines.push('    <div />');
  }
  lines.push('  );');
  lines.push('}');

  return lines.join('\n');
}

export interface GenUIRendererProps {
  spec: Spec | null;
  loading?: boolean;
  onAction?: GenUiActionHandler;
  onPromoteToCanvas?: (spec: Spec, title?: string) => void;
  /** Show compact Astryx footer bar with Promote to Canvas + Export React TSX */
  showToolbar?: boolean;
  className?: string;
}

function inferSpecTitle(spec: Spec): string {
  const rootEl = spec.root ? spec.elements?.[spec.root] : undefined;
  const rawTitle =
    rootEl?.props && typeof rootEl.props === 'object'
      ? (rootEl.props as Record<string, unknown>).title
      : undefined;
  if (typeof rawTitle === 'string' && rawTitle.trim()) {
    return rawTitle.trim();
  }
  return 'Generative UI Widget';
}

export function GenUIRenderer({
  spec,
  loading = false,
  onAction,
  onPromoteToCanvas,
  showToolbar = true,
  className,
}: GenUIRendererProps) {
  const [showCode, setShowCode] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);

  const actionHandlers = React.useMemo(() => createAdeActionHandlers(onAction), [onAction]);

  const generatedTsx = React.useMemo(() => {
    if (!spec || !showCode) {
      return '';
    }
    try {
      return exportSpecToReactTsx(spec);
    } catch {
      return '// Spec is still streaming…';
    }
  }, [spec, showCode]);

  if (!spec?.root || !spec.elements?.[spec.root]) {
    if (!loading) {
      return null;
    }
    return (
      <div
        data-slot="genui-renderer-skeleton"
        className={cn(
          'my-2.5 rounded-[var(--radius-container)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-[var(--shadow-low)]',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
          <Sparkles className="size-3.5 animate-pulse text-[var(--accent)]" aria-hidden="true" />
          <span>Streaming interactive UI…</span>
        </div>
      </div>
    );
  }

  const handleCopyTsx = async () => {
    try {
      const code = exportSpecToReactTsx(spec);
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      toast.success('Copied React TSX to clipboard');
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      toast.error('Failed to copy React TSX');
    }
  };

  const specTitle = inferSpecTitle(spec);

  return (
    <div
      data-slot="genui-renderer"
      className={cn('my-3 flex flex-col gap-2.5 rounded-[var(--radius-container)]', className)}
    >
      <GenUiActionBridgeProvider onAction={onAction}>
        <JSONUIProvider registry={adeRegistry} initialState={spec.state} handlers={actionHandlers}>
          <div className="flex flex-col gap-2.5">
            <Renderer spec={spec} registry={adeRegistry} loading={loading} />
          </div>
        </JSONUIProvider>
      </GenUiActionBridgeProvider>

      {showToolbar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-element)] border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-[var(--accent)]" aria-hidden="true" />
            <span className="text-[11px] font-medium text-[var(--fg-secondary)]">json-render</span>
            {loading && (
              <Badge variant="accent" className="text-[10px]">
                Streaming
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onPromoteToCanvas && (
              <Button variant="ghost" size="xs" onClick={() => onPromoteToCanvas(spec, specTitle)}>
                <Maximize2 className="size-3" aria-hidden="true" />
                Promote to Canvas
              </Button>
            )}
            <Button variant="ghost" size="xs" onClick={() => setShowCode((prev) => !prev)}>
              <Code2 className="size-3" aria-hidden="true" />
              {showCode ? 'Hide TSX' : 'Export React TSX'}
            </Button>
            <Button variant="ghost" size="xs" onClick={handleCopyTsx}>
              {copiedCode ? (
                <Check className="size-3 text-[var(--status-success)]" aria-hidden="true" />
              ) : (
                <Copy className="size-3" aria-hidden="true" />
              )}
              {copiedCode ? 'Copied' : 'Copy TSX'}
            </Button>
          </div>
        </div>
      )}

      {showCode && generatedTsx && (
        <pre className="astryx-dark-surface max-h-72 overflow-auto rounded-[var(--radius-element)] border border-[var(--border-subtle)] p-3.5 font-mono text-[11px] leading-relaxed">
          <code>{generatedTsx}</code>
        </pre>
      )}
    </div>
  );
}
