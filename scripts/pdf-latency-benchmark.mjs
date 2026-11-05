import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {documentHtml} from '../lib/printTemplate.js';
import {renderPdf,closePdfRenderer} from '../lib/renderPdf.js';
import {cachedPdf,clearPdfServerCache} from '../lib/pdfCache.js';
if(process.env.PDF_TEST_SKIP_CHOWN==='1')fs.promises.chown=async()=>{};
const oldSource=execFileSync('git',['show',(process.env.PDF_BENCH_BASE_REF||'origin/main')+':lib/pdfCache.js'],{encoding:'utf8'});
const previous=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
const html=n=>documentHtml({record:{document_no:'SPEED-'+n,document_date:'2026-11-05',customer_name:'Synthetic benchmark',items:[{description:'Test service',quantity:1,unit_price:50}],total:50,paid_total:0},brand:{company_name:'Speed test'}});
const measure=async fn=>{const started=performance.now();const result=await fn();return {ms:Number((performance.now()-started).toFixed(2)),result}};
try{
 const cold=await measure(()=>renderPdf(html('cold')));if(cold.result.length<500)throw Error('Invalid PDF');
 const inputs=Array.from({length:12},(_,i)=>({userId:'benchmark',host:'benchmark.invalid',html:html(i),paper:'A4',render:renderPdf}));
 previous.clearPdfServerCache();for(const input of inputs)await previous.cachedPdf(input);const baseline=await measure(()=>previous.cachedPdf(inputs[0]));
 clearPdfServerCache();for(const input of inputs)await cachedPdf(input);const improved=await measure(()=>cachedPdf(inputs[0]));
 const results={scope:'Local synthetic PDF generation only; excludes access RPC, network and device preview.',cold_render_ms:cold.ms,reopen_after_12_documents:{previous:{ms:baseline.ms,cache:baseline.result.cache},improved:{ms:improved.ms,cache:improved.result.cache}}};
 console.log(JSON.stringify(results,null,2));fs.writeFileSync('/tmp/kenza-pdf-benchmark.json',JSON.stringify(results,null,2));
 if(improved.result.cache!=='hit')throw Error('Repeated document should remain cached');
}finally{await closePdfRenderer()}
