'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

export default function AppointmentStaffSelect({orgId,caseIds=[],profileId,name,onChange,bulk=false,disabled=false}){
 const [result,setResult]=useState(null),[attempt,setAttempt]=useState(0);
 const key=[...new Set(caseIds.filter(Boolean))].sort().join(',');
 const scope=orgId&&key?`${orgId}:${key}:${attempt}`:'';
 // Never display eligible staff from the previous case while a new request starts.
 const current=result?.scope===scope?result:null;
 const people=current?.people||[],loading=Boolean(scope&&!current),error=current?.error;
 useEffect(()=>{
  setResult(null);
  if(!scope)return;
  let live=true;
  (async()=>{
   let common=null;
   for(const id of key.split(',')){
    const response=await supabase.rpc('work_assignment_staff',{target_org:orgId,work_type:'appointment_case',target_id:id});
    if(!live)return;
    if(response.error)throw response.error;
    if(!Array.isArray(response.data))throw new Error('Team response unavailable');
    const ids=new Set(response.data.map(person=>person.id));
    common=common===null?response.data:common.filter(person=>ids.has(person.id));
    if(!common.length)break;
   }
   if(live)setResult({scope,people:common||[],error:false});
  })().catch(()=>{if(live)setResult({scope,people:[],error:true})});
  return()=>{live=false};
 },[orgId,key,scope]);
 const value=profileId||(name==='__clear__'?'__clear__':name?'legacy':'');
 return <>
  <select aria-label="Appointment staff" aria-busy={loading} disabled={disabled||loading||!scope} value={value} onChange={e=>{
   const v=e.target.value;
   if(v==='legacy'||v===profileId)return;
   if(v==='__clear__')return onChange(null,bulk?'__clear__':'');
   const person=people.find(p=>p.id===v);
   onChange(person?.id||null,person?.full_name||'');
  }}>
   <option value="">{loading?'Loading team…':bulk?'Keep current owner':'Unassigned'}</option>
   {bulk&&<option value="__clear__">Unassign selected appointments</option>}
   {name&&name!=='__clear__'&&!profileId&&<option value="legacy">{name} (current)</option>}
   {profileId&&!people.some(p=>p.id===profileId)&&<option value={profileId}>{name||'Current owner'} (current)</option>}
   {people.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}
  </select>
  {error&&<small role="alert">Team could not be loaded. <button type="button" className="secondary" disabled={disabled} onClick={()=>setAttempt(n=>n+1)}>Retry team</button></small>}
  {scope&&current&&!error&&!people.length&&<small>No eligible staff for {bulk?'all selected cases':'this case'}.</small>}
 </>
}
