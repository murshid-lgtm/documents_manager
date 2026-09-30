import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';

const secureHeaders={
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer'
};

export function apiJson(body,status=200,extraHeaders={}){
  return NextResponse.json(body,{status,headers:{...secureHeaders,...extraHeaders}});
}

export function apiError(error,{status=500,code='INTERNAL_ERROR',message='The request could not be completed.'}={}){
  const requestId=randomUUID();
  console.error(`[${requestId}] ${code}`,error);
  return apiJson({ok:false,error:message,code,request_id:requestId},status);
}

export function bearerToken(request){
  return String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
}

export function constantTimeEqual(left,right){
  const a=Buffer.from(String(left||''));
  const b=Buffer.from(String(right||''));
  if(!a.length||a.length!==b.length)return false;
  return timingSafeEqual(a,b);
}

export function requestIp(request){
  return String(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown')
    .split(',')[0].trim().slice(0,128);
}

export function isSameOrigin(request){
  const origin=request.headers.get('origin');
  if(!origin)return false;
  try{
    const originUrl=new URL(origin);
    const forwardedHost=String(request.headers.get('x-forwarded-host')||'').split(',')[0].trim();
    const requestHost=forwardedHost||new URL(request.url).host;
    return (originUrl.protocol==='https:'||process.env.NODE_ENV!=='production')&&originUrl.host===requestHost;
  }catch{return false}
}

export function rateKey(value){
  const pepper=process.env.RATE_LIMIT_PEPPER||process.env.CRON_SECRET||'deployment-local-rate-key';
  return createHash('sha256').update(`${pepper}:${String(value||'unknown')}`).digest('hex');
}

export async function consumeRateLimit(admin,{bucket,key,limit,windowSeconds}){
  const {data,error}=await admin.rpc('consume_api_rate_limit',{
    p_bucket:bucket,
    p_key_hash:rateKey(key),
    p_limit:limit,
    p_window_seconds:windowSeconds
  });
  if(error){
    console.error('Rate-limit check failed',error);
    return {allowed:false,unavailable:true};
  }
  return {allowed:data===true,unavailable:false};
}

export async function readJson(request,maxBytes=32*1024){
  const length=Number(request.headers.get('content-length')||0);
  if(length>maxBytes)throw Object.assign(new Error('Request body is too large.'),{status:413,code:'PAYLOAD_TOO_LARGE'});
  const reader=request.body?.getReader();
  if(!reader)throw Object.assign(new Error('Invalid JSON body.'),{status:400,code:'INVALID_JSON'});
  let bytes=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>maxBytes){await reader.cancel();throw Object.assign(new Error('Request body is too large.'),{status:413,code:'PAYLOAD_TOO_LARGE'})}chunks.push(Buffer.from(value));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('Invalid JSON body.'),{status:400,code:'INVALID_JSON'})}
}

export async function hasLiveSession(viewer){
  const {data,error}=await viewer.rpc('is_current_session_valid');
  if(error)console.error('Session validation failed',error);
  return !error&&data===true;
}
