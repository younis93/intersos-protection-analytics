const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture=JSON.parse(fs.readFileSync('output/analysis-features/extended-fixture.json','utf8')),base='http://127.0.0.1:5397';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{for(const workspace of ['kobo','custom']){
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),item=fixture[workspace],project=item.project,ids=item.ids,errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.richCopy=[];Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{window.richCopy.push({text:await(await items[0].getType('text/plain')).text(),html:await(await items[0].getType('text/html')).text()})}}})});
 const endpoint=`${base}/api/${workspace}/projects/${project.id}`,settings=structuredClone(project.settings);
 settings.hidden=project.form.questions.filter(q=>q.id!==ids.answer).map(q=>q.id);settings.percentageDecimals=2;settings.filters=[{field:ids.status,kind:'category',values:['Refugee']}];
 settings.questions[ids.answer]={...settings.questions[ids.answer],filterMode:'own',ownFilters:[{field:ids.status,kind:'category',values:['IDP','Refugee']}],percentageMode:'breakdown-group',breakdowns:[ids.status,ids.gender],breakdownDisplay:'both'};
 const save=await page.request.put(endpoint+'/settings',{data:settings});assert(save.ok(),await save.text());
 await page.goto(`${base}/#/${workspace}/${project.id}`);const card=page.locator(`[data-question-id="${ids.answer}"]`);await card.locator('.kobo-question').waitFor();
 for(const percent of ['40.00%','60.00%','70.00%','30.00%'])assert((await card.innerText()).includes(percent));
 await card.getByRole('button',{name:`Copy table for ${project.form.questions.find(q=>q.id===ids.answer).name}`,exact:true}).click();
 for(let i=0;i<50&&!await page.evaluate(()=>window.richCopy.length);i++)await page.waitForTimeout(50);
 const copied=await page.evaluate(()=>window.richCopy[0]);for(const percent of ['40.00%','60.00%','70.00%','30.00%'])assert(copied.text.includes(percent));assert(copied.html.includes('colspan="4"'));assert(copied.text.includes('Uses own filters'));
 const download=page.waitForEvent('download');await card.getByRole('button',{name:'Export question',exact:true}).click();await card.getByRole('button',{name:'Question PDF',exact:true}).click();await(await download).saveAs(`output/analysis-features/${workspace}-breakdown-group.pdf`);
 await page.screenshot({path:`output/analysis-features/${workspace}-breakdown-example.png`});assert.deepEqual(errors,[]);console.log('PASS',workspace,'40/60 and 70/30 screen, formatted copy and PDF export');await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
