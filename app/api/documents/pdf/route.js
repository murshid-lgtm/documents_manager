import {createClient} from '@supabase/supabase-js';
import {apiError,apiJson,bearerToken,isSameOrigin,readJson} from '../../../../lib/serverSecurity';
import {portalDecision} from '../../../../lib/portalPolicy';
import {renderPdf} from '../../../../lib/renderPdf';
import {cachedPdf} from '../../../../lib/pdfCache';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
export async function POST(request){const started=performance.now();try{
 if(!isSameOrigin(request))return apiJson({error:'Request origin was not accepted.'},403);
 const token=bearerToken(request);if(!token)return apiJson({error:'Please sign in to prepare a document.'},401);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
 if(!url||!key)return apiJson({error:'Document preparation is temporarily unavailable.'},503);
 const viewer=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const access=await viewer.rpc('document_render_access');if(access.error)return apiJson({error:'Your session could not be verified. Please sign in again.'},access.status===401?401:503);
 const profile=access.data;if(!profile?.allowed)return apiJson({error:profile?.error||'Document access denied.'},profile?.status||403);
 const host=new URL(request.url).hostname,portal=portalDecision({host,platformOrigin:process.env.APP_ORIGIN,profile,companyDomain:profile.company_domain});if(!portal.allowed)return apiJson({error:portal.error,code:portal.code},portal.status);
 const verified=performance.now();const {html,paper}=await readJson(request,3700000);if(typeof html!=='string'||html.length>3600000||!['A4','A5','58mm','80mm'].includes(paper))return apiJson({error:'Invalid document layout.'},400);
 const result=await cachedPdf({userId:profile.id,host,html,paper,render:renderPdf});const finished=performance.now();
 console.info('PDF prepared',{auth_ms:Math.round(verified-started),render_ms:Math.round(finished-verified),cache:result.cache,bytes:result.bytes.length});
 return new Response(result.bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Server-Timing':`access;dur=${Math.round(verified-started)},pdf;dur=${Math.round(finished-verified)};desc="${result.cache}"`}});
 }catch(error){return apiError(error,{status:error.status||500,code:'PDF_RENDER_FAILED',message:'The PDF could not be prepared. Please try again.'})}}
