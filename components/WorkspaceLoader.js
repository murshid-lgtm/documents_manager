'use client';
import {useWorkspaceBranding} from './WorkspaceBranding';
import {useState} from 'react';
import {loaderAnimation} from '../lib/loaderAnimations';
export default function WorkspaceLoader({name,initial,brand:providedBrand,animation,contained=false,message='Opening your workspace…'}){
 const {brand:publicBrand}=useWorkspaceBranding(),brand=providedBrand||publicBrand;
 const [failedLogo,setFailedLogo]=useState(null);
 const title=name||brand?.product_name||brand?.company_name||'Your workspace',mark=initial||(brand?.short_name||brand?.company_name||'').slice(0,1).toUpperCase(),logo=brand?.logo_url||brand?.app_icon_url;
 const color=(value,fallback)=>/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value||'')?value:fallback;
 const colors={'--loader-accent':color(brand?.primary_color,'#3578ed'),'--loader-secondary':color(brand?.secondary_color,'#a855f7'),'--loader-highlight':color(brand?.accent_color,'#22d3bd')};
 return <div className={`workspace-loader loader-fx fx-${loaderAnimation(animation||brand?.loader_animation)} ${contained?'is-contained':''}`} style={colors} role="status" aria-live="polite" aria-label={message}>
  <div className="workspace-loader-ambient" aria-hidden="true"><i/><i/></div>
  <div className="workspace-loader-identity">
   <div className="workspace-loader-emblem" aria-hidden="true"><div className="workspace-loader-energy"><i/><i/><i/><i/><i/></div><div className={'workspace-loader-mark '+(logo&&failedLogo!==logo?'has-logo':'')}>{logo&&failedLogo!==logo?<img src={logo} alt="" decoding="async" onError={()=>setFailedLogo(logo)}/>:mark?<span>{mark}</span>:<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="5" width="16" height="21" rx="4"/><path d="M6 10v14a5 5 0 0 0 5 5h10M13 11h8M13 16h8M13 21h5"/></svg>}<i className="workspace-loader-reveal"/></div></div>
   <strong>{title}</strong>
  </div>
  <div className="workspace-loader-caption"><div className="workspace-loader-dots" aria-hidden="true"><i/><i/><i/></div><p>{message}</p></div>
 </div>;
}
