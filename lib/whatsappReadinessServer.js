// Read-only production checks. Never registers, subscribes or sends from a number.
export const READINESS_FIELDS='whatsapp_phone_id,whatsapp_business_id,whatsapp_api_version,whatsapp_template,whatsapp_language,whatsapp_enabled,updated_at';

export function productionConfig(settings){
 const cfg={phone_id:String(settings?.whatsapp_phone_id||''),business_id:String(settings?.whatsapp_business_id||''),api_version:String(settings?.whatsapp_api_version||''),template:String(settings?.whatsapp_template||''),language:String(settings?.whatsapp_language||'en')};
 if(!/^\d{5,30}$/.test(cfg.phone_id)||!/^\d{5,30}$/.test(cfg.business_id)||!/^v\d{2}\.0$/.test(cfg.api_version))throw new Error('Save the business Phone number ID, WhatsApp Business Account ID and Graph API version in communication settings first.');
 if(cfg.template&&!/^[a-z0-9_]{1,512}$/.test(cfg.template)||!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(cfg.language))throw new Error('Check the saved template name and language in communication settings.');
 return cfg;
}

function providerFailure(code){
 if(Number(code)===190)return 'Meta rejected the saved access token. It may have expired or been revoked. Replace it in communication settings, then check again.';
 if([10,200,131005].includes(Number(code)))return 'The saved token does not have access to this business account. Check its WhatsApp permissions and assigned business assets in Meta.';
 return 'Meta could not verify these settings. Check the saved sender IDs, API version, token permissions and business asset access.';
}

export async function productionGraph(cfg,token,path,fetcher=fetch){
 let response;
 try{response=await fetcher(`https://graph.facebook.com/${cfg.api_version}/${path}`,{method:'GET',headers:{authorization:`Bearer ${token}`,accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)})}catch{throw new Error('Meta could not be reached. Your saved connection is unchanged; retry the check when the connection recovers.')}
 let body;try{const text=await response.text();if(text.length>256*1024)throw new Error();body=JSON.parse(text)}catch{throw new Error('Meta returned an unexpected response. Your saved connection is unchanged.')}
 if(!response.ok||body.error)throw new Error(providerFailure(body.error?.code));
 return body;
}

export function automationTemplateReadiness(template){
 if(!template)return {state:'missing',message:'The saved template and language were not found in this account.'};
 if(template.status!=='APPROVED')return {state:'pending',message:'Meta template status: '+String(template.status||'UNKNOWN').replace(/[^A-Z_]/g,'').slice(0,40)+'. Approval is required before sending.'};
 if(template.category!=='UTILITY')return {state:'incompatible',message:'Use an approved utility template for service updates; the selected template is not a utility template.'};
 const components=Array.isArray(template.components)?template.components:[],body=components.find(c=>c.type==='BODY');
 const variables=[...String(body?.text||'').matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(m=>m[1]);
 const expected=new Set(['1','2','3','4']);
 const complex=components.some(c=>!['BODY','FOOTER','HEADER','BUTTONS'].includes(c.type)||c.type==='HEADER'&&(c.format!=='TEXT'||/{{/.test(c.text||''))||c.type==='BUTTONS'&&(c.buttons||[]).some(b=>!['URL','PHONE_NUMBER','QUICK_REPLY'].includes(b.type)||/{{/.test(b.url||b.text||'')));
 if(!body||variables.length!==4||new Set(variables).size!==4||variables.some(v=>!expected.has(v))||complex)return {state:'incompatible',message:'The current automation sender requires four body placeholders (customer, reference, status, link) and no dynamic header or button parameters.'};
 return {state:'ready',message:'Approved utility template with the four supported body placeholders.'};
}

export async function checkProductionReadiness(cfg,token,fetcher=fetch){
 let phone=null,cursor='',limited=false;
 for(let page=0;page<5;page++){
  const query=new URLSearchParams({fields:'id,display_phone_number,verified_name,quality_rating,code_verification_status',limit:'100',...(cursor?{after:cursor}:{})});
  const result=await productionGraph(cfg,token,`${cfg.business_id}/phone_numbers?${query}`,fetcher);
  if(!Array.isArray(result.data))throw new Error('Meta did not return a phone-number list. The sender has not been verified.');
  phone=result.data.find(p=>String(p.id)===cfg.phone_id);if(phone)break;
  cursor=result.paging?.next&&result.paging?.cursors?.after;
  if(!cursor)break;
  if(typeof cursor!=='string'||cursor.length>2048)throw new Error('Meta returned an invalid page cursor. The sender has not been verified.');
  limited=page===4;
 }
 if(!phone)throw new Error(limited?'This account has more numbers than this readiness check can inspect. Confirm the sender in Meta; access is not verified.':'The saved Phone number ID was not found in the configured WhatsApp Business Account. Check both IDs.');
 let template={state:'missing',message:'Choose an approved utility template in communication settings before enabling customer updates.'};
 if(cfg.template){
  try{
   const query=new URLSearchParams({name:cfg.template,fields:'name,language,status,category,components',limit:'100'});
   const result=await productionGraph(cfg,token,`${cfg.business_id}/message_templates?${query}`,fetcher);
   template=automationTemplateReadiness(Array.isArray(result.data)?result.data.find(t=>t.name===cfg.template&&t.language===cfg.language):null);
  }catch(e){template={state:'unknown',message:e.message}}
 }
 const safe=value=>String(value||'').slice(0,160);
 return {checked_at:new Date().toISOString(),phone:{id:cfg.phone_id,display_phone_number:safe(phone.display_phone_number),verified_name:safe(phone.verified_name),quality_rating:safe(phone.quality_rating)||'UNKNOWN',code_verification_status:safe(phone.code_verification_status)||'UNKNOWN'},template};
}
