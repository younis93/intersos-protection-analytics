const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.CUSTOM_ANALYSIS_URL||'http://127.0.0.1:5401';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{for(const theme of ['glass-light','glass-dark'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(t=>localStorage.setItem('app-theme',t),theme);await page.route('**/api/app/**',r=>r.fulfill({json:{available:false}}));
  const staged=await(await page.request.post(base+'/api/custom/columns/preview',{multipart:{data:{name:'data.csv',mimeType:'text/csv',buffer:Buffer.from('Code,Amount\n001,20\n002,30\n')}}})).json();
  const project=await(await page.request.post(base+'/api/custom/columns/confirm',{data:{token:staged.token,name:'Fast preparation',config:staged.config}})).json();assert(project.id,JSON.stringify(project));
  await page.goto(base+'/#/custom/'+project.id);
  let release,gate=new Promise(resolve=>release=resolve),fail=false;
  await page.route(`**/api/custom/projects/${project.id}/columns`,async route=>{await gate;if(fail)await route.fulfill({status:503,json:{detail:'Preview temporarily unavailable'}});else await route.continue()});
  const open=async()=>{await page.getByRole('button',{name:'Manage data',exact:true}).click();const start=Date.now();await page.getByRole('button',{name:'Prepare data',exact:true}).click();await page.getByLabel('Column display label',{exact:true}).waitFor({timeout:1000});return Date.now()-start};
  const elapsed=await open();console.log('Immediate editor',theme,width,elapsed+'ms');
  assert(elapsed<1000);assert.equal(await page.getByRole('heading',{name:'Start with your spreadsheet',exact:true}).count(),0);assert.equal(await page.locator('.custom-working').count(),0);
  assert(await page.getByRole('button',{name:'Choose filters',exact:true}).isDisabled());
  assert.equal(await page.locator('[aria-label="Preparation preview"]').getAttribute('aria-busy'),'true');
  await page.getByLabel('Column display label',{exact:true}).fill('Edited before preview');await page.getByLabel('Column group',{exact:true}).fill('Early group');
  await page.locator('.custom-column-list button').nth(1).click();release();
  await page.locator('[aria-label="Preparation preview"][aria-busy="false"]').waitFor();
  assert.equal(await page.getByLabel('Column display label',{exact:true}).inputValue(),'Amount');
  await page.locator('.custom-column-list button').nth(0).click();assert.equal(await page.getByLabel('Column display label',{exact:true}).inputValue(),'Edited before preview');assert.equal(await page.getByLabel('Column group',{exact:true}).inputValue(),'Early group');
  await page.getByRole('button',{name:'Choose filters',exact:true}).click();await page.getByRole('button',{name:'Review',exact:true}).click();await page.getByRole('button',{name:'Apply changes',exact:true}).click();await page.locator('.custom-setup').waitFor({state:'hidden'});
  const saved=await(await page.request.get(base+'/api/custom/projects/'+project.id)).json();assert.equal(saved.customConfig.columns[0].label,'Edited before preview');assert.equal(saved.customConfig.columns[0].group,'Early group');
  // A failed background preview keeps the editor usable and supports retry.
  fail=true;gate=Promise.resolve();await open();await page.getByRole('alert').filter({hasText:'Preview temporarily unavailable'}).waitFor();assert(await page.getByRole('button',{name:'Choose filters',exact:true}).isDisabled());
  await page.getByLabel('Column group',{exact:true}).fill('After failure');fail=false;await page.getByRole('button',{name:'Retry preview',exact:true}).click();await page.locator('[aria-label="Preparation preview"][aria-busy="false"]').waitFor();assert.equal(await page.getByLabel('Column group',{exact:true}).inputValue(),'After failure');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('.custom-setup').waitFor({state:'hidden'});
  // Closing during loading cleans up the staging token when the late response arrives.
  gate=new Promise(resolve=>release=resolve);await open();await page.getByRole('button',{name:'Close prepare data',exact:true}).click();await page.locator('.custom-setup').waitFor({state:'hidden'});
  const cleaned=page.waitForResponse(response=>response.url().includes('/api/custom/columns/')&&response.request().method()==='DELETE');release();await cleaned;
  assert.deepEqual(await(await page.request.get(base+'/api/custom/projects/'+project.id)).json(),saved);assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS immediate preparation: editor before preview response, early edits retained, selection retained, save validation, retry, cancellation and late token cleanup desktop/mobile light/dark');}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
