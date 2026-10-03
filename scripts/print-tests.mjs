import assert from 'node:assert/strict';
import {documentHtml,normalizePrintTemplate} from '../lib/printTemplate.js';
let checks=0;
for(const kind of ['invoice','receipt','delivery','report'])for(const paper of ['A4','A5','58mm','80mm']){
 const html=documentHtml({kind,record:{customer_name:'<script>bad()</script>',items:[{description:'<img src=x onerror=bad()>',quantity:1,unit_price:100,government_fee:25,service_fee:75}],total:100,paid_total:10},brand:{company_name:'<b>Company</b>',logo_url:'javascript:alert(1)'},template:{paper,footer:'<script>bad()</script>',terms:'Terms',show_fees:true}});
 assert(!html.includes('<script>'));assert(!html.includes('src="javascript:'));assert(html.includes('&lt;script&gt;'));assert(html.includes('Terms'));if(paper.endsWith('mm'))assert(html.includes('@page{size:auto'));else assert(html.includes('@page{size:'+paper));checks+=5;
}
const hidden=documentHtml({kind:'invoice',record:{customer_mobile:'ONLY-MOBILE',customer_email:'ONLY-EMAIL',items:[{description:'Test',government_fee:25,service_fee:75,unit_price:100,quantity:1}],total:100,paid_total:10},template:{show_mobile:false,show_email:false,show_fees:false,show_balance:false,show_signature:false}});
assert(!hidden.includes('ONLY-MOBILE'));assert(!hidden.includes('ONLY-EMAIL'));assert(!hidden.includes('Govt QAR'));assert(!hidden.includes('<span>Balance</span>'));assert(!hidden.includes('Authorized signature'));checks+=5;
const normalized=normalizePrintTemplate('receipt',{paper:'unsafe',font_size:999,logo_width:999,margin:-3,style:'unsafe'});assert.equal(normalized.paper,'80mm');assert.equal(normalized.font_size,16);assert.equal(normalized.logo_width,80);assert.equal(normalized.margin,0);assert.equal(normalized.style,'Minimal');checks+=5;
assert(!documentHtml({brand:{footer_text:'Company default'},template:{footer:''}}).includes('Company default'));checks++;

const artwork='data:image/png;base64,aGVsbG8=';
const customized=documentHtml({kind:'invoice',record:{items:[{description:'Combined only',unit_price:100,quantity:1,government_fee:25,service_fee:75,show_fees:false},{description:'Requested split',unit_price:150,quantity:1,government_fee:50,service_fee:100,show_fees:true}]},template:{show_fees:false,header_image:artwork,footer_image:artwork,header_width:80,header_height:20,footer_width:60,footer_height:10}});
assert.equal((customized.match(/src="data:image\/png/g)||[]).length,2);checks++;
assert(customized.includes('width:80%;height:20mm'));assert(customized.includes('width:60%;height:10mm'));checks+=2;
assert(!customized.includes('Govt QAR 25'));assert(customized.includes('Govt QAR 50'));checks+=2;
const unsafeImages=normalizePrintTemplate('invoice',{header_image:'data:image/svg+xml;base64,PHN2Zz4=',footer_image:'javascript:alert(1)',header_width:999,footer_height:-5});
assert.equal(unsafeImages.header_image,'');assert.equal(unsafeImages.footer_image,'');assert.equal(unsafeImages.header_width,100);assert.equal(unsafeImages.footer_height,5);checks+=4;
for(const kind of ['invoice','quotation','receipt']){const html=documentHtml({kind,template:{paper:'80mm',title:kind==='invoice'?'Invoice':kind==='quotation'?'Quotation':'Receipt'},record:{items:[],document_no:'REF'}});assert(html.includes('@page{size:auto'));assert(html.includes(kind==='invoice'?'Invoice':kind==='quotation'?'Quotation':'Receipt'));checks+=2;}
console.log(`PASS: ${checks} print-template assertions.`);
