import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MODEL_CATALOG } from '@/lib/ai/models';
import {
  getProviderDiagnostics,
  type ProviderDiagnostics,
  type ProviderOverrideInput,
  type UserVercelAuth,
} from '@/lib/ai/provider';
import { getServerSession, type ServerSession, updateVercelTokens } from '@/lib/auth/session';
import type { BillingSource, BillingSourceInfo, ModelDefinition } from '@/lib/types';

export const dynamic = 'force-dynamic';

const overrideFieldsSchema = z.object({
  mode: z.enum(['auto', 'custom-openai-compatible', 'byok-gateway', 'byok-openai']).optional(),
  baseUrl: z.string().max(2048).optional(),
  apiKey: z.string().max(4096).optional(),
  model: z.string().max(256).optional(),
  customBaseUrl: z.string().max(2048).optional(),
  customApiKey: z.string().max(4096).optional(),
  customModel: z.string().max(256).optional(),
  byokApiKey: z.string().max(4096).optional(),
  teamIdOrSlug: z.string().max(128).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const statusPostBodySchema = overrideFieldsSchema.extend({
  override: overrideFieldsSchema.optional(),
  providerOverride: overrideFieldsSchema.optional(),
});

export interface ProviderStatusResponse {
  models: readonly ModelDefinition[];
  defaultModelId: string;
  diagnostics: ProviderDiagnostics;
  activeBillingSource: BillingSource;
  activeBillingInfo: BillingSourceInfo;
  vercelOAuthConfigured: boolean;
  vercelConnectConfigured: boolean;
  hasOpenAIKey: boolean;
  hasGatewayKey: boolean;
  hasOidcToken: boolean;
  hasCustomEnv: boolean;
  user: {
    isAuthenticated: boolean;
    isGuest: boolean;
    hasVercelAuth: boolean;
  };
}

async function resolveSafeSession(requestHeaders: Headers): Promise<ServerSession | null> {
  try {
    return await getServerSession(requestHeaders);
  } catch {
    return null;
  }
}

function buildUserVercelAuth(session: ServerSession | null): UserVercelAuth | null {
  if (!session?.vercelAuth?.accessToken) {
    return null;
  }
  const { accessToken, refreshToken, expiresAt, providerId } = session.vercelAuth;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    providerId,
    onRefreshed: async (refreshed) => {
      await updateVercelTokens(session.userId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        providerId,
      });
    },
  };
}

async function buildStatusResponse(
  request: Request,
  override?: ProviderOverrideInput | null,
): Promise<NextResponse<ProviderStatusResponse>> {
  const session = await resolveSafeSession(request.headers);
  const userVercelAuth = buildUserVercelAuth(session);
  const diagnostics = await getProviderDiagnostics(userVercelAuth, override);

  const payload: ProviderStatusResponse = {
    models: MODEL_CATALOG,
    defaultModelId: diagnostics.defaultModelId,
    diagnostics,
    activeBillingSource: diagnostics.activeBillingSource,
    activeBillingInfo: diagnostics.activeBillingInfo,
    vercelOAuthConfigured: diagnostics.vercelOAuthConfigured,
    vercelConnectConfigured: diagnostics.vercelConnectConfigured,
    hasOpenAIKey: diagnostics.hasOpenAIKey,
    hasGatewayKey: diagnostics.hasGatewayKey,
    hasOidcToken: diagnostics.hasOidcToken,
    hasCustomEnv: diagnostics.hasCustomEnv,
    user: {
      isAuthenticated: Boolean(session?.isAuthenticated),
      isGuest: session ? session.isGuest : true,
      hasVercelAuth: Boolean(session?.vercelAuth?.accessToken),
    },
  };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export async function GET(request: Request): Promise<NextResponse<ProviderStatusResponse>> {
  return buildStatusResponse(request, null);
}

export async function POST(request: Request): Promise<NextResponse> {
  let rawBody: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      rawBody = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = statusPostBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid provider override payload' }, { status: 400 });
  }

  const data = parsed.data;
  const nested = data.override ?? data.providerOverride;
  const override: ProviderOverrideInput = {
    mode: nested?.mode ?? data.mode,
    baseUrl: nested?.baseUrl ?? data.baseUrl,
    apiKey: nested?.apiKey ?? data.apiKey,
    model: nested?.model ?? data.model,
    customBaseUrl: nested?.customBaseUrl ?? data.customBaseUrl,
    customApiKey: nested?.customApiKey ?? data.customApiKey,
    customModel: nested?.customModel ?? data.customModel,
    byokApiKey: nested?.byokApiKey ?? data.byokApiKey,
    teamIdOrSlug: nested?.teamIdOrSlug ?? data.teamIdOrSlug,
    headers: nested?.headers ?? data.headers,
  };

  return buildStatusResponse(request, override);
}
