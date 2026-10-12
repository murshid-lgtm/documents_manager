import {createClient} from '@supabase/supabase-js';
import {apiError,apiJson,bearerToken,hasLiveSession,isSameOrigin,readJson,consumeRateLimit} from '../../../../lib/serverSecurity';
import {checkPortal} from '../../../../lib/portalAccess';
import {renderPdf} from '../../../../lib/renderPdf';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request){
 try{
  if(!isSameOrigin(request))return apiJson({error:'Request origin was not accepted.'},403);
  const token=bearerToken(request);if(!token)return apiJson({error:'Please sign in to prepare a document.'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!url||!key||!secret)return apiJson({error:'Document preparation is temporarily unavailable.'},503);
  const viewer=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await viewer.auth.getUser(token);
  if(error||!user||!await hasLiveSession(viewer))return apiJson({error:'Your session has expired. Please sign in again.'},401);
  const {data:profile,error:profileError}=await viewer.from('profiles').select('id,is_active,is_platform_super_admin,organization_id').eq('id',user.id).maybeSingle();
  if(profileError)throw profileError;if(!profile?.is_active)return apiJson({error:'This account is unavailable.'},403);
  const denied=await checkPortal(viewer,profile,request);if(denied)return denied;
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const rate=await consumeRateLimit(admin,{bucket:'document-pdf',key:user.id,limit:30,windowSeconds:60});
  if(!rate.allowed)return apiJson({error:rate.unavailable?'Document preparation is temporarily unavailable.':'Please wait a moment before preparing another PDF.'},rate.unavailable?503:429);
  const {html,paper}=await readJson(request,3700000);
  if(typeof html!=='string'||html.length>3600000||!['A4','A5','58mm','80mm'].includes(paper))return apiJson({error:'Invalid document layout.'},400);
  const bytes=await renderPdf(html,paper);
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return apiError(error,{status:error.status||500,code:'PDF_RENDER_FAILED',message:'The PDF could not be prepared. Please try again.'})}
}
