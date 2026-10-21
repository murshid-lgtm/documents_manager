export const WHATSAPP_FIELDS=['name','company','reference','status','tracking_link','total','balance','document_name','expiry_date'];
export const WHATSAPP_STARTERS=[
 {id:'welcome',name:'Welcome',body:'Hello {{name}}, thank you for contacting {{company}}. How can we help you today?'},
 {id:'update',name:'Service update',body:'Hello {{name}}, your reference {{reference}} is now {{status}}.\nTrack the progress: {{tracking_link}}'},
 {id:'payment',name:'Payment follow-up',body:'Hello {{name}}, this is a reminder from {{company}} regarding invoice {{reference}}. The remaining balance is {{balance}}. Please contact us if you need assistance.'},
 {id:'renewal',name:'Renewal reminder',body:'Hello {{name}}, your {{document_name}} expires on {{expiry_date}}. {{company}} can help you renew it. Please reply if you would like assistance.'},
 {id:'delivery',name:'Ready for collection',body:'Hello {{name}}, your documents for reference {{reference}} are ready for collection. Please contact {{company}} to arrange a convenient time.'}
];
export function whatsappPhone(value,country='974'){let phone=String(value||'').replace(/\D/g,'');if(phone.startsWith('00'))phone=phone.slice(2);if(phone.length===8)phone=country+phone;if(!/^[1-9]\d{7,14}$/.test(phone))throw Error('Add a valid mobile number with its country code in the customer profile.');return phone}
export function whatsappDraft(template,values){return String(template||'').replace(/{{\s*([a-z_]+)\s*}}/g,(_,key)=>String(values[key]??''))}
export function whatsappMissing(template,values){return [...new Set([...String(template||'').matchAll(/{{\s*([a-z_]+)\s*}}/g)].map(m=>m[1]).filter(key=>!WHATSAPP_FIELDS.includes(key)||values[key]===undefined||values[key]===null||values[key]===''))]}
export function whatsappLabels(text){const labels=String(text||'').split(',').map(v=>v.trim()).filter(Boolean),out=[];for(const label of labels){if(label.length>40)throw Error('Keep labels within 40 characters.');if(!out.some(v=>v.toLowerCase()===label.toLowerCase()))out.push(label)}if(out.length>8)throw Error('Use up to eight labels per customer.');return out}
export function whatsappLink(phone,message,country){if(!String(message||'').trim()||message.length>4000)throw Error('Enter a message up to 4,000 characters.');return 'https://wa.me/'+whatsappPhone(phone,country)+'?text='+encodeURIComponent(message)}
export function openWhatsAppCrm(customerId){window.dispatchEvent(new CustomEvent('workspace-whatsapp-crm',{detail:{customerId}}))}
