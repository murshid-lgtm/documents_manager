import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabase = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession:false, autoRefreshToken:false } }) : null;

const cleanRef=v=>String(v||'').trim().replace(/[^A-Za-z0-9._/-]/g,'').slice(0,50);
const cleanMobile=v=>String(v||'').replace(/\D/g,'').slice(-8);
const cleanSlug=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,80);
const allowedCase = c => ({
  tracking_reference: c.tracking_reference,
  customer_name: c.customer_name,
  submission_date: c.submission_date,
  overall_status: c.overall_status,
  documents: (c.documents||[]).map(d=>({
    id:d.id,
    document_name:d.document_name,
    occurrence_no:d.occurrence_no,
    quantity:d.quantity,
    document_status:d.document_status,
    document_stages:(d.document_stages||[]).map(s=>({
      id:s.id, stage_name:s.stage_name, stage_order:s.stage_order, status:s.status
    })).sort((a,b)=>(a.stage_order||0)-(b.stage_order||0))
  }))
});

function response(body,status=200){
  return NextResponse.json(body,{status,headers:{
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  }});
}

export async function GET(request){
  if(!supabase) return response({ok:false,error:'Public tracking is not configured.'},503);
  const {searchParams}=new URL(request.url);
  const reference=cleanRef(searchParams.get('reference'));
  const mobile=cleanMobile(searchParams.get('mobile'));
  const organizationSlug=cleanSlug(searchParams.get('org'));
  const mobileEnabled=String(process.env.PUBLIC_TRACKING_MOBILE_ENABLED||'false').toLowerCase()==='true';

  if(!reference && !mobile) return response({ok:false,error:'Enter a tracking reference.'},400);

  let organizationId=null,organization=null;
  if(organizationSlug){
    const {data,error}=await supabase.from('organizations').select('id,name,slug').eq('slug',organizationSlug).eq('is_active',true).maybeSingle();
    if(error||!data)return response({ok:false,error:'Tracking workspace was not found.'},404);
    organizationId=data.id;organization=data;
  }else{
    const {data}=await supabase.from('organizations').select('id,name,slug').eq('is_active',true).limit(2);
    if(data?.length===1){organizationId=data[0].id;organization=data[0]}
    else if((data||[]).length>1)return response({ok:false,error:'This tracking link is incomplete. Please use the link supplied by your service provider.'},400);
  }
  if(!organizationId)return response({ok:false,error:'Tracking workspace is not configured.'},503);
  const {data:settings}=await supabase.from('organization_settings').select('company_name,product_name,short_name,logo_url,primary_color,secondary_color,support_email,support_phone').eq('organization_id',organizationId).maybeSingle();
  const branding={company_name:settings?.company_name||organization?.name||'Your Organization',product_name:settings?.product_name||'Document Tracking',short_name:settings?.short_name||'',logo_url:settings?.logo_url||'',primary_color:settings?.primary_color||'#3265DF',secondary_color:settings?.secondary_color||'#17879A',support_email:settings?.support_email||'',support_phone:settings?.support_phone||''};

  const select=`tracking_reference,customer_name,submission_date,overall_status,
    documents(id,document_name,occurrence_no,quantity,document_status,
      document_stages(id,stage_name,stage_order,status))`;

  if(reference){
    const {data,error}=await supabase.from('cases').select(select).eq('organization_id',organizationId).eq('tracking_reference',reference).limit(1);
    if(error) return response({ok:false,error:'Unable to retrieve tracking information.'},500);
    if(!data?.length) return response({ok:true,cases:[],branding});
    return response({ok:true,cases:[allowedCase(data[0])],branding});
  }

  if(!mobileEnabled) return response({ok:false,error:'Mobile lookup is not enabled on the public tracker.'},403);

  // Mobile lookup is deliberately capped. Only customer-safe whitelisted fields leave the server.
  // Match common Qatar storage variants (8 digit local / 974 prefix).
  const variants=[mobile,`974${mobile}`,`+974${mobile}`];
  const {data,error}=await supabase.from('cases').select(select+',mobile').eq('organization_id',organizationId).in('mobile',variants).limit(20);
  if(error) return response({ok:false,error:'Unable to retrieve tracking information.'},500);
  return response({ok:true,cases:(data||[]).map(allowedCase),branding});
}
