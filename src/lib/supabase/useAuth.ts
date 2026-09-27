'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from './client';

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setEmail(data.session?.user?.email ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setToken(session?.access_token ?? null);
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(loginEmail: string, password: string) {
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email: loginEmail, password });
    return error?.message ?? null;
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
  }

  return { token, email, loading, signIn, signOut };
}
