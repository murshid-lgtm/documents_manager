'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {notifyAction} from '../lib/actionFeedback';
import {AppearanceToggle} from './ThemeStudio';
import SharedWhatsAppWorkspace from './SharedWhatsAppWorkspace';
function ChatMark(){return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 1 1 18-4Z"/><path d="M8 10h8M8 14h5"/></svg>}
export function WhatsAppLoading(){return <main className="wa-app-loading" role="status"><span className="wa-app-symbol"><ChatMark/></span><h1>WhatsApp CRM</h1><p>Connecting your conversations…</p><progress aria-label="Opening WhatsApp workspace"/></main>}
export default function WhatsAppApplication({profile}){
 const [workspace,setWorkspace]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true;setError('');setWorkspace(null);const timeout=setTimeout(()=>{if(live){live=false;setError('The connection is taking too long. Please retry.')}},20000);
 (async()=>{
   let org=profile.organization_id;
   if(!org&&profile.is_platform_super_admin){try{org=localStorage.getItem('platform_selected_organization')}catch{}}
   if(!org)throw Error('Choose a company in the main workspace, then reopen WhatsApp CRM.');
   const [company,settings,access]=await Promise.all([
     supabase.from('organizations').select('id,name,slug,status,currency_code,timezone').eq('id',org).maybeSingle(),
     supabase.from('organization_settings').select('*').eq('organization_id',org).maybeSingle(),
     supabase.rpc('business_access',{target_org:org,target_branch:profile.branch_id,module_name:'crm'})
   ]);
   if(company.error||settings.error||access.error)throw Error('Your WhatsApp workspace could not be loaded. Check your connection and retry.');
   if(company.data?.status!=='Active'||!access.data)throw Error('WhatsApp CRM is not available for this account. Contact your administrator.');
   const customer=new URLSearchParams(window.location.search).get('customer');
   if(live){clearTimeout(timeout);setWorkspace({org,organization:company.data,brand:settings.data||{},customer:/^[a-f0-9-]{36}$/i.test(customer||'')?{id:customer}:null})};
 })().catch(e=>{if(live){clearTimeout(timeout);setError(e.message)}});
 return()=>{live=false;clearTimeout(timeout)};
 },[profile.id,profile.organization_id,retry]);
 if(error)return <main className="wa-app-loading"><span className="wa-app-symbol"><ChatMark/></span><h1>WhatsApp CRM</h1><p role="alert">{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button><a href="/">Open main workspace</a></main>;
 if(!workspace)return <WhatsAppLoading/>;
 function openRecord(type,id){if(!['customer','invoice','attestation','service'].includes(type)||!/^[a-f0-9-]{36}$/i.test(id||''))return;const url=new URL('/',location.origin);url.searchParams.set('record_type',type);url.searchParams.set('record_id',id);window.open(url.href,'_blank','noopener')}
 return <main className="wa-application" aria-label="WhatsApp CRM application"><aside className="wa-app-rail" aria-label="WhatsApp workspace"><span className="wa-app-symbol" title={workspace.brand.company_name||workspace.organization.name}><ChatMark/></span><span className="wa-app-rail-label">CRM</span><div className="wa-app-rail-bottom"><AppearanceToggle/><a href="/" target="_blank" rel="noopener" title="Open main workspace" aria-label="Open main workspace">↗</a><span className="wa-app-user" title={profile.full_name}>{(profile.full_name||'U').slice(0,2).toUpperCase()}</span></div></aside><section className="wa-app-content"><SharedWhatsAppWorkspace standalone orgId={workspace.org} profile={profile} brand={workspace.brand} organization={workspace.organization} initialCustomer={workspace.customer} notify={notifyAction} onOpen={openRecord}/></section></main>
}
