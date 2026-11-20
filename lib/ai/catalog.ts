import {
  defineCatalog,
  type InferActionParams,
  type InferCatalogActions,
  type InferCatalogComponents,
  type InferComponentProps,
} from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

const tableCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const chartDatumValueSchema = z.union([z.string(), z.number()]);

export const adeCatalog = defineCatalog(schema, {
  components: {
    MetricCard: {
      props: z.object({
        label: z.string().describe('Short uppercase or concise metric label'),
        value: z.union([z.string(), z.number()]).describe('Formatted primary figure'),
        delta: z.string().optional().describe('Delta text such as "+14.2%" or "-24ms"'),
        trend: z.enum(['up', 'down', 'neutral']).optional(),
        caption: z.string().optional().describe('Secondary explanatory subtitle'),
        tone: z.enum(['default', 'accent', 'positive', 'warning', 'danger']).optional(),
      }),
      slots: [],
      description:
        'Single KPI / telemetry metric card with optional delta badge and trend indicator.',
      example: {
        label: 'p95 Latency',
        value: '184ms',
        delta: '-18%',
        trend: 'down',
        caption: 'vs. last 24h',
        tone: 'positive',
      },
    },

    MetricGrid: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        columns: z.number().int().min(1).max(4).optional().describe('Grid column count (1-4)'),
      }),
      slots: ['default'],
      description:
        'Responsive container for grouping MetricCard items or other visual cards into a crisp Astryx dashboard section.',
      example: {
        title: 'Runtime Overview',
        columns: 3,
      },
    },

    DataTable: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        columns: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            align: z.enum(['left', 'center', 'right']).optional(),
            format: z.enum(['text', 'number', 'currency', 'percent', 'badge', 'mono']).optional(),
          }),
        ),
        rows: z.array(z.record(z.string(), tableCellValueSchema)),
        searchable: z.boolean().optional(),
        compact: z.boolean().optional(),
      }),
      slots: [],
      description: 'Structured interactive data table with sorting/search and formatted columns.',
      example: {
        title: 'Model Benchmarks',
        columns: [
          { key: 'model', label: 'Model', format: 'mono' },
          { key: 'latency', label: 'Latency', align: 'right' },
          { key: 'status', label: 'Tier', format: 'badge' },
        ],
        rows: [{ model: 'anthropic/claude-sonnet-5.5', latency: '420ms', status: 'Flagship' }],
      },
    },

    Chart: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(['bar', 'line', 'area', 'pie']),
        data: z.array(z.record(z.string(), chartDatumValueSchema)),
        xKey: z.string().describe('Category / x-axis field name in each datum'),
        series: z.array(
          z.object({
            key: z.string(),
            label: z.string(),
            color: z.string().optional(),
          }),
        ),
        height: z.number().int().min(160).max(520).optional(),
        showLegend: z.boolean().optional(),
      }),
      slots: [],
      description: 'Interactive Recharts visualization supporting bar, line, area, and pie charts.',
      example: {
        title: 'Throughput by Harness',
        type: 'bar',
        xKey: 'harness',
        series: [{ key: 'rps', label: 'Req/s' }],
        data: [
          { harness: 'AI SDK 7', rps: 124 },
          { harness: 'fx', rps: 98 },
          { harness: 'Workflow 5', rps: 112 },
        ],
      },
    },

    Callout: {
      props: z.object({
        title: z.string().optional(),
        message: z.string(),
        tone: z.enum(['info', 'success', 'warning', 'danger', 'neutral']).optional(),
      }),
      slots: ['default'],
      description: 'Highlighted informational, warning, success, or error callout card.',
      example: {
        title: 'Sandbox Ready',
        message: 'Running in Tier 1 instant just-bash mode.',
        tone: 'info',
      },
    },

    Tabs: {
      props: z.object({
        defaultValue: z.string().optional(),
        items: z.array(
          z.object({
            value: z.string(),
            label: z.string(),
            badge: z.string().optional(),
            content: z.string().optional(),
          }),
        ),
      }),
      slots: ['default'],
      description:
        'Tabbed content switcher for organizing comparisons, plans, or multi-view outputs.',
      example: {
        defaultValue: 'summary',
        items: [
          { value: 'summary', label: 'Summary', content: 'Key findings overview.' },
          { value: 'details', label: 'Details', content: 'Implementation breakdown.' },
        ],
      },
    },

    Timeline: {
      props: z.object({
        title: z.string().optional(),
        items: z.array(
          z.object({
            id: z.string().optional(),
            title: z.string(),
            description: z.string().optional(),
            timestamp: z.string().optional(),
            status: z.enum(['completed', 'active', 'pending', 'error']).optional(),
            badge: z.string().optional(),
          }),
        ),
      }),
      slots: [],
      description: 'Vertical milestone or station timeline (Plan -> Implement -> Verify -> Ship).',
      example: {
        title: 'Execution Plan',
        items: [
          { title: 'Inspect workspace', status: 'completed', timestamp: '0.2s' },
          { title: 'Build preview', status: 'active', timestamp: 'now' },
        ],
      },
    },

    DiffCard: {
      props: z.object({
        filename: z.string(),
        summary: z.string().optional(),
        language: z.string().optional(),
        additions: z.number().int().optional(),
        deletions: z.number().int().optional(),
        hunks: z.array(
          z.object({
            header: z.string().optional(),
            lines: z.array(
              z.object({
                type: z.enum(['context', 'add', 'remove']),
                content: z.string(),
                lineNumber: z.number().int().optional(),
              }),
            ),
          }),
        ),
      }),
      slots: [],
      description: 'Unified code diff card highlighting additions, removals, and context lines.',
      example: {
        filename: 'src/hello.ts',
        additions: 1,
        deletions: 1,
        hunks: [
          {
            header: '@@ -1,2 +1,2 @@',
            lines: [
              { type: 'remove', content: 'export const greeting = "hi";', lineNumber: 1 },
              { type: 'add', content: 'export const greeting = "hello, world";', lineNumber: 1 },
            ],
          },
        ],
      },
    },

    CodePreview: {
      props: z.object({
        title: z.string().optional(),
        filename: z.string().optional(),
        language: z.string().optional(),
        code: z.string(),
        caption: z.string().optional(),
        promotable: z.boolean().optional(),
      }),
      slots: [],
      description:
        'Syntax-styled code snippet card with copy and optional Promote to Canvas button.',
      example: {
        title: 'Starter Handler',
        filename: 'index.ts',
        language: 'typescript',
        code: 'export const status = "ready";',
        promotable: true,
      },
    },

    ActionBar: {
      props: z.object({
        label: z.string().optional(),
        align: z.enum(['start', 'end', 'between']).optional(),
        actions: z.array(
          z.object({
            label: z.string(),
            variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).optional(),
            actionName: z.enum([
              'send_prompt',
              'open_workbench',
              'promote_artifact',
              'run_command',
              'approve_action',
              'submit_form',
            ]),
            params: z.record(z.string(), z.unknown()).optional(),
          }),
        ),
      }),
      slots: [],
      description: 'Row of actionable buttons dispatching catalog actions back into the ADE.',
      example: {
        align: 'end',
        actions: [
          {
            label: 'Open Terminal',
            variant: 'secondary',
            actionName: 'open_workbench',
            params: { tab: 'terminal' },
          },
        ],
      },
    },

    Form: {
      props: z.object({
        id: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        submitLabel: z.string().optional(),
        fields: z.array(
          z.object({
            name: z.string(),
            label: z.string(),
            type: z.enum(['text', 'textarea', 'number', 'select', 'toggle']),
            placeholder: z.string().optional(),
            required: z.boolean().optional(),
            defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
            options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
          }),
        ),
      }),
      slots: [],
      description: 'Interactive configuration or input form that submits values via submit_form.',
      example: {
        id: 'deploy-config',
        title: 'Deployment Settings',
        submitLabel: 'Apply Config',
        fields: [
          {
            name: 'region',
            label: 'Region',
            type: 'select',
            options: [{ label: 'iad1', value: 'iad1' }],
          },
        ],
      },
    },

    ApprovalCard: {
      props: z.object({
        actionId: z.string(),
        title: z.string(),
        description: z.string(),
        riskLevel: z.enum(['low', 'medium', 'high']).optional(),
        commandPreview: z.string().optional(),
        approveLabel: z.string().optional(),
        denyLabel: z.string().optional(),
      }),
      slots: [],
      description: 'Sentinel human-in-the-loop confirmation card invoking approve_action.',
      example: {
        actionId: 'deploy-prod',
        title: 'Run Production Build',
        description: 'Builds and publishes changes to the target environment.',
        riskLevel: 'medium',
        commandPreview: 'bun run build',
      },
    },

    AskUserCard: {
      props: z.object({
        questionId: z.string().optional(),
        title: z.string().optional(),
        prompt: z.string(),
        multiSelect: z.boolean().optional(),
        options: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            description: z.string().optional(),
          }),
        ),
      }),
      slots: [],
      description:
        'Interactive clarifying choice card sending the selected response via send_prompt.',
      example: {
        questionId: 'framework',
        title: 'Choose Target',
        prompt: 'Which preview style would you like?',
        options: [
          {
            id: 'minimal',
            label: 'Minimal Single-File HTML',
            description: 'Zero build step preview',
          },
          {
            id: 'dashboard',
            label: 'Interactive Dashboard',
            description: 'Charts and live filters',
          },
        ],
      },
    },
  },

  actions: {
    send_prompt: {
      params: z.object({
        prompt: z.string().describe('Follow-up user message to send to the chat agent'),
      }),
      description: 'Send a follow-up prompt directly into the active chat conversation.',
    },
    open_workbench: {
      params: z.object({
        tab: z.enum(['preview', 'browser', 'terminal', 'files', 'genui', 'trace']),
        target: z.string().optional().describe('Optional file path, artifact id, or URL to focus'),
      }),
      description: 'Open or switch the right-hand ADE Workbench to a specific tab.',
    },
    promote_artifact: {
      params: z.object({
        title: z.string(),
        kind: z.enum(['code', 'document', 'html', 'genui', 'diff']),
        content: z.string(),
        language: z.string().optional(),
      }),
      description: 'Promote content or a generated spec into a persistent Workbench artifact.',
    },
    run_command: {
      params: z.object({
        command: z.string(),
        cwd: z.string().optional(),
      }),
      description: 'Execute a shell command in the active workspace terminal.',
    },
    approve_action: {
      params: z.object({
        actionId: z.string(),
        approved: z.boolean(),
        note: z.string().optional(),
      }),
      description: 'Approve or deny a pending Sentinel human-in-the-loop action.',
    },
    submit_form: {
      params: z.object({
        formId: z.string().optional(),
        title: z.string().optional(),
        values: z.record(z.string(), z.unknown()),
      }),
      description: 'Submit collected Form field values back to the assistant.',
    },
  },
});

export type AdeCatalog = typeof adeCatalog;
export type AdeCatalogComponents = InferCatalogComponents<AdeCatalog>;
export type AdeCatalogActions = InferCatalogActions<AdeCatalog>;
export type AdeComponentName = keyof AdeCatalogComponents;
export type AdeActionName = keyof AdeCatalogActions;
export type AdeComponentProps<K extends AdeComponentName> = InferComponentProps<AdeCatalog, K>;
export type AdeActionParams<K extends AdeActionName> = InferActionParams<AdeCatalog, K>;

export const ADE_COMPONENT_NAMES = adeCatalog.componentNames as AdeComponentName[];
export const ADE_ACTION_NAMES = adeCatalog.actionNames as AdeActionName[];

export const ADE_CATALOG_PROMPT = adeCatalog.prompt({
  mode: 'inline',
  customRules: [
    'Only emit a json-render UI spec when structured visual output (metrics, tables, charts, timelines, diffs, interactive forms, or actionable cards) genuinely improves clarity over plain Markdown.',
    'Always wrap multiple top-level MetricCard elements inside a MetricGrid root element.',
    'Keep specs concise and well-structured; avoid duplicating identical prose above and inside the UI spec.',
  ],
});
