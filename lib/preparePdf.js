import {supabase} from './supabase';
const pdfCache=new Map(),pdfPending=new Map(),artCache=new Map();
const PDF_CACHE_BUDGET=12*1024*1024;let pdfCacheBytes=0;
let cacheUser=null,cacheEpoch=0;supabase.auth.onAuthStateChange((event,session)=>{const user=session?.user?.id||null;if(event==='SIGNED_OUT'||cacheUser&&user!==cacheUser){pdfCache.clear();pdfCacheBytes=0;artCache.clear();cacheEpoch++;for(const entry of pdfPending.values())entry.controller.abort();pdfPending.clear()}cacheUser=user});
async function compactArtwork(blob){if(blob.size<150000||typeof createImageBitmap!=='function')return blob;let bitmap;try{bitmap=await createImageBitmap(blob);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const smaller=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.92));canvas.width=0;canvas.height=0;return smaller&&smaller.size<blob.size?smaller:blob}catch{return blob}finally{bitmap?.close()}}
async function artworkData(src){
 const hit=artCache.get(src);if(hit&&Date.now()-hit.at<900000)return hit.promise;
 const epoch=cacheEpoch;
 const promise=(async()=>{const response=await fetch(src,{credentials:'omit',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Document artwork could not be loaded.');const blob=await response.blob();if(!/^image\/(png|jpeg|webp)$/.test(blob.type)||blob.size>5000000)throw new Error('Use PNG, JPEG or WebP artwork smaller than 5 MB.');const compressed=await compactArtwork(blob);return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(compressed)})})();
 if(artCache.size>=12)artCache.delete(artCache.keys().next().value);const entry={at:Date.now(),promise};artCache.set(src,entry);
 try{const data=await promise;if(epoch!==cacheEpoch&&artCache.get(src)===entry)artCache.delete(src);return data}catch(error){if(artCache.get(src)===entry)artCache.delete(src);throw error}
}
export async function preloadPdfArtwork(html){
 if(typeof DOMParser==='undefined')return;
 const parsed=new DOMParser().parseFromString(html,'text/html');const sources=[...new Set([...parsed.images].map(i=>i.getAttribute('src')).filter(src=>src&&!src.startsWith('data:image/')))];
 await Promise.all(sources.map(artworkData));
}
function cancelled(){return new DOMException('Document preparation cancelled.','AbortError')}
function progress(entry,text){entry.stage=text;for(const callback of entry.consumers.values())try{callback?.(text)}catch{}}
function waitForPdf(entry,signal,onProgress){
 return new Promise((resolve,reject)=>{
  const consumer={};let settled=false;
  const cleanup=()=>{signal?.removeEventListener('abort',abort);entry.consumers.delete(consumer);if(!entry.done&&!entry.consumers.size){entry.controller.abort();if(pdfPending.get(entry.key)===entry)pdfPending.delete(entry.key)}};
  const abort=()=>{if(settled)return;settled=true;cleanup();reject(cancelled())};
  entry.consumers.set(consumer,onProgress);if(entry.stage)try{onProgress?.(entry.stage)}catch{}
  signal?.addEventListener('abort',abort,{once:true});
  entry.promise.then(bytes=>{if(settled)return;settled=true;cleanup();resolve(bytes.slice())},error=>{if(settled)return;settled=true;cleanup();reject(error)});
  if(signal?.aborted)abort();
 });
}
export async function preparePdf(html,paper,signal,onProgress){
 if(signal?.aborted)throw cancelled();
 const epoch=cacheEpoch,{data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Please sign in to prepare a document.');
 if(signal?.aborted||epoch!==cacheEpoch)throw cancelled();
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${session.user.id}|${paper}|${html}`));
 if(signal?.aborted||epoch!==cacheEpoch)throw cancelled();
 const cacheKey=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),hit=pdfCache.get(cacheKey);
 if(hit&&Date.now()-hit.at<900000)return hit.bytes.slice();
 if(hit){pdfCache.delete(cacheKey);pdfCacheBytes-=hit.bytes.length}
 let entry=pdfPending.get(cacheKey);
 if(!entry){
  entry={key:cacheKey,controller:new AbortController(),consumers:new Map(),done:false,stage:''};pdfPending.set(cacheKey,entry);
  entry.promise=Promise.resolve().then(()=>generatePdf(html,paper,entry.controller.signal,text=>progress(entry,text),session,epoch,cacheKey)).finally(()=>{entry.done=true;if(pdfPending.get(cacheKey)===entry)pdfPending.delete(cacheKey)});
 }
 return waitForPdf(entry,signal,onProgress);
}
async function generatePdf(html,paper,signal,onProgress,session,epoch,cacheKey){
 if(signal.aborted||epoch!==cacheEpoch)throw cancelled();
 const started=performance.now();onProgress?.('Loading letterhead and artwork…');const parsed=new DOMParser().parseFromString(html,'text/html'),assets=new Map();
 const sources=[...new Set([...parsed.images].map(i=>i.getAttribute('src')).filter(src=>src&&!src.startsWith('data:image/')))];
 await Promise.all(sources.map(async src=>assets.set(src,await artworkData(src))));
 if(signal?.aborted||epoch!==cacheEpoch)throw new DOMException('Document preparation cancelled.','AbortError');
 for(const image of parsed.images){const value=assets.get(image.getAttribute('src'));if(value)image.src=value}
 const meta=parsed.querySelector('meta[name="pdf-artwork"]');if(meta){const artwork=JSON.parse(meta.content);for(const key of ['header_image','footer_image','background_image'])if(assets.has(artwork[key]))artwork[key]=assets.get(artwork[key]);meta.content=JSON.stringify(artwork)}
 const body=JSON.stringify({html:'<!doctype html>'+parsed.documentElement.outerHTML,paper});
 if(new Blob([body]).size>3700000)throw new Error('The artwork is too large for this PDF. Use smaller images.');
 const prepared=performance.now();onProgress?.('Generating your PDF…');const response=await fetch('/api/documents/pdf',{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${session.access_token}`},body,signal});
 if(!response.ok){const value=await response.json();throw new Error(value.error||'The PDF could not be prepared.')}
 const bytes=new Uint8Array(await response.arrayBuffer());if(signal?.aborted||epoch!==cacheEpoch)throw new DOMException('Document preparation cancelled.','AbortError');
 performance.measure?.('workspace-pdf-preparation',{start:started,end:performance.now(),detail:{artwork_ms:Math.round(prepared-started),request_ms:Math.round(performance.now()-prepared),server:response.headers.get('server-timing')||''}});
 onProgress?.('Opening your preview…');
 if(bytes.length<=PDF_CACHE_BUDGET){
  while(pdfCache.size&&(pdfCache.size>=8||pdfCacheBytes+bytes.length>PDF_CACHE_BUDGET)){const key=pdfCache.keys().next().value;pdfCacheBytes-=pdfCache.get(key).bytes.length;pdfCache.delete(key)}
  pdfCache.set(cacheKey,{at:Date.now(),bytes:bytes.slice()});pdfCacheBytes+=bytes.length;
 }
 return bytes;
}
export function documentFilename(title){return String(title||'Document').split(' · ')[0].replace(/[^\p{L}\p{N}._ -]/gu,'-').trim()||'Document'}
