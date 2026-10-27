'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
export default function AppointmentStaffSelect({orgId,caseIds=[],profileId,name,onChange,bulk=false,disabled=false}){
 const [people,setPeople]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const key=[...new Set(caseIds.filter(Boolean))].sort().join(',');
 useEffect(()=>{let live=true;setPeople([]);setError(false);if(!orgId||!key)return;setLoading(true);(async()=>{let common=null;for(const id of key.split(',')){const r=await supabase.rpc('work_assignment_staff',{target_org:orgId,work_type:'appointment_case',target_id:id});if(r.error)throw r.error;common=common===null?r.data:common.filter(p=>(r.data||[]).some(x=>x.id===p.id));if(!live)return}setPeople(common||[])})().catch(()=>{if(live)setError(true)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[orgId,key]);
 const value=profileId|| (name==='__clear__'?'__clear__':name?'legacy':'');
 return <><select aria-label="Appointment staff" disabled={disabled||loading||!key} value={value} onChange={e=>{const v=e.target.value;if(v==='legacy')return;if(v==='__clear__')return onChange(null,bulk?'__clear__':'');const p=people.find(x=>x.id===v);onChange(p?.id||null,p?.full_name||'')}}><option value="">{loading?'Loading team…':bulk?'Keep current owner':'Unassigned'}</option>{bulk&&<option value="__clear__">Unassign selected appointments</option>}{name&&name!=='__clear__'&&!profileId&&<option value="legacy">{name} (current)</option>}{profileId&&!people.some(p=>p.id===profileId)&&<option value={profileId}>{name||'Current owner'} (current)</option>}{people.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>{error&&<small role="alert">Team could not be loaded. Reopen this editor to retry.</small>}</>
}
