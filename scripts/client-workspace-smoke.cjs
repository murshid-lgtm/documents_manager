/* Render the complete production application with a fake signed-in session and
   intercepted data. No real accounts, credentials or customer writes are used. */
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 if(process.env.PDF_TEST_SKIP_CHOWN==='1'){fs.chown=(...a)=>a.at(-1)(null);fs.lchown=(...a)=>a.at(-1)(null);fs.promises.chown=async()=>{};require('node:module').syncBuiltinESMExports()}
 const chromium=(await import('@sparticuz/chromium')).default,puppeteer=(await import('puppeteer-core')).default;chromium.setGraphicsMode=false;
 const browser=await puppeteer.launch({args:await puppeteer.defaultArgs({args:chromium.args,headless:'shell'}),executablePath:await chromium.executablePath(),headless:'shell'});
 const mobile=process.env.WORKSPACE_SMOKE_MOBILE==='1',origin=process.env.WORKSPACE_SMOKE_URL||'http://127.0.0.1:3100',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;let checks=0;
 const server=process.env.WORKSPACE_SMOKE_URL?null:require('node:child_process').spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3100'],{stdio:['ignore','pipe','pipe']});
 if(server)await new Promise((resolve,reject)=>{let logs='';const timer=setTimeout(()=>reject(Error('Smoke server startup timed out.')),10000);const read=data=>{logs+=data;if(logs.includes('Ready in')){clearTimeout(timer);resolve()}};server.stdout.on('data',read);server.stderr.on('data',read);server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(Error('Smoke server exited: '+code))})});
 try{for(const role of ['admin','branch','staff','platform']){
  const page=await browser.newPage(),errors=[],writes=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',async message=>{if(message.type()==='error')for(const arg of message.args()){const problem=await arg.evaluate(value=>value instanceof Error?`${value.name}: ${value.message}`:null).catch(()=>null);if(problem)errors.push(problem)}});await page.setViewport(mobile?{width:390,height:844,isMobile:true,hasTouch:true}:{width:1440,height:960});
  const user={id:id(1),aud:'authenticated',role:'authenticated',email:'smoke@example.invalid',app_metadata:{},user_metadata:{}},profile={id:id(1),organization_id:role==='platform'?null:id(2),full_name:'Smoke user',role:role==='platform'?'admin':role,is_active:true,is_platform_super_admin:role==='platform',staff_modules:null,branch_id:role==='branch'?id(3):null};
  const brand={organization_id:id(2),company_name:'Client smoke workspace',product_name:'Document Tracker',short_name:'C',primary_domain:'localhost',loader_animation:'signature',enabled_modules:['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports','import','crm','sales','services']};
  const records=mobile?[{id:id(4),organization_id:id(2),branch_id:id(3),branches:{name:'Main branch'},tracking_reference:'10001',customer_name:'Sample delivery customer',mobile:'50000001',overall_status:'Ready for Delivery',submission_date:'2026-10-23',total_amount:100,advance_paid:100,balance_payment:0,documents:[{id:id(5),case_id:id(4),document_name:'Degree certificate',quantity:1,occurrence_no:1,document_stages:[{id:id(6),document_id:id(5),stage_name:'MEA',stage_order:1,status:'Completed'}]}]}]:[];
  const token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
  await page.evaluateOnNewDocument(({user,token,mode,theme})=>{localStorage.setItem('sb-workspace-smoke-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}));localStorage.setItem('workspace-appearance-v1',JSON.stringify({theme,mode}))},{user,token,mode:process.env.WORKSPACE_SMOKE_MODE||'light',theme:process.env.WORKSPACE_SMOKE_THEME||'fern'});
  await page.setRequestInterception(true);page.on('request',async request=>{
   const url=new URL(request.url()),json=data=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(data)});
   if(url.hostname==='workspace-smoke.supabase.co'){
    if(request.method()==='OPTIONS')return request.respond({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
    if(url.pathname==='/auth/v1/user')return json(user);
    if(url.pathname.includes('/rpc/')){const name=url.pathname.split('/').at(-1);if(name==='is_current_session_valid')return json(true);if(name==='public_branding')return json(brand);if(name==='workspace_alert_list')return json({rows:[],counts:{unread:0},total:0});return json([])}
    if(!['GET','HEAD'].includes(request.method())){writes.push(url.pathname);return request.abort()}
    const table=url.pathname.split('/').at(-1),object=(request.headers().accept||'').includes('object+json');let data=[];
    if(table==='profiles')data=[profile];if(table==='branches')data=[{id:id(3),organization_id:id(2),name:'Main branch',is_active:true}];if(table==='organizations')data=[{id:id(2),name:brand.company_name,slug:'client-smoke',status:'Active',currency_code:'QAR',timezone:'Asia/Qatar'}];if(table==='organization_settings')data=[brand];
    return json(object?(data[0]||null):data);
   }
   if(url.origin===origin){if(url.pathname==='/api/auth/workspace')return json({ok:true});if(url.pathname==='/api/cases')return json({cases:records});if(url.pathname.startsWith('/api/'))return json({});return request.continue()}
   return request.abort();
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});try{await page.waitForSelector('.sidebar-menu-flat')}catch(error){throw new Error(`${role} workspace failed: ${errors.join('; ')}; ${await page.$eval('body',e=>e.innerText).catch(()=>'')}`)}
  assert.equal(await page.$eval('.workspace-page h1',e=>e.textContent),'Dashboard');assert.deepEqual(errors,[]);checks+=2;
  if(role==='admin'){
   const moduleIcons=await page.$$eval('.sidebar-menu-flat .nav-icon>svg',nodes=>nodes.map(e=>({name:e.dataset.icon,shape:e.innerHTML})));
   assert.equal(new Set(moduleIcons.map(e=>e.name)).size,moduleIcons.length,'Every module needs its own icon');
   assert.equal(new Set(moduleIcons.map(e=>e.shape)).size,moduleIcons.length,'Module icon artwork must be distinct');checks+=2;
   for(const [label,icon] of [['Attestations','attestation'],['Accounts','accounts'],['Email centre','mail'],['WhatsApp CRM','whatsapp']]){const actual=await page.evaluate(label=>[...document.querySelectorAll('.sidebar-menu-flat .nav')].find(e=>e.getAttribute('aria-label')===label)?.querySelector('svg')?.dataset.icon,label);if(actual){assert.equal(actual,icon);checks++}}
   assert.equal(await page.$eval('.sidebar-menu-flat .nav',e=>getComputedStyle(e).fontSize),'13.5px');
   assert.equal(await page.$eval('.workspace-toolbar .app-icon',e=>e.getAttribute('stroke-width')),'1.5');checks+=2;
   if(!mobile){
    assert(await page.$$eval('.sidebar-menu-flat .nav',buttons=>buttons.every(e=>e.getBoundingClientRect().height<=40)),'Sidebar rows must stay compact');checks++;
    assert.equal(await page.$eval('.sidebar-menu-flat .nav-icon>.app-icon',e=>getComputedStyle(e).width),'16px');checks++;
    if(await page.$('.fern-kpi')){
     if(await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches))await page.hover('.fern-kpi');else await page.focus('.fern-kpi');
     await page.waitForFunction(()=>getComputedStyle(document.querySelector('.fern-kpi [data-icon="arrow-right"]')).transform!=='none');checks++;
     await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
     assert.equal(await page.$eval('.fern-kpi [data-icon="arrow-right"]',e=>getComputedStyle(e).transitionDuration),'0s');checks++;
     await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    }
    await page.click('.sidebar-toggle');assert(await page.$('.app-shell.sidebar-collapsed'));checks++;
    assert(await page.$eval('.sidebar-menu-flat .nav',e=>e.scrollWidth<=e.clientWidth+1),'Collapsed sidebar must fit');checks++;
    await page.click('.sidebar-toggle');
   }
  }
  for(const label of ['Attestations','Deliveries','Dashboard']){if(mobile){await page.tap('.mobile-app-nav button[aria-label="More"]');await page.waitForSelector('.mobile-menu-group');const target=await page.evaluateHandle(label=>[...document.querySelectorAll('.mobile-menu-group button')].find(b=>b.textContent.trim()===(label==='Dashboard'?'Home':label)),label);await target.asElement().tap();await target.dispose();await page.waitForFunction(()=>!document.querySelector('.mobile-app-layer'))}else await page.evaluate(label=>[...document.querySelectorAll('.sidebar-menu-flat button')].find(b=>b.getAttribute('aria-label')===label)?.click(),label);await page.waitForFunction(label=>document.querySelector('.workspace-page h1')?.textContent===label,{},label);assert.deepEqual(errors,[]);checks++}
  if(mobile){await page.waitForSelector('.mobile-dashboard');assert(await page.$eval('.mobile-home-metrics .featured',e=>{const style=getComputedStyle(e),l=value=>{const c=value.match(/[0-9.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722},a=l(style.color),b=l(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5}),'Featured KPI text contrast');checks++;assert(await page.$eval('.mobile-home-shortcuts',e=>e.getBoundingClientRect().bottom<innerHeight));assert.equal(await page.$eval('.mobile-home-activity',e=>e.open),false);checks+=2;for(const width of [320,390,430]){await page.setViewport({width,height:844,isMobile:true,hasTouch:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++}await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.tap('.mobile-home-activity summary');await page.waitForFunction(()=>document.querySelector('.mobile-home-activity').open);await page.tap('.mobile-home-activity summary');checks++;await page.evaluate(()=>window.scrollTo(0,0));}
  if(mobile&&role==='admin'){
   await page.tap('.mobile-home-records>button');await page.waitForSelector('.mobile-case-chrome');
   await page.tap('.mobile-case-shortcuts>button:first-child');await page.waitForSelector('.delivery-confirm-modal');
   await page.tap('.delivery-confirm-modal .modal-head .icon-btn');await page.waitForSelector('.mobile-case-chrome');
   assert.equal(await page.$eval('.mobile-case-identity h2',e=>e.textContent),records[0].customer_name);checks++;
   await page.tap('[aria-label="Close attestation"]');await page.waitForFunction(()=>!document.querySelector('.mobile-case-chrome'));
   await page.tap('.mobile-app-nav button[aria-label="More"]');await page.waitForSelector('.mobile-menu-group');
   await page.evaluate(()=>[...document.querySelectorAll('.mobile-menu-group button')].find(b=>b.textContent.trim()==='Attestations').click());
   await page.waitForSelector('.legacy-case-card');
   for(const width of [320,390,430]){
    await page.setViewport({width,height:844,isMobile:true,hasTouch:true});
    assert(await page.$eval('.legacy-case-card',e=>e.scrollWidth<=e.clientWidth+1),'Attestation card must fit phone width');
    assert(await page.$$eval('.legacy-card-actions button',buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)),'Phone actions must have 44px touch height');
    assert.equal(await page.$eval('.mobile-attestation-progress progress',e=>e.value),1);checks+=3;
   }
   await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
   await page.screenshot({path:'/tmp/mobile-attestation-list.png',fullPage:true});
   await page.tap('.mobile-app-nav button[aria-label="More"]');await page.waitForSelector('.mobile-menu-group');
   await page.evaluate(()=>[...document.querySelectorAll('.mobile-menu-group button')].find(b=>b.textContent.trim()==='Home').click());await page.waitForSelector('.mobile-dashboard');
  }
  assert.equal(await page.$('.nav-group-toggle'),null);assert.equal(await page.evaluate(()=>document.body.textContent.includes('Something went wrong')),false);assert.deepEqual(writes,[]);checks+=3;await page.screenshot({path:`/tmp/client-workspace-${role}-${mobile?'mobile':'desktop'}-smoke.png`,fullPage:mobile});await page.close();
 }}finally{await browser.close();server?.kill('SIGTERM')}
 console.log(`PASS: ${checks} complete production workspace checks across admin, branch, staff and platform: authentication, dashboard, sidebar navigation and no runtime exceptions or customer writes.`);
})().catch(error=>{console.error(error);process.exitCode=1});
