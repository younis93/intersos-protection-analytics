// Build frontend, start serve_reupload_worksheets_fixture.py, then run this check.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve('output/reupload-sheets'),ids=JSON.parse(fs.readFileSync(path.join(root,'projects.json'))),base='http://127.0.0.1:5399';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const width of [1440,390])for(const workspace of ['kobo','custom']){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/api/app/**',r=>r.fulfill({json:{available:false}}));
  const project=await(await page.request.get(`${base}/api/${workspace}/projects/${ids[workspace]}`)).json();
  await page.goto(`${base}/#/${workspace}/${ids[workspace]}`);
  await page.getByRole('button',{name:workspace==='kobo'?'Data source':'Manage data',exact:true}).click();
  await page.getByRole('button',{name:workspace==='kobo'?'Re-upload data':'Replace source file',exact:true}).click();
  const d=page.getByRole('dialog');await d.getByRole('checkbox',{name:'Keep my settings',exact:false}).waitFor();
  assert(await d.getByRole('checkbox',{name:'Keep my settings',exact:false}).isChecked());
  await d.getByLabel(workspace==='kobo'?'Replacement response data':'Choose analysis data',{exact:true}).setInputFiles(path.join(root,'reordered.xlsx'));
  await d.getByRole('button',{name:'Worksheet',exact:true}).filter({hasText:'Data'}).waitFor();
  await d.getByRole('button',{name:'Check file',exact:true}).click();
  await d.getByRole('heading',{name:'Ready to update. Your settings will be kept.',exact:true}).waitFor();
  assert.equal(await d.getByRole('heading',{name:'Review source update',exact:true}).count(),0);
  assert.equal(await d.getByRole('checkbox',{name:'Update without record comparison',exact:true}).count(),0);
  assert.equal(await d.locator('.kobo-mapping-workbench').count(),0);
  assert.equal(await d.locator('.custom-review').count(),0);
  const changes=d.locator('details.update-details');assert.equal(await changes.getAttribute('open'),null);
  await changes.locator('summary').first().click();assert(await d.getByText('Individual responses could not be compared automatically.',{exact:false}).isVisible());
  await changes.locator('summary').first().click();
  assert(await d.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
  await page.screenshot({path:path.join(root,`simple-${workspace}-${width}.png`)});
  const update=d.getByRole('button',{name:'Update data',exact:true});await update.click();await d.waitFor({state:'detached'});
  const after=await(await page.request.get(`${base}/api/${workspace}/projects/${ids[workspace]}`)).json();assert.deepEqual(after.settings,project.settings);
  const history=await(await page.request.get(`${base}/api/${workspace}/projects/${ids[workspace]}/updates`)).json();assert(history[0].skipped);
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${workspace} ${width}px: file/sheet, automatic readiness, optional details, save and history`);
 }

 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});await page.route('**/api/app/**',r=>r.fulfill({json:{available:false}}));
  const checked=async r=>{assert(r.ok(),await r.text());return r.json()};
  const source=await checked(await page.request.post(`${base}/api/custom/columns/preview`,{multipart:{data:{name:'corrections.csv',mimeType:'text/csv',buffer:Buffer.from('uuid,Amount\nu1,10\nu2,20\n')}}}));
  let project=await checked(await page.request.post(`${base}/api/custom/columns/confirm`,{data:{token:source.token,name:'Correction check',config:source.config}}));
  const amount=project.customConfig.columns.find(c=>c.header==='Amount').id;
  project=await checked(await page.request.post(`${base}/api/custom/projects/${project.id}/edits/apply`,{data:{revision:project.dataRevision||0,operation:{kind:'cells',cells:[{record:'row_2',field:amount,value:99}]}}}));
  await page.goto(`${base}/#/custom/${project.id}`);await page.getByRole('button',{name:'Manage data',exact:true}).click();await page.getByRole('button',{name:'Replace source file',exact:true}).click();
  let d=page.getByRole('dialog');await d.getByLabel('Choose analysis data',{exact:true}).setInputFiles({name:'incoming.csv',mimeType:'text/csv',buffer:Buffer.from('uuid,Amount\nu1,30\nu2,20\n')});
  await d.getByRole('button',{name:'Check file',exact:true}).click();await d.getByRole('heading',{name:'Keep your corrections',exact:true}).waitFor();
  assert(await d.getByRole('button',{name:'Update data',exact:true}).isDisabled());
  await d.getByRole('radio',{name:/Keep my correction/}).check();
  await d.getByRole('heading',{name:'Ready to update. Your settings will be kept.',exact:true}).waitFor();
  const details=d.locator('details.update-details');await details.locator('summary').first().click();
  await d.getByRole('combobox',{name:/^Changes/}).selectOption('changed');await d.getByRole('combobox',{name:/^Changed column/}).selectOption(amount);
  await d.getByRole('heading',{name:'Ready to update. Your settings will be kept.',exact:true}).waitFor();assert(await d.locator('.update-table-wrap').isVisible());
  await details.locator('summary').first().click();
  await d.getByRole('button',{name:'Update data',exact:true}).click();await d.waitFor({state:'detached'});
  let history=await checked(await page.request.get(`${base}/api/custom/projects/${project.id}/updates`));assert.equal(history[0].skipped,false);assert(Object.values(history[0].editResolutions).includes('local'));
  // Missing identities must show an acknowledgement instead of silently losing a correction.
  await page.getByRole('button',{name:'Manage data',exact:true}).click();await page.getByRole('button',{name:'Replace source file',exact:true}).click();d=page.getByRole('dialog');
  await d.getByLabel('Choose analysis data',{exact:true}).setInputFiles({name:'unmatched.csv',mimeType:'text/csv',buffer:Buffer.from('uuid,Amount\n,30\nu2,20\n')});await d.getByRole('button',{name:'Check file',exact:true}).click();
  await d.getByText(/1 corrections? could not be matched to the uploaded responses/,{exact:false}).waitFor();assert(await d.getByRole('button',{name:'Update data',exact:true}).isDisabled());
  await d.getByRole('checkbox',{name:'Continue without these unmatched corrections',exact:true}).check();await d.getByRole('heading',{name:'Ready to update. Your settings will be kept.',exact:true}).waitFor();
  await d.getByRole('button',{name:'Update data',exact:true}).click();await d.waitFor({state:'detached'});
  history=await checked(await page.request.get(`${base}/api/custom/projects/${project.id}/updates`));assert.equal(history[0].discardEdits,true);
  console.log(`PASS corrections ${width}px: automatic UUID matching, conflict choice, explicit acknowledgement for unmatched corrections`);await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
