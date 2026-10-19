// Document rendering only: no network, scripts, cookies or live app browsing.
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,min,max,fallback)=>Math.min(max,Math.max(min,Number(v)||fallback));
const image=s=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s||'')?s:'';
let browserPromise=null,idleTimer=null,active=0;const pending=[];
async function browserLease(){if(active>=2)await new Promise(resolve=>pending.push(resolve));else active++;clearTimeout(idleTimer);if(!browserPromise)browserPromise=(async()=>{const [{default:chromium},{default:puppeteer}]=await Promise.all([import('@sparticuz/chromium'),import('puppeteer-core')]);chromium.setGraphicsMode=false;return puppeteer.launch({args:await puppeteer.defaultArgs({args:chromium.args.filter(arg=>arg!=='--single-process'),headless:'shell'}),executablePath:await chromium.executablePath(),headless:'shell'})})().catch(e=>{browserPromise=null;throw e});try{let browser=await browserPromise;if(!browser.connected){browserPromise=null;throw Error('PDF browser disconnected. Please retry.')}return browser}catch(e){releaseBrowser();throw e}}
function releaseBrowser(){const next=pending.shift();if(next){next();return}active--;if(!active){idleTimer=setTimeout(()=>{const old=browserPromise;browserPromise=null;old?.then(b=>b.close()).catch(()=>{})},180000);idleTimer.unref?.()}}
export async function closePdfRenderer(){clearTimeout(idleTimer);const old=browserPromise;browserPromise=null;await old?.then(b=>b.close()).catch(()=>{})}
export async function renderPdf(html,paper='A4'){
 const browser=await browserLease();let context;
 try{
  context=await browser.createBrowserContext();const page=await context.newPage();await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);
  page.on('request',request=>/^(data:image\/(png|jpeg|webp);base64,|about:blank$)/i.test(request.url())?request.continue():request.abort());
  if(paper.endsWith('mm'))await page.setViewport({width:Math.ceil(Number.parseInt(paper)*96/25.4),height:100});
  await page.setContent(html,{waitUntil:'load',timeout:15000});
  const thermal=paper.endsWith('mm');let options={};
  const artwork=await page.evaluate(()=>{try{return JSON.parse(document.querySelector('meta[name="pdf-artwork"]')?.content||'null')}catch{return null}});
  if(artwork&&!thermal){
   const width=paper==='A5'?148:210,height=paper==='A5'?210:297,margin=number(artwork.margin,0,20,0),header=image(artwork.header_image),footer=image(artwork.footer_image),hh=number(artwork.header_height,5,100,25),fh=number(artwork.footer_height,5,100,25),hx=number(artwork.header_x,-60,60,0),hy=number(artwork.header_y,-60,60,0),fx=number(artwork.footer_x,0,60,0),fy=number(artwork.footer_y,0,60,0),hw=number(artwork.header_width,10,100,100),fw=number(artwork.footer_width,10,100,100);
   const top=header?Math.max(margin,hh+Math.max(0,hy)+6):margin,bottom=footer?fh+fy+6:artwork.footer?12:margin;
   // Browser-managed margin templates repeat on each page. They don't participate
   // in the content flow and cannot push the first-page footer to a second page.
   options={displayHeaderFooter:true,headerTemplate:header?`<div style="width:100%;height:${top}mm;position:relative;transform:translateY(-5mm)"><img src="${header}" style="position:absolute;left:${hx}mm;top:${Math.max(0,hy)}mm;width:${hw}%;height:${hh}mm;object-fit:contain"/></div>`:'<div></div>',footerTemplate:`<div style="width:100%;height:${bottom}mm;position:relative;transform:translateY(5mm);font:9px Arial;text-align:center">${footer?`<img src="${footer}" style="position:absolute;left:${fx}mm;bottom:${fy}mm;width:${fw}%;height:${fh}mm;object-fit:${['fill','contain','cover'].includes(artwork.footer_fit)?artwork.footer_fit:'fill'}"/>`:esc(artwork.footer)}</div>`};
   const bg=image(artwork.background_image),bw=number(artwork.background_width,10,200,100),bh=number(artwork.background_height,10,200,100),bx=number(artwork.background_x,0,100,50),by=number(artwork.background_y,0,100,50);
   await page.addStyleTag({content:`@page{size:${paper} portrait;margin:${top}mm 0 ${bottom}mm!important}@media print{.header-art,.letterhead-footer,.template-header-image,footer{display:none!important}.document{min-height:0!important;padding-top:0!important;padding-bottom:0!important}.page-background,.print-background{position:fixed!important;left:${width*(bx-bw/2)/100}mm!important;top:${height*(by-bh/2)/100-top}mm!important;width:${width*bw/100}mm!important;height:${height*bh/100}mm!important;transform:none!important}}`});
   if(!bg)await page.evaluate(()=>document.querySelectorAll('.page-background,.print-background').forEach(n=>n.remove()));
  }
  await page.emulateMediaType('print');
  const height=thermal?await page.evaluate(()=>Math.ceil(document.body.getBoundingClientRect().height)):null;
  return await page.pdf({printBackground:true,preferCSSPageSize:!thermal,...options,...(thermal?{width:paper,height:`${Math.max(150,height)}px`,margin:{top:0,bottom:0,left:0,right:0}}:{format:paper}),timeout:20000});
 }finally{await context?.close().catch(()=>{});releaseBrowser()}
}
