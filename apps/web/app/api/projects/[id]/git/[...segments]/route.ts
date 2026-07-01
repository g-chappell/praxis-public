// Git data API proxy (STORY-16). The browser can't reach the orchestrator's
// internal-secret-gated git endpoints directly, so the Git panel calls these
// same-origin routes: we authenticate the user, verify project ownership, then
// forward to the orchestrator with x-internal-secret and pass its response
// through. Read ops (branch/log/status/diff) are GET; revert is POST.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { userOwnsProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GET_SUBPATHS = new Set(['branch', 'log', 'status', 'diff']);
const POST_SUBPATHS = new Set(['revert']);

type Params = { params: { id: string; segments: string[] } };

type Authorized = { ok: true; orchestratorUrl: string; internalSecret: string };
type AuthFailed = { ok: false; response: NextResponse };

/** Auth + ownership + orchestrator config, shared by both verbs. Returns either
 *  an early response to return, or the resolved orchestrator base + secret. */
async function authorize(projectId: string): Promise<Authorized | AuthFailed> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!(await userOwnsProject(session.user.id, projectId))) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!orchestratorUrl || !internalSecret) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 }),
    };
  }
  return { ok: true, orchestratorUrl, internalSecret };
}

/** Pass the orchestrator's status + JSON body straight through to the browser so
 *  the panel can react to 409 (no session) / 422 (git error) / 400 specifically. */
async function passthrough(res: Response | null): Promise<NextResponse> {
  if (!res) return NextResponse.json({ error: 'orchestrator_unreachable' }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(req: Request, { params }: Params): Promise<NextResponse> {
  const sub = params.segments?.[0];
  if (params.segments?.length !== 1 || !sub || !GET_SUBPATHS.has(sub)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const auth = await authorize(params.id);
  if (!auth.ok) return auth.response;

  const search = new URL(req.url).search; // forwards ?from=&to=&limit=
  const res = await fetch(
    `${auth.orchestratorUrl}/projects/${encodeURIComponent(params.id)}/git/${sub}${search}`,
    { headers: { 'x-internal-secret': auth.internalSecret } },
  ).catch(() => null);
  return passthrough(res);
}

export async function POST(req: Request, { params }: Params): Promise<NextResponse> {
  const sub = params.segments?.[0];
  if (params.segments?.length !== 1 || !sub || !POST_SUBPATHS.has(sub)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const auth = await authorize(params.id);
  if (!auth.ok) return auth.response;

  const body = await req.text(); // forward as-is (e.g. { "to": "<sha>" })
  const res = await fetch(
    `${auth.orchestratorUrl}/projects/${encodeURIComponent(params.id)}/git/${sub}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': auth.internalSecret },
      body,
    },
  ).catch(() => null);
  return passthrough(res);
}
