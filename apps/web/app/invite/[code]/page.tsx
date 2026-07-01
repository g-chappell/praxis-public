// /invite/[code] — redeem a project invite (STORY-31/TASK-083). Public route
// (deliberately OUT of the middleware matcher) so a signed-out invitee can reach
// it. Signed-out → bounce to sign-in with a callback back here; signed-in → join
// the team and land in the shared project, or show a friendly error.

import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAuth } from '@/lib/auth';
import { type AcceptResult, acceptInvite } from '@/lib/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Join a project — Praxis',
};

export default async function InviteAcceptPage({ params }: { params: { code: string } }) {
  const code = params.code;
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (!session?.user) {
    // Return here after magic-link verification (SignInForm reads `next`).
    redirect(`/signin?next=${encodeURIComponent(`/invite/${code}`)}`);
  }

  const result = await acceptInvite(session.user.id, code);
  if (result.status === 'ok') {
    redirect(result.projectId ? `/projects/${result.projectId}` : '/dashboard');
  }

  return <InviteError reason={result.status} />;
}

const REASONS: Record<Exclude<AcceptResult['status'], 'ok'>, string> = {
  invalid: "This invite link isn't valid.",
  expired: 'This invite link has expired. Ask the project owner for a new one.',
  used: 'This invite link has already been used.',
  team_full: 'This team is full (a pair). Ask the owner to make room.',
};

function InviteError({ reason }: { reason: Exclude<AcceptResult['status'], 'ok'> }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Can&apos;t join this project</h1>
        <p data-testid="invite-error" className="text-sm text-muted-foreground">
          {REASONS[reason]}
        </p>
        <Link
          href="/dashboard"
          data-testid="invite-error-dashboard-link"
          className="inline-block text-sm font-medium text-foreground underline underline-offset-4"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
