import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { getAuth } from '@/lib/auth/auth';
import { getDbOrNull } from '@/lib/db/index';
import { account } from '@/lib/db/schema';
import { generateId } from '@/lib/utils';

export const GUEST_COOKIE_NAME = 'ade_guest_id';
export const GUEST_HEADER_NAME = 'x-ade-guest-id';

const VERCEL_PROVIDER_IDS = ['vercel', 'vercel-connect'] as const;
const GUEST_ID_PATTERN = /^guest_[A-Za-z0-9_-]{8,40}$/;

export interface VercelAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Token expiration time in epoch milliseconds. */
  expiresAt?: number;
  scope?: string;
  providerId?: string;
}

export interface ServerSession {
  userId: string;
  email?: string;
  name?: string;
  image?: string;
  isGuest: boolean;
  isAuthenticated: boolean;
  vercelAuth?: VercelAuthTokens;
}

export interface UpdateVercelTokensInput {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds or Date object. */
  expiresAt?: number | Date;
  providerId?: string;
}

function getGuestSigningSecret(): string | null {
  return process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

function computeGuestSignature(guestId: string, secret: string): string {
  return createHmac('sha256', secret).update(guestId).digest('hex').slice(0, 24);
}

/** Signs a guest ID with HMAC-SHA256 when a server secret is configured. */
export function signGuestCookieValue(guestId: string): string {
  const secret = getGuestSigningSecret();
  if (!secret) {
    return guestId;
  }
  return `${guestId}.${computeGuestSignature(guestId, secret)}`;
}

/** Extracts and validates a guest ID from a cookie or header token. */
export function parseGuestCookieValue(rawValue: string | null | undefined): string | null {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx === -1) {
    return !getGuestSigningSecret() && GUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
  }

  const guestId = trimmed.slice(0, dotIdx);
  const signature = trimmed.slice(dotIdx + 1);
  if (!GUEST_ID_PATTERN.test(guestId)) {
    return null;
  }

  const secret = getGuestSigningSecret();
  if (!secret) {
    return guestId;
  }

  const expected = computeGuestSignature(guestId, secret);
  if (signature.length !== expected.length) {
    return null;
  }

  try {
    const valid = timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
    return valid ? guestId : null;
  } catch {
    return null;
  }
}

function parseCookieHeaderValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

/** Fetches the stored Sign in with Vercel OAuth tokens for a user (never logged). */
export async function getVercelTokensForUser(userId: string): Promise<VercelAuthTokens | null> {
  const db = getDbOrNull();
  if (!db) {
    return null;
  }

  try {
    const [row] = await db
      .select({
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        scope: account.scope,
        providerId: account.providerId,
      })
      .from(account)
      .where(and(eq(account.userId, userId), inArray(account.providerId, [...VERCEL_PROVIDER_IDS])))
      .orderBy(desc(account.updatedAt))
      .limit(1);

    if (!row?.accessToken) {
      return null;
    }

    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken ?? undefined,
      expiresAt: row.accessTokenExpiresAt ? row.accessTokenExpiresAt.getTime() : undefined,
      scope: row.scope ?? undefined,
      providerId: row.providerId,
    };
  } catch {
    return null;
  }
}

/**
 * Persists refreshed Sign in with Vercel OAuth tokens back to the `account` table.
 * Called by provider/billing logic after automatic token refresh.
 */
export async function updateVercelTokens(
  userId: string,
  tokens: UpdateVercelTokensInput,
): Promise<boolean> {
  const db = getDbOrNull();
  if (!db || !userId || !tokens.accessToken) {
    return false;
  }

  const expiresAtDate =
    tokens.expiresAt === undefined
      ? undefined
      : tokens.expiresAt instanceof Date
        ? tokens.expiresAt
        : new Date(tokens.expiresAt);

  const updates: Partial<typeof account.$inferInsert> = {
    accessToken: tokens.accessToken,
    updatedAt: new Date(),
  };

  if (tokens.refreshToken !== undefined) {
    updates.refreshToken = tokens.refreshToken;
  }
  if (expiresAtDate !== undefined && !Number.isNaN(expiresAtDate.getTime())) {
    updates.accessTokenExpiresAt = expiresAtDate;
  }

  try {
    const providerCondition = tokens.providerId
      ? eq(account.providerId, tokens.providerId)
      : inArray(account.providerId, [...VERCEL_PROVIDER_IDS]);

    const updated = await db
      .update(account)
      .set(updates)
      .where(and(eq(account.userId, userId), providerCondition))
      .returning({ id: account.id });

    return updated.length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolves the current server session from Better Auth (including Vercel OAuth tokens)
 * and falls back cleanly to a cookie-scoped guest ID (`ade_guest_id`) so zero requests
 * fail for first-time visitors or unconfigured auth databases.
 */
export async function getServerSession(requestHeaders?: Headers): Promise<ServerSession> {
  let resolvedHeaders: Headers | null = requestHeaders ?? null;
  if (!resolvedHeaders) {
    try {
      resolvedHeaders = await headers();
    } catch {
      resolvedHeaders = null;
    }
  }

  if (resolvedHeaders) {
    try {
      const auth = getAuth();
      const result = await auth.api.getSession({
        headers: resolvedHeaders,
      });

      if (result?.user?.id) {
        const userRecord = result.user as typeof result.user & {
          isAnonymous?: boolean | null;
        };
        const isGuest = Boolean(userRecord.isAnonymous);
        const vercelAuth = !isGuest
          ? ((await getVercelTokensForUser(result.user.id)) ?? undefined)
          : undefined;

        return {
          userId: result.user.id,
          email: isGuest ? undefined : (result.user.email ?? undefined),
          name: result.user.name ?? undefined,
          image: result.user.image ?? undefined,
          isGuest,
          isAuthenticated: !isGuest,
          ...(vercelAuth ? { vercelAuth } : {}),
        };
      }
    } catch {
      // Gracefully fall back to cookie-scoped guest session below.
    }
  }

  let guestId: string | null = null;

  if (resolvedHeaders) {
    guestId =
      parseGuestCookieValue(
        parseCookieHeaderValue(resolvedHeaders.get('cookie'), GUEST_COOKIE_NAME),
      ) ?? parseGuestCookieValue(resolvedHeaders.get(GUEST_HEADER_NAME));
  }

  if (!guestId) {
    try {
      const cookieStore = await cookies();
      guestId = parseGuestCookieValue(cookieStore.get(GUEST_COOKIE_NAME)?.value);
    } catch {
      // Outside a request context; generate an ephemeral guest ID below.
    }
  }

  return {
    userId: guestId ?? generateId('guest', 16),
    name: 'Guest',
    isGuest: true,
    isAuthenticated: false,
  };
}
