'use client';
import {useEffect} from 'react';

const ease='cubic-bezier(.22,1,.36,1)';
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Animate existing nodes: navigating never remounts a form or discards its draft.
export default function WorkspaceMotion({view}){
 useEffect(()=>{
  if(reduced())return;
  const page=document.querySelector('.workspace-page');
  const animation=page?.animate?.([{opacity:.8,transform:'translateX(10px)'},{opacity:1,transform:'translateX(0)'}],{duration:300,easing:ease});
  const cards=[...document.querySelectorAll('.fern-kpis>button,.fern-dashboard-grid>article,.studio-kpis>button,.studio-home-grid>*,.mobile-home-metrics>button,.mobile-dashboard>.mobile-home-card,.legacy-case-grid>article')].slice(0,12);
  const entrances=cards.map((el,i)=>el.animate?.([{opacity:.8,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,delay:Math.min(i*20,120),easing:ease}));
  return()=>{animation?.cancel();entrances.forEach(a=>a?.cancel())};
 },[view]);
 useEffect(()=>{
  let pending=0;const animations=new Set();
  const track=(el,frames,duration=240)=>{const a=el?.animate?.(frames,{duration,easing:ease});if(a){animations.add(a);a.onfinish=()=>animations.delete(a)}};
  const clicked=e=>{
   const button=e.target.closest?.('button');
   const tabs=button?.closest('.quick-tabs,.mobile-case-tabs,.business-tabs,.finance-tabs,.settings-tabs,.notification-tabs,.view-toggle,.tabs');
   if(!tabs||button.disabled||button.classList.contains('active')||reduced())return;
   cancelAnimationFrame(pending);
   pending=requestAnimationFrame(()=>{
    animations.forEach(a=>a.cancel());animations.clear();
    const quick=tabs.closest('.quick-modal');
    const panels=quick?[...quick.querySelectorAll('.quick-finance-panel,.quick-body:not([hidden])')]:[...tabs.parentElement.children].filter(el=>el!==tabs&&!el.matches('header,nav,[class$="-top"],[class$="-hero"],[class$="-summary"],[class$="-toolbar"]'));
    panels.filter(el=>el.getClientRects().length).slice(0,6).forEach(el=>track(el,[{opacity:.8,transform:'translateX(8px)'},{opacity:1,transform:'translateX(0)'}]));
   });
  };
  const toggle=e=>{
   const node=e.target;
   if(reduced()||!node.open||!node.matches?.('.quick-document-card,.quick-details-fold,.quick-activity-fold,.linked-job-card,.invoice-preview-fold,.mobile-home-activity'))return;
   [...node.children].filter(child=>child.tagName!=='SUMMARY').forEach(child=>track(child,[{opacity:.7,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],200));
  };
  document.addEventListener('click',clicked,true);document.addEventListener('toggle',toggle,true);
  return()=>{document.removeEventListener('click',clicked,true);document.removeEventListener('toggle',toggle,true);cancelAnimationFrame(pending);animations.forEach(a=>a.cancel())};
 },[]);
 return null;
}
