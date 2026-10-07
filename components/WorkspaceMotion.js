'use client';
import {useEffect} from 'react';

// Animate the existing DOM so navigation never remounts a form or loses a draft.
export default function WorkspaceMotion({view}){
 useEffect(()=>{
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const page=document.querySelector('.workspace-page');
  const animation=page?.animate?.([{opacity:.55,transform:'translateX(16px)'},{opacity:1,transform:'translateX(0)'}],{duration:320,easing:'cubic-bezier(.22,1,.36,1)'});
  return()=>animation?.cancel();
 },[view]);
 useEffect(()=>{
  let pending=0;const animations=new Set();
  const clicked=e=>{
   const button=e.target.closest?.('button');
   const tabs=button?.closest('.business-tabs,.finance-tabs,.settings-tabs,.notification-tabs,.view-toggle,.tabs');
   if(!tabs||button.disabled||button.classList.contains('active')||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   cancelAnimationFrame(pending);
   pending=requestAnimationFrame(()=>{
    animations.forEach(a=>a.cancel());animations.clear();
    [...tabs.parentElement.children].filter(el=>el!==tabs&&!el.matches('header,nav,[class$="-top"],[class$="-hero"],[class$="-summary"],[class$="-toolbar"]')).forEach(el=>{
     const a=el.animate?.([{opacity:.6,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
     if(a){animations.add(a);a.onfinish=()=>animations.delete(a)}
    });
   });
  };
  document.addEventListener('click',clicked,true);
  return()=>{document.removeEventListener('click',clicked,true);cancelAnimationFrame(pending);animations.forEach(a=>a.cancel())};
 },[]);
 return null;
}
