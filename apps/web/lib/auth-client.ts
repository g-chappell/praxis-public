// Better Auth client — for use in client components (`'use client'`).
// Calls the server-side `/api/auth/*` routes mounted by `lib/auth.ts`.

import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // Same baseURL convention as the server: empty string = same-origin in
  // the browser, which is what we want in both dev (localhost:3000) and
  // prod (praxis.blacksail.dev).
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
