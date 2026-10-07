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
 if(settings&&named.data.kind!==kind)settings={...settings,title:({quotation:'Quotation',invoice:'Invoice',receipt:'Receipt',delivery:'Delivery note',report:''})[kind]||'Document'};
 if(!settings){const legacy=await supabase.from('organization_print_settings').select('templates').eq('organization_id',orgId).maybeSingle();if(legacy.error)throw legacy.error;settings=legacy.data?.templates?.[kind]||(kind==='quotation'?{...legacy.data?.templates?.invoice,title:'Quotation'}:{})}return settings||{}})();if(cache.size>80)cache.clear();cache.set(key,{at:Date.now(),promise});try{return await promise}catch(e){cache.delete(key);throw e}
}
export async function printConfiguredDocument({orgId,kind='invoice',record,brand,currency,popup,notify,template}){
 const preview=popup?.setHtml?popup:openDocumentPreview(`${record.document_no||record.reference||'Document'} · PDF preview`);
 let version=0;
 const render=async(id)=>{const request=++version;preview.loading?.();try{const settings=id==='initial'&&template?template:await loadPrintSettings(orgId,kind,id==='initial'?record.template_id:id||null);if(request!==version)return;preview.setHtml(documentHtml({kind,record,brand,currency,template:settings}),normalizePrintTemplate(kind,settings).paper)}catch{if(request===version)preview.fail('This template could not be loaded. Choose another template or try again.')}};
 if(orgId&&preview.configure){supabase.from('named_print_templates').select('id,name,kind').eq('organization_id',orgId).eq('archived',false).order('name',{ascending:true}).then(({data,error})=>{if(!error)preview.configure({templates:data||[],selectedTemplate:'initial',onSelectTemplate:render})}).catch(()=>{});}
 try{const settings=template||await loadPrintSettings(orgId,kind,record.template_id);if(version===0)preview.setHtml(documentHtml({kind,record,brand,currency,template:settings}),normalizePrintTemplate(kind,settings).paper);return true}catch{preview.fail('Print settings could not be loaded. Close this preview and try again.');notify?.('Print settings could not be loaded. Please try again.');return false}
}

// Compatibility for operational reports and QR sheets; preserve the complete existing content.
export function openLegacyPrintPreview({orgId,brand,currency}={}){
 const preview=openDocumentPreview('Document · PDF preview');let html='';
 return {document:{open(){html=''},write(value){html+=String(value)},close(){
 const parsed=new DOMParser().parseFromString(html,'text/html');parsed.querySelectorAll('script').forEach(n=>n.remove());
 const style=parsed.createElement('style');style.textContent='.hero,.print-hero{background:#0d3a23!important}thead th,.print-table th{background:#1d7347!important;color:white!important}.title-bar{background:#f0f5e9!important}.print-kpis>div,.summary{background:#f2f6ed!important}body{color:#263d2e}';parsed.head.append(style);
 preview.configure({title:parsed.title||'Document · PDF preview'});
 const paper=/A5/.test(parsed.head.textContent)?'A5':/80mm/.test(parsed.head.textContent)?'80mm':'A4';preview.setHtml('<!doctype html>'+parsed.documentElement.outerHTML,paper);
 const table=parsed.querySelector('table');if(orgId&&table){const title=parsed.querySelector('h1')?.textContent||parsed.title||'Report',columns=[...table.querySelectorAll('thead tr:last-child th')].map(x=>x.textContent),rows=[...table.querySelectorAll('tbody tr')].map(r=>[...r.querySelectorAll('td')].map(c=>c.textContent));
 let revision=0;supabase.from('named_print_templates').select('id,name,kind').eq('organization_id',orgId).eq('archived',false).order('name').then(({data,error})=>{if(error)return;preview.configure({templates:data||[],selectedTemplate:'initial',onSelectTemplate:async id=>{const request=++revision;preview.loading();if(id==='initial'){preview.setHtml('<!doctype html>'+parsed.documentElement.outerHTML,paper);return}try{const settings=await loadPrintSettings(orgId,'report',id||null);if(request===revision)preview.setHtml(documentHtml({kind:'report',record:{title,columns,table:rows,customer_notes:parsed.querySelector('.meta,.print-meta')?.textContent||''},brand,currency,template:settings}),normalizePrintTemplate('report',settings).paper)}catch{if(request===revision)preview.fail('The selected template could not be loaded. Choose another layout.')}}})}).catch(()=>{});}
 }},close:preview.close};
}
