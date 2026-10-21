'use client';
import {useState} from 'react';
import WhatsAppInbox from './WhatsAppInbox';
import WhatsAppWorkspace from './WhatsAppWorkspace';
export default function SharedWhatsAppWorkspace(props){const [mode,setMode]=useState(props.initialCustomer?.id?'followups':'inbox');return mode==='inbox'?<WhatsAppInbox {...props} onAssisted={()=>setMode('followups')}/>:<><button type="button" className="wi-return" onClick={()=>setMode('inbox')}>← Shared WhatsApp Inbox</button><WhatsAppWorkspace {...props}/></>}
