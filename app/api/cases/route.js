import {createClient} from '@supabase/supabase-js';
import {checkPortal} from '../../../lib/portalAccess';
import {CASE_SELECT} from '../../../lib/caseSelect';
import {apiJson,apiError,bearerToken,hasLiveSession} from '../../../lib/serverSecurity';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request){
 try{
  const token=bearerToken(request);
  if(!token)return apiJson({ok:false,error:'Please sign in to load cases.',code:'AUTH_REQUIRED'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!key)return apiJson({ok:false,error:'Cases are temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);
  // Use the signed-in user's token, never a service key. RLS remains the
  // authority for tenant, branch, session and staff-module access.
  const viewer=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await viewer.auth.getUser(token);
  if(userError||!user||!await hasLiveSession(viewer))return apiJson({ok:false,error:'Your session has expired. Please sign in again.',code:'INVALID_SESSION'},401);
  const {data:profile,error:profileError}=await viewer.from('profiles').select('id,role,is_active,is_platform_super_admin,organization_id').eq('id',user.id).maybeSingle();
  if(profileError)throw profileError;
  if(!profile?.is_active)return apiJson({ok:false,error:'This account is unavailable.',code:'FORBIDDEN'},403);
  const denied=await checkPortal(viewer,profile,request);
  if(denied)return denied;
  const params=new URL(request.url).searchParams;
  const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||300);
  if(!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(limit)||limit<1||limit>300)return apiJson({ok:false,error:'Invalid page requested.',code:'INVALID_INPUT'},400);
  const {data,error}=await viewer.from('cases').select(CASE_SELECT).order('created_at',{ascending:false}).range(offset,offset+limit-1);
  if(error)return apiError(error,{code:'CASE_LOAD_FAILED',message:'Cases could not be loaded. Please retry or contact your administrator.'});
  return apiJson({ok:true,cases:data||[]});
 }catch(error){return apiError(error,{code:'CASE_LOAD_FAILED',message:'Cases could not be loaded. Please retry.'})}
}
