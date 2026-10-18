'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

const stack=[];let background=null,originalOverflow='';
function sync(){
 for(const [i,entry] of stack.entries()){entry.root.inert=i!==stack.length-1;entry.root.toggleAttribute('data-dialog-top',i===stack.length-1);entry.root.setAttribute('aria-hidden',i===stack.length-1?'false':'true');entry.root.style.setProperty('--dialog-depth',String(i))}
}
function visibleControls(dialog){return [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[inert]'))}
function findDialog(root){return [...root.querySelectorAll('[role="dialog"],.modal,.business-dialog,.legacy-label-dialog,.quick-edit-panel,.delete-review-modal,.notification-center,.pdf-preview-modal,.batch-setup-modal,.batch-print-modal,.qr-legacy-dialog')].filter(el=>el.getClientRects().length).at(-1)||root.firstElementChild}
function closeControl(dialog){return [...(dialog?.querySelectorAll('.business-close:not(:disabled),.quick-corner-close:not(:disabled),[aria-label^="Close"]:not(:disabled),.modal-head .icon-btn:not(:disabled),.label-sheet-manager-head .icon-btn:not(:disabled)')||[])].find(el=>el.getClientRects().length)||[...(dialog?.querySelectorAll('button:not(:disabled)')||[])].find(b=>b.getClientRects().length&&/^(close|cancel|back|done)$/i.test(b.textContent.trim()))}

// Portals remove transformed page ancestors from fixed-position calculations.
// One stack owns focus, body scrolling and browser Back for nested dialogs.
export default function DialogPortal({children,label,presentation='auto',contextClass=''}){
 const [mounted,setMounted]=useState(false),root=useRef(null);
 useLayoutEffect(()=>setMounted(true),[]);
 useLayoutEffect(()=>{
  if(!mounted||!root.current)return;
  const element=root.current,previous=document.activeElement,id=`dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry={root:element,id,active:true};
  if(!stack.length){originalOverflow=document.body.style.overflow;background=[...document.querySelectorAll('.app-shell:not(.dialog-portal-scope)')].filter(el=>!el.closest('.dialog-portal-scope')).map(el=>({el,inert:el.inert,hidden:el.getAttribute('aria-hidden')}));for(const {el} of background){el.inert=true;el.setAttribute('aria-hidden','true')}document.body.style.overflow='hidden'}
  stack.push(entry);sync();
  const dialog=findDialog(element);if(dialog){dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');if(!dialog.getAttribute('aria-label'))dialog.setAttribute('aria-label',label||dialog.querySelector('h2,h3')?.textContent||'Dialog')}
  let ownsHistory=false;const previousState=history.state;
  if(matchMedia('(max-width:700px)').matches)try{history.pushState({...previousState,workspaceDialog:id},'');ownsHistory=true}catch{}
  const dismiss=()=>{if(stack.at(-1)!==entry)return;closeControl(findDialog(element))?.click();requestAnimationFrame(()=>{if(entry.active&&ownsHistory&&stack.at(-1)===entry&&history.state?.workspaceDialog!==id)try{history.pushState({...history.state,workspaceDialog:id},'')}catch{}})};
  const pop=()=>{if(stack.at(-1)===entry&&history.state?.workspaceDialog!==id)dismiss()};
  const key=e=>{if(stack.at(-1)!==entry)return;const dialog=findDialog(element);if(!dialog)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();dismiss()}if(e.key==='Tab'){const fields=visibleControls(dialog),first=fields[0],last=fields.at(-1);if(!fields.length){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus()}}};
  const resize=()=>{const viewport=window.visualViewport;element.style.setProperty('--dialog-height',`${viewport?.height||window.innerHeight}px`);element.style.setProperty('--dialog-offset',`${viewport?.offsetTop||0}px`)};resize();window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);window.addEventListener('popstate',pop);document.addEventListener('keydown',key,true);
  const frame=requestAnimationFrame(()=>{const dialog=findDialog(element);const control=closeControl(dialog)||visibleControls(dialog)[0];control?.focus({preventScroll:true})});
  return()=>{entry.active=false;cancelAnimationFrame(frame);document.removeEventListener('keydown',key,true);window.removeEventListener('popstate',pop);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);const index=stack.indexOf(entry);if(index>=0)stack.splice(index,1);sync();if(!stack.length){document.body.style.overflow=originalOverflow;for(const {el,inert,hidden} of background||[]){el.inert=inert;if(hidden===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',hidden)}background=null}if(ownsHistory&&history.state?.workspaceDialog===id)history.back();if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true})};
 },[mounted]);
 if(!mounted)return children;
 return createPortal(<div ref={root} className={`app-shell dialog-portal-scope ${contextClass}`} data-mobile-presentation={presentation}>{children}</div>,document.body);
}
