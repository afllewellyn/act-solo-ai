import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';

const auth = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: { identify: vi.fn(), capture: vi.fn(), reset: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        auth.listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session: null } }),
      signUp: auth.signUp,
      signInWithPassword: auth.signInWithPassword,
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      signOut: auth.signOut,
    },
  },
}));

import { AuthProvider, useAuth } from '@/hooks/useAuth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = { user: { id: 'user-uuid', email: 'a@b.com' } };

async function mountAuth() {
  let api: ReturnType<typeof useAuth> | null = null;
  const Probe = () => {
    api = useAuth();
    return null;
  };
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  return () => api!;
}

describe('useAuth PostHog tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    auth.signOut.mockResolvedValue({ error: null });
  });

  it('identifies by Supabase id only, never sending the email', async () => {
    await mountAuth();
    await act(async () => auth.listener!('INITIAL_SESSION', session));
    expect(posthog.identify).toHaveBeenCalledWith('user-uuid');
    expect(posthog.capture).not.toHaveBeenCalledWith('login_completed');
  });

  it('captures login_completed only for an actual sign-in, once', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    const get = await mountAuth();
    await act(async () => { await get().signIn('a@b.com', 'pw'); });
    await act(async () => auth.listener!('SIGNED_IN', session));
    expect(posthog.capture).toHaveBeenCalledWith('login_completed');
    await act(async () => auth.listener!('SIGNED_IN', session));
    expect(posthog.capture).toHaveBeenCalledTimes(1);
  });

  it('captures signup_completed only when sign-up succeeds', async () => {
    const get = await mountAuth();
    auth.signUp.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad' } });
    await act(async () => { await get().signUp('a@b.com', 'pw'); });
    expect(posthog.capture).not.toHaveBeenCalled();
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [] } }, error: null });
    await act(async () => { await get().signUp('a@b.com', 'pw'); });
    expect(posthog.capture).not.toHaveBeenCalled();
    auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [{}] } }, error: null });
    await act(async () => { await get().signUp('a@b.com', 'pw'); });
    expect(posthog.capture).toHaveBeenCalledWith('signup_completed', { method: 'email' });
  });

  it('resets PostHog when the session ends, not before Supabase confirms', async () => {
    const get = await mountAuth();
    // signOut ends by assigning window.location.href; jsdom logs that navigation as not implemented
    await act(async () => { await get().signOut(); });
    expect(auth.signOut).toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
    await act(async () => auth.listener!('SIGNED_OUT', null));
    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });
});
