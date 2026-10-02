import {supabase} from './supabase';
import {documentHtml} from './printTemplate';
export {PRINT_DEFAULTS,normalizePrintTemplate,documentHtml} from './printTemplate';
export async function printConfiguredDocument({orgId,kind='invoice',record,brand,currency,popup,notify,template}){
 const w=popup||window.open('','_blank');if(!w){notify?.('Allow pop-ups to print this document.');return false}
 try{w.document.write('<!doctype html><html><head><title>Preparing print</title></head><body>Preparing document…</body></html>');w.document.close();let settings=template;
 if(!settings&&orgId){const {data,error}=await supabase.from('organization_print_settings').select('templates').eq('organization_id',orgId).maybeSingle();if(error)throw error;settings=data?.templates?.[kind]}
 if(w.closed)return false;w.document.open();w.document.write(documentHtml({kind,record,brand,currency,template:settings}));w.document.close();
 const ready=Promise.all([...w.document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve})));await Promise.race([ready,new Promise(resolve=>setTimeout(resolve,2500))]);await new Promise(resolve=>setTimeout(resolve,150));if(!w.closed){w.focus();w.print()}return true;
 }catch{if(!w.closed)w.close();notify?.('Print settings could not be loaded. Please try again.');return false}
}
