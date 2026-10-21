import {apiJson,apiError} from '../../../../../lib/serverSecurity';
import {inboxContext} from '../../../../../lib/whatsappInboxServer';
export const dynamic='force-dynamic';export const runtime='nodejs';
export async function GET(request){try{
 const p=new URL(request.url).searchParams,ctx=await inboxContext(request,p.get('organization_id'),p.get('conversation_id'));if(ctx.response)return ctx.response;
 const {viewer,conversation,org}=ctx,customer=conversation?.customer_id;if(!customer)return apiJson({error:'Link a customer before browsing private documents.'},400);
 const term=String(p.get('search')||'').slice(0,100).replace(/[\\%_]/g,'\\$&');
 const queries=[viewer.from('sales_documents').select('*').eq('organization_id',org).eq('customer_id',customer).neq('status','Cancelled').order('created_at',{ascending:false}).limit(50),
 viewer.from('customer_record_files').select('id,name,size_bytes,content_type,customer_records!inner(name,expires_on,reference,archived)').eq('organization_id',org).eq('customer_id',customer).eq('customer_records.archived',false).order('created_at',{ascending:false}).limit(50),
 viewer.from('sales_payments').select('id,receipt_no,amount,received_at,method,reference,document_id,sales_documents!inner(customer_id,customer_name,customer_mobile,document_no,total,paid_total)').eq('organization_id',org).eq('sales_documents.customer_id',customer).eq('voided',false).order('received_at',{ascending:false}).limit(50),
 viewer.from('billing_attachments').select('id,name,size_bytes,content_type,sales_documents!inner(customer_id,document_no)').eq('organization_id',org).eq('sales_documents.customer_id',customer).order('created_at',{ascending:false}).limit(50)];
 if(term){queries[0]=queries[0].ilike('document_no','%'+term+'%');queries[1]=queries[1].ilike('name','%'+term+'%');queries[2]=queries[2].ilike('receipt_no','%'+term+'%');queries[3]=queries[3].ilike('name','%'+term+'%')}
 const r=await Promise.all(queries);for(const row of r)if(row.error)throw new Error('Attachments unavailable.');return apiJson({bills:r[0].data,files:r[1].data,receipts:r[2].data,billing_files:r[3].data});
}catch(e){return apiError(e,{code:'WHATSAPP_ATTACHMENT_LIST',message:'Customer attachments could not be loaded.'})}}
