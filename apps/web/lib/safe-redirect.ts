// Open-redirect guard for post-auth `next` targets (STORY-31). Only same-origin
// absolute paths are honoured; anything else (absolute URL, protocol-relative,
// backslash trick) falls back so `?next=https://evil.com` can't bounce a
// freshly-signed-in user off-site.

export function safeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback; // must be a root-relative path
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback; // protocol-relative
  return raw;
}
