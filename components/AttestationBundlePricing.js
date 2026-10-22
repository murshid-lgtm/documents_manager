'use client';
import {useState} from 'react';
import {supabase} from '../lib/supabase';
import {userError} from '../lib/userError';
export default function AttestationBundlePricing({orgId,invoice,notify,onChanged}){
 const bundle=invoice.items?.find(i=>i.attestation_bundle),[amount,setAmount]=useState(()=>bundle?.unit_price??''),[busy,setBusy]=useState(false);
 if(!bundle)return null;
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);try{const linked=await supabase.from('cases').select('id').eq('organization_id',orgId).eq('invoice_id',invoice.id).single();if(linked.error)throw linked.error;const r=await supabase.from('cases').update({attestation_bundle_total:Number(amount)}).eq('organization_id',orgId).eq('id',linked.data.id).select('id').single();if(r.error)throw r.error;notify('Attestation bundle updated.');window.dispatchEvent(new Event('workspace-finance-changed'));onChanged?.()}catch(e){notify(userError(e))}finally{setBusy(false)}}
 return <form className="attestation-bundle-pricing" onSubmit={save}><label>Attestation bundle amount<input aria-label="Attestation bundle amount" required type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button type="submit" className="secondary" disabled={busy||invoice.status!=='Issued'}>{busy?'Updating…':'Update bundle amount'}</button>{busy&&<progress aria-label="Updating attestation bundle"/>}</form>;
}
