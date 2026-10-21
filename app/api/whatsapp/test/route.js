import {apiJson,apiError,isSameOrigin,readJson,consumeRateLimit} from '../../../../lib/serverSecurity';
import {communicationContext} from '../../../../lib/communicationsServer';
import {TEST_CONFIG_FIELDS,TEST_HELLO,TEST_LANGUAGE,TEST_TEMPLATE,testRecipients,testReplyWindow,uuidPattern} from '../../../../lib/whatsappTest';
import {testWebhook,testGraph,testDelivery} from '../../../../lib/whatsappTestServer';
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
 if(!cfg.enabled||!cfg.verified_at)return apiJson({error:'Enable testing and check the Meta connection before sending.'},400);
 if(!cfg.recipients.includes(input.peer))return apiJson({error:'Sending is restricted to your saved test recipients.'},403);
 if(!uuidPattern.test(input.request_id||''))return apiJson({error:'A valid message request ID is required.'},400);
 const existing=await admin.from('whatsapp_test_messages').select('id,status').eq('organization_id',org).eq('id',input.request_id).maybeSingle();if(existing.error)throw new Error('Test request could not be checked.');if(existing.data)return apiJson({ok:true,message:'This request was already recorded. Refresh the conversation for its status.',status:existing.data.status});
 const kind=input.kind==='text'?'text':input.kind==='template'?'template':'';if(!kind)return apiJson({error:'Choose Hello World or a text reply.'},400);
 const body=kind==='text'?String(input.text||'').trim():TEST_HELLO;if(!body||body.length>4096)return apiJson({error:'Enter a message of up to 4,096 characters.'},400);
 if(kind==='text'){
  const last=await admin.from('whatsapp_test_messages').select('direction,created_at').eq('organization_id',org).eq('phone_id',cfg.phone_id).eq('peer',input.peer).eq('direction','incoming').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(last.error)throw new Error('Reply window could not be checked.');if(!testReplyWindow(last.data))return apiJson({error:'Reply from your test phone first. Free-text replies are available for 24 hours after an incoming message.'},400);
 }
 const inserted=await admin.from('whatsapp_test_messages').insert({id:input.request_id,organization_id:org,phone_id:cfg.phone_id,peer:input.peer,direction:'outgoing',kind,body,status:'Processing',created_by:profile.id});
 if(inserted.error?.code==='23505')return apiJson({ok:true,message:'This request is already being processed.'});if(inserted.error)throw new Error('Test message could not be recorded.');
 try{
  const result=await testGraph(cfg,token,`${cfg.phone_id}/messages`,{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',to:input.peer,biz_opaque_callback_data:input.request_id,...(kind==='template'?{type:'template',template:{name:TEST_TEMPLATE,language:{code:TEST_LANGUAGE}}}:{type:'text',text:{body,preview_url:false}})})});
  if(result.error){await testDelivery(admin,org,cfg.phone_id,'',input.request_id,'Failed',result.code);return apiJson({error:result.error,status:'Failed'},400)}
  const id=result.data.messages?.[0]?.id;if(typeof id!=='string'||id.length>512)throw new Error('Unconfirmed provider response.');
  await testDelivery(admin,org,cfg.phone_id,id,input.request_id,'Accepted');return apiJson({ok:true,status:'Accepted',message:'Meta accepted the test message. Delivery and replies appear after webhook setup.'});
 }catch{
  await testDelivery(admin,org,cfg.phone_id,'',input.request_id,'Unconfirmed');return apiJson({ok:true,status:'Unconfirmed',message:'The outcome is unconfirmed. Check your test phone and refresh before sending another message.'});
 }
}catch(e){return apiError(e,{status:e.status||500,code:'WHATSAPP_TEST_FAILED',message:'The test request could not be completed. Refresh and retry.'})}}
