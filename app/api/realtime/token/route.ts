import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { invalidateVercelGatewayCreditsCache, isUserTokenBillingError } from '@/lib/ai/credits';
import {
  type ProviderOverrideInput,
  resolveRealtimeTokenConfig,
  type UserVercelAuth,
} from '@/lib/ai/provider';
import { getServerSession, updateVercelTokens } from '@/lib/auth/session';

export const maxDuration = 30;

interface RealtimeTokenBody {
  modelId?: string;
  expiresAfterSeconds?: number;
  providerOverride?: ProviderOverrideInput;
}

/**
 * Mints a short-lived ephemeral Realtime Voice token via Vercel AI Gateway
 * (`gateway.experimental_realtime.getToken`) or direct OpenAI Realtime when
 * `OPENAI_API_KEY` is primary. Never exposes raw API keys or OAuth tokens.
 */
async function handleRealtimeTokenRequest(
  request: Request,
  body: RealtimeTokenBody = {},
): Promise<Response> {
  try {
    const session = await getServerSession(request.headers);
    const userVercelAuth: UserVercelAuth | undefined = session.vercelAuth
      ? {
          accessToken: session.vercelAuth.accessToken,
          refreshToken: session.vercelAuth.refreshToken,
          expiresAt: session.vercelAuth.expiresAt,
          providerId: session.vercelAuth.providerId,
          onRefreshed: async (tokens) => {
            await updateVercelTokens(session.userId, {
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
              providerId: session.vercelAuth?.providerId,
            });
          },
        }
      : undefined;

    const expiresAfterSeconds =
      typeof body.expiresAfterSeconds === 'number' &&
      Number.isFinite(body.expiresAfterSeconds) &&
      body.expiresAfterSeconds >= 30 &&
      body.expiresAfterSeconds <= 300
        ? Math.round(body.expiresAfterSeconds)
        : 120;

    const attemptMint = async (skipUserToken: boolean) => {
      const config = await resolveRealtimeTokenConfig({
        modelId: body.modelId,
        override: body.providerOverride,
        userVercelAuth,
        skipUserToken,
      });

      if (!config.supported || !config.mintToken) {
        return { config, minted: null };
      }

      const minted = await config.mintToken({ expiresAfterSeconds });
      return { config, minted };
    };

    let result: Awaited<ReturnType<typeof attemptMint>>;
    try {
      result = await attemptMint(false);
    } catch (error) {
      if (userVercelAuth?.accessToken && isUserTokenBillingError(error)) {
        invalidateVercelGatewayCreditsCache(userVercelAuth.accessToken);
        result = await attemptMint(true);
      } else {
        throw error;
      }
    }

    if (!result.minted) {
      return NextResponse.json(
        {
          supported: false,
          transport: result.config.transport,
          modelId: result.config.modelId,
          billingSource: result.config.billingSource,
          billingInfo: result.config.billingInfo,
          reason:
            result.config.reason ??
            'Realtime voice token minting is unavailable for the active provider.',
          fallback: 'web-speech',
        },
        { status: 501 },
      );
    }

    try {
      metric('ade.voice.realtime_token', 1, {
        transport: result.config.transport,
        billing_source: result.config.billingSource,
        outcome: 'ok',
      });
    } catch {
      // Best-effort telemetry.
    }

    return NextResponse.json(
      {
        supported: true,
        transport: result.config.transport,
        token: result.minted.token,
        url: result.minted.url,
        expiresAt: result.minted.expiresAt ?? null,
        modelId: result.config.modelId,
        billingSource: result.config.billingSource,
        billingInfo: result.config.billingInfo,
        fallbackReason: result.config.fallbackReason,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    try {
      metric('ade.voice.realtime_token', 1, { outcome: 'error' });
    } catch {
      // Best-effort telemetry.
    }

    const message = error instanceof Error ? error.message : 'Unable to mint realtime voice token.';
    return NextResponse.json(
      {
        supported: false,
        error: message,
        fallback: 'web-speech',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as RealtimeTokenBody;
  return handleRealtimeTokenRequest(request, body);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const modelId = url.searchParams.get('modelId') ?? undefined;
  return handleRealtimeTokenRequest(request, { modelId });
}
