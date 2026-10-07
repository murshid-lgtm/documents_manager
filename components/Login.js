'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../lib/supabase';
import { userError } from '../lib/userError';

export default function Login({resetMode=false,onResetComplete,initialNotice=''}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode,setMode]=useState(resetMode?'reset':'signin');
  const [notice,setNotice]=useState(initialNotice);
  const [brand,setBrand]=useState(null);
  useEffect(()=>{let live=true;(async()=>{const host=window.location.host;const slug=process.env.NEXT_PUBLIC_ORGANIZATION_SLUG||null;const {data}=await supabase.rpc('public_branding',{request_host:host,requested_slug:slug});if(live&&data){setBrand(data);document.title=data.product_name||'Document Tracker';if(data.favicon_url){let link=document.querySelector("link[rel='icon']");if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link)}link.href=data.favicon_url}}})().catch(()=>{});return()=>{live=false}},[]);
  const company=brand?.company_name||'Your Organization',product=brand?.product_name||'Document Tracker',mark=(brand?.short_name||company||'D').slice(0,1).toUpperCase();

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('');
    try{
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw String(result.error||'Sign in could not be completed.');
      const {error}=await supabase.auth.setSession({access_token:result.session.access_token,refresh_token:result.session.refresh_token});
      if(error)throw error;
    }catch(error){setError(userError(error))}
    setLoading(false);
  }
  async function requestReset(e){
    e.preventDefault();setLoading(true);setError('');setNotice('');
    try{const response=await fetch('/api/auth/password-reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});const result=await response.json().catch(()=>({}));if(!response.ok)throw String(result.error||'Password reset could not be requested.');setNotice(result.message||'If an account exists for that email, a reset link has been sent.')}catch(error){setError(userError(error))}
    setLoading(false);
  }
  async function savePassword(e){
    e.preventDefault();setLoading(true);setError('');
    if(password.length<12){setError('Use at least 12 characters for your new password.');setLoading(false);return}
    const {error}=await supabase.auth.updateUser({password});
    if(error)setError(userError(error));else{setNotice('Password updated successfully.');setTimeout(()=>onResetComplete?.(),700)}
    setLoading(false);
  }

  const hasLogo=Boolean(brand?.logo_url),showLogo=hasLogo&&brand?.login_logo_visible!==false,showCardLogo=hasLogo&&brand?.login_card_logo_visible!==false;
  const themeColor=(value,legacy,fallback)=>!value||value.toLowerCase()===legacy?fallback:value;
  const brandStyle={'--login-primary':themeColor(brand?.primary_color,'#3265df','#1d7347'),'--login-secondary':themeColor(brand?.secondary_color,'#17879a','#0d3a23'),'--login-accent':themeColor(brand?.accent_color,'#15a37d','#83b57e'),'--login-surface':brand?.surface_color||'#f4f6f3','--login-logo-size':`${Number(brand?.login_logo_size||100)}%`,'--login-logo-align':brand?.login_logo_alignment||'left','--login-logo-background':brand?.login_logo_background||'#FFFFFF','--login-logo-radius':`${Number(brand?.login_logo_radius??14)}px`,'--login-logo-width':`${Number(brand?.login_logo_container_width||220)}px`,'--login-logo-height':`${Number(brand?.login_logo_container_height||72)}px`,'--login-card-logo-size':`${Number(brand?.login_card_logo_size||100)}%`,'--login-card-logo-align':brand?.login_card_logo_alignment||'left','--login-card-logo-background':brand?.login_card_logo_background||'#FFFFFF','--login-card-logo-radius':`${Number(brand?.login_card_logo_radius??14)}px`,'--login-card-logo-width':`${Number(brand?.login_card_logo_container_width||220)}px`,'--login-card-logo-height':`${Number(brand?.login_card_logo_container_height||64)}px`};
  const visualStyle=brand?.login_background_url?{backgroundImage:`linear-gradient(145deg,rgba(13,58,35,.94),rgba(29,115,71,.84)),url("${brand.login_background_url}")`}:undefined;
  return <main className="auth-shell auth-shell-v329 auth-forest" style={brandStyle}>
    <section className="auth-saas-panel" style={visualStyle}>
      {(!hasLogo||showLogo)&&<div className={`auth-saas-brand ${showLogo?'auth-logo-mode':''}`}>{showLogo?<div className="auth-logo-container"><img className="auth-company-logo" src={brand.logo_url} alt={`${company} logo`}/></div>:<><div className="brand-mark">{mark}</div><div><strong>{product}</strong><span>{company}</span></div></>}</div>}
      <div className="auth-saas-copy"><span className="auth-saas-kicker"><i></i> {brand?.login_kicker||'LIVE OPERATIONS WORKSPACE'}</span><h1>{brand?.login_title||<>Every document.<br/>Every stage.<br/><em>One clear view.</em></>}</h1><p>{brand?.login_subtitle||'Manage sales, service jobs and attestations with connected billing, payments and tracking.'}</p></div>
      <div className="auth-product-preview">
        <div className="auth-preview-top"><span><i></i><i></i><i></i></span><b>Everything connected</b><small>Your workspace</small></div>
        <div className="auth-workspace-types"><div><span>01</span><strong>Sales & billing</strong><small>Invoices, quotations and receipts</small></div><div><span>02</span><strong>Service jobs</strong><small>Required work, stages and results</small></div><div><span>03</span><strong>Attestations</strong><small>Documents, custody and delivery</small></div></div>
        <div className="auth-preview-flow"><span className="done">Receive</span><b></b><span className="done">Process</span><b></b><span>Deliver</span></div>
      </div>
      <div className="auth-feature-row"><span>✓ Branch-aware workflows</span><span>✓ Live custody tracking</span><span>✓ Secure role access</span></div>
    </section>
    <section className="auth-login-zone"><div className="auth-card auth-card-v329">
      {(!hasLogo||showCardLogo)&&<div className={`auth-mobile-brand auth-card-brand ${showCardLogo?'auth-logo-mode':''}`}>{showCardLogo?<div className="auth-logo-container"><img className="auth-company-logo" src={brand.logo_url} alt={`${company} logo`}/></div>:<><div className="brand-mark">{mark}</div><div><strong>{product}</strong><span>{company}</span></div></>}</div>}
      <div className="auth-security-chip"><span></span> Secure operations workspace</div>
      <div className="auth-copy"><h2>{mode==='reset'?'Create new password':mode==='forgot'?'Reset password':brand?.login_welcome_title||'Welcome back'}</h2><p className="muted">{mode==='reset'?'Enter a secure new password for your account.':mode==='forgot'?'We will send a secure reset link to your work email.':brand?.login_welcome_subtitle||'Sign in to continue to your operations dashboard.'}</p></div>
      {mode==='signin'&&<form onSubmit={submit} className="stack">
        {notice&&<div className="auth-success" role="status">{notice}</div>}
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" autoComplete="username" required autoFocus /></label>
        <label><span className="auth-label-row">Password<button type="button" onClick={()=>{setMode('forgot');setError('');setNotice('')}}>Forgot password?</button></span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required /></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary large" disabled={loading}>{loading?'Signing in…':brand?.login_button_text||'Sign in to workspace'}<span aria-hidden="true">→</span></button>
      </form>}
      {mode==='forgot'&&<form onSubmit={requestReset} className="stack">
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" autoComplete="email" required autoFocus /></label>
        {error&&<div className="error-box">{error}</div>}{notice&&<div className="auth-success">{notice}</div>}
        <button className="primary large" disabled={loading}>{loading?'Sending…':'Send reset link'}<span aria-hidden="true">→</span></button>
        <button type="button" className="auth-back-link" onClick={()=>{setMode('signin');setError('');setNotice('')}}>← Back to sign in</button>
      </form>}
      {mode==='reset'&&<form onSubmit={savePassword} className="stack">
        <label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 12 characters" minLength="12" autoComplete="new-password" required autoFocus /></label>
        {error&&<div className="error-box">{error}</div>}{notice&&<div className="auth-success">{notice}</div>}
        <button className="primary large" disabled={loading}>{loading?'Updating…':'Update password'}<span aria-hidden="true">→</span></button>
      </form>}
      <div className="auth-trust"><span>Encrypted session</span><i></i><span>Authorized staff only</span></div>
      <p className="auth-foot">{brand?.footer_text||`${company} · Operations Command Center`}</p>
    </div></section>
  </main>;
}
