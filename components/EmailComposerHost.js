'use client';
import {useEffect,useState} from 'react';
import dynamic from 'next/dynamic';
const EmailComposer=dynamic(()=>import('./EmailComposer'),{ssr:false});
export default function EmailComposerHost({orgId,notify,company}){const [seed,setSeed]=useState(null);useEffect(()=>{window.dispatchEvent(new CustomEvent('workspace-email-availability',{detail:{organizationId:orgId}}));return()=>window.dispatchEvent(new CustomEvent('workspace-email-availability',{detail:{organizationId:null}}))},[orgId]);useEffect(()=>{const handler=e=>{if(e.detail?.organizationId&&e.detail.organizationId!==orgId)return;setSeed({...e.detail,company})};window.addEventListener('workspace-email-compose',handler);return()=>window.removeEventListener('workspace-email-compose',handler)},[orgId,company]);return seed&&orgId?<EmailComposer key={seed.record?.id||seed.attachment?.name||'compose'} seed={seed} orgId={orgId} notify={notify} onClose={()=>setSeed(null)}/>:null;}
