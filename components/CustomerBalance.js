'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
export default function CustomerBalance({orgId,customerId,additionalBalance=0}){
 const [data,setData]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{let live=true;setData(null);setError(false);if(customerId)supabase.rpc('customer_credit_snapshot',{target_org:orgId,target_customer:customerId}).then(r=>{if(live){if(r.error||!r.data)setError(true);else setData(r.data)}});return()=>{live=false}},[orgId,customerId]);
 if(!customerId)return null;if(error)return <p role="alert">Customer receivables could not be loaded.</p>;
 return <div className={'customer-balance '+(Number(data?.balance)>0?'has-balance':'')}><span>Existing invoices <b>{data?Number(data.total).toFixed(2):'…'}</b></span><span>Paid <b>{data?Number(data.paid).toFixed(2):'…'}</b></span><span>Receivables <b>{data?Number(data.balance).toFixed(2):'…'}</b></span>{data?.credit_limit!==null&&data?.credit_limit!==undefined&&<span className={(Number(data.balance)+Math.max(0,Number(additionalBalance)||0))>Number(data.credit_limit)?'credit-warning':''}>Credit limit <b>{Number(data.credit_limit).toFixed(2)}</b>{(Number(data.balance)+Math.max(0,Number(additionalBalance)||0))>Number(data.credit_limit)&&(Number(data.balance)>Number(data.credit_limit)?' · Limit exceeded':' · This bill would exceed the limit')}</span>}</div>
}
