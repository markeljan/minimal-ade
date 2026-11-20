import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeSandboxChatAccess, execCommand, normalizeChatId } from '@/lib/sandbox/manager';

export const runtime = 'nodejs';

const execSchema = z.object({
  chatId: z.string().optional(),
  command: z.string().min(1, 'Command is required').max(16_000),
  cwd: z.string().optional(),
  tier: z.enum(['just-bash', 'vercel-sandbox', 'remote-agent-browser']).optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json().catch(() => null);
    const parsed = execSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid exec payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const chatId = normalizeChatId(parsed.data.chatId);
    const access = await authorizeSandboxChatAccess(request, chatId, 'write');
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.error }, { status: 403 });
    }

    const result = await execCommand(chatId, parsed.data.command, {
      cwd: parsed.data.cwd,
      tier: parsed.data.tier,
      env: parsed.data.env,
      timeoutMs: parsed.data.timeoutMs,
    });

    try {
      metric('ade.sandbox.actions', 1, {
        action: 'exec',
        tier: result.tier,
        outcome: result.exitCode === 0 ? 'ok' : 'nonzero',
      });
    } catch {
      // Ignore outside Vercel telemetry runtime.
    }

    return NextResponse.json({
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      tier: result.tier,
      cwd: result.cwd,
      files: result.files,
      changedFiles: result.changedFiles,
      deletedFiles: result.deletedFiles,
      notice: result.notice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command execution failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
