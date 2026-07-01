// Helpers for the admin seed (scripts/seed-admins.ts). Kept separate from the
// runnable script so the parsing is unit-testable without a DB connection.

/**
 * Parse the `PRAXIS_ADMIN_EMAILS` env value into a clean list of admin emails.
 * Accepts comma- and/or whitespace-separated entries; trims, lowercases, drops
 * anything without an `@`, and de-duplicates. Returns `[]` for empty/unset input
 * (the seed then no-ops rather than failing).
 */
export function parseAdminEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s]+/)) {
    const email = part.trim().toLowerCase();
    if (email.includes('@')) seen.add(email);
  }
  return [...seen];
}
