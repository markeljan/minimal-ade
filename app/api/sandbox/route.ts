import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBrowserStatus } from '@/lib/sandbox/browser-service';
import {
  authorizeSandboxChatAccess,
  getAllFilesRecord,
  getOrCreateCloudSandbox,
  getSandboxStatus,
  listFiles,
  normalizeChatId,
  setPreferredTier,
  stopCloudSandbox,
} from '@/lib/sandbox/manager';

export const runtime = 'nodejs';

const sandboxPostSchema = z.object({
  chatId: z.string().optional(),
  action: z.enum(['status', 'upgrade', 'stop', 'set-tier', 'boot-desktop']).default('status'),
  tier: z.enum(['just-bash', 'vercel-sandbox', 'remote-agent-browser']).optional(),
  snapshotId: z.string().optional(),
});

function safeMetric(name: string, value: number, tags?: Record<string, string>): void {
  try {
    metric(name, value, tags);
  } catch {
    // No-op outside Vercel Function telemetry runtime.
  }
}

function shellEscapeSingle(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function resolveTrustedAppOrigin(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.BETTER_AUTH_URL?.trim(),
    process.env.VERCEL_URL?.trim() ? `https://${process.env.VERCEL_URL.trim()}` : undefined,
    'http://localhost:3000',
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Try next trusted origin candidate.
    }
  }

  return 'http://localhost:3000';
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = normalizeChatId(searchParams.get('chatId'));

    const access = await authorizeSandboxChatAccess(request, chatId, 'read');
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.error }, { status: 403 });
    }

    const [status, files, fileMap, browser] = await Promise.all([
      getSandboxStatus(chatId),
      listFiles(chatId),
      getAllFilesRecord(chatId),
      getBrowserStatus(chatId),
    ]);

    return NextResponse.json({
      ok: true,
      status,
      files,
      fileMap,
      browser,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to inspect sandbox status';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = sandboxPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid sandbox request payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, tier, snapshotId } = parsed.data;
    const chatId = normalizeChatId(parsed.data.chatId);

    const access = await authorizeSandboxChatAccess(request, chatId, 'write');
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.error }, { status: 403 });
    }

    if (action === 'set-tier' && tier) {
      setPreferredTier(chatId, tier);
      safeMetric('ade.sandbox.actions', 1, { action: 'set_tier', tier });
      const status = await getSandboxStatus(chatId);
      return NextResponse.json({ ok: true, status });
    }

    if (action === 'stop') {
      const stopped = await stopCloudSandbox(chatId);
      safeMetric('ade.sandbox.actions', 1, { action: 'stop', outcome: 'ok' });
      const status = await getSandboxStatus(chatId);
      return NextResponse.json({ ok: true, ...stopped, status });
    }

    if (action === 'upgrade' || action === 'boot-desktop') {
      const cloud = await getOrCreateCloudSandbox(chatId, {
        snapshotId,
        hydrateFiles: true,
      });

      if (!cloud.ok) {
        safeMetric('ade.sandbox.actions', 1, { action, outcome: 'degraded' });
        const status = await getSandboxStatus(chatId);
        return NextResponse.json({
          ok: false,
          degraded: true,
          error: cloud.error,
          notice: `${cloud.error} Continuing in Tier 1 instant just-bash.`,
          status,
        });
      }

      let desktopNotice: string | undefined;
      if (action === 'boot-desktop' && cloud.entry.relayUrl) {
        const appOrigin = resolveTrustedAppOrigin();
        let relayOrigin: string | null = null;
        try {
          const parsedRelay = new URL(cloud.entry.relayUrl);
          if (parsedRelay.protocol === 'http:' || parsedRelay.protocol === 'https:') {
            relayOrigin = parsedRelay.origin;
          }
        } catch {
          relayOrigin = null;
        }

        if (relayOrigin) {
          const bootCmd = `if command -v screen-relay >/dev/null 2>&1; then screen-relay up -d --bind 0.0.0.0 --public ${shellEscapeSingle(relayOrigin)} --allow-origin ${shellEscapeSingle(appOrigin)} >/dev/null 2>&1 && echo "relay_started" || echo "relay_failed"; else echo "relay_missing"; fi`;
          const res = await cloud.entry.sandbox
            .runCommand('bash', ['-lc', bootCmd], { timeoutMs: 25_000 })
            .catch(() => null);
          const out = res ? (await res.stdout()).trim() : 'relay_failed';
          desktopNotice = out.includes('relay_started')
            ? 'screen-relay desktop engine started on port 8080.'
            : out.includes('relay_missing')
              ? 'screen-relay binary not installed in this sandbox. Run `bun run sandbox:snapshot` to pre-bake a desktop snapshot.'
              : 'Cloud sandbox ready; screen-relay startup requires a pre-baked desktop snapshot.';
        }
      }

      safeMetric('ade.sandbox.actions', 1, { action, outcome: 'ok' });
      const status = await getSandboxStatus(chatId);
      return NextResponse.json({
        ok: true,
        status,
        notice: desktopNotice ?? `Cloud Sandbox ${cloud.entry.sandboxName} is ready.`,
      });
    }

    const status = await getSandboxStatus(chatId);
    safeMetric('ade.sandbox.actions', 1, { action: 'status', outcome: 'ok' });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sandbox request failed';
    safeMetric('ade.sandbox.actions', 1, { action: 'unknown', outcome: 'error' });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
