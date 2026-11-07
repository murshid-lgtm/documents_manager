'use client';
import {useWorkspaceBranding} from './WorkspaceBranding';
import {useState} from 'react';
import {loaderAnimation,loaderLayout} from '../lib/loaderAnimations';
export default function WorkspaceLoader({name,initial,brand:providedBrand,animation,contained=false,message='Opening your workspace…'}){
 const {brand:publicBrand}=useWorkspaceBranding(),brand=providedBrand||publicBrand;
 const [failedLogo,setFailedLogo]=useState(null);
 const [transparentLogo,setTransparentLogo]=useState(null);
 const style=loaderAnimation(animation||brand?.loader_animation);
 const signature=style==='signature';
 const title=name||brand?.product_name||brand?.company_name||'Your workspace',mark=initial||(brand?.short_name||brand?.company_name||'').slice(0,1).toUpperCase(),logo=brand?.logo_url||brand?.app_icon_url;
 const color=(value,fallback)=>/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value||'')?value:fallback;
 const layout=loaderLayout(brand),colors={'--loader-accent':color(brand?.primary_color,'#3578ed'),'--loader-secondary':color(brand?.secondary_color,'#a855f7'),'--loader-highlight':color(brand?.accent_color,'#22d3bd'),'--loader-logo-scale':layout.loader_logo_size/100,'--loader-name-size':layout.loader_name_size+'px','--loader-name-gap':layout.loader_name_gap+'px','--loader-name-align':layout.loader_name_alignment};
 function checkLogoTransparency(event){
  // Preserve opaque and unreadable logos. Turning the entire image white would
  // replace its detail with a solid rectangle.
  if(!signature)return;
  try{
   const canvas=document.createElement('canvas');
   canvas.width=canvas.height=24;
   const context=canvas.getContext('2d');
   context.drawImage(event.currentTarget,0,0,24,24);
   const pixels=context.getImageData(0,0,24,24).data;
   for(let index=3;index<pixels.length;index+=4){
    if(pixels[index]===0){setTransparentLogo(logo);break;}
   }
  }catch{/* The original image remains visible if pixels are unavailable. */}
 }
 return <div className={`workspace-loader loader-fx fx-${style} loader-name-${layout.loader_name_position} ${contained?'is-contained':''}`} style={colors} role="status" aria-live="polite" aria-label={message}>
  {signature&&<svg className="workspace-signature-lines" viewBox="0 0 480 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
   <path pathLength="1" d="M-38 291C77 307 122 194 208 189S361 261 515 117"/>
   <path pathLength="1" d="M-40 314C76 333 133 222 208 216S366 280 518 143"/>
   <path pathLength="1" d="M-38 338C74 362 148 249 222 242S383 294 518 172"/>
   <path pathLength="1" d="M-32 133C71 113 91 38 171 34S310 83 414-33"/>
  </svg>}
  <div className="workspace-loader-ambient" aria-hidden="true"><i/><i/></div>
  <div className="workspace-loader-identity">
   <div className="workspace-loader-emblem" aria-hidden="true">
    <div className="workspace-loader-energy"><i/><i/><i/><i/><i/></div>
    <div className={`workspace-loader-mark${logo&&failedLogo!==logo?' has-logo':''}`}>
     {logo&&failedLogo!==logo?<img
      src={logo}
      alt=""
      decoding="async"
      className={transparentLogo===logo?'signature-white-logo':undefined}
      onLoad={checkLogoTransparency}
      onError={()=>setFailedLogo(logo)}
     />:mark?<span>{mark}</span>:<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="9" y="5" width="16" height="21" rx="4"/>
      <path d="M6 10v14a5 5 0 0 0 5 5h10M13 11h8M13 16h8M13 21h5"/>
     </svg>}
     <i className="workspace-loader-reveal"/>
    </div>
   </div>
   <strong>{title}</strong>
  </div>
  <div className="workspace-loader-caption"><div className="workspace-loader-dots" aria-hidden="true"><i/><i/><i/></div><p>{message}</p></div>
 </div>;
}
