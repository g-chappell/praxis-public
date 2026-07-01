'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    await authClient.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <Button onClick={handleClick} variant="outline" size="sm">
      Sign out
    </Button>
  );
}
