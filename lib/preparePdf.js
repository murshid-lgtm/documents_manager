import {supabase} from './supabase';
const pdfCache=new Map(),artCache=new Map();
supabase.auth.onAuthStateChange(()=>{pdfCache.clear();artCache.clear()});
export async function preparePdf(html,paper,signal){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Please sign in to prepare a document.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${session.user.id}|${paper}|${html}`));
 const cacheKey=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),hit=pdfCache.get(cacheKey);
 if(hit&&Date.now()-hit.at<300000)return hit.bytes.slice();
 const parsed=new DOMParser().parseFromString(html,'text/html'),assets=new Map();
 const sources=[...new Set([...parsed.images].map(i=>i.getAttribute('src')).filter(src=>src&&!src.startsWith('data:image/')))];
 await Promise.all(sources.map(async src=>{
  let value=artCache.get(src);if(!value||Date.now()-value.at>900000){const response=await fetch(src,{signal,credentials:'omit'});if(!response.ok)throw new Error('Document artwork could not be loaded.');const blob=await response.blob();if(!/^image\/(png|jpeg|webp)$/.test(blob.type)||blob.size>5000000)throw new Error('Use PNG, JPEG or WebP artwork smaller than 5 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});value={at:Date.now(),data};if(artCache.size>=12)artCache.delete(artCache.keys().next().value);artCache.set(src,value)}assets.set(src,value.data);
 }));
 for(const image of parsed.images){const value=assets.get(image.getAttribute('src'));if(value)image.src=value}
 const meta=parsed.querySelector('meta[name="pdf-artwork"]');if(meta){const artwork=JSON.parse(meta.content);for(const key of ['header_image','footer_image','background_image'])if(assets.has(artwork[key]))artwork[key]=assets.get(artwork[key]);meta.content=JSON.stringify(artwork)}
 const body=JSON.stringify({html:'<!doctype html>'+parsed.documentElement.outerHTML,paper});
 if(new Blob([body]).size>3700000)throw new Error('The artwork is too large for this PDF. Use smaller images.');
 const response=await fetch('/api/documents/pdf',{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${session.access_token}`},body,signal});
 if(!response.ok){const value=await response.json();throw new Error(value.error||'The PDF could not be prepared.')}
 const bytes=new Uint8Array(await response.arrayBuffer());if(pdfCache.size>=8)pdfCache.delete(pdfCache.keys().next().value);pdfCache.set(cacheKey,{at:Date.now(),bytes:bytes.slice()});return bytes;
}
export function documentFilename(title){return String(title||'Document').split(' · ')[0].replace(/[^\p{L}\p{N}._ -]/gu,'-').trim()||'Document'}
