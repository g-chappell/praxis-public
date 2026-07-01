'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';

type Provider = 'anthropic' | 'openai';

const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const PROVIDER_PLACEHOLDER: Record<Provider, string> = { anthropic: 'sk-ant-…', openai: 'sk-…' };

// Set / rotate / deactivate a platform API key for one provider. Posts to
// /api/admin/api-keys, which stores it encrypted and returns masked metadata
// only. On success we clear the field and refresh so the page re-reads the
// (masked) state.
export function ApiKeyForm({ provider, hasKey }: { provider: Provider; hasKey: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = PROVIDER_LABEL[provider];

  async function post(payload: Record<string, unknown>, confirmMessage?: string): Promise<void> {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, ...payload }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'request_failed');
        return;
      }
      setKey('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const rotateConfirm =
      provider === 'anthropic'
        ? `Rotate the ${label} key? New agent sessions will use the new key immediately.`
        : `Rotate the ${label} key?`;
    await post({ key }, hasKey ? rotateConfirm : undefined);
  }

  async function onDeactivate() {
    // Deactivating Anthropic halts ALL sessions — warn loudly. OpenAI just
    // disables image generation.
    const confirmMessage =
      provider === 'anthropic'
        ? 'Deactivate the Anthropic key? ALL agent sessions will stop working until a new key is set.'
        : 'Deactivate the OpenAI key? Image generation will be unavailable until a key is set.';
    await post({ action: 'deactivate' }, confirmMessage);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{hasKey ? 'Rotate key' : 'Set key'}</span>
        <input
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={PROVIDER_PLACEHOLDER[provider]}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border px-3 py-2 font-mono text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">Could not save key: {error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || key.trim().length === 0}>
          {pending ? 'Saving…' : hasKey ? 'Rotate' : 'Save'}
        </Button>
        {hasKey && (
          <Button type="button" variant="outline" disabled={pending} onClick={onDeactivate}>
            Deactivate
          </Button>
        )}
      </div>
    </form>
  );
}
