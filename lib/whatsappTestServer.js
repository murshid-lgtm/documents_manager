import {createHmac} from 'node:crypto';
import {workerToken} from './communicationsServer';
import {testProviderError,uuidPattern} from './whatsappTest';
export const testWebhookToken=org=>createHmac('sha256',workerToken()).update(`whatsapp-test:${org}`).digest('hex');
export function testWebhook(org){let origin='';try{origin=new URL(process.env.APP_ORIGIN).origin}catch{}return origin.startsWith('https://')?{url:`${origin}/api/whatsapp/test/webhook?org=${encodeURIComponent(org)}`,verify_token:testWebhookToken(org)}:null}
export async function testGraph(config,token,path,options={},fetcher=fetch){
 const response=await fetcher(`https://graph.facebook.com/${config.api_version}/${path}`,{...options,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
 const text=await response.text();if(text.length>64*1024)throw new Error('Unexpected Meta response.');let out;try{out=JSON.parse(text)}catch{throw new Error('Unexpected Meta response.')}
 if(!response.ok||out.error)return {error:testProviderError(out.error?.code),code:String(out.error?.code||response.status).replace(/[^0-9]/g,'').slice(0,30)};
 return {data:out};
}
export async function testDelivery(admin,org,phone,id,requestId,status,code=null){const r=await admin.rpc('whatsapp_test_delivery',{target_org:org,sender_id:phone,message_id:id||'',request_id:uuidPattern.test(requestId||'')?requestId:null,new_status:status,failure_code:code});if(r.error)throw new Error('Delivery status could not be saved.');}
export function incomingBody(message){
 if(message.type==='text')return String(message.text?.body||'').slice(0,4096);
 if(message.type==='button')return String(message.button?.text||'Button reply').slice(0,4096);
 if(message.type==='interactive')return String(message.interactive?.button_reply?.title||message.interactive?.list_reply?.title||'Interactive reply').slice(0,4096);
 return `[${String(message.type||'unsupported').slice(0,30)} received · media preview is not available in the test lab]`;
}
