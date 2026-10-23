/* Render the complete production application with a fake signed-in session and
   intercepted data. No real accounts, credentials or customer writes are used. */
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 if(process.env.PDF_TEST_SKIP_CHOWN==='1'){fs.chown=(...a)=>a.at(-1)(null);fs.lchown=(...a)=>a.at(-1)(null);fs.promises.chown=async()=>{};require('node:module').syncBuiltinESMExports()}
 const chromium=(await import('@sparticuz/chromium')).default,puppeteer=(await import('puppeteer-core')).default;chromium.setGraphicsMode=false;
 const browser=await puppeteer.launch({args:await puppeteer.defaultArgs({args:chromium.args,headless:'shell'}),executablePath:await chromium.executablePath(),headless:'shell'});
 const origin=process.env.WORKSPACE_SMOKE_URL||'http://127.0.0.1:3100',id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;let checks=0;
 const server=process.env.WORKSPACE_SMOKE_URL?null:require('node:child_process').spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3100'],{stdio:['ignore','pipe','pipe']});
 if(server)await new Promise((resolve,reject)=>{let logs='';const timer=setTimeout(()=>reject(Error('Smoke server startup timed out.')),10000);const read=data=>{logs+=data;if(logs.includes('Ready in')){clearTimeout(timer);resolve()}};server.stdout.on('data',read);server.stderr.on('data',read);server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(Error('Smoke server exited: '+code))})});
 try{for(const role of ['admin','branch','staff','platform']){
  const page=await browser.newPage(),errors=[],writes=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',async message=>{if(message.type()==='error')for(const arg of message.args()){const problem=await arg.evaluate(value=>value instanceof Error?`${value.name}: ${value.message}`:null).catch(()=>null);if(problem)errors.push(problem)}});await page.setViewport({width:1440,height:960});
  const user={id:id(1),aud:'authenticated',role:'authenticated',email:'smoke@example.invalid',app_metadata:{},user_metadata:{}},profile={id:id(1),organization_id:role==='platform'?null:id(2),full_name:'Smoke user',role:role==='platform'?'admin':role,is_active:true,is_platform_super_admin:role==='platform',staff_modules:null,branch_id:role==='branch'?id(3):null};
  const brand={organization_id:id(2),company_name:'Client smoke workspace',product_name:'Document Tracker',short_name:'C',primary_domain:'localhost',loader_animation:'signature',enabled_modules:['dashboard','cases','documents','operations','deliveries','custody','appointments','batches','courier','payments','reports','import','crm','sales','services']};
  const token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
  await page.evaluateOnNewDocument(({user,token})=>localStorage.setItem('sb-workspace-smoke-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})),{user,token});
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
   if(url.origin===origin){if(url.pathname==='/api/auth/workspace')return json({ok:true});if(url.pathname==='/api/cases')return json({cases:[]});if(url.pathname.startsWith('/api/'))return json({});return request.continue()}
   return request.abort();
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});try{await page.waitForSelector('.sidebar-menu-flat')}catch(error){throw new Error(`${role} workspace failed: ${errors.join('; ')}; ${await page.$eval('body',e=>e.innerText).catch(()=>'')}`)}
  assert.equal(await page.$eval('.workspace-page h1',e=>e.textContent),'Dashboard');assert.deepEqual(errors,[]);checks+=2;
  for(const label of ['Attestations','Deliveries','Dashboard']){await page.evaluate(label=>[...document.querySelectorAll('.sidebar-menu-flat button')].find(b=>b.getAttribute('aria-label')===label)?.click(),label);await page.waitForFunction(label=>document.querySelector('.workspace-page h1')?.textContent===label,{},label);assert.deepEqual(errors,[]);checks++}
  assert.equal(await page.$('.nav-group-toggle'),null);assert.equal(await page.evaluate(()=>document.body.textContent.includes('Something went wrong')),false);assert.deepEqual(writes,[]);checks+=3;await page.screenshot({path:`/tmp/client-workspace-${role}-smoke.png`});await page.close();
 }}finally{await browser.close();server?.kill('SIGTERM')}
 console.log(`PASS: ${checks} complete production workspace checks across admin, branch, staff and platform: authentication, dashboard, sidebar navigation and no runtime exceptions or customer writes.`);
})().catch(error=>{console.error(error);process.exitCode=1});
