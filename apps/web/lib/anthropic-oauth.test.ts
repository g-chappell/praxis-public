import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAuthorizeUrl,
  createPkce,
  createState,
  exchangeCode,
  getRedirectUri,
  parsePastedCode,
  refreshTokens,
} from './anthropic-oauth';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

beforeEach(() => {
  process.env.BETTER_AUTH_URL = 'https://example.test';
  delete process.env.ANTHROPIC_OAUTH_CLIENT_ID;
  delete process.env.ANTHROPIC_OAUTH_REDIRECT_URI;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PKCE + state', () => {
  it('derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(base64url(createHash('sha256').update(verifier).digest()));
  });

  it('produces unique verifiers and states', () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier);
    expect(createState()).not.toBe(createState());
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes all required OAuth + PKCE params', () => {
    const url = new URL(buildAuthorizeUrl({ state: 'st8', challenge: 'chal' }));
    expect(url.origin + url.pathname).toBe('https://claude.ai/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('st8');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(getRedirectUri());
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('user:inference');
  });

  it('defaults the redirect URI to the Anthropic console callback', () => {
    expect(getRedirectUri()).toBe('https://console.anthropic.com/oauth/code/callback');
  });

  it('honors a configured redirect URI override', () => {
    process.env.ANTHROPIC_OAUTH_REDIRECT_URI = 'https://override.test/cb';
    expect(getRedirectUri()).toBe('https://override.test/cb');
  });
});

describe('parsePastedCode', () => {
  it('splits code#state', () => {
    expect(parsePastedCode('the-code#the-state')).toEqual({
      code: 'the-code',
      state: 'the-state',
    });
  });

  it('tolerates a bare code and surrounding whitespace', () => {
    expect(parsePastedCode('  just-a-code  ')).toEqual({ code: 'just-a-code', state: null });
  });

  it('extracts the code from an accidentally-pasted full URL', () => {
    expect(
      parsePastedCode('https://console.anthropic.com/oauth/code/callback?code=abc123'),
    ).toEqual({ code: 'abc123', state: null });
  });
});

describe('exchangeCode', () => {
  it('POSTs the code + verifier and parses tokens', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 }),
          { status: 200 },
        ),
      );

    const before = Date.now();
    const tokens = await exchangeCode({ code: 'the-code', verifier: 'the-verifier' });

    expect(tokens.accessToken).toBe('acc');
    expect(tokens.refreshToken).toBe('ref');
    expect(tokens.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3600 * 1000);

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init!.body));
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('the-code');
    expect(body.code_verifier).toBe('the-verifier');
    expect(body.redirect_uri).toBe('https://console.anthropic.com/oauth/code/callback');
  });

  it('echoes state in the token request when provided', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'acc', expires_in: 60 }), { status: 200 }),
      );
    await exchangeCode({ code: 'c', verifier: 'v', state: 'st8' });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body.state).toBe('st8');
  });

  it('throws when access_token is missing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: 'ref' }), { status: 200 }),
    );
    await expect(exchangeCode({ code: 'c', verifier: 'v' })).rejects.toThrow(/access_token/);
  });

  it('throws on a non-OK response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 400 }));
    await expect(exchangeCode({ code: 'c', verifier: 'v' })).rejects.toThrow(/exchange failed/);
  });
});

describe('refreshTokens', () => {
  it('keeps the prior refresh token when the response omits one', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'acc2', expires_in: 60 }), { status: 200 }),
    );
    const tokens = await refreshTokens('original-refresh');
    expect(tokens.accessToken).toBe('acc2');
    expect(tokens.refreshToken).toBe('original-refresh');
  });
});
