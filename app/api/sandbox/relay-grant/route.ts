import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mintRelayGrant } from '@/lib/sandbox/browser-service';
import { authorizeSandboxChatAccess, normalizeChatId } from '@/lib/sandbox/manager';

export const runtime = 'nodejs';

const relayGrantSchema = z.object({
  chatId: z.string().optional(),
  role: z.enum(['watch', 'control']).default('watch'),
  ttlSec: z.number().int().min(30).max(3600).default(600),
});

/**
 * Mints a short-lived scoped `watch` or `control` grant for `<ScreenRelayViewer />`.
 * SECURITY: Never returns or logs the raw 64-hex screen-relay session token.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = relayGrantSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid relay grant request', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const requestedChatId = normalizeChatId(parsed.data.chatId);
    const access = await authorizeSandboxChatAccess(request, requestedChatId, 'write');
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status ?? 403 },
      );
    }
    const chatId = access.effectiveChatId ?? requestedChatId;

    const result = await mintRelayGrant(chatId, parsed.data.role, parsed.data.ttlSec);

    try {
      metric('ade.sandbox.actions', 1, {
        action: 'relay_grant',
        role: parsed.data.role,
        outcome: result.ok ? 'ok' : 'unavailable',
      });
    } catch {
      // Ignore outside Vercel Function runtime.
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          role: result.role,
          error: result.error,
          hint: result.hint,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      wsUrl: result.wsUrl,
      grantToken: result.grantToken,
      authProtocol: result.authProtocol ?? 'ticket',
      role: result.role,
      expiresAt: result.expiresAt,
      loopbackNoAuth: result.loopbackNoAuth ?? false,
      capabilities: result.capabilities,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mint screen-relay grant';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
