import { metric } from '@vercel/functions';
import { transcribe } from 'ai';
import { NextResponse } from 'next/server';
import { invalidateVercelGatewayCreditsCache, isUserTokenBillingError } from '@/lib/ai/credits';
import {
  ProviderCapabilityError,
  ProviderNotConfiguredError,
  type ProviderOverrideInput,
  resolveTranscriptionModel,
  type UserVercelAuth,
} from '@/lib/ai/provider';
import { getServerSession, updateVercelTokens } from '@/lib/auth/session';

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

function parseOverrideFromHeader(request: Request): ProviderOverrideInput | undefined {
  const raw = request.headers.get('x-ade-provider-override');
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as ProviderOverrideInput;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();

  try {
    const contentType = request.headers.get('content-type') ?? '';
    let audioBytes: Uint8Array | null = null;
    let modelId: string | undefined;
    let override: ProviderOverrideInput | undefined = parseOverrideFromHeader(request);

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('audio') ?? formData.get('file');
      if (file instanceof Blob) {
        if (file.size === 0) {
          return NextResponse.json({ error: 'Audio file is empty.' }, { status: 400 });
        }
        if (file.size > MAX_AUDIO_BYTES) {
          return NextResponse.json({ error: 'Audio exceeds 25 MB limit.' }, { status: 413 });
        }
        audioBytes = new Uint8Array(await file.arrayBuffer());
      }
      const rawModel = formData.get('modelId');
      if (typeof rawModel === 'string' && rawModel.trim()) {
        modelId = rawModel.trim();
      }
      const rawOverride = formData.get('providerOverride');
      if (typeof rawOverride === 'string' && rawOverride.trim()) {
        try {
          override = JSON.parse(rawOverride) as ProviderOverrideInput;
        } catch {
          // Ignore malformed override JSON in multipart field.
        }
      }
    } else if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => ({}))) as {
        audioBase64?: string;
        modelId?: string;
        providerOverride?: ProviderOverrideInput;
      };
      if (typeof body.audioBase64 === 'string' && body.audioBase64.trim()) {
        const cleaned = body.audioBase64.replace(/^data:[^;]+;base64,/, '');
        const buf = Buffer.from(cleaned, 'base64');
        if (buf.byteLength > MAX_AUDIO_BYTES) {
          return NextResponse.json({ error: 'Audio exceeds 25 MB limit.' }, { status: 413 });
        }
        audioBytes = new Uint8Array(buf);
      }
      modelId = body.modelId;
      override = body.providerOverride ?? override;
    } else {
      const buf = new Uint8Array(await request.arrayBuffer());
      if (buf.byteLength > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Audio exceeds 25 MB limit.' }, { status: 413 });
      }
      if (buf.byteLength > 0) {
        audioBytes = buf;
      }
    }

    if (!audioBytes || audioBytes.byteLength === 0) {
      return NextResponse.json(
        { error: 'Missing audio payload. Send multipart field "audio" or JSON "audioBase64".' },
        { status: 400 },
      );
    }

    const session = await getServerSession(request.headers);
    const userVercelAuth: UserVercelAuth | undefined = session.vercelAuth
      ? {
          accessToken: session.vercelAuth.accessToken,
          refreshToken: session.vercelAuth.refreshToken,
          expiresAt: session.vercelAuth.expiresAt,
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

    const runTranscription = async (skipUserToken: boolean) => {
      const resolved = await resolveTranscriptionModel({
        modelId,
        override,
        userVercelAuth,
        skipUserToken,
      });

      const result = await transcribe({
        model: resolved.model,
        audio: audioBytes,
      });

      return { resolved, result };
    };

    let output: Awaited<ReturnType<typeof runTranscription>>;
    try {
      output = await runTranscription(false);
    } catch (error) {
      if (userVercelAuth?.accessToken && isUserTokenBillingError(error)) {
        invalidateVercelGatewayCreditsCache(userVercelAuth.accessToken);
        output = await runTranscription(true);
      } else {
        throw error;
      }
    }

    try {
      metric('ade.voice.transcribe', 1, {
        billing_source: output.resolved.billingSource,
        outcome: 'ok',
      });
    } catch {
      // Best-effort telemetry.
    }

    return NextResponse.json({
      text: output.result.text,
      language: output.result.language ?? null,
      durationInSeconds: output.result.durationInSeconds ?? null,
      segments: output.result.segments ?? [],
      modelId: output.resolved.modelId,
      billingSource: output.resolved.billingSource,
      billingInfo: output.resolved.billingInfo,
      latencyMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    if (error instanceof ProviderCapabilityError || error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          fallback: 'web-speech',
        },
        { status: 501 },
      );
    }

    try {
      metric('ade.voice.transcribe', 1, { outcome: 'error' });
    } catch {
      // Best-effort telemetry.
    }

    const message = error instanceof Error ? error.message : 'Transcription failed.';
    return NextResponse.json({ error: message, fallback: 'web-speech' }, { status: 500 });
  }
}
