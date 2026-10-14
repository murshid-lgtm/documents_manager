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
 useEffect(()=>{
  const active=new Set();
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const track=a=>{if(!a)return;active.add(a);a.onfinish=()=>active.delete(a);return a};
  const press=e=>{if(reduced())return;const b=e.target.closest?.('button:not(:disabled),.workspace-new-menu>summary');if(!b)return;track(b.animate?.([{transform:'scale(1)'},{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'}))};
  const menu=e=>{const node=e.target;if(reduced()||!node.open)return;if(node.matches?.('.quick-document-card,.quick-details-fold,.quick-activity-fold,.linked-job-card,.invoice-preview-fold')){for(const child of [...node.children].filter(x=>x.tagName!=='SUMMARY'))track(child.animate?.([{opacity:.3,transform:'translateY(-4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.22,1,.36,1)'}));return}if(!node.matches?.('.workspace-new-menu,.toolbar-settings-menu,.toolbar-profile-menu,.quick-more-actions,.case-recent-menu'))return;const content=node.querySelector('summary+div');track(content?.animate?.([{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'cubic-bezier(.22,1,.36,1)'}))};
  const observer=new MutationObserver(records=>{if(reduced())return;for(const r of records)for(const node of r.addedNodes){if(node.nodeType!==1)continue;const dialogs=[...(node.matches?.('.quick-modal,.business-dialog,.pdf-preview-modal,.quick-add-modal')?[node]:[]),...node.querySelectorAll('.quick-modal,.business-dialog,.pdf-preview-modal,.quick-add-modal')];for(const dialog of dialogs)track(dialog.animate?.([{opacity:0,transform:'translateY(12px) scale(.99)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'}));}});
  observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('pointerdown',press);document.addEventListener('toggle',menu,true);
  return()=>{observer.disconnect();document.removeEventListener('pointerdown',press);document.removeEventListener('toggle',menu,true);active.forEach(a=>a.cancel());};
 },[]);
 return null;
}
