import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Stamp } from '@/components/ui/stamp';

export const metadata = {
  title: 'Check your email — Praxis',
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const safeEmail = email && /^[^<>]+$/.test(email) ? email : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="border-b-2 bg-foreground px-6 py-5 text-background">
          <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        </div>
        <div className="space-y-6 px-6 py-6 text-center">
          <div className="flex justify-center">
            <Stamp solid>Link sent</Stamp>
          </div>
          <p className="text-muted-foreground">
            {safeEmail ? (
              <>
                We sent a sign-in link to{' '}
                <span className="font-medium text-foreground">{safeEmail}</span>.
              </>
            ) : (
              <>We sent a sign-in link to your inbox.</>
            )}{' '}
            The link expires in 5 minutes.
          </p>
          <Button asChild className="w-full">
            <Link href="/dashboard">I clicked the link</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <Link href="/signin" className="underline">
              request a new link
            </Link>
            .
          </p>
        </div>
      </Card>
    </main>
  );
}
