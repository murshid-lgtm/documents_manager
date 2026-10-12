import fs from 'node:fs';
import {documentHtml} from '../lib/printTemplate.js';
import {renderPdf} from '../lib/renderPdf.js';
// The local managed filesystem does not implement chown; deployment uses a normal /tmp.
if(process.env.PDF_TEST_SKIP_CHOWN==='1')fs.promises.chown=async()=>{};
const fixture={"header": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAMCAIAAAAmte5SAAAAO0lEQVR4nO3QQRHAIADAMEDXhCEHqVOx8liioNe5zzP43rod8BdGR4yOGB0xOmJ0xOiI0RGjI0ZHjI68VFkBbLSymuwAAAAASUVORK5CYII=", "footer": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAMCAIAAAAmte5SAAAAPUlEQVR4nO3QQRHAIADAMEDFVCAE/4KmYuWxREGv8zl78L11O+AvjI4YHTE6YnTE6IjREaMjRkeMjhgdeQFgHACoVQoxVgAAAABJRU5ErkJggg==", "background": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAMCAIAAAAmte5SAAAAO0lEQVR4nO3QsQ3AIADAMOD/eyvB1CsahtoXRJn7PIPvrdsBf2F0xOiI0RGjI0ZHjI4YHTE6YnTE6MgLF+cDAf2n4vEAAAAASUVORK5CYII="};
const asset=name=>fixture[name];
for(const count of [1,65]){
 const record={document_no:'INV-TEST-'+count,document_date:'2026-10-12',customer_name:'Sample Customer',customer_mobile:'50000000',items:Array.from({length:count},(_,i)=>({description:'Attestation service '+(i+1),quantity:1,unit_price:50})),total:count*50,paid_total:count*50,customer_notes:'Thank you for your business.'};
 const html=documentHtml({record,brand:{company_name:'Test Company'},template:{style:'Letterhead',footer_image:asset('footer'),footer_height:15,footer_width:100,header_image:asset('header'),header_height:15,header_width:100,header_space:45,background_image:asset('background')}});
 fs.writeFileSync('/tmp/INV-TEST-'+count+'.html',html);
 const pdf=await renderPdf(html);fs.writeFileSync('/tmp/INV-TEST-'+count+'.pdf',pdf);const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:pdf.slice()});const doc=await task.promise;if(count===1&&doc.numPages!==1)throw Error('Short invoice must remain one page');if(count>1&&doc.numPages<2)throw Error('Long invoice must paginate');let text='';for(let page=1;page<=doc.numPages;page++){const p=await doc.getPage(page);text+=(await p.getTextContent()).items.map(i=>i.str).join(' ')+' ';}for(let line=1;line<=count;line++)if(!text.includes('Attestation service '+line))throw Error('Missing invoice line '+line);console.log('PASS:',count,'items,',doc.numPages,'pages, all lines retained');await doc.destroy();
}
