import {createHmac} from 'node:crypto';
import {apiJson,apiError,isSameOrigin,readJson,consumeRateLimit} from '../../../../lib/serverSecurity';
import {communicationContext,workerToken} from '../../../../lib/communicationsServer';
import {READINESS_FIELDS,productionConfig,checkProductionReadiness} from '../../../../lib/whatsappReadinessServer';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const maxDuration=90;

async function load(admin,org){
 const [settings,credentials,test]=await Promise.all([
  admin.from('communication_settings').select(READINESS_FIELDS).eq('organization_id',org).maybeSingle(),
  admin.from('integration_credentials').select('updated_at').eq('organization_id',org).eq('kind','whatsapp').maybeSingle(),
  admin.from('whatsapp_test_connections').select('phone_id,enabled,verified_at').eq('organization_id',org).maybeSingle()
 ]);
 if(settings.error||credentials.error||test.error)throw new Error('Connection settings could not be loaded.');
 return {settings:settings.data,credentials:credentials.data,test:test.data};
}

export async function GET(request){try{
 const ctx=await communicationContext(request,new URL(request.url).searchParams.get('organization_id'));if(ctx.response)return ctx.response;
 const {settings,credentials,test}=await load(ctx.admin,ctx.organizationId);
 let origin='';try{origin=new URL(process.env.APP_ORIGIN).origin}catch{}
 return apiJson({ok:true,settings,credentials_saved:Boolean(credentials),credentials_updated_at:credentials?.updated_at||null,test_sender:{configured:Boolean(test),enabled:Boolean(test?.enabled),checked:Boolean(test?.verified_at)},webhook:credentials&&origin.startsWith('https://')?{url:`${origin}/api/communications/webhook?org=${encodeURIComponent(ctx.organizationId)}`,verify_token:createHmac('sha256',workerToken()).update(`whatsapp:${ctx.organizationId}`).digest('hex')}:null,live_inbox_available:false});
}catch(e){return apiError(e,{code:'WHATSAPP_READINESS_LOAD',message:'The business connection could not be loaded.'})}}

export async function POST(request){try{
 if(!isSameOrigin(request))return apiJson({error:'Request not allowed.'},403);
 const input=await readJson(request,4096),ctx=await communicationContext(request,input.organization_id);if(ctx.response)return ctx.response;
 if(input.action!=='check')return apiJson({error:'This endpoint supports read-only checks only.'},400);
 const rate=await consumeRateLimit(ctx.admin,{bucket:'whatsapp-production-readiness',key:ctx.profile.id,limit:12,windowSeconds:3600});
 if(!rate.allowed)return apiJson({error:'Connection check limit reached. Try again later.'},429);
 const {settings,credentials,test}=await load(ctx.admin,ctx.organizationId);
 let cfg;try{cfg=productionConfig(settings)}catch(e){return apiJson({error:e.message},400)}
 if(test?.phone_id===cfg.phone_id)return apiJson({error:'This is the same sender as your Test Lab. Keep the test sender separate and configure your business number for production.'},400);
 if(!credentials)return apiJson({error:'Save the business access token and app secret in communication settings first.'},400);
 const secret=await ctx.admin.rpc('get_communication_credentials',{target_org:ctx.organizationId,credential_kind:'whatsapp'});
 if(secret.error||!secret.data?.access_token||!secret.data?.app_secret)return apiJson({error:'The saved business credentials are incomplete. Update the token and app secret in communication settings.'},400);
 let result;try{result=await checkProductionReadiness(cfg,secret.data.access_token)}catch(e){return apiJson({error:e.message},400)}
 // A parallel settings edit must not leave an apparently valid result for old credentials.
 const fresh=await load(ctx.admin,ctx.organizationId);
 if(JSON.stringify(fresh.settings)!==JSON.stringify(settings)||fresh.credentials?.updated_at!==credentials.updated_at)return apiJson({error:'Connection settings changed during this check. Refresh and check again.'},409);
 return apiJson({ok:true,...result,message:'Business sender access checked. No message was sent and no settings were changed.'});
}catch(e){return apiError(e,{status:e.status||500,code:'WHATSAPP_READINESS_CHECK',message:'The business connection could not be checked. Your saved settings are unchanged.'})}}
