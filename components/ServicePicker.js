'use client';
import {useState} from 'react';
import {matchServices} from '../lib/catalogSearch';
export default function ServicePicker({services,value,onSelect,onChange,onQuickAdd,label='Search services'}){
 const [open,setOpen]=useState(false);const found=matchServices(services,value).slice(0,12);
 return <div className="service-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}><input role="combobox" aria-expanded={open} aria-label={label} value={value||''} placeholder="Search service…" onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setOpen(true)}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);if(e.key==='Enter'&&open&&found[0]){e.preventDefault();onSelect(found[0]);setOpen(false)}}}/>{open&&<div className="business-picker-results">{found.map(s=><button type="button" key={s.id} onClick={()=>{onSelect(s);setOpen(false)}}><strong>{s.name}</strong><span>{Number(s.base_price||0).toFixed(2)}</span></button>)}{!found.length&&<p>No matching services.</p>}{onQuickAdd&&<button type="button" onClick={()=>{setOpen(false);onQuickAdd()}}>＋ New service</button>}</div>}</div>
}
