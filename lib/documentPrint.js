import {supabase} from './supabase';
import {documentHtml,normalizePrintTemplate} from './printTemplate';
import {openDocumentPreview} from './documentPreview';
export {PRINT_DEFAULTS,normalizePrintTemplate,documentHtml} from './printTemplate';
export {openDocumentPreview} from './documentPreview';
const cache=new Map();
supabase.auth.onAuthStateChange(event=>{cache.clear();if(event==='SIGNED_OUT'&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('workspace-document-preview',{detail:{action:'close-all'}}))});
export function invalidatePrintSettings(orgId){for(const key of cache.keys())if(key.startsWith(orgId+':'))cache.delete(key)}
export async function loadPrintSettings(orgId,kind,templateId){
 if(!orgId)return {};const key=orgId+':'+kind+':'+(templateId||'default'),hit=cache.get(key);if(hit&&Date.now()-hit.at<60000)return hit.promise;
 const promise=(async()=>{const namedQuery=supabase.from('named_print_templates').select('settings,kind').eq('organization_id',orgId).eq('archived',false);const named=await(templateId?namedQuery.eq('id',templateId):namedQuery.eq('kind',kind).eq('is_default',true)).maybeSingle();if(named.error)throw named.error;let settings=named.data?.settings;
 if(settings&&named.data.kind!==kind)settings={...settings,title:kind==='quotation'?'Quotation':kind==='invoice'?'Invoice':'Receipt'};
 if(!settings){const legacy=await supabase.from('organization_print_settings').select('templates').eq('organization_id',orgId).maybeSingle();if(legacy.error)throw legacy.error;settings=legacy.data?.templates?.[kind]||(kind==='quotation'?{...legacy.data?.templates?.invoice,title:'Quotation'}:{})}return settings||{}})();if(cache.size>80)cache.clear();cache.set(key,{at:Date.now(),promise});try{return await promise}catch(e){cache.delete(key);throw e}
}
export async function printConfiguredDocument({orgId,kind='invoice',record,brand,currency,popup,notify,template}){
 const preview=popup?.setHtml?popup:openDocumentPreview(`${record.document_no||record.reference||'Document'} · PDF preview`);
 try{const settings=template||await loadPrintSettings(orgId,kind,record.template_id);preview.setHtml(documentHtml({kind,record,brand,currency,template:settings}),normalizePrintTemplate(kind,settings).paper);return true}catch{preview.fail('Print settings could not be loaded. Close this preview and try again.');notify?.('Print settings could not be loaded. Please try again.');return false}
}
