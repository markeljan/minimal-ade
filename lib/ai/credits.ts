import { createHash } from 'node:crypto';
import {
  GatewayAccessPolicyDeniedError,
  GatewayAuthenticationError,
  GatewayError,
  GatewayForbiddenError,
} from '@ai-sdk/gateway';
import { APICallError } from 'ai';

const VERCEL_GATEWAY_CREDITS_URL = 'https://ai-gateway.vercel.sh/v1/credits';
const VERCEL_OAUTH_TOKEN_URL = 'https://api.vercel.com/login/oauth/token';

const CREDITS_CACHE_TTL_MS = 60_000;
const CREDITS_CACHE_MAX_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 5_000;

export interface VercelGatewayCreditsResult {
  ok: boolean;
  balance?: number;
  totalUsed?: number;
  status?: number;
  cached?: boolean;
  reason?: string;
}

export interface RefreshedVercelOAuthToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds when the refreshed access token expires. */
  expiresAt?: number;
  scope?: string;
}

interface CreditsCacheEntry {
  result: VercelGatewayCreditsResult;
  expiresAt: number;
}

const creditsCache = new Map<string, CreditsCacheEntry>();

function hashTokenCacheKey(token: string, teamIdOrSlug?: string): string {
  const hash = createHash('sha256');
  hash.update(token);
  if (teamIdOrSlug) {
    hash.update('\0');
    hash.update(teamIdOrSlug);
  }
  return hash.digest('hex');
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function setCreditsCache(cacheKey: string, result: VercelGatewayCreditsResult): void {
  const now = Date.now();
  if (creditsCache.size >= CREDITS_CACHE_MAX_ENTRIES) {
    for (const [key, entry] of creditsCache) {
      if (entry.expiresAt <= now) {
        creditsCache.delete(key);
      }
    }
    if (creditsCache.size >= CREDITS_CACHE_MAX_ENTRIES) {
      const oldestKey = creditsCache.keys().next().value;
      if (oldestKey) {
        creditsCache.delete(oldestKey);
      }
    }
  }

  creditsCache.set(cacheKey, {
    result,
    expiresAt: now + CREDITS_CACHE_TTL_MS,
  });
}

/** Evict a cached credit lookup (e.g. immediately after a 401/402/403 billing failure). */
export function invalidateVercelGatewayCreditsCache(token: string, teamIdOrSlug?: string): void {
  const trimmed = token.trim();
  if (!trimmed) {
    return;
  }
  creditsCache.delete(hashTokenCacheKey(trimmed, teamIdOrSlug?.trim() || undefined));
}

/**
 * Verify a Vercel AI Gateway token (`vca_*` OAuth access token or `vck_*` API key)
 * against `GET https://ai-gateway.vercel.sh/v1/credits`.
 *
 * Results are cached for 60 seconds keyed strictly by the SHA-256 digest of the token.
 */
export async function checkVercelGatewayCredits(
  token: string,
  options?: { teamIdOrSlug?: string; bypassCache?: boolean },
): Promise<VercelGatewayCreditsResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, status: 401, reason: 'Missing gateway token' };
  }

  const teamIdOrSlug = options?.teamIdOrSlug?.trim() || undefined;
  const cacheKey = hashTokenCacheKey(trimmedToken, teamIdOrSlug);

  if (!options?.bypassCache) {
    const cached = creditsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cached: true };
    }
    if (cached) {
      creditsCache.delete(cacheKey);
    }
  }

  try {
    const url = new URL(VERCEL_GATEWAY_CREDITS_URL);
    if (teamIdOrSlug) {
      url.searchParams.set(teamIdOrSlug.startsWith('team_') ? 'teamId' : 'slug', teamIdOrSlug);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${trimmedToken}`,
      Accept: 'application/json',
    };
    if (teamIdOrSlug) {
      headers['x-vercel-ai-gateway-team'] = teamIdOrSlug;
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const reason =
        response.status === 401
          ? 'Vercel token unauthorized for AI Gateway'
          : response.status === 402
            ? 'Insufficient Vercel AI Gateway credits'
            : response.status === 403
              ? 'Vercel token lacks AI Gateway permission'
              : `AI Gateway credits check failed (HTTP ${response.status})`;

      const failedResult: VercelGatewayCreditsResult = {
        ok: false,
        status: response.status,
        reason,
      };
      setCreditsCache(cacheKey, failedResult);
      return failedResult;
    }

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const balance = parseFiniteNumber(data?.balance);
    const totalUsed = parseFiniteNumber(data?.total_used ?? data?.totalUsed);

    const okResult: VercelGatewayCreditsResult = {
      ok: true,
      balance,
      totalUsed,
      status: response.status,
    };
    setCreditsCache(cacheKey, okResult);
    return okResult;
  } catch {
    return {
      ok: false,
      reason: 'Unable to reach Vercel AI Gateway credits endpoint',
    };
  }
}

/**
 * Refresh a signed-in user's Vercel OAuth access token via
 * `POST https://api.vercel.com/login/oauth/token` when `VERCEL_CLIENT_ID`
 * and `VERCEL_CLIENT_SECRET` are configured.
 */
export async function refreshVercelOAuthToken(
  refreshToken: string,
): Promise<RefreshedVercelOAuthToken | null> {
  const clientId = process.env.VERCEL_CLIENT_ID?.trim();
  const clientSecret = process.env.VERCEL_CLIENT_SECRET?.trim();
  const trimmedRefreshToken = refreshToken.trim();

  if (!clientId || !clientSecret || !trimmedRefreshToken) {
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: trimmedRefreshToken,
    });

    const response = await fetch(VERCEL_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const accessToken =
      typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
    if (!accessToken) {
      return null;
    }

    const nextRefreshToken =
      typeof payload?.refresh_token === 'string' && payload.refresh_token.trim().length > 0
        ? payload.refresh_token.trim()
        : trimmedRefreshToken;

    const expiresInSeconds = parseFiniteNumber(payload?.expires_in);
    const expiresAt =
      expiresInSeconds !== undefined ? Date.now() + expiresInSeconds * 1_000 : undefined;

    const scope = typeof payload?.scope === 'string' ? payload.scope : undefined;

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresAt,
      scope,
    };
  } catch {
    return null;
  }
}

const BILLING_ERROR_PATTERNS = [
  /insufficient[_\s-]?credits?/i,
  /out\s+of\s+credits?/i,
  /no\s+credits?\s+(?:left|remaining|available)/i,
  /credit\s+balance/i,
  /payment\s+required/i,
  /billing\s+(?:limit|quota|required|inactive|error)/i,
  /invalid[_\s-]?(?:token|api[_\s-]?key|credentials?)/i,
  /(?:token|access[_\s-]?token)\s+(?:expired|revoked|invalid)/i,
  /expired[_\s-]?token/i,
  /authentication[_\s-]?(?:error|failed|required)/i,
  /access[_\s-]?policy[_\s-]?denied/i,
  /missing\s+(?:scope|permission)/i,
  /ai\s+gateway:\s*use/i,
  /\bunauthorized\b/i,
  /\bforbidden\b/i,
];

function extractNumericStatus(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['statusCode', 'status', 'httpStatus']) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function isUserTokenBillingErrorInternal(error: unknown, depth: number): boolean {
  if (!error || depth > 4) {
    return false;
  }

  if (
    error instanceof GatewayAuthenticationError ||
    error instanceof GatewayForbiddenError ||
    error instanceof GatewayAccessPolicyDeniedError
  ) {
    return true;
  }

  if (error instanceof GatewayError || error instanceof APICallError) {
    if (error.statusCode === 401 || error.statusCode === 402 || error.statusCode === 403) {
      return true;
    }
  }

  const status = extractNumericStatus(error);
  if (status === 401 || status === 402 || status === 403) {
    return true;
  }

  const texts: string[] = [];
  if (typeof error === 'string') {
    texts.push(error);
  } else if (error instanceof Error) {
    texts.push(error.name, error.message);
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['code', 'type', 'message', 'responseBody', 'error']) {
      const val = record[key];
      if (typeof val === 'string') {
        texts.push(val);
      }
    }
  }

  for (const text of texts) {
    if (BILLING_ERROR_PATTERNS.some((pattern) => pattern.test(text))) {
      return true;
    }
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (record.cause && isUserTokenBillingErrorInternal(record.cause, depth + 1)) {
      return true;
    }
    if (record.lastError && isUserTokenBillingErrorInternal(record.lastError, depth + 1)) {
      return true;
    }
    if (record.data && isUserTokenBillingErrorInternal(record.data, depth + 1)) {
      return true;
    }
    if (Array.isArray(record.errors)) {
      for (const nested of record.errors) {
        if (isUserTokenBillingErrorInternal(nested, depth + 1)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Detect HTTP `401` / `402` / `403`, invalid/expired user tokens, or insufficient
 * AI Gateway credit errors so callers can cleanly retry with `skipUserToken: true`
 * and fall back from Tier 2 to Tier 3+.
 */
export function isUserTokenBillingError(error: unknown): boolean {
  return isUserTokenBillingErrorInternal(error, 0);
}
