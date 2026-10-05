import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getMyProfile, type AdminProfile } from '@/lib/admin';
import { can as canDo, isStaff, isSuperAdmin, type Permission } from '@/lib/permissions';

type Status = 'loading' | 'signed-out' | 'not-admin' | 'admin';
type Value = {
  status: Status; user: User | null; profile: AdminProfile | null; signOut: () => Promise<void>; recheck: () => void;
  /** UI hint only; the database enforces the same permission. */
  can: (p: Permission) => boolean;
  isSuper: boolean;
};
const SessionContext = createContext<Value | null>(null);

/**
 * Tracks the Supabase session and whether it belongs to an active admin.
 * This only decides which screens to show. The real enforcement is Row Level Security in the database.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const resolve = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) { setProfile(null); setStatus('signed-out'); return; }
    const p = await getMyProfile(u.id).catch(() => null);
    setProfile(p);
    setStatus(isStaff(p) ? 'admin' : 'not-admin');
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes don't change who is signed in; avoid re-querying the profile for them.
      if (event === 'TOKEN_REFRESHED') return;
      // Supabase advises not awaiting other Supabase calls inside this callback.
      setTimeout(() => resolve(session?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [resolve]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); }, []);
  const recheck = useCallback(() => { void supabase.auth.getUser().then(({ data }) => resolve(data.user)); }, [resolve]);
  const value = useMemo(() => ({
    status, user, profile, signOut, recheck,
    can: (perm: Permission) => canDo(profile, perm),
    isSuper: isSuperAdmin(profile),
  }), [status, user, profile, signOut, recheck]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
