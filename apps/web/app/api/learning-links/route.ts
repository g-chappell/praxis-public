// /api/learning-links — curated learning content for the workspace learning panel
// (STORY-17). The links are global (not project-scoped), so this just requires a
// signed-in user and returns the full set ordered by topic for grouping client-side.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { learningLinks } from '@praxis/db';
import { db } from '@praxis/db/client';
import { asc } from 'drizzle-orm';

import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const links = await db
    .select({
      id: learningLinks.id,
      title: learningLinks.title,
      url: learningLinks.url,
      topic: learningLinks.topic,
      source: learningLinks.source,
    })
    .from(learningLinks)
    .orderBy(asc(learningLinks.topic), asc(learningLinks.title));
  return NextResponse.json({ links });
}
