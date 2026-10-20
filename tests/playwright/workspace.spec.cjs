const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
let fixture;
test.beforeAll(()=>{const file=path.join(os.tmpdir(),`workspace-playwright-${process.pid}.html`);execFileSync(process.execPath,['scripts/mobile-navigation-tests.cjs'],{env:{...process.env,PLAYWRIGHT_EXPORT_FIXTURE:file},stdio:'pipe'});fixture=fs.readFileSync(file,'utf8');fs.unlinkSync(file)});

test('live login loads without a client exception or horizontal overflow',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('/',{waitUntil:'domcontentloaded'});expect(response.status()).toBe(200);
 await expect(page.locator('input[type=email]')).toBeVisible();await expect(page.locator('input[type=password]')).toBeVisible();
 await expect(page.locator('input[type=email]')).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('login.png'),fullPage:true});
});
test('live forgot-password screen opens and returns without sending email',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Forgot password?'}).click();
 await expect(page.getByRole('heading',{name:'Reset password'})).toBeVisible();
 await expect(page.locator('input[type=password]')).toHaveCount(0);
 await page.getByRole('button',{name:/Back to sign in/}).click();await expect(page.locator('input[type=password]')).toBeVisible();
});
test('live login handles a rejected response and allows retry (intercepted API)',async({page})=>{
 await page.route('**/api/auth/login',route=>route.fulfill({status:401,json:{error:'Test account credentials were rejected.'}}));
 await page.goto('/');await page.locator('input[type=email]').fill('playwright@example.test');await page.locator('input[type=password]').fill('NotARealPassword123!');
 await page.locator('form button[type=submit],form button.primary').click();await expect(page.locator('.error-box')).toContainText('Test account credentials were rejected.');await expect(page.locator('form button.primary')).toBeEnabled();
});
test('live protected endpoints reject unauthenticated access',async({request})=>{
 for(const url of ['/api/auth/workspace','/api/cases']){const response=await request.get(url);expect([401,403]).toContain(response.status())}
});

test.describe('real mobile navigation component with isolated sample data',()=>{
 test.beforeEach(async({page},info)=>{test.skip(info.project.name!=='mobile','Mobile-only interaction coverage');page.on('pageerror',e=>console.error('Fixture error:',e.message));await page.route('https://workspace-fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('https://workspace-fixture.invalid/')});
 test('More menu searches, routes, and restores background interaction',async({page})=>{
 await page.getByRole('button',{name:'More',exact:true}).click();await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 await page.locator('input[aria-label="Find a module"]').fill('custody');await expect(page.locator('.mobile-menu-group button')).toHaveCount(1);
 await page.locator('.mobile-menu-group button').click();await expect(page.locator('.mobile-app-layer')).toHaveCount(0);expect(await page.evaluate(()=>window.actions)).toContain('view:custody');await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');
 });
 test('Escape closes menu and mobile search sends tracking input',async({page})=>{
 await page.getByRole('button',{name:'More',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('.mobile-app-layer')).toHaveCount(0);
 await page.getByRole('button',{name:'Search attestations'}).click();await page.locator('input[aria-label="Tracking, name or mobile"]').fill('58457');await page.getByRole('button',{name:'Run search'}).click();expect(await page.evaluate(()=>window.actions)).toContain('search:58457');
 });
 test('Fern and Studio light/dark menus fit mobile screen',async({page},info)=>{
 for(const theme of ['fern','studio'])for(const mode of ['light','dark']){
 await page.evaluate(({theme,mode})=>{document.documentElement.dataset.workspaceTheme=theme;document.documentElement.dataset.workspaceMode=mode},{theme,mode});
 await page.getByRole('button',{name:'More',exact:true}).click();await expect(page.locator('.mobile-app-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:info.outputPath(`${theme}-${mode}.png`)});await page.keyboard.press('Escape');await expect(page.locator('.mobile-app-layer')).toHaveCount(0);
 }
 });
});
