import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  browserBack,
  browserClick,
  browserFill,
  browserForward,
  browserOpen,
  browserPress,
  browserRead,
  browserReload,
  browserScreenshot,
  browserScroll,
  browserSnapshot,
  browserType,
  getBrowserStatus,
  setBrowserModeAndViewport,
} from '@/lib/sandbox/browser-service';
import { authorizeSandboxChatAccess, normalizeChatId } from '@/lib/sandbox/manager';

export const runtime = 'nodejs';

const browserActionSchema = z.object({
  chatId: z.string().optional(),
  action: z.enum([
    'open',
    'back',
    'forward',
    'reload',
    'snapshot',
    'screenshot',
    'click',
    'fill',
    'type',
    'press',
    'scroll',
    'read',
    'status',
    'configure',
  ]),
  url: z.string().optional(),
  selector: z.string().optional(),
  target: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().int().min(50).max(5000).optional(),
  mode: z.enum(['preview', 'screen-relay', 'agent-browser', 'snapshot']).optional(),
  viewport: z
    .object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(320).max(2160),
    })
    .optional(),
  isHumanInControl: z.boolean().optional(),
  fullPage: z.boolean().optional(),
  interactive: z.boolean().optional(),
  compact: z.boolean().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = normalizeChatId(searchParams.get('chatId'));
    const access = await authorizeSandboxChatAccess(request, chatId, 'read');
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.error }, { status: 403 });
    }
    const status = await getBrowserStatus(chatId);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read browser status';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.json().catch(() => null);
    const parsed = browserActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid browser action payload', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const chatId = normalizeChatId(data.chatId);

    const access = await authorizeSandboxChatAccess(request, chatId, 'write');
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.error }, { status: 403 });
    }

    try {
      metric('ade.sandbox.actions', 1, { action: `browser_${data.action}` });
    } catch {
      // No-op outside Vercel telemetry runtime.
    }

    switch (data.action) {
      case 'status': {
        const status = await getBrowserStatus(chatId);
        return NextResponse.json({ ok: true, status });
      }
      case 'configure': {
        const state = setBrowserModeAndViewport(chatId, {
          mode: data.mode,
          viewport: data.viewport,
          isHumanInControl: data.isHumanInControl,
        });
        const status = await getBrowserStatus(chatId);
        return NextResponse.json({ ok: true, state, status });
      }
      case 'open': {
        const result = await browserOpen(chatId, data.url ?? 'workspace://index.html', {
          mode: data.mode,
        });
        return NextResponse.json(result);
      }
      case 'back': {
        return NextResponse.json(await browserBack(chatId));
      }
      case 'forward': {
        return NextResponse.json(await browserForward(chatId));
      }
      case 'reload': {
        return NextResponse.json(await browserReload(chatId));
      }
      case 'snapshot': {
        return NextResponse.json(
          await browserSnapshot(chatId, {
            interactive: data.interactive,
            compact: data.compact,
          }),
        );
      }
      case 'screenshot': {
        return NextResponse.json(
          await browserScreenshot(chatId, {
            fullPage: data.fullPage,
          }),
        );
      }
      case 'click': {
        const clickTarget =
          typeof data.x === 'number' && typeof data.y === 'number'
            ? { x: data.x, y: data.y }
            : (data.target ?? data.selector ?? '');
        if (typeof clickTarget === 'string' && !clickTarget) {
          return NextResponse.json(
            { ok: false, error: 'Provide `target`, `selector`, or `(x, y)` for click.' },
            { status: 400 },
          );
        }
        return NextResponse.json(await browserClick(chatId, clickTarget));
      }
      case 'fill': {
        const selector = data.selector ?? data.target ?? '';
        const value = data.value ?? data.text ?? '';
        if (!selector) {
          return NextResponse.json(
            { ok: false, error: 'Provide `selector` or `target` for fill.' },
            { status: 400 },
          );
        }
        return NextResponse.json(await browserFill(chatId, selector, value));
      }
      case 'type': {
        return NextResponse.json(
          await browserType(chatId, data.text ?? data.value ?? '', data.selector),
        );
      }
      case 'press': {
        return NextResponse.json(await browserPress(chatId, data.key ?? 'Enter'));
      }
      case 'scroll': {
        return NextResponse.json(
          await browserScroll(chatId, data.direction ?? 'down', data.amount ?? 480),
        );
      }
      case 'read': {
        return NextResponse.json(await browserRead(chatId, data.url));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser action failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
