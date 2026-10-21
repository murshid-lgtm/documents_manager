import {apiJson} from './serverSecurity';
import {TEST_HELLO,TEST_LANGUAGE,TEST_TEMPLATE,testReplyWindow,uuidPattern} from './whatsappTest';
import {testGraph,testDelivery} from './whatsappTestServer';
export async function sendWhatsAppTestMessage({admin,org,profile,cfg,token,input}){
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
}
