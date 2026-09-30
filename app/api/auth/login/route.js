import {createClient} from '@supabase/supabase-js';
import {checkPortal} from '../../../../lib/portalAccess';
import {apiError,apiJson,consumeRateLimit,isSameOrigin,readJson,requestIp} from '../../../../lib/serverSecurity';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;

export async function POST(request){
  try{
    if(!isSameOrigin(request))return apiJson({ok:false,error:'Request origin was not accepted.',code:'INVALID_ORIGIN'},403);
    if(!url||!publishable||!service)return apiJson({ok:false,error:'Sign in is temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);
    const body=await readJson(request,8*1024),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
    if(!email||!password)return apiJson({ok:false,error:'Enter your email address and password.',code:'INVALID_INPUT'},400);
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const ipRate=await consumeRateLimit(admin,{bucket:'login-ip',key:requestIp(request),limit:40,windowSeconds:900});
    if(!ipRate.allowed)return apiJson({ok:false,error:ipRate.unavailable?'Sign in is temporarily unavailable.':'Too many attempts. Please try again later.',code:ipRate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},ipRate.unavailable?503:429,{'Retry-After':'900'});
    const rate=await consumeRateLimit(admin,{bucket:'login',key:`${requestIp(request)}:${email}`,limit:10,windowSeconds:900});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Sign in is temporarily unavailable.':'Too many sign-in attempts. Please wait 15 minutes and try again.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'900'});
    const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await authClient.auth.signInWithPassword({email,password});
    if(error||!data.session)return apiJson({ok:false,error:'The email address or password is incorrect.',code:'INVALID_CREDENTIALS'},401);
    const {data:profile}=await admin.from('profiles').select('is_active,is_platform_super_admin,organization_id').eq('id',data.user.id).maybeSingle();
    const {data:org}=profile?.organization_id?await admin.from('organizations').select('status').eq('id',profile.organization_id).maybeSingle():{data:null};
    if(!profile?.is_active||(!profile.is_platform_super_admin&&org?.status!=='Active')||data.session.expires_in>86400){await authClient.auth.signOut({scope:'local'});return apiJson({ok:false,error:'This account cannot access a workspace. Contact your administrator.',code:'FORBIDDEN'},403)}
    const denied=await checkPortal(admin,profile,request);
    if(denied){await authClient.auth.signOut({scope:'local'});return denied}
    return apiJson({ok:true,session:{access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_at:data.session.expires_at,expires_in:data.session.expires_in,token_type:data.session.token_type}});
  }catch(error){
    return apiError(error,{status:error?.status||500,code:error?.code||'LOGIN_FAILED',message:error?.status===413?'The request is too large.':'Sign in could not be completed.'});
  }
}
