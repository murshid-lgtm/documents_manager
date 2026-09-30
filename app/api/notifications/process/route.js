import {createClient} from '@supabase/supabase-js';
import {apiError,apiJson,bearerToken,constantTimeEqual} from '../../../../lib/serverSecurity';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const dbUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
const accessToken=process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
const templateName=process.env.WHATSAPP_TEMPLATE_NAME||'document_case_update';
const templateLanguage=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en';
const processSecret=process.env.NOTIFICATION_PROCESS_SECRET||process.env.CRON_SECRET;
const supabase=dbUrl&&serviceKey?createClient(dbUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const qatarNumber=value=>{let n=String(value||'').replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);if(n.length===8)n=`974${n}`;return n};

export async function POST(request){
  try{
    if(String(process.env.WHATSAPP_AUTOMATION_ENABLED||'false').toLowerCase()!=='true')return apiJson({ok:false,error:'Automatic WhatsApp is on hold for this release.',code:'FEATURE_DISABLED'},409);
    if(!processSecret||!constantTimeEqual(bearerToken(request),processSecret))return apiJson({ok:false,error:'Unauthorized.',code:'UNAUTHORIZED'},401);
    if(!supabase||!accessToken||!phoneNumberId)return apiJson({ok:false,error:'WhatsApp processing is not configured.',code:'SERVICE_NOT_CONFIGURED'},503);
    const {data:rows,error}=await supabase.from('notification_outbox').select('*,cases!notification_outbox_case_id_fkey(public_tracking_token)').eq('status','Pending').order('created_at',{ascending:true}).limit(20);
    if(error)throw error;
    const results=[],baseCache=new Map();
    for(const row of rows||[]){
      const {data:claimed,error:claimError}=await supabase.from('notification_outbox').update({status:'Processing',attempts:Number(row.attempts||0)+1}).eq('id',row.id).eq('status','Pending').select('id').maybeSingle();
      if(claimError){console.error('Notification claim failed',claimError);continue}
      if(!claimed)continue;
      let base=baseCache.get(row.organization_id);
      if(base===undefined){
        const {data:setting,error:settingError}=await supabase.from('organization_settings').select('tracking_base_url').eq('organization_id',row.organization_id).maybeSingle();
        if(settingError)console.error('Notification tracking setting failed',settingError);
        base=String(setting?.tracking_base_url||process.env.NEXT_PUBLIC_CUSTOMER_TRACKING_URL||'').replace(/\/$/,'');
        baseCache.set(row.organization_id,base);
      }
      const p=row.payload||{},token=row.cases?.public_tracking_token;
      if(!base||!token){
        await supabase.from('notification_outbox').update({status:'Failed',processed_at:new Date().toISOString(),last_error:'Secure customer tracking link is not configured.'}).eq('id',row.id);
        results.push({id:row.id,status:'Failed'});
        continue;
      }
      const link=`${base}${base.includes('?')?'&':'?'}token=${encodeURIComponent(token)}`;
      try{
        const response=await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:qatarNumber(row.recipient),type:'template',template:{name:templateName,language:{code:templateLanguage},components:[{type:'body',parameters:[{type:'text',text:String(p.customer_name||'Customer')},{type:'text',text:String(p.tracking_reference||'')},{type:'text',text:String(p.status||'Updated')},{type:'text',text:link}]}]}})});
        const result=await response.json();
        if(!response.ok)throw new Error(result?.error?.message||'WhatsApp provider rejected the message.');
        await supabase.from('notification_outbox').update({status:'Sent',processed_at:new Date().toISOString(),last_error:null,payload:{...p,provider_message_id:result?.messages?.[0]?.id||null}}).eq('id',row.id).eq('status','Processing');
        results.push({id:row.id,status:'Sent'});
      }catch(error){
        console.error('WhatsApp delivery failed',error);
        await supabase.from('notification_outbox').update({status:'Failed',processed_at:new Date().toISOString(),last_error:'Provider delivery failed.'}).eq('id',row.id).eq('status','Processing');
        results.push({id:row.id,status:'Failed'});
      }
    }
    return apiJson({ok:true,processed:results.length,results});
  }catch(error){
    return apiError(error,{code:'NOTIFICATION_PROCESSING_FAILED',message:'Notification processing could not be completed.'});
  }
}

export async function GET(){
  return apiJson({ok:false,error:'Method not allowed.',code:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
}
