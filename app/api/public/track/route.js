import {createClient} from '@supabase/supabase-js';
import {apiError,apiJson,consumeRateLimit,requestIp} from '../../../../lib/serverSecurity';

export const dynamic='force-dynamic';
export const runtime='nodejs';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
const supabase=url&&serviceKey?createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const cleanRef=v=>String(v||'').trim().replace(/[^A-Za-z0-9._/-]/g,'').slice(0,50);
const cleanMobile=v=>String(v||'').replace(/\D/g,'').slice(-8);
const cleanSlug=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,80);
const cleanToken=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''))?String(v):'';
const caseSelect=`organization_id,tracking_reference,customer_name,mobile,submission_date,overall_status,
  documents!documents_case_id_fkey(id,document_name,occurrence_no,quantity,document_status,
    document_stages!document_stages_document_id_fkey(id,stage_name,stage_order,status))`;

const allowedCase=c=>({
  tracking_reference:c.tracking_reference,
  customer_name:c.customer_name,
  submission_date:c.submission_date,
  overall_status:c.overall_status,
  documents:(c.documents||[]).map(d=>({
    id:d.id,document_name:d.document_name,occurrence_no:d.occurrence_no,
    quantity:d.quantity,document_status:d.document_status,
    document_stages:(d.document_stages||[]).map(s=>({id:s.id,stage_name:s.stage_name,stage_order:s.stage_order,status:s.status})).sort((a,b)=>(a.stage_order||0)-(b.stage_order||0))
  }))
});

async function brandingFor(organizationId,organization){
  const {data:settings,error}=await supabase.from('organization_settings').select('company_name,product_name,short_name,logo_url,primary_color,secondary_color,support_email,support_phone').eq('organization_id',organizationId).maybeSingle();
  if(error)throw error;
  return {company_name:settings?.company_name||organization?.name||'Your Organization',product_name:settings?.product_name||'Document Tracking',short_name:settings?.short_name||'',logo_url:settings?.logo_url||'',primary_color:settings?.primary_color||'#3265DF',secondary_color:settings?.secondary_color||'#17879A',support_email:settings?.support_email||'',support_phone:settings?.support_phone||''};
}

async function activeOrganization(slug){
  if(slug){
    const {data,error}=await supabase.from('organizations').select('id,name,slug').eq('slug',slug).eq('status','Active').maybeSingle();
    if(error)throw error;
    return data||null;
  }
  const {data,error}=await supabase.from('organizations').select('id,name,slug').eq('status','Active').limit(2);
  if(error)throw error;
  return data?.length===1?data[0]:null;
}

export async function GET(request){
  try{
    if(!supabase)return apiJson({ok:false,error:'Public tracking is temporarily unavailable.',code:'SERVICE_NOT_CONFIGURED'},503);
    const rate=await consumeRateLimit(supabase,{bucket:'public-tracking',key:requestIp(request),limit:30,windowSeconds:900});
    if(!rate.allowed)return apiJson({ok:false,error:rate.unavailable?'Tracking is temporarily unavailable. Please try again later.':'Too many tracking attempts. Please wait before trying again.',code:rate.unavailable?'RATE_LIMIT_UNAVAILABLE':'RATE_LIMITED'},rate.unavailable?503:429,{'Retry-After':'900'});

    const {searchParams}=new URL(request.url);
    const token=cleanToken(searchParams.get('token'));
    const reference=cleanRef(searchParams.get('reference')||searchParams.get('ref'));
    const suppliedMobile=String(searchParams.get('mobile')||'');
    const mobile=cleanMobile(suppliedMobile||(/^\+?\d{8,12}$/.test(reference)?reference:''));
    const organizationSlug=cleanSlug(searchParams.get('org'));
    if(!token&&!reference&&mobile.length!==8)return apiJson({ok:false,error:'Enter a tracking number or a valid customer mobile number.',code:'INVALID_INPUT'},400);
    if(suppliedMobile&&mobile.length!==8)return apiJson({ok:false,error:'Enter a valid customer mobile number.',code:'INVALID_INPUT'},400);

    let records=[],organization=null;
    if(token){
      const {data,error}=await supabase.from('cases').select(caseSelect).eq('public_tracking_token',token).maybeSingle();
      if(error)throw error;
      if(data){
        const {data:org,error:orgError}=await supabase.from('organizations').select('id,name,slug').eq('id',data.organization_id).eq('status','Active').maybeSingle();
        if(orgError)throw orgError;
        organization=org||null;
        if(organization&&(!organizationSlug||organization.slug===organizationSlug))records=[data];
      }
    }else{
      organization=await activeOrganization(organizationSlug);
      if(!organization)return apiJson({ok:true,cases:[],branding:null});
      const results=await Promise.all([
        reference?supabase.from('cases').select(caseSelect).eq('organization_id',organization.id).eq('tracking_reference',reference).limit(1):Promise.resolve({data:[]}),
        mobile.length===8?supabase.from('cases').select(caseSelect).eq('organization_id',organization.id).eq('mobile_search_key',mobile).order('submission_date',{ascending:false}).limit(100):Promise.resolve({data:[]})
      ]);
      for(const result of results){if(result.error)throw result.error}
      records=[...new Map(results.flatMap((result,i)=>(result.data||[]).filter(c=>i===0||cleanMobile(c.mobile)===mobile)).map(c=>[c.tracking_reference,c])).values()];
    }
    const branding=organization?await brandingFor(organization.id,organization):null;
    return apiJson({ok:true,cases:records.map(allowedCase),branding});
  }catch(error){
    return apiError(error,{code:'TRACKING_LOOKUP_FAILED',message:'Unable to retrieve tracking information right now.'});
  }
}
