'use client';
import {useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {beginAction} from '../lib/actionFeedback';
import {userError} from '../lib/userError';
import {useWorkspaceBranding} from './WorkspaceBranding';
import WorkspaceLoader from './WorkspaceLoader';
import Icon from './AppIcon';

const assets=[{kind:'logo',field:'logo_url',title:'Company logo',hint:'Transparent PNG recommended. Used in the loader and workspace.'},{kind:'app_icon',field:'app_icon_url',title:'App icon',hint:'Square image recommended. Used for the installed app.'}];
export default function ProfileBranding({organizationId,brand,onBrandChange,notify}){
 const [busy,setBusy]=useState('');const lock=useRef(false);const {updateBrand}=useWorkspaceBranding();
 function publish(next){onBrandChange?.(next);updateBrand(next)}
 async function change(asset,file){
  if(lock.current||!organizationId)return;
  if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)){notify('Choose a PNG, JPG or WebP image up to 5 MB.');return}
  lock.current=true;setBusy(asset.kind);const end=beginAction();
  try{
   if(file){
    const {data:{session},error}=await supabase.auth.getSession();if(error)throw error;if(!session)throw new Error('Sign in again to update your branding.');
    const form=new FormData();form.append('organization_id',organizationId);form.append('kind',asset.kind);form.append('file',file);
    const response=await fetch('/api/platform/branding-upload',{method:'POST',headers:{authorization:`Bearer ${session.access_token}`},body:form,signal:AbortSignal.timeout(60000)});
    const out=await response.json().catch(()=>({}));if(!response.ok||!out.settings)throw new Error(out.error||'The image could not be saved.');publish(out.settings);
   }else{
    const {data,error}=await supabase.from('organization_settings').update({[asset.field]:'',updated_at:new Date().toISOString()}).eq('organization_id',organizationId).select('*').single();if(error)throw error;if(!data)throw new Error('Company branding could not be updated.');publish(data);
   }
   notify(`${asset.title} ${file?'saved':'removed'}.`);
  }catch(error){notify(userError(error))}finally{lock.current=false;setBusy('');end()}
 }
 return <section className="profile-branding" aria-busy={Boolean(busy)}>
  <header><div><small>CLIENT IDENTITY</small><h2>Company branding</h2><p>Your logo, your app. Changes save automatically.</p></div></header>
  <div className="profile-branding-layout"><div className="profile-branding-assets">{assets.map(asset=><article key={asset.kind}>
   <div className={'profile-branding-thumb '+asset.kind}>{brand?.[asset.field]?<img src={brand[asset.field]} alt={asset.title}/>:<Icon name={asset.kind==='logo'?'file':'grid'} size={26}/>}</div>
   <div><h3>{asset.title}</h3><p>{asset.hint}</p><div className="profile-branding-buttons"><label className={busy?'is-disabled':''}><Icon name="upload" size={16}/>{busy===asset.kind?'Saving…':brand?.[asset.field]?'Replace image':'Upload image'}<input aria-label={`Upload ${asset.title.toLowerCase()}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)change(asset,file)}}/></label>{brand?.[asset.field]&&<button type="button" disabled={Boolean(busy)} onClick={()=>change(asset,null)}>Remove</button>}</div></div>
  </article>)}{busy&&<progress aria-label="Saving branding"/>}<small>PNG, JPG or WebP · up to 5 MB. Installed app icons may refresh after reopening or reinstalling the PWA.</small></div>
  <div className="profile-loader-preview"><span>LIVE SPLASH PREVIEW</span><div><WorkspaceLoader brand={brand} contained/></div></div></div>
 </section>;
}
