import {createHmac} from 'node:crypto';
import {apiJson,apiError,constantTimeEqual,consumeRateLimit,requestIp} from '../../../../../lib/serverSecurity';
import {communicationAdmin} from '../../../../../lib/communicationsServer';
import {testWebhookToken,testDelivery,incomingBody} from '../../../../../lib/whatsappTestServer';
import {uuidPattern} from '../../../../../lib/whatsappTest';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){try{
 const p=new URL(request.url).searchParams,org=p.get('org');
 if(!uuidPattern.test(org||'')||p.get('hub.mode')!=='subscribe'||!constantTimeEqual(p.get('hub.verify_token'),testWebhookToken(org)))return apiJson({error:'Verification failed.'},403);
 const admin=communicationAdmin(),cfg=await admin.from('whatsapp_test_connections').select('phone_id').eq('organization_id',org).maybeSingle();if(cfg.error||!cfg.data)return apiJson({error:'Verification failed.'},403);
 const saved=await admin.from('whatsapp_test_connections').update({webhook_at:new Date().toISOString()}).eq('organization_id',org).eq('phone_id',cfg.data.phone_id);if(saved.error)throw new Error('Webhook verification could not be saved.');
 return new Response(p.get('hub.challenge')||'',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
}catch{return apiJson({error:'Verification failed.'},403)}}
export async function POST(request){try{
 const org=new URL(request.url).searchParams.get('org');if(!uuidPattern.test(org||''))return apiJson({error:'Invalid webhook.'},400);
 const admin=communicationAdmin(),rate=await consumeRateLimit(admin,{bucket:'whatsapp-test-webhook',key:requestIp(request),limit:120,windowSeconds:60});if(!rate.allowed)return apiJson({error:'Too many requests.'},429);
 if(Number(request.headers.get('content-length')||0)>128*1024)return apiJson({error:'Payload too large.'},413);
 const reader=request.body?.getReader();if(!reader)return apiJson({error:'Invalid webhook.'},400);const parts=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128*1024){await reader.cancel();return apiJson({error:'Payload too large.'},413)}parts.push(Buffer.from(value))}const raw=Buffer.concat(parts);
 const secret=await admin.rpc('whatsapp_test_secret',{target_org:org});if(secret.error||!secret.data?.app_secret||!constantTimeEqual(request.headers.get('x-hub-signature-256'),`sha256=${createHmac('sha256',secret.data.app_secret).update(raw).digest('hex')}`))return apiJson({error:'Verification failed.'},403);
 let body;try{body=JSON.parse(raw.toString('utf8'))}catch{return apiJson({error:'Invalid webhook.'},400)}
 const cfg=await admin.from('whatsapp_test_connections').select('phone_id,business_id,recipients,enabled').eq('organization_id',org).maybeSingle();if(cfg.error)throw new Error('Test configuration unavailable.');
 if(body.object!=='whatsapp_business_account'||!cfg.data?.enabled)return apiJson({ok:true});
 for(const entry of Array.isArray(body.entry)?body.entry:[]){
  if(String(entry.id)!==cfg.data.business_id)continue;
  for(const change of Array.isArray(entry.changes)?entry.changes:[]){
   const value=change.value;if(change.field!=='messages'||String(value?.metadata?.phone_number_id)!==cfg.data.phone_id)continue;
   for(const m of Array.isArray(value.messages)?value.messages:[]){
    if(!cfg.data.recipients.includes(m.from)||typeof m.id!=='string'||!m.id||m.id.length>512)continue;
    const timestamp=Number(m.timestamp)*1000;if(!Number.isFinite(timestamp)||timestamp<=0||timestamp>Date.now()+5*60*1000)continue;
    const kinds=['text','image','document','audio','video','sticker','location','contacts','interactive','button'];
    const r=await admin.from('whatsapp_test_messages').upsert({organization_id:org,phone_id:cfg.data.phone_id,peer:m.from,provider_id:m.id,direction:'incoming',kind:kinds.includes(m.type)?m.type:'unsupported',body:incomingBody(m),status:'Received',created_at:new Date(Math.min(Date.now(),timestamp)).toISOString()},{onConflict:'organization_id,provider_id',ignoreDuplicates:true});if(r.error)throw new Error('Incoming test message could not be saved.');
   }
   for(const s of Array.isArray(value.statuses)?value.statuses:[]){
    const state={sent:'Sent',delivered:'Delivered',read:'Read',failed:'Failed'}[s.status];if(!state||!cfg.data.recipients.includes(s.recipient_id)||typeof s.id!=='string'||s.id.length>512)continue;
    await testDelivery(admin,org,cfg.data.phone_id,s.id,s.biz_opaque_callback_data,state,String(s.errors?.[0]?.code||'').replace(/[^0-9]/g,'').slice(0,30)||null);
   }
   const r=await admin.from('whatsapp_test_connections').update({webhook_at:new Date().toISOString()}).eq('organization_id',org).eq('phone_id',cfg.data.phone_id);if(r.error)throw new Error('Webhook receipt could not be saved.');
  }
 }
 return apiJson({ok:true});
}catch(e){return apiError(e,{code:'WHATSAPP_TEST_WEBHOOK',message:'The test webhook could not be processed.'})}}
