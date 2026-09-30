import {apiJson} from './serverSecurity';
import {portalDecision} from './portalPolicy';
export async function checkPortal(client,profile,request){
  let companyDomain='';
  if(!profile.is_platform_super_admin){
    const {data,error}=await client.from('organization_settings').select('primary_domain').eq('organization_id',profile.organization_id).maybeSingle();
    if(error)throw error;
    companyDomain=data?.primary_domain||'';
  }
  const decision=portalDecision({host:new URL(request.url).hostname,platformOrigin:process.env.APP_ORIGIN,profile,companyDomain});
  return decision.allowed?null:apiJson({ok:false,error:decision.error,code:decision.code,...(decision.portal_url?{portal_url:decision.portal_url}:{})},decision.status);
}
