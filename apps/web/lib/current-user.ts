// Single-user shim. A local Praxis install has no authentication — there is one
// operator, seeded as LOCAL_USER_ID (see @praxis/db). Every server-side handler
// that used to resolve a Better Auth session now calls getCurrentUser(); it
// always returns the local user. Kept async so a real auth backend can slot in
// later without touching call sites.

import { LOCAL_USER_EMAIL, LOCAL_USER_ID, LOCAL_USER_NAME } from '@praxis/db';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return { id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL, name: LOCAL_USER_NAME, image: null };
}
