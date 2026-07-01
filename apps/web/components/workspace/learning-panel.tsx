'use client';

import { useCallback, useEffect, useState } from 'react';

// Workspace learning panel (STORY-17): a collapsible section under the chat that
// surfaces the curated learning_links grouped by topic. Cards show title + source
// and open the external resource in a new tab. Links are fetched lazily the first
// time the panel is opened (mirrors the Git panel's on-demand fetch). Each item is
// checkable as "read"; the choice persists in localStorage and drives a read count.

export interface LearningLink {
  id: string;
  title: string;
  url: string;
  topic: string;
  source: string | null;
}

const READ_STORAGE_KEY = 'praxis-learning-read';

/** Group links by topic, preserving first-seen topic order (the API already
 *  orders by topic, so groups come out alphabetical). */
export function groupByTopic(links: LearningLink[]): [string, LearningLink[]][] {
  const groups = new Map<string, LearningLink[]>();
  for (const link of links) {
    const list = groups.get(link.topic);
    if (list) list.push(link);
    else groups.set(link.topic, [link]);
  }
  return [...groups.entries()];
}

/** Presentational topic-grouped list. Each card links out in a new tab and can be
 *  ticked as read (controlled via `read` + `onToggleRead` when provided). */
export function LearningLinksList({
  links,
  read,
  onToggleRead,
}: {
  links: LearningLink[];
  read?: Set<string>;
  onToggleRead?: (id: string) => void;
}) {
  if (links.length === 0) {
    return <p className="px-3 py-2 text-xs italic text-muted-foreground">No learning links yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      {groupByTopic(links).map(([topic, items]) => (
        <section key={topic}>
          <h3 className="label-mono mb-1">{topic}</h3>
          <ul className="flex flex-col gap-1">
            {items.map((link) => (
              <li key={link.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Mark “${link.title}” as read`}
                  checked={read?.has(link.id) ?? false}
                  onChange={() => onToggleRead?.(link.id)}
                  className="mt-1.5 size-3.5 shrink-0 accent-[hsl(var(--stamp))]"
                />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-1 py-1 text-sm text-foreground hover:bg-accent"
                >
                  {link.title}
                  {link.source && (
                    <span className="ml-1 text-xs text-muted-foreground">· {link.source}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function LearningPanel() {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LearningLink[] | null>(null);
  const [error, setError] = useState(false);
  const [read, setRead] = useState<Set<string>>(new Set());

  // Hydrate read-state from storage after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(READ_STORAGE_KEY);
      if (raw) setRead(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRead = useCallback((id: string) => {
    setRead((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Fetch once, the first time the panel is opened.
  useEffect(() => {
    if (!open || links !== null) return;
    let active = true;
    fetch('/api/learning-links')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { links: LearningLink[] }) => {
        if (active) setLinks(data.links);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [open, links]);

  const total = links?.length ?? 0;
  const readCount = links ? links.filter((l) => read.has(l.id)).length : 0;

  return (
    <div className="border-t-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="label-mono flex w-full items-center justify-between px-3 py-2.5 hover:bg-accent"
      >
        <span>Learn · Suggested reading</span>
        <span className="flex items-center gap-2">
          {total > 0 && (
            <span className="font-mono normal-case tracking-normal text-muted-foreground">
              {readCount}/{total} read
            </span>
          )}
          <span aria-hidden>{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto">
          {error ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Couldn’t load learning links.</p>
          ) : links === null ? (
            <p className="px-3 py-2 text-xs italic text-muted-foreground">Loading…</p>
          ) : (
            <LearningLinksList links={links} read={read} onToggleRead={toggleRead} />
          )}
        </div>
      )}
    </div>
  );
}
