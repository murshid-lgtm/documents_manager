import {supabase} from './supabase';
import {documentHtml} from './printTemplate';
export {PRINT_DEFAULTS,normalizePrintTemplate,documentHtml} from './printTemplate';
export async function printConfiguredDocument({orgId,kind='invoice',record,brand,currency,popup,notify,template,preview=false}){
 const w=popup||window.open('','_blank');if(!w){notify?.('Allow pop-ups to print this document.');return false}
 try{w.document.write('<!doctype html><html><head><title>Preparing print</title></head><body>Preparing document…</body></html>');w.document.close();let settings=template;
 if(!settings&&orgId){let query=supabase.from('named_print_templates').select('settings,kind').eq('organization_id',orgId);query=record.template_id?query.eq('id',record.template_id):query.eq('kind',kind).eq('is_default',true).eq('archived',false);const {data:named,error:namedError}=await query.maybeSingle();if(namedError)throw namedError;settings=named?.settings;if(settings&&named.kind!==kind)settings={...settings,title:kind==='quotation'?'Quotation':kind==='invoice'?'Invoice':'Receipt'};}
 if(!settings&&orgId){const {data,error}=await supabase.from('organization_print_settings').select('templates').eq('organization_id',orgId).maybeSingle();if(error)throw error;settings=data?.templates?.[kind]||(kind==='quotation'?{...data?.templates?.invoice,title:'Quotation'}:undefined)}
 if(w.closed)return false;w.document.open();w.document.write(documentHtml({kind,record,brand,currency,template:settings}));w.document.close();
 const ready=Promise.all([...w.document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve})));await Promise.race([ready,new Promise(resolve=>setTimeout(resolve,2500))]);await new Promise(resolve=>setTimeout(resolve,150));if(!w.closed){w.focus();if(!preview)w.print()}return true;
 }catch{if(!w.closed)w.close();notify?.('Print settings could not be loaded. Please try again.');return false}
}
