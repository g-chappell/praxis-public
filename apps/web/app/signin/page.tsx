import { Suspense } from 'react';

import { SignInForm } from '@/components/sign-in-form';
import { Card } from '@/components/ui/card';

export const metadata = {
  title: 'Sign in to Praxis',
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md overflow-hidden">
        {/* envelope-flap header */}
        <div className="relative border-b-2 bg-foreground px-6 py-5 text-background">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[120px] border-t-[26px] border-x-transparent border-t-background/15"
          />
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Praxis</h1>
          <p className="mt-1 text-sm opacity-80">We&apos;ll email you a one-time sign-in link.</p>
        </div>
        <div className="px-6 py-6">
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>
      </Card>
    </main>
  );
}
