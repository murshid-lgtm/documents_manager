import {apiJson,apiError,isSameOrigin,readJson,consumeRateLimit} from '../../../../lib/serverSecurity';
import {inboxContext,inboxRecords} from '../../../../lib/whatsappInboxServer';
import {TEST_CONFIG_FIELDS} from '../../../../lib/whatsappTest';
import {sendWhatsAppTestMessage} from '../../../../lib/whatsappSendServer';
import {sendWhatsAppDocument} from '../../../../lib/whatsappDocumentServer';
import {workspaceDay} from '../../../../lib/workspaceDates';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){try{
 const p=new URL(request.url).searchParams,ctx=await inboxContext(request,p.get('organization_id'),p.get('conversation_id'));if(ctx.response)return ctx.response;
 const {admin,viewer,org,profile,conversation}=ctx;
 const cfg=await admin.from('whatsapp_test_connections').select(TEST_CONFIG_FIELDS).eq('organization_id',org).maybeSingle();if(cfg.error)throw new Error('WhatsApp connection unavailable.');
 if(!conversation){const list=await viewer.rpc('whatsapp_inbox_list',{target_org:org,search:String(p.get('search')||'').slice(0,100),bucket:p.get('bucket')||'all',page_number:Math.max(0,Number.parseInt(p.get('page')||'0')||0),today:workspaceDay(ctx.timezone)});if(list.error)throw new Error('Inbox could not be loaded.');return apiJson({...list.data,connection:cfg.data?{enabled:cfg.data.enabled,checked:Boolean(cfg.data.verified_at),phone_id:cfg.data.phone_id,test_mode:true}:null})}
 const page=Math.min(1000,Math.max(0,Number.parseInt(p.get('page')||'0')||0));
 if(p.get('poll')==='1'){
  const latest=await viewer.from('whatsapp_test_messages').select('id,peer,direction,kind,body,status,error_code,created_at,created_by,media_name,attachment_id').eq('organization_id',org).eq('phone_id',conversation.phone_id).eq('peer',conversation.peer).order('created_at',{ascending:false}).order('id').limit(50);if(latest.error)throw new Error('Messages unavailable.');return apiJson({conversation,messages:latest.data});
 }
 const result=await Promise.all([
 viewer.from('whatsapp_test_messages').select('id,peer,direction,kind,body,status,error_code,created_at,created_by,media_name,attachment_id').eq('organization_id',org).eq('phone_id',conversation.phone_id).eq('peer',conversation.peer).order('created_at',{ascending:false}).order('id').range(page*50,page*50+49),
 inboxRecords(viewer,org,conversation.customer_id),
 viewer.from('whatsapp_conversation_notes').select('id,body,created_by,created_at').eq('conversation_id',conversation.id).order('created_at',{ascending:false}).limit(50),
 viewer.from('whatsapp_conversation_audit').select('id,action,created_by,created_at').eq('conversation_id',conversation.id).order('created_at',{ascending:false}).limit(50),
 viewer.from('profiles').select('id,full_name,role,branch_id').eq('organization_id',org).eq('is_active',true).order('full_name'),
 viewer.from('branches').select('id,name').eq('organization_id',org).order('name'),
 viewer.from('whatsapp_replies').select('id,name,body').eq('organization_id',org).order('name')]);
 for(const r of result)if(r?.error)throw new Error('Conversation details could not be loaded.');
 return apiJson({conversation,messages:result[0].data,records:result[1],notes:result[2].data,audit:result[3].data,team:result[4].data,branches:result[5].data,replies:result[6].data,can_send:Boolean(cfg.data?.enabled&&cfg.data.verified_at&&cfg.data.phone_id===conversation.phone_id&&cfg.data.recipients.includes(conversation.peer)),is_admin:profile.role==='admin'});
}catch(e){return apiError(e,{code:'WHATSAPP_INBOX_LOAD',message:'The shared inbox could not be loaded. Please retry.'})}}
export async function POST(request){try{
 if(!isSameOrigin(request))return apiJson({error:'Request not allowed.'},403);
 const input=await readJson(request,2300000),ctx=await inboxContext(request,input.organization_id,input.conversation_id);if(ctx.response)return ctx.response;
 const {admin,viewer,org,profile,conversation}=ctx;if(!conversation)return apiJson({error:'Choose a conversation.'},400);
 const rate=await consumeRateLimit(admin,{bucket:'whatsapp-shared-inbox',key:profile.id,limit:120,windowSeconds:60});if(!rate.allowed)return apiJson({error:'Too many requests. Please wait a moment.'},429);
 if(input.action==='read'){const r=await admin.from('whatsapp_conversation_reads').upsert({conversation_id:conversation.id,user_id:profile.id,read_at:new Date().toISOString()},{onConflict:'conversation_id,user_id'});if(r.error)throw new Error('Read status could not be saved.');return apiJson({ok:true})}
 if(input.action==='note'||input.action==='update'){
  const changes=input.action==='note'?{note:String(input.body||'').trim()}:Object.fromEntries(['status','assigned_to','branch_id','customer_id','labels','follow_up_date'].filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]));
  if(input.action==='note'&&(!changes.note||changes.note.length>4000))return apiJson({error:'Enter an internal note of up to 4,000 characters.'},400);
  if(profile.role!=='admin'&&('branch_id' in changes||'customer_id' in changes))return apiJson({error:'Only administrators can link customers or move branches.'},403);
  const result=await admin.rpc('whatsapp_manage_conversation',{target_id:conversation.id,actor_id:profile.id,changes});if(result.error)return apiJson({error:/customer mobile must match/.test(result.error.message)?'The customer mobile must match this WhatsApp number.':/active team member/.test(result.error.message)?'Choose an active team member in this branch.':'The conversation could not be updated. Check the selected fields.'},400);
  return apiJson({ok:true,message:input.action==='note'?'Internal note saved.':'Conversation updated.'});
 }
 if(!['send','document'].includes(input.action))return apiJson({error:'Choose a supported action.'},400);
 const cfg=await admin.from('whatsapp_test_connections').select(TEST_CONFIG_FIELDS).eq('organization_id',org).maybeSingle();if(cfg.error)throw new Error('Connection unavailable.');if(!cfg.data||cfg.data.phone_id!==conversation.phone_id)return apiJson({error:'This sender is not active in the test connection.'},400);
 const creds=await admin.rpc('whatsapp_test_secret',{target_org:org});if(creds.error||!creds.data?.access_token)return apiJson({error:'An administrator must update the WhatsApp test credentials.'},400);
 const options={admin,org,profile,cfg:cfg.data,token:creds.data.access_token,input:{...input,peer:conversation.peer},conversation,viewer};
 return input.action==='document'?await sendWhatsAppDocument(options):await sendWhatsAppTestMessage(options);
}catch(e){return apiError(e,{status:e.status||500,code:'WHATSAPP_INBOX_ACTION',message:'The inbox action could not be completed. Please retry.'})}}
