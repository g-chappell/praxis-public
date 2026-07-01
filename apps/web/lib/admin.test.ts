import { describe, expect, it } from 'vitest';

import { adminAccess } from './admin';

describe('adminAccess', () => {
  it('redirects unauthenticated users to sign in', () => {
    expect(adminAccess({ signedIn: false, isAdmin: false })).toBe('redirect-signin');
    // isAdmin is irrelevant when not signed in
    expect(adminAccess({ signedIn: false, isAdmin: true })).toBe('redirect-signin');
  });

  it('redirects signed-in non-admins to the dashboard', () => {
    expect(adminAccess({ signedIn: true, isAdmin: false })).toBe('redirect-dashboard');
  });

  it('allows signed-in admins', () => {
    expect(adminAccess({ signedIn: true, isAdmin: true })).toBe('allow');
  });
});
