'use client';
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import Login from '../components/Login';
import AppShell from '../components/AppShell';

export default function Home() {
  const [session, setSession] = useState(undefined);
  const [passwordRecovery,setPasswordRecovery]=useState(false);

  useEffect(() => {
    if(!isSupabaseConfigured){setSession(null);return}
    const setupLink=new URLSearchParams(window.location.search).get('mode');
    const callbackType=new URLSearchParams(window.location.hash.slice(1)).get('type');
    if(setupLink==='setup'||setupLink==='reset'||callbackType==='invite'||callbackType==='recovery')setPasswordRecovery(true);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {setSession(session);if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true)});
    return () => listener.subscription.unsubscribe();
  }, []);

  if(!isSupabaseConfigured)return <main className="auth-shell"><div className="auth-card"><div className="auth-copy"><h2>Connect your database</h2><p className="muted">This deployment is ready, but its Supabase environment variables have not been added.</p></div><div className="error-box"><b>Required in Vercel</b><br/>NEXT_PUBLIC_SUPABASE_URL<br/>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</div><p className="muted">Add them in Project Settings → Environment Variables, then redeploy.</p></div></main>;

  if (session === undefined) return <main className="auth-shell"><div className="auth-card"><p>Loading your workspace…</p></div></main>;
  if (passwordRecovery) return <Login resetMode onResetComplete={()=>{window.history.replaceState({},'',window.location.pathname);setPasswordRecovery(false)}} />;
  if (!session) return <Login />;
  return <AppShell session={session} />;
}
