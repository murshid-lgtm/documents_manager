import {supabase} from './supabase';
const pdfCache=new Map(),artCache=new Map();
let cacheUser=null;supabase.auth.onAuthStateChange((event,session)=>{const user=session?.user?.id||null;if(event==='SIGNED_OUT'||cacheUser&&user!==cacheUser){pdfCache.clear();artCache.clear()}cacheUser=user});
async function compactArtwork(blob){if(blob.size<150000||typeof createImageBitmap!=='function')return blob;let bitmap;try{bitmap=await createImageBitmap(blob);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const smaller=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));canvas.width=0;canvas.height=0;return smaller&&smaller.size<blob.size?smaller:blob}catch{return blob}finally{bitmap?.close()}}
export async function preparePdf(html,paper,signal,onProgress){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Please sign in to prepare a document.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${session.user.id}|${paper}|${html}`));
 const cacheKey=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),hit=pdfCache.get(cacheKey);
 if(hit&&Date.now()-hit.at<900000)return hit.bytes.slice();
 onProgress?.('Loading letterhead and artwork…');const parsed=new DOMParser().parseFromString(html,'text/html'),assets=new Map();
 const sources=[...new Set([...parsed.images].map(i=>i.getAttribute('src')).filter(src=>src&&!src.startsWith('data:image/')))];
 await Promise.all(sources.map(async src=>{
  let value=artCache.get(src);if(!value||Date.now()-value.at>900000){const response=await fetch(src,{signal,credentials:'omit'});if(!response.ok)throw new Error('Document artwork could not be loaded.');const blob=await response.blob();if(!/^image\/(png|jpeg|webp)$/.test(blob.type)||blob.size>5000000)throw new Error('Use PNG, JPEG or WebP artwork smaller than 5 MB.');const compressed=await compactArtwork(blob);const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(compressed)});value={at:Date.now(),data};if(artCache.size>=12)artCache.delete(artCache.keys().next().value);artCache.set(src,value)}assets.set(src,value.data);
 }));
 for(const image of parsed.images){const value=assets.get(image.getAttribute('src'));if(value)image.src=value}
 const meta=parsed.querySelector('meta[name="pdf-artwork"]');if(meta){const artwork=JSON.parse(meta.content);for(const key of ['header_image','footer_image','background_image'])if(assets.has(artwork[key]))artwork[key]=assets.get(artwork[key]);meta.content=JSON.stringify(artwork)}
 const body=JSON.stringify({html:'<!doctype html>'+parsed.documentElement.outerHTML,paper});
 if(new Blob([body]).size>3700000)throw new Error('The artwork is too large for this PDF. Use smaller images.');
 onProgress?.('Generating your PDF…');const response=await fetch('/api/documents/pdf',{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${session.access_token}`},body,signal});
 if(!response.ok){const value=await response.json();throw new Error(value.error||'The PDF could not be prepared.')}
 const bytes=new Uint8Array(await response.arrayBuffer());onProgress?.('Opening your preview…');if(pdfCache.size>=8)pdfCache.delete(pdfCache.keys().next().value);pdfCache.set(cacheKey,{at:Date.now(),bytes:bytes.slice()});return bytes;
}
export function documentFilename(title){return String(title||'Document').split(' · ')[0].replace(/[^\p{L}\p{N}._ -]/gu,'-').trim()||'Document'}
