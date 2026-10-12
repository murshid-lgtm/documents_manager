import {supabase} from './supabase';
export async function preparePdf(html,paper,signal){
 const parsed=new DOMParser().parseFromString(html,'text/html');
 // Artwork is embedded by the user's browser. The PDF renderer never fetches
 // arbitrary URLs or carries a signed-in browser session.
 const assets=new Map();
 await Promise.all([...parsed.images].map(async image=>{
  const src=image.getAttribute('src');if(!src||src.startsWith('data:image/'))return;
  const response=await fetch(src,{signal,credentials:'omit'});if(!response.ok)throw new Error('Document artwork could not be loaded.');
  const blob=await response.blob();if(!/^image\/(png|jpeg|webp)$/.test(blob.type)||blob.size>5000000)throw new Error('Use PNG, JPEG or WebP artwork smaller than 5 MB.');
  image.src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});assets.set(src,image.src);
 }));
 const meta=parsed.querySelector('meta[name="pdf-artwork"]');if(meta){const artwork=JSON.parse(meta.content);for(const key of ['header_image','footer_image','background_image'])if(assets.has(artwork[key]))artwork[key]=assets.get(artwork[key]);meta.content=JSON.stringify(artwork)}
 const {data:{session}}=await supabase.auth.getSession();
 const body=JSON.stringify({html:'<!doctype html>'+parsed.documentElement.outerHTML,paper});
 if(new Blob([body]).size>3700000)throw new Error('The artwork is too large for this PDF. Use smaller images.');
 const response=await fetch('/api/documents/pdf',{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${session?.access_token||''}`},body,signal});
 if(!response.ok){const value=await response.json();throw new Error(value.error||'The PDF could not be prepared.')}
 return new Uint8Array(await response.arrayBuffer());
}
export function documentFilename(title){return String(title||'Document').split(' · ')[0].replace(/[^\p{L}\p{N}._ -]/gu,'-').trim()||'Document'}
