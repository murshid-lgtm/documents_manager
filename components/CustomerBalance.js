'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
export default function CustomerBalance({orgId,customerId}){
 const [data,setData]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{let live=true;setData(null);setError(false);if(customerId)supabase.rpc('customer_receivables',{target_org:orgId,target_customer:customerId}).then(r=>{if(live){if(r.error)setError(true);else setData(r.data)}});return()=>{live=false}},[orgId,customerId]);
 if(!customerId)return null;if(error)return <p role="alert">Customer receivables could not be loaded.</p>;
 return <div className={'customer-balance '+(Number(data?.balance)>0?'has-balance':'')}><span>Existing invoices <b>{data?Number(data.total).toFixed(2):'…'}</b></span><span>Paid <b>{data?Number(data.paid).toFixed(2):'…'}</b></span><span>Receivables <b>{data?Number(data.balance).toFixed(2):'…'}</b></span></div>
}
