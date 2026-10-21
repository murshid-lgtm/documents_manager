import {apiJson,apiError,isSameOrigin,readJson,consumeRateLimit} from '../../../../lib/serverSecurity';
import {communicationContext} from '../../../../lib/communicationsServer';
import {TEST_CONFIG_FIELDS,testRecipients} from '../../../../lib/whatsappTest';
import {sendWhatsAppTestMessage} from '../../../../lib/whatsappSendServer';
import {testWebhook,testGraph} from '../../../../lib/whatsappTestServer';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function configuration(admin,org){const r=await admin.from('whatsapp_test_connections').select(TEST_CONFIG_FIELDS).eq('organization_id',org).maybeSingle();if(r.error)throw new Error('Test connection could not be loaded.');return r.data}
export async function GET(request){try{
 const ctx=await communicationContext(request,new URL(request.url).searchParams.get('organization_id'));if(ctx.response)return ctx.response;
 const {admin,organizationId:org}=ctx,cfg=await configuration(admin,org);
 const history=cfg?await admin.from('whatsapp_test_messages').select('id,phone_id,peer,direction,kind,body,status,error_code,created_at,updated_at').eq('organization_id',org).eq('phone_id',cfg.phone_id).in('peer',cfg.recipients).order('created_at',{ascending:false}).limit(100):{data:[]};
 if(history.error)throw new Error('Test messages could not be loaded.');return apiJson({ok:true,settings:cfg,messages:history.data||[],webhook:cfg?testWebhook(org):null});
}catch(e){return apiError(e,{code:'WHATSAPP_TEST_LOAD',message:'The WhatsApp test connection could not be loaded.'})}}
export async function POST(request){try{
 if(!isSameOrigin(request))return apiJson({error:'Request not allowed.'},403);
 const input=await readJson(request,16*1024),ctx=await communicationContext(request,input.organization_id);if(ctx.response)return ctx.response;
 const {admin,organizationId:org,profile}=ctx;
 const rate=await consumeRateLimit(admin,{bucket:'whatsapp-test-admin',key:profile.id,limit:30,windowSeconds:3600});if(!rate.allowed)return apiJson({error:'Test request limit reached. Please try again later.'},429);
 if(input.action==='save'){
  let recipients;try{recipients=testRecipients(input.recipients)}catch(e){return apiJson({error:e.message},400)}
  const cfg={phone_id:String(input.phone_id||'').trim(),business_id:String(input.business_id||'').trim(),api_version:String(input.api_version||'v25.0').trim(),recipients,enabled:input.enabled===true};
  if(!/^\d{5,30}$/.test(cfg.phone_id)||!/^\d{5,30}$/.test(cfg.business_id)||!/^v\d{2}\.0$/.test(cfg.api_version))return apiJson({error:'Enter the test Phone number ID, WhatsApp Business Account ID and Graph API version from Meta.'},400);
  const token=String(input.access_token||'').trim(),secret=String(input.app_secret||'').trim();
  if((token||secret)&&(!/^[\x21-\x7e]{10,4096}$/.test(token)||!/^[a-f\d]{32}$/i.test(secret)))return apiJson({error:'Enter both the access token and 32-character Meta app secret. Leave both blank to keep saved credentials.'},400);
  const previous=await configuration(admin,org);if(!previous&&!token)return apiJson({error:'Enter test credentials before saving.'},400);
  const r=await admin.rpc('save_whatsapp_test_connection',{target_org:org,input:cfg,secret_json:token?{access_token:token,app_secret:secret}:null});if(r.error)throw new Error('Test configuration could not be saved.');return apiJson({ok:true,message:'Test connection saved. Customer automations are unchanged.'});
 }
 const cfg=await configuration(admin,org);if(!cfg)return apiJson({error:'Save the Meta test connection first.'},400);
 const secretResult=await admin.rpc('whatsapp_test_secret',{target_org:org});if(secretResult.error)throw new Error('Test credentials are unavailable.');const token=secretResult.data?.access_token;if(!token)return apiJson({error:'Save a Meta access token first.'},400);
 if(input.action==='check'){
  // Validate WABA membership as well as phone access; a phone ID from another account is rejected.
  const check=await testGraph(cfg,token,`${cfg.business_id}/phone_numbers?fields=id,display_phone_number&limit=100`);
  if(check.error)return apiJson({error:check.error},400);
  const phone=check.data.data?.find(p=>p.id===cfg.phone_id);if(!phone)return apiJson({error:'This Phone number ID does not belong to the configured WhatsApp Business Account.'},400);
  const r=await admin.from('whatsapp_test_connections').update({verified_at:new Date().toISOString()}).eq('organization_id',org).eq('phone_id',cfg.phone_id).eq('updated_at',cfg.updated_at);if(r.error)throw new Error('Connection check could not be saved.');return apiJson({ok:true,message:`Meta connection checked${phone.display_phone_number?' · '+phone.display_phone_number:''}.`});
 }
 if(input.action==='subscribe'){
  if(!cfg.verified_at||!testWebhook(org))return apiJson({error:'Check your connection and configure the platform URL first.'},400);
  const result=await testGraph(cfg,token,`${cfg.business_id}/subscribed_apps`,{method:'POST',body:'{}'});
  if(result.error)return apiJson({error:result.error},400);
  if(result.data.success!==true)return apiJson({error:'Meta did not confirm the subscription. Check WhatsApp Configuration in your Meta app.'},400);
  return apiJson({ok:true,message:'The Meta app is subscribed to your test WhatsApp account. Verify the callback and select the messages field in Meta too.'});
 }
 if(input.action!=='send')return apiJson({error:'Unknown test action.'},400);
 return sendWhatsAppTestMessage({admin,org,profile,cfg,token,input});
}catch(e){return apiError(e,{status:e.status||500,code:'WHATSAPP_TEST_FAILED',message:'The test request could not be completed. Refresh and retry.'})}}
