import {createClient} from '@supabase/supabase-js';
import {apiJson,bearerToken,hasLiveSession} from './serverSecurity';
import {communicationAdmin} from './communicationsServer';
import {checkPortal} from './portalAccess';
import {uuidPattern} from './whatsappTest';
export async function inboxContext(request,organizationId,conversationId){
 const token=bearerToken(request);if(!token)return {response:apiJson({error:'Please sign in.'},401)};
 const viewer=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await viewer.auth.getUser(token);if(error||!user||!await hasLiveSession(viewer))return {response:apiJson({error:'Your session has expired. Please sign in again.'},401)};
 const admin=communicationAdmin(),p=await admin.from('profiles').select('id,organization_id,branch_id,role,is_active,is_platform_super_admin').eq('id',user.id).maybeSingle(),profile=p.data;
 if(!profile?.is_active)return {response:apiJson({error:'Your account is unavailable.'},403)};
 const portal=await checkPortal(admin,profile,request);if(portal)return {response:portal};
 const org=profile.is_platform_super_admin?organizationId:profile.organization_id;if(!uuidPattern.test(org||'')||organizationId&&org!==organizationId)return {response:apiJson({error:'Choose your company workspace.'},403)};
 const company=await admin.from('organizations').select('status,timezone').eq('id',org).maybeSingle();if(company.data?.status!=='Active')return {response:apiJson({error:'This company is unavailable.'},403)};
 const access=await viewer.rpc('business_access',{target_org:org,target_branch:profile.branch_id,module_name:'crm'});if(access.error||!access.data)return {response:apiJson({error:'CRM access is required.'},403)};
 let conversation=null;if(conversationId){if(!uuidPattern.test(conversationId))return {response:apiJson({error:'Choose a conversation.'},400)};const r=await viewer.from('whatsapp_conversations').select('*').eq('organization_id',org).eq('id',conversationId).maybeSingle();if(r.error)throw new Error('Conversation could not be loaded.');if(!r.data)return {response:apiJson({error:'This conversation is unavailable.'},404)};conversation=r.data}
 return {admin,viewer,org,profile,conversation,timezone:company.data.timezone||'Asia/Qatar'};
}
export async function inboxAudit(admin,conversation,profile,action){const r=await admin.from('whatsapp_conversation_audit').insert({conversation_id:conversation.id,created_by:profile.id,action});if(r.error)throw new Error('Activity could not be recorded.');}
export async function inboxRecords(viewer,org,customer){
 const empty={customer:null,invoices:[],cases:[],jobs:[],receipts:[],documents:[]};if(!customer)return empty;
 const c=await viewer.from('crm_customers').select('id,name,mobile,email,company,customer_type,branch_id,whatsapp_opt_in').eq('organization_id',org).eq('id',customer).eq('archived',false).maybeSingle();if(c.error)throw new Error('Customer profile could not be loaded.');if(!c.data)return empty;
 const result=await Promise.all([
 viewer.from('sales_documents').select('id,document_no,kind,status,total,paid_total,document_date,created_at').eq('organization_id',org).eq('customer_id',customer).order('created_at',{ascending:false}).limit(20),
 viewer.from('cases').select('id,tracking_reference,public_tracking_token,overall_status,total_amount,advance_paid').eq('organization_id',org).eq('customer_id',customer).order('created_at',{ascending:false}).limit(20),
 viewer.from('service_jobs').select('id,job_no,title,status,public_tracking_token').eq('organization_id',org).eq('customer_id',customer).order('created_at',{ascending:false}).limit(20),
 viewer.from('sales_payments').select('id,receipt_no,amount,received_at,voided,sales_documents!inner(customer_id,document_no)').eq('organization_id',org).eq('sales_documents.customer_id',customer).eq('voided',false).order('received_at',{ascending:false}).limit(20),
 viewer.from('customer_records').select('id,name,reference,expires_on').eq('organization_id',org).eq('customer_id',customer).eq('archived',false).eq('record_kind','Document').order('expires_on').limit(20)]);
 for(const r of result)if(r.error)throw new Error('Some linked records could not be loaded.');
 return {customer:c.data,invoices:result[0].data,cases:result[1].data,jobs:result[2].data,receipts:result[3].data,documents:result[4].data};
}
