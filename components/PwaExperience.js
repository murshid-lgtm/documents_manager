'use client';
import {useEffect,useRef,useState} from 'react';
import WorkspaceLoader from './WorkspaceLoader';
import DialogPortal from './DialogPortal';
export default function PwaExperience(){
 const [prompt,setPrompt]=useState(null),[offline,setOffline]=useState(false),[ios,setIos]=useState(false),[dismissed,setDismissed]=useState(true),[waiting,setWaiting]=useState(null),[updating,setUpdating]=useState(false),[installing,setInstalling]=useState(false),[updateHint,setUpdateHint]=useState('');
 const updateRequested=useRef(false);
 useEffect(()=>{let live=true,registration,watch;setOffline(!navigator.onLine);try{setDismissed(localStorage.getItem('pwa_install_dismissed')==='1')}catch{setDismissed(false)}
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;setIos(!standalone&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)));
  const before=e=>{e.preventDefault();if(!standalone)setPrompt(e)},online=()=>setOffline(false),off=()=>setOffline(true),installed=()=>{setPrompt(null);setIos(false)};
  // Old persisted requests must never turn a later controller change into a
  // surprise reload while a member of staff is working.
  try{sessionStorage.removeItem('workspace-update-requested')}catch{}
  const changed=()=>{if(updateRequested.current){updateRequested.current=false;window.location.reload()}};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installed);window.addEventListener('online',online);window.addEventListener('offline',off);
  if('serviceWorker' in navigator&&location.protocol==='https:'){
   navigator.serviceWorker.addEventListener('controllerchange',changed);
   navigator.serviceWorker.register('/service-worker.js',{scope:'/'}).then(r=>{if(!live)return;registration=r;if(r.waiting)setWaiting(r.waiting);watch=()=>{const worker=r.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(live&&worker.state==='installed'&&navigator.serviceWorker.controller)setWaiting(worker)})};r.addEventListener('updatefound',watch)}).catch(()=>{});
  }
  return()=>{live=false;window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installed);window.removeEventListener('online',online);window.removeEventListener('offline',off);if('serviceWorker' in navigator)navigator.serviceWorker.removeEventListener('controllerchange',changed);if(registration&&watch)registration.removeEventListener('updatefound',watch)}
 },[]);
 function dismiss(){setDismissed(true);try{localStorage.setItem('pwa_install_dismissed','1')}catch{}}
 async function install(){if(!prompt||installing)return;setInstalling(true);try{await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')dismiss();setPrompt(null)}catch{setPrompt(null)}finally{setInstalling(false)}}
 function update(){if(!waiting||updateRequested.current)return;if(document.querySelector('form[data-dirty=true],#billing-editor-form,[aria-modal=true],.action-progress')){setUpdateHint('Finish your current action and close open forms, then tap Update app.');return}try{updateRequested.current=true;setUpdating(true);waiting.postMessage({type:'ACTIVATE_UPDATE'})}catch{updateRequested.current=false;setUpdating(false);setUpdateHint('Close and reopen the app to apply this update.')}}
 if(updating)return <DialogPortal label="Updating workspace"><div className="pwa-updating-screen" role="dialog" aria-modal="true" aria-label="Updating workspace"><WorkspaceLoader message="Updating your workspace…"/></div></DialogPortal>;
 return <>{offline&&<div className="pwa-offline-banner" role="status"><strong>Connection lost.</strong> Reconnect before saving, recording payments or confirming delivery.</div>}{waiting&&!offline&&<div className="pwa-status-banner" role="status"><span>{updateHint||'A workspace update is ready. Finish and close any open form before updating.'}</span><button className="secondary" disabled={updating} onClick={update}>{updating?'Updating…':'Update app'}</button></div>}{!dismissed&&(prompt||ios)&&<div className="pwa-status-banner"><span>{ios?'Install this workspace: tap Share, then Add to Home Screen.':'Your workspace, one tap away. Install it on your home screen.'}</span>{prompt&&<button className="secondary" disabled={installing} onClick={install}>{installing?'Opening…':'Install app'}</button>}<button className="business-text-button" onClick={dismiss} aria-label="Dismiss installation hint">×</button></div>}</>
}
