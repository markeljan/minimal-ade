'use client';

import { anonymousClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;

/** Initiates Sign in with Vercel OAuth flow (native or Vercel Connect). */
export async function signInWithVercel(callbackURL = '/') {
  return authClient.signIn.social({
    provider: 'vercel',
    callbackURL,
  });
}

/** Creates an instant Better Auth anonymous session with zero friction. */
export async function signInAsGuest() {
  return authClient.signIn.anonymous();
}
