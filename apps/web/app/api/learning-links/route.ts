// /api/learning-links — curated learning content for the workspace learning
// panel. The links are global (not project-scoped); returns the full set ordered
// by topic for grouping client-side.

import { NextResponse } from 'next/server';

import { learningLinks } from '@praxis/db';
import { db } from '@praxis/db/client';
import { asc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
