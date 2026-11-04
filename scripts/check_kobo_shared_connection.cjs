const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const page=await browser.newPage({viewport:{width:1450,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const pid=JSON.parse(fs.readFileSync('output/kobo-connection-setup/fixture.json')).id,base='http://127.0.0.1:5386';
await page.goto(`${base}/#/kobo/${pid}`);await page.getByRole('button',{name:'Review',exact:true}).click();
const group=page.locator('[data-check^="connection-setup:"]');await group.first().waitFor();assert.equal(await group.count(),1);assert.match(await group.innerText(),/Shared connection.*Question A/s);assert.match(await group.innerText(),/2 questions/);
await group.locator('.kobo-data-review-group-heading').click();await group.getByRole('button',{name:'Edit connection',exact:true}).click();
const editor=page.getByRole('dialog',{name:'Edit connection',exact:true});await editor.getByText('Affected questions',{exact:true}).click();assert.equal(await editor.locator('li').count(),2);
const confirm=editor.getByRole('button',{name:'Confirm connection for 2 questions',exact:true});await confirm.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Confirm connection for 2 questions'&&!b.disabled));
await page.screenshot({path:'output/kobo-connection-setup/shared-confirmation.png'});await confirm.click();await editor.waitFor({state:'detached'});await group.waitFor({state:'detached'});
const saved=await(await page.request.get(`${base}/api/kobo/projects/${pid}`)).json();for(const id of ['required_text','optional_text'])assert(!saved.form.questions.find(q=>q.id===id).connectionSetup);assert.equal(errors.length,0);console.log('Passed shared connection grouping, affected questions, explicit confirmation and resumed checks.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

