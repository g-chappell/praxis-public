// The single local operator. A local Praxis install has no authentication —
// every project and event is owned by this one seeded user. The id is a fixed
// UUID so the web app's getCurrentUser() shim, the seed script, and any FK all
// agree without a lookup.

export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_USER_EMAIL = 'you@localhost';
export const LOCAL_USER_NAME = 'You';
