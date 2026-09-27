'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Login from '../components/Login';
import AppShell from '../components/AppShell';

export default function Home() {
  const [session, setSession] = useState(undefined);
  const [passwordRecovery,setPasswordRecovery]=useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {setSession(session);if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true)});
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <main className="auth-shell"><div className="auth-card"><p>Loading your workspace…</p></div></main>;
  if (passwordRecovery) return <Login resetMode onResetComplete={()=>setPasswordRecovery(false)} />;
  if (!session) return <Login />;
  return <AppShell session={session} />;
}
