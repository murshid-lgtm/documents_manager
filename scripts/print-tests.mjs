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
console.log(`PASS: ${checks} print-template assertions.`);
