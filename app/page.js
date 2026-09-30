'use client';
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import Login from '../components/Login';
import AppShell from '../components/AppShell';
import {verifyWorkspaceSession} from '../lib/workspaceSession';

export default function Home() {
  const [session, setSession] = useState(undefined);
  const [passwordRecovery,setPasswordRecovery]=useState(false);
  const [profile,setProfile]=useState(null);
  const [accountError,setAccountError]=useState('');
  const [loginNotice,setLoginNotice]=useState('');
  const [retry,setRetry]=useState(0);

  useEffect(() => {
    if(!isSupabaseConfigured){setSession(null);return}
    const setupLink=new URLSearchParams(window.location.search).get('mode');
    const callbackType=new URLSearchParams(window.location.hash.slice(1)).get('type');
    if(setupLink==='setup'||setupLink==='reset'||callbackType==='invite'||callbackType==='recovery')setPasswordRecovery(true);
    let alive=true,generation=0,timer;
    async function verify(){
      const run=++generation;
      try{
        const result=await verifyWorkspaceSession(supabase,async current=>{
          const response=await fetch('/api/auth/workspace',{headers:{authorization:`Bearer ${current.access_token}`},cache:'no-store'});
          const out=await response.json();
          if(response.ok)return {status:'ready'};
          if(out.code==='WRONG_PORTAL')return {status:'wrong-portal',message:out.error};
          if(response.status===401)return {status:'expired'};
          if(response.status===403)return {status:'blocked'};
          throw new Error('Workspace verification failed');
        });
        if(!alive||run!==generation)return;
        setAccountError('');
        if(result.status==='ready'){setProfile(result.profile);setSession(result.session);setLoginNotice('');return}
        setProfile(null);setSession(null);
        if(result.status==='expired'||result.status==='blocked'||result.status==='wrong-portal'){
          setLoginNotice(result.status==='wrong-portal'?result.message:result.status==='expired'?'Your session has ended. Please sign in again.':'This account cannot access a workspace. Contact your administrator.');
          await supabase.auth.signOut({scope:'local'});
        }
      }catch{
        if(alive&&run===generation){setSession(undefined);setProfile(null);setAccountError('Your account could not be verified. Check your connection and retry.');}
      }
    }
    function schedule(){clearTimeout(timer);timer=setTimeout(verify,0)}
    schedule();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Supabase calls must run after this callback releases the auth lock.
      if(event==='SIGNED_OUT'){++generation;setSession(null);setProfile(null);setAccountError('');return}
      if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true);
      if(nextSession)schedule();
    });
    function onVisible(){if(document.visibilityState==='visible')schedule()}
    document.addEventListener('visibilitychange',onVisible);
    return () => {alive=false;++generation;clearTimeout(timer);listener.subscription.unsubscribe();document.removeEventListener('visibilitychange',onVisible)};
  }, [retry]);

  if(!isSupabaseConfigured)return <main className="auth-shell"><div className="auth-card"><div className="auth-copy"><h2>Connect your database</h2><p className="muted">This deployment is ready, but its Supabase environment variables have not been added.</p></div><div className="error-box"><b>Required in Vercel</b><br/>NEXT_PUBLIC_SUPABASE_URL<br/>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</div><p className="muted">Add them in Project Settings → Environment Variables, then redeploy.</p></div></main>;

  if(accountError)return <main className="auth-shell"><div className="auth-card"><h2>Unable to open your workspace</h2><p role="alert">{accountError}</p><button className="primary" onClick={()=>{setAccountError('');setRetry(v=>v+1)}}>Retry</button><button onClick={()=>supabase.auth.signOut({scope:'local'})}>Back to sign in</button></div></main>;
  if (session === undefined) return <main className="auth-shell"><div className="auth-card"><p>Verifying your workspace…</p></div></main>;
  if (passwordRecovery) return <Login resetMode onResetComplete={()=>{window.history.replaceState({},'',window.location.pathname);setPasswordRecovery(false)}} />;
  if (!session) return <Login initialNotice={loginNotice} />;
  return <AppShell key={session.user.id} session={session} initialProfile={profile} />;
}
