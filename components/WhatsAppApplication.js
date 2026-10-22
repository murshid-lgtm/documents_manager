'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {notifyAction} from '../lib/actionFeedback';
import {AppearanceToggle} from './ThemeStudio';
import AppIcon from './AppIcon';
import AutomationCenter from './AutomationCenter';
import SharedWhatsAppWorkspace from './SharedWhatsAppWorkspace';
function ChatMark(){return <AppIcon name="whatsapp" size={25}/>}
export function WhatsAppLoading(){return <main className="wa-app-loading" role="status"><span className="wa-app-symbol"><ChatMark/></span><h1>WhatsApp CRM</h1><p>Connecting your conversations…</p><progress aria-label="Opening WhatsApp workspace"/></main>}
export default function WhatsAppApplication({profile}){
 const [workspace,setWorkspace]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[tab,setTab]=useState('inbox');
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
 return <main className="wa-application" aria-label="WhatsApp CRM application"><aside className="wa-app-rail" aria-label="WhatsApp workspace"><span className="wa-app-symbol" title={workspace.brand.company_name||workspace.organization.name}><ChatMark/></span><span className="wa-app-rail-label">CRM</span><button className="wa-app-inbox-button" aria-pressed={tab==='inbox'} onClick={()=>setTab('inbox')} title="Conversations" aria-label="Conversations"><AppIcon name="chat" size={23}/></button><button className="wa-app-inbox-button" aria-pressed={tab==='alerts'} onClick={()=>setTab('alerts')} title="Alerts & automation" aria-label="Alerts and automation"><AppIcon name="bell" size={21}/></button><div className="wa-app-rail-bottom"><AppearanceToggle/><a href="/" target="_blank" rel="noopener" title="Open main workspace" aria-label="Open main workspace"><AppIcon name="external" size={21}/></a><span className="wa-app-user" title={profile.full_name}>{(profile.full_name||'U').slice(0,2).toUpperCase()}</span></div></aside><section className="wa-app-content">{tab==='alerts'?<div className="wa-app-alerts"><AutomationCenter orgId={workspace.org} profile={profile} organization={workspace.organization} notify={notifyAction} onOpen={(type,id)=>type==='chat'?setTab('inbox'):openRecord(type,id)}/></div>:<SharedWhatsAppWorkspace standalone orgId={workspace.org} profile={profile} brand={workspace.brand} organization={workspace.organization} initialCustomer={workspace.customer} notify={notifyAction} onOpen={openRecord}/>}</section></main>
}
