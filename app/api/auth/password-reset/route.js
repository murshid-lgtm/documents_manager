import {createClient} from '@supabase/supabase-js';
import {apiError,apiJson,consumeRateLimit,isSameOrigin,readJson,requestIp} from '../../../../lib/serverSecurity';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;

export async function POST(request){
  try{
    if(!isSameOrigin(request))return apiJson({ok:false,error:'Request origin was not accepted.',code:'INVALID_ORIGIN'},403);
    if(!url||!publishable||!service)return apiJson({ok:false,error:'Password reset is temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);
    const body=await readJson(request,8*1024),email=String(body.email||'').trim().toLowerCase();
    if(!email)return apiJson({ok:false,error:'Enter your email address.',code:'INVALID_INPUT'},400);
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
    const ipRate=await consumeRateLimit(admin,{bucket:'password-reset-ip',key:requestIp(request),limit:15,windowSeconds:3600});
    if(!ipRate.allowed)return apiJson({ok:false,error:ipRate.unavailable?'Sign in is temporarily unavailable.':'Too many attempts. Please try again later.',code:ipRate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},ipRate.unavailable?503:429,{'Retry-After':'3600'});
    const rate=await consumeRateLimit(admin,{bucket:'password-reset',key:`${requestIp(request)}:${email}`,limit:5,windowSeconds:3600});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Password reset is temporarily unavailable.':'Too many reset requests. Please wait before trying again.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'3600'});
    const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
    const redirectTo=new URL('/?mode=reset',request.headers.get('origin')).toString();
    const {error}=await authClient.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)console.error('Password reset request failed',error);
    return apiJson({ok:true,message:'If an account exists for that email, a reset link has been sent.'});
  }catch(error){
    return apiError(error,{status:error?.status||500,code:error?.code||'PASSWORD_RESET_FAILED',message:error?.status===413?'The request is too large.':'Password reset could not be requested.'});
  }
}
