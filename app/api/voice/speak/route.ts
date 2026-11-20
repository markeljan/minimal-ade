import { metric } from '@vercel/functions';
import { generateSpeech } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidateVercelGatewayCreditsCache, isUserTokenBillingError } from '@/lib/ai/credits';
import {
  ProviderCapabilityError,
  ProviderNotConfiguredError,
  type ProviderOverrideInput,
  resolveSpeechModel,
  type UserVercelAuth,
} from '@/lib/ai/provider';
import { getServerSession, updateVercelTokens } from '@/lib/auth/session';

export const maxDuration = 60;

const speakRequestSchema = z.object({
  text: z.string().trim().min(1).max(4_096),
  voice: z.string().trim().min(1).max(64).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
  modelId: z.string().trim().optional(),
  instructions: z.string().trim().max(500).optional(),
  providerOverride: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = speakRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid TTS request payload.', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { text, voice = 'alloy', speed, modelId, instructions, providerOverride } = parsed.data;
    const override = providerOverride as ProviderOverrideInput | undefined;

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

    const runSpeech = async (skipUserToken: boolean) => {
      const resolved = await resolveSpeechModel({
        modelId,
        override,
        userVercelAuth,
        skipUserToken,
      });

      const result = await generateSpeech({
        model: resolved.model,
        text,
        voice,
        outputFormat: 'mp3',
        ...(speed !== undefined ? { speed } : {}),
        ...(instructions ? { instructions } : {}),
      });

      return { resolved, result };
    };

    let output: Awaited<ReturnType<typeof runSpeech>>;
    try {
      output = await runSpeech(false);
    } catch (error) {
      if (userVercelAuth?.accessToken && isUserTokenBillingError(error)) {
        invalidateVercelGatewayCreditsCache(userVercelAuth.accessToken);
        output = await runSpeech(true);
      } else {
        throw error;
      }
    }

    try {
      metric('ade.voice.speak', 1, {
        billing_source: output.resolved.billingSource,
        outcome: 'ok',
      });
    } catch {
      // Best-effort telemetry.
    }

    const audioBuffer = Buffer.from(output.result.audio.uint8Array);
    const mediaType = output.result.audio.mediaType || 'audio/mpeg';

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': mediaType,
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
        'X-Ade-Billing-Source': output.resolved.billingSource,
        'X-Ade-Model-Id': output.resolved.modelId,
      },
    });
  } catch (error) {
    if (error instanceof ProviderCapabilityError || error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          fallback: 'browser-speech-synthesis',
        },
        { status: 501 },
      );
    }

    try {
      metric('ade.voice.speak', 1, { outcome: 'error' });
    } catch {
      // Best-effort telemetry.
    }

    const message = error instanceof Error ? error.message : 'Speech synthesis failed.';
    return NextResponse.json(
      { error: message, fallback: 'browser-speech-synthesis' },
      { status: 500 },
    );
  }
}
