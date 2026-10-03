'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
export function usePaymentAccounts(orgId,branch){
 const [accounts,setAccounts]=useState([]),[error,setError]=useState('');
 useEffect(()=>{let live=true;setAccounts([]);setError('');if(!orgId||!branch)return;(async()=>{const setup=await supabase.rpc('finance_command',{action:'setup',input:{organization_id:orgId,branch_id:branch},request_key:crypto.randomUUID()});if(setup.error)throw setup.error;const r=await supabase.from('finance_accounts').select('*').eq('organization_id',orgId).eq('is_cash',true).order('name');if(r.error)throw r.error;if(live)setAccounts(r.data||[])})().catch(()=>{if(live)setError('Payment accounts could not be loaded. Refresh to retry.')});return()=>{live=false}},[orgId,branch]);return {accounts,error};
}
export default function PaymentAccountPicker({accounts,value,onChange,required=false,error}){return <label>Payment account<select required={required} value={value||''} onChange={e=>{const a=accounts.find(x=>x.id===e.target.value);onChange(e.target.value,['Card','Credit card'].includes(a?.payment_type)?'Card':a?.payment_type==='Bank'?'Bank transfer':a?.payment_type==='Other'?'Other':'Cash')}}><option value="">Choose account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.payment_type||'Cash'}</option>)}</select>{error&&<small role="alert">{error}</small>}</label>}
