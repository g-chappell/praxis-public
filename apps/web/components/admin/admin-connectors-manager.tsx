'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

// Admin MCP connector registry (STORY-50, ADR-0020): catalog CRUD + per-template
// enablement. Inlines the known command_refs / templates so this client bundle
// never imports lib/admin-connectors (which pulls the db client + crypto).

const KNOWN_COMMAND_REFS = ['image-gen'];
const KNOWN_TEMPLATES = ['react-threejs-scene', 'blank'];

interface TemplateEnablement {
  templateId: string;
  enabled: boolean;
  allowedCommands: string[] | null;
}
interface Connector {
  id: string;
  name: string;
  commandRef: string;
  usageCap: number | null;
  hasCredential: boolean;
  templates?: TemplateEnablement[];
}

export function AdminConnectorsManager() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [name, setName] = useState('');
  const [commandRef, setCommandRef] = useState(KNOWN_COMMAND_REFS[0]!);
  const [credential, setCredential] = useState('');
  const [cap, setCap] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setState('loading');
    try {
      const res = await fetch('/api/admin/connectors');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { connectors: Connector[] };
      setConnectors(data.connectors);
      setState('ready');
    } catch {
      setState('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    if (!name.trim()) {
      setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/connectors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          commandRef,
          credential: credential.trim() || undefined,
          usageCap: cap.trim() ? Number(cap) : undefined,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          b.error === 'name_taken'
            ? 'A connector with that name already exists.'
            : b.error === 'invalid_command_ref'
              ? 'Unknown command — bake the wrapper into sandbox-base first.'
              : 'Couldn’t add it. Try again.',
        );
        setBusy(false);
        return;
      }
      setName('');
      setCredential('');
      setCap('');
      await load();
    } catch {
      setError('Couldn’t add it. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/connectors/${id}`, { method: 'DELETE' });
    if (res.ok) setConnectors((prev) => prev.filter((c) => c.id !== id));
  }

  async function setTemplate(connectorId: string, templateId: string, enabled: boolean) {
    const res = await fetch(`/api/admin/connectors/${connectorId}/templates`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateId, enabled }),
    });
    if (res.ok) await load();
  }

  function isEnabled(c: Connector, templateId: string): boolean {
    return Boolean(c.templates?.find((t) => t.templateId === templateId)?.enabled);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Add connector
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Connector name"
              className="block w-44 rounded-md border px-3 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Command</span>
            <select
              value={commandRef}
              onChange={(e) => setCommandRef(e.target.value)}
              aria-label="Command ref"
              className="block rounded-md border px-2 py-1.5 text-sm"
            >
              {KNOWN_COMMAND_REFS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Credential</span>
            <input
              type="password"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              aria-label="Credential"
              placeholder="optional"
              className="block w-44 rounded-md border px-3 py-1.5 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Daily cap</span>
            <input
              type="number"
              min="0"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              aria-label="Usage cap"
              placeholder="none"
              className="block w-24 rounded-md border px-3 py-1.5 text-sm"
            />
          </label>
          <Button onClick={add} disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {state === 'error' ? (
        <p className="text-sm text-destructive">Couldn’t load connectors. Try again.</p>
      ) : state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : connectors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No connectors yet.</p>
      ) : (
        <ul className="space-y-3">
          {connectors.map((c) => (
            <li key={c.id} className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{c.name}</span>{' '}
                  <span className="text-xs text-muted-foreground">
                    {c.commandRef} · {c.hasCredential ? 'credential set' : 'no credential'}
                    {c.usageCap !== null ? ` · cap ${c.usageCap}/day` : ''}
                  </span>
                </span>
                <Button variant="outline" onClick={() => remove(c.id)}>
                  Remove
                </Button>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                {KNOWN_TEMPLATES.map((t) => (
                  <label key={t} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={isEnabled(c, t)}
                      onChange={(e) => setTemplate(c.id, t, e.target.checked)}
                      aria-label={`Enable ${c.name} for ${t}`}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
