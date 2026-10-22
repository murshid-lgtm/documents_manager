'use client';
import {useEffect,useState} from 'react';
import WhatsAppInbox from './WhatsAppInbox';
import dynamic from 'next/dynamic';
const WhatsAppWorkspace=dynamic(()=>import('./WhatsAppWorkspace'),{loading:()=> <p role="status">Opening follow-ups…</p>});
export default function SharedWhatsAppWorkspace(props){const [mode,setMode]=useState(props.initialCustomer?.id?'followups':'inbox');useEffect(()=>{if(props.initialCustomer?.id)setMode('followups')},[props.initialCustomer?.id]);return mode==='inbox'?<WhatsAppInbox {...props} onAssisted={()=>setMode('followups')}/>:<div className={props.standalone?'wi-followups-window':''}><button type="button" className="wi-return" onClick={()=>setMode('inbox')}>← Shared WhatsApp Inbox</button><WhatsAppWorkspace {...props}/></div>}
