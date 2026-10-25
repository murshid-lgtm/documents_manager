'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import {beginAction} from '../lib/actionFeedback';
import {userError} from '../lib/userError';
import {LOADER_ANIMATIONS,loaderAnimation,loaderLayout} from '../lib/loaderAnimations';
import {useWorkspaceBranding} from './WorkspaceBranding';
import WorkspaceLoader from './WorkspaceLoader';
import DialogPortal from './DialogPortal';
import Icon from './AppIcon';

export default function LoaderStudio({organizationId,brand,onBrandChange,notify}){
 const [chosen,setChosen]=useState(()=>loaderAnimation(brand?.loader_animation)),[busy,setBusy]=useState(false),[full,setFull]=useState(false),[device,setDevice]=useState('mobile'),[replay,setReplay]=useState(0);const lock=useRef(false);const {updateBrand}=useWorkspaceBranding();
 useEffect(()=>{setChosen(loaderAnimation(brand?.loader_animation))},[organizationId,brand?.loader_animation]);
 const [layout,setLayout]=useState(()=>loaderLayout(brand));
 useEffect(()=>{setLayout(loaderLayout(brand))},[organizationId,brand?.loader_logo_size,brand?.loader_name_size,brand?.loader_name_gap,brand?.loader_name_position,brand?.loader_name_alignment]);
 const previewBrand={...brand,...layout},unchanged=chosen===loaderAnimation(brand?.loader_animation)&&JSON.stringify(layout)===JSON.stringify(loaderLayout(brand));
 const selected=LOADER_ANIMATIONS.find(a=>a.id===chosen);
 async function save(){if(lock.current||!organizationId)return;lock.current=true;setBusy(true);const end=beginAction();try{
  const {data,error}=await supabase.from('organization_settings').update({loader_animation:chosen,...layout,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).select('*').single();if(error)throw error;if(!data)throw new Error('The loading experience could not be saved.');onBrandChange?.(data);
  // Platform owners can edit another company's studio; never cache that company's identity on the platform host.
  if(!brand?.primary_domain||brand.primary_domain.toLowerCase()===location.hostname.toLowerCase())updateBrand(data);
  notify('Loading animation saved.');
 }catch(error){notify(userError(error))}finally{lock.current=false;setBusy(false);end()}}
 return <section className="loader-studio" aria-label="Loading animation settings" aria-busy={busy}>
  <header><div><span>FIRST IMPRESSIONS</span><h3>Loading experience</h3><p>Choose the motion that feels right for your brand.</p></div><b>12 styles</b></header>
  <div className="loader-studio-layout"><div className="loader-style-gallery" role="group" aria-label="Animation styles">{LOADER_ANIMATIONS.map((a,index)=><button type="button" key={a.id} aria-pressed={chosen===a.id} className={chosen===a.id?'selected':''} onClick={()=>{setChosen(a.id);setReplay(n=>n+1)}} disabled={busy}>
   <span className={`loader-swatch loader-fx fx-${a.id}`} aria-hidden="true"><span className="workspace-loader-energy"><i/><i/><i/><i/><i/></span><span className="loader-swatch-brand">{(brand?.short_name||brand?.company_name||'W').slice(0,1).toUpperCase()}</span></span><span><small>{String(index+1).padStart(2,'0')}</small><strong>{a.name}</strong></span>{chosen===a.id&&<Icon name="check" size={14}/>}</button>)}</div>
   <div className="loader-studio-preview"><div className="loader-preview-toolbar"><div role="group" aria-label="Preview size">{['mobile','desktop'].map(d=><button key={d} type="button" aria-pressed={device===d} onClick={()=>setDevice(d)}>{d==='mobile'?'Mobile':'Desktop'}</button>)}</div><button type="button" onClick={()=>setReplay(n=>n+1)} aria-label="Replay animation" title="Replay animation"><Icon name="refresh" size={16}/></button><button type="button" onClick={()=>setFull(true)} aria-label="Full screen preview" title="Full screen preview"><Icon name="expand" size={16}/></button></div>
    <div className={'loader-studio-canvas '+device}><WorkspaceLoader key={replay} brand={previewBrand} animation={chosen} contained/></div><div className="loader-preview-caption"><strong>{selected.name}</strong><p>{selected.description}</p></div>
    <fieldset className="loader-layout-controls" disabled={busy}><legend>Logo & app name</legend>{[['loader_logo_size','Logo size',50,150,'%'],['loader_name_size','App name size',16,36,'px'],['loader_name_gap','Spacing',0,40,'px']].map(([key,label,min,max,unit])=><label key={key}><span>{label}<output>{layout[key]}{unit}</output></span><input type="range" min={min} max={max} value={layout[key]} onChange={e=>setLayout(x=>({...x,[key]:Number(e.target.value)}))}/></label>)}<label><span>App name position</span><select value={layout.loader_name_position} onChange={e=>setLayout(x=>({...x,loader_name_position:e.target.value}))}><option value="below">Below logo</option><option value="above">Above logo</option><option value="right">Beside logo</option><option value="hidden">Hide app name</option></select></label><label><span>App name alignment</span><select value={layout.loader_name_alignment} onChange={e=>setLayout(x=>({...x,loader_name_alignment:e.target.value}))}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label><button type="button" className="secondary" onClick={()=>setLayout(loaderLayout())}>Reset layout</button></fieldset>
   </div></div>
  <footer><span>{unchanged?'Current loading experience':`${selected.name} · unsaved preview`}</span><button type="button" className="primary" disabled={busy||unchanged} onClick={save}>{busy?'Saving…':'Save loading experience'}</button></footer>
  {full&&<DialogPortal><div className="loader-full-preview" role="dialog" aria-modal="true" aria-label={`${selected.name} animation preview`}><WorkspaceLoader brand={previewBrand} animation={chosen}/><button type="button" autoFocus onClick={()=>setFull(false)} aria-label="Close animation preview"><Icon name="close" size={20}/></button></div></DialogPortal>}
 </section>;
}
