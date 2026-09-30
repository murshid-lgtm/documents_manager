import {createClient} from '@supabase/supabase-js';
import {apiJson,apiError,bearerToken,hasLiveSession} from '../../../../lib/serverSecurity';
import {checkPortal} from '../../../../lib/portalAccess';
export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const token=bearerToken(request);
  if(!token)return apiJson({ok:false,error:'Please sign in.',code:'AUTH_REQUIRED'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!url||!key)return apiJson({ok:false,error:'Account verification is temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);
  const viewer=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await viewer.auth.getUser(token);
  if(error||!user||!await hasLiveSession(viewer))return apiJson({ok:false,error:'Your session has ended. Please sign in again.',code:'INVALID_SESSION'},401);
  const {data:profile,error:pe}=await viewer.from('profiles').select('id,role,is_active,is_platform_super_admin,organization_id').eq('id',user.id).maybeSingle();
  if(pe)throw pe;
  if(!profile?.is_active)return apiJson({ok:false,error:'This account is unavailable.',code:'FORBIDDEN'},403);
  const denied=await checkPortal(viewer,profile,request);
  if(denied)return denied;
  return apiJson({ok:true});
 }catch(error){return apiError(error,{message:'Account verification could not be completed.',code:'WORKSPACE_CHECK_FAILED'})}
}
