import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import posthog from 'posthog-js';

// Set when the user starts a sign-in. Google OAuth leaves the page, so this is
// stored in sessionStorage rather than a ref. Used so SIGNED_IN only counts as
// a login when the user actually signed in, not when a stored session restores.
const PENDING_LOGIN_KEY = 'pending_login_capture';

// Analytics must never block auth: storage can throw (private mode, blocked site data).
const pendingLogin = {
  set: () => { try { sessionStorage.setItem(PENDING_LOGIN_KEY, '1'); } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem(PENDING_LOGIN_KEY); } catch { /* ignore */ } },
  isSet: () => { try { return !!sessionStorage.getItem(PENDING_LOGIN_KEY); } catch { return false; } },
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Identify by Supabase id only (no email) on every known session, incl. restored ones.
        if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          posthog.identify(session.user.id);
          if (event === 'SIGNED_IN' && pendingLogin.isSet()) {
            pendingLogin.clear();
            posthog.capture('login_completed');
          }
        }

        // Covers every way a session ends (manual, expired, other tab), after Supabase confirms it.
        if (event === 'SIGNED_OUT') {
          pendingLogin.clear();
          posthog.reset();
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const getRedirectOrigin = () => {
    const origin = window.location.origin;
    if (origin.includes('lovable.app') || origin.includes('lovableproject.com')) {
      return 'https://actsolo.ai';
    }
    return origin;
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${getRedirectOrigin()}/manage-scripts`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    // Supabase returns success with no identities for an already-registered email.
    if (!error && data?.user?.identities?.length !== 0) posthog.capture('signup_completed', { method: 'email' });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    pendingLogin.set();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) pendingLogin.clear();
    return { error };
  };

  const signInWithGoogle = async () => {
    pendingLogin.set();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${getRedirectOrigin()}/manage-scripts`
      }
    });
    if (error) pendingLogin.clear();
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = 'https://actsolo.ai/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}