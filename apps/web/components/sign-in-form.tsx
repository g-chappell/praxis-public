'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stamp } from '@/components/ui/stamp';
import { authClient } from '@/lib/auth-client';
import { safeNextPath } from '@/lib/safe-redirect';

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to land after the magic link is verified — used by the invite flow to
  // return to /invite/<code>. Guarded against open redirects; defaults /dashboard.
  const callbackURL = safeNextPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      const { error: signInError } = await authClient.signIn.magicLink({
        email,
        callbackURL,
      });

      if (signInError) {
        setError(signInError.message ?? 'Sign in failed. Please try again.');
        return;
      }
      router.push(`/signin/check-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <label htmlFor="email" className="label-mono block">
        Email
      </label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending…' : 'Email me a link'}
      </Button>
      <div className="flex justify-center pt-1">
        <Stamp>No password needed</Stamp>
      </div>
    </form>
  );
}
