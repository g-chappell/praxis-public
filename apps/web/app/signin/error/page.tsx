import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Sign-in link error — Praxis',
};

export default function SignInErrorPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Link expired</h1>
        <p className="text-muted-foreground">
          This sign-in link has expired or was already used. Request a new one to sign in.
        </p>
        <Button asChild>
          <Link href="/signin">Send a new link</Link>
        </Button>
      </div>
    </main>
  );
}
