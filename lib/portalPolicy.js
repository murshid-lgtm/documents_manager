export function portalHost(value){
  if(!value)return '';
  try{return new URL(String(value).includes('://')?String(value):`https://${value}`).hostname.toLowerCase().replace(/\.$/,'')}catch{return ''}
}
export function portalDecision({host,platformOrigin,profile,companyDomain}){
  const expected=portalHost(profile?.is_platform_super_admin?platformOrigin:companyDomain);
  if(!expected)return {allowed:false,status:503,code:'PORTAL_NOT_CONFIGURED',error:'Your sign-in portal is not configured. Contact the platform administrator.'};
  if(!profile?.is_platform_super_admin&&expected===portalHost(platformOrigin))return {allowed:false,status:503,code:'PORTAL_NOT_CONFIGURED',error:'The main platform address is reserved for the platform owner. Configure a separate company portal.'};
  if(portalHost(host)!==expected)return {allowed:false,status:403,code:'WRONG_PORTAL',error:`Please sign in at https://${expected}.`,portal_url:`https://${expected}`};
  return {allowed:true};
}
export function canManageAccount(actor,target){
  return Boolean(actor?.is_active&&target&&!target.is_platform_super_admin&&(actor.is_platform_super_admin||(actor.role==='admin'&&actor.organization_id===target.organization_id&&target.role!=='admin')));
}
