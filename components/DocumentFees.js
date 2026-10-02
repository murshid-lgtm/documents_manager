'use client';
import {useEffect} from 'react';
export const documentPriceKey=d=>`${String(d.document_name||'').trim().toLowerCase()}|${(d.stages||[]).map(s=>s.trim().toLowerCase()).sort().join('|')}`;
export default function DocumentFees({document:d,prices,onChange}){
 const key=documentPriceKey(d);
 useEffect(()=>{const p=prices.find(p=>p.price_key===key);if(d._pricingKey!==key||!d._pricingEdited)onChange({government_fee:p?.government_fee??0,service_fee:p?.service_fee??0,remember:false,_pricingKey:key,_pricingEdited:false})},[key,prices]);
 return <div className="document-fees"><label>Government fee / document<input type="number" required min="0" step=".01" value={d.government_fee??0} onChange={e=>onChange({government_fee:e.target.value,_pricingEdited:true})}/></label><label>Service fee / document<input type="number" required min="0" step=".01" value={d.service_fee??0} onChange={e=>onChange({service_fee:e.target.value,_pricingEdited:true})}/></label><strong>{(Number(d.quantity||1)*(Number(d.government_fee||0)+Number(d.service_fee||0))).toFixed(2)}</strong><label className="remember-price"><input type="checkbox" checked={Boolean(d.remember)} onChange={e=>onChange({remember:e.target.checked})}/>Remember these prices for next time</label></div>
}
