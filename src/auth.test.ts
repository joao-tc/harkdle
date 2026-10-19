import { beforeEach, describe, expect, it } from 'vitest';
import { _resetMemory, challengeFor, generateVerifier, getAccessToken, isLoopbackHost, needsRefresh, SCOPES, type AuthDeps, type KeyValueStore } from './auth';

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('pkce', () => {
  it('matches the RFC 7636 appendix B challenge vector', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('generates url-safe verifiers of valid length', () => {
    const v = generateVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });
});

describe('scopes', () => {
  it('are exactly those of R1', () => {
    expect(SCOPES.split(' ').sort()).toEqual(
      ['streaming', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative'].sort(),
    );
  });
});

describe('isLoopbackHost', () => {
  it('accepts only 127.0.0.1', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(false);
  });
});

describe('refresh window', () => {
  const t = { accessToken: 'a', refreshToken: 'r', expiresAt: 100_000 };
  it('refreshes under 60s left', () => {
    expect(needsRefresh(t, 40_001)).toBe(true);
    expect(needsRefresh(t, 40_000)).toBe(false);
  });
});

describe('getAccessToken', () => {
  beforeEach(_resetMemory);
  const calls: string[] = [];
  function deps(now: { v: number }, store: KeyValueStore): AuthDeps {
    return {
      clientId: 'cid',
      redirectUri: 'http://127.0.0.1:5173/callback',
      store,
      now: () => now.v,
      fetchFn: async (_u, init) => {
        calls.push(init.body);
        return { ok: true, status: 200, json: async () => ({ access_token: 'new', expires_in: 3600 }) };
      },
    };
  }

  it('returns the stored token when fresh and refreshes (keeping the refresh token) when stale', async () => {
    calls.length = 0;
    const now = { v: 0 };
    const store = memStore();
    store.setItem('spike.tokens', JSON.stringify({ accessToken: 'old', refreshToken: 'r1', expiresAt: 120_000 }));
    const d = deps(now, store);
    expect(await getAccessToken(d)).toBe('old');
    expect(calls).toHaveLength(0);
    now.v = 100_000;
    expect(await getAccessToken(d)).toBe('new');
    expect(calls[0]).toContain('grant_type=refresh_token');
    expect(JSON.parse(store.getItem('spike.tokens')!).refreshToken).toBe('r1');
  });
  it('throws when not logged in', async () => {
    await expect(getAccessToken(deps({ v: 0 }, memStore()))).rejects.toThrow('not logged in');
  });
});
