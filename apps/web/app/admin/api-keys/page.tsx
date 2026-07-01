import { getActivePlatformKeyMeta } from '@praxis/keys';

import { ApiKeyForm } from '@/components/admin/api-key-form';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'API keys — Praxis Admin',
};

function formatWhen(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown';
}

export default async function AdminApiKeysPage() {
  // The admin layout already enforced access. Metadata only — never the raw key.
  const [anthropicMeta, openaiMeta] = await Promise.all([
    getActivePlatformKeyMeta('anthropic'),
    getActivePlatformKeyMeta('openai'),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <section className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Anthropic API key</h1>
          <p className="text-sm text-muted-foreground">
            The Anthropic API key that powers all agent sessions (ADR-0009). Stored encrypted; shown
            masked.
          </p>
        </div>

        {anthropicMeta ? (
          <div className="space-y-1 rounded-lg border p-4">
            <p className="font-mono text-sm">{anthropicMeta.maskedKey}</p>
            <p className="text-xs text-muted-foreground">
              Last set {formatWhen(anthropicMeta.lastRotatedAt)}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <p className="text-sm font-medium">No active key</p>
            <p className="text-sm text-muted-foreground">
              Agent sessions cannot run until a platform key is set.
            </p>
          </div>
        )}

        <ApiKeyForm provider="anthropic" hasKey={anthropicMeta !== null} />
      </section>

      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">OpenAI API key</h2>
          <p className="text-sm text-muted-foreground">
            Optional. Powers the image-generation MCP server (STORY-15) for textures. Sessions run
            without it — image generation is simply unavailable. Stored encrypted; shown masked.
          </p>
        </div>

        {openaiMeta ? (
          <div className="space-y-1 rounded-lg border p-4">
            <p className="font-mono text-sm">{openaiMeta.maskedKey}</p>
            <p className="text-xs text-muted-foreground">
              Last set {formatWhen(openaiMeta.lastRotatedAt)}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">No active key</p>
            <p className="text-sm text-muted-foreground">
              Image generation is unavailable until an OpenAI key is set.
            </p>
          </div>
        )}

        <ApiKeyForm provider="openai" hasKey={openaiMeta !== null} />
      </section>
    </div>
  );
}
