import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const dbUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken=process.env.WHATSAPP_ACCESS_TOKEN;
const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
const templateName=process.env.WHATSAPP_TEMPLATE_NAME||'document_case_update';
const templateLanguage=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en';
const processSecret=process.env.NOTIFICATION_PROCESS_SECRET||process.env.CRON_SECRET;
const supabase=dbUrl&&serviceKey?createClient(dbUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;

const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const qatarNumber=value=>{let n=String(value||'').replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);if(n.length===8)n=`974${n}`;return n};

export async function POST(request){
  if(String(process.env.WHATSAPP_AUTOMATION_ENABLED||'false').toLowerCase()!=='true')return json({ok:false,error:'Automatic WhatsApp is on hold for this release.'},409);
  const auth=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!processSecret||auth!==processSecret)return json({ok:false,error:'Unauthorized'},401);
  if(!supabase||!accessToken||!phoneNumberId)return json({ok:false,error:'WhatsApp processing is not configured.'},503);
  const {data:setting}=await supabase.from('app_settings').select('setting_value').eq('setting_key','customer_tracking').maybeSingle();
  const base=String(setting?.setting_value?.base_url||process.env.NEXT_PUBLIC_CUSTOMER_TRACKING_URL||'').replace(/\/$/,'');
  if(!base)return json({ok:false,error:'Customer tracking URL is not configured.'},503);
  const {data:rows,error}=await supabase.from('notification_outbox').select('*').eq('status','Pending').order('created_at',{ascending:true}).limit(20);
  if(error)return json({ok:false,error:error.message},500);
  const results=[];
  for(const row of rows||[]){
    await supabase.from('notification_outbox').update({status:'Processing',attempts:Number(row.attempts||0)+1}).eq('id',row.id).eq('status','Pending');
    const p=row.payload||{},link=`${base}${base.includes('?')?'&':'?'}ref=${encodeURIComponent(p.tracking_reference||'')}`;
    try{
      const response=await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:qatarNumber(row.recipient),type:'template',template:{name:templateName,language:{code:templateLanguage},components:[{type:'body',parameters:[{type:'text',text:String(p.customer_name||'Customer')},{type:'text',text:String(p.tracking_reference||'')},{type:'text',text:String(p.status||'Updated')},{type:'text',text:link}]}]}})});
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error?.message||'WhatsApp API rejected the message.');
      await supabase.from('notification_outbox').update({status:'Sent',processed_at:new Date().toISOString(),last_error:null,payload:{...p,provider_message_id:result?.messages?.[0]?.id||null}}).eq('id',row.id);
      results.push({id:row.id,status:'Sent'});
    }catch(err){
      await supabase.from('notification_outbox').update({status:'Failed',processed_at:new Date().toISOString(),last_error:String(err?.message||err).slice(0,500)}).eq('id',row.id);
      results.push({id:row.id,status:'Failed'});
    }
  }
  return json({ok:true,processed:results.length,results});
}

export async function GET(request){return POST(request)}
