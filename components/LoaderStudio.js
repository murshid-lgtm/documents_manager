'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {beginAction} from '../lib/actionFeedback';
import {userError} from '../lib/userError';
import {LOADER_ANIMATIONS,loaderAnimation} from '../lib/loaderAnimations';
import {useWorkspaceBranding} from './WorkspaceBranding';
import WorkspaceLoader from './WorkspaceLoader';
import DialogPortal from './DialogPortal';
import Icon from './AppIcon';

export default function LoaderStudio({organizationId,brand,onBrandChange,notify}){
 const [chosen,setChosen]=useState(()=>loaderAnimation(brand?.loader_animation)),[busy,setBusy]=useState(false),[full,setFull]=useState(false),[device,setDevice]=useState('mobile'),[replay,setReplay]=useState(0);const lock=useRef(false);const {updateBrand}=useWorkspaceBranding();
 useEffect(()=>{setChosen(loaderAnimation(brand?.loader_animation))},[organizationId,brand?.loader_animation]);
 const saved=loaderAnimation(brand?.loader_animation),selected=LOADER_ANIMATIONS.find(a=>a.id===chosen);
 async function save(){if(lock.current||!organizationId)return;lock.current=true;setBusy(true);const end=beginAction();try{
  const {data,error}=await supabase.from('organization_settings').update({loader_animation:chosen,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).select('*').single();if(error)throw error;if(!data)throw new Error('The animation could not be saved.');onBrandChange?.(data);
  // Platform owners can edit another company's studio; never cache that company's identity on the platform host.
  if(!brand?.primary_domain||brand.primary_domain.toLowerCase()===location.hostname.toLowerCase())updateBrand(data);
  notify('Loading animation saved.');
 }catch(error){notify(userError(error))}finally{lock.current=false;setBusy(false);end()}}
 return <section className="loader-studio" aria-label="Loading animation settings" aria-busy={busy}>
  <header><div><span>FIRST IMPRESSIONS</span><h3>Loading experience</h3><p>Choose the motion that feels right for your brand.</p></div><b>12 styles</b></header>
  <div className="loader-studio-layout"><div className="loader-style-gallery" role="group" aria-label="Animation styles">{LOADER_ANIMATIONS.map((a,index)=><button type="button" key={a.id} aria-pressed={chosen===a.id} className={chosen===a.id?'selected':''} onClick={()=>{setChosen(a.id);setReplay(n=>n+1)}} disabled={busy}>
   <span className={`loader-swatch loader-fx fx-${a.id}`} aria-hidden="true"><span className="workspace-loader-energy"><i/><i/><i/><i/><i/></span><span className="loader-swatch-brand">{(brand?.short_name||brand?.company_name||'W').slice(0,1).toUpperCase()}</span></span><span><small>{String(index+1).padStart(2,'0')}</small><strong>{a.name}</strong></span>{chosen===a.id&&<Icon name="check" size={14}/>}</button>)}</div>
   <div className="loader-studio-preview"><div className="loader-preview-toolbar"><div role="group" aria-label="Preview size">{['mobile','desktop'].map(d=><button key={d} type="button" aria-pressed={device===d} onClick={()=>setDevice(d)}>{d==='mobile'?'Mobile':'Desktop'}</button>)}</div><button type="button" onClick={()=>setReplay(n=>n+1)} aria-label="Replay animation" title="Replay animation"><Icon name="refresh" size={16}/></button><button type="button" onClick={()=>setFull(true)} aria-label="Full screen preview" title="Full screen preview"><Icon name="expand" size={16}/></button></div>
    <div className={'loader-studio-canvas '+device}><WorkspaceLoader key={replay} brand={brand} animation={chosen} contained/></div><div className="loader-preview-caption"><strong>{selected.name}</strong><p>{selected.description}</p></div>
   </div></div>
  <footer><span>{chosen===saved?'Current animation':`${selected.name} · unsaved preview`}</span><button type="button" className="primary" disabled={busy||chosen===saved} onClick={save}>{busy?'Saving…':'Use this animation'}</button></footer>
  {full&&<DialogPortal><div className="loader-full-preview" role="dialog" aria-modal="true" aria-label={`${selected.name} animation preview`}><WorkspaceLoader brand={brand} animation={chosen}/><button type="button" autoFocus onClick={()=>setFull(false)} aria-label="Close animation preview"><Icon name="close" size={20}/></button></div></DialogPortal>}
 </section>;
}
