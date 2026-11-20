import { type NextRequest, NextResponse } from 'next/server';

const GUEST_COOKIE_NAME = 'ade_guest_id';
const GUEST_HEADER_NAME = 'x-ade-guest-id';
const GUEST_ID_PATTERN = /^guest_[A-Za-z0-9_-]{8,40}$/;
const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function hmacSignHex(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const bytes = new Uint8Array(signature);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex.slice(0, 24);
}

async function isValidGuestCookie(
  rawValue: string | undefined,
  secret: string | null,
): Promise<boolean> {
  if (!rawValue) {
    return false;
  }
  const trimmed = rawValue.trim();
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx === -1) {
    return process.env.NODE_ENV !== 'production' && !secret && GUEST_ID_PATTERN.test(trimmed);
  }
  const guestId = trimmed.slice(0, dotIdx);
  const sig = trimmed.slice(dotIdx + 1);
  if (!GUEST_ID_PATTERN.test(guestId)) {
    return false;
  }
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const expected = await hmacSignHex(guestId, secret);
  return sig.length === expected.length && sig === expected;
}

function createGuestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let token = '';
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length];
  }
  return `guest_${token}`;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET (or AUTH_SECRET) must be configured in production.');
  }
  const existingCookie = request.cookies.get(GUEST_COOKIE_NAME)?.value;

  if (await isValidGuestCookie(existingCookie, secret)) {
    if (request.headers.has(GUEST_HEADER_NAME)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.delete(GUEST_HEADER_NAME);
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
    return NextResponse.next();
  }

  const guestId = createGuestId();
  const cookieValue = secret ? `${guestId}.${await hmacSignHex(guestId, secret)}` : guestId;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(GUEST_HEADER_NAME, cookieValue);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.cookies.set(GUEST_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|\\.well-known/workflow|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|css|js|map)$).*)',
  ],
};
