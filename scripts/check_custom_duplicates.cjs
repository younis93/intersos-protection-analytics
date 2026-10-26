const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{for(const theme of ['glass-light','glass-dark'])for(const width of [1440,390]){
  console.log('Duplicates',theme,width);
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(t=>localStorage.setItem('app-theme',t),theme);await page.route('**/api/app/**',r=>r.fulfill({json:{available:false}}));
  await page.goto('http://127.0.0.1:5399/#/custom');await page.getByRole('button',{name:'New project',exact:true}).click();
  await page.getByLabel('Choose analysis data',{exact:true}).setInputFiles({name:`Duplicates-${theme}-${width}.csv`,mimeType:'text/csv',buffer:Buffer.from('ID,Name,Amount\n001,Ali,20\n001,Ali,30\n002,Sara,40\n')});
  await page.getByRole('button',{name:'Read file',exact:true}).click();await page.getByRole('button',{name:'Prepare data',exact:true}).click();
  await page.getByRole('button',{name:'Duplicate review',exact:true}).click();await page.getByRole('checkbox',{name:'Match duplicates by ID',exact:true}).check();
  await page.getByText('1 duplicate group · 1 needs review · 0 records excluded · 3 records included · 0 incomplete keys skipped',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Choose filters',exact:true}).click();await page.getByRole('button',{name:'Review',exact:true}).click();
  assert(await page.getByRole('button',{name:'Create project',exact:true}).isDisabled());await page.getByRole('button',{name:'Edit duplicates',exact:true}).click();
  const dropdown=page.getByRole('button',{name:'Records to include for group 1',exact:true});await dropdown.click();await page.getByRole('option',{name:'Keep first source row',exact:true}).click();
  await page.getByText('1 duplicate group · 0 need review · 1 record excluded · 2 records included · 0 incomplete keys skipped',{exact:true}).waitFor();
  assert(await page.getByRole('checkbox',{name:'Include source row 2',exact:true}).isChecked());assert(!(await page.getByRole('checkbox',{name:'Include source row 3',exact:true}).isChecked()));
  await page.getByRole('checkbox',{name:'Include source row 3',exact:true}).check();await page.getByText('1 duplicate group · 0 need review · 0 records excluded · 3 records included · 0 incomplete keys skipped',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Include source row 2',exact:true}).uncheck();await page.getByText('1 duplicate group · 0 need review · 1 record excluded · 2 records included · 0 incomplete keys skipped',{exact:true}).waitFor();
  await page.screenshot({path:`output/custom-analysis/duplicates-${theme}-${width}.png`});assert(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.getByRole('button',{name:'Return to review',exact:true}).click();await page.getByRole('button',{name:'Create project',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const pid=page.url().split('#/custom/')[1],saved=await(await page.request.get(`http://127.0.0.1:5399/api/custom/projects/${pid}`)).json();
  assert.equal(saved.customConfig.duplicateReview.fields.length,1);const data=await(await page.request.post(`http://127.0.0.1:5399/api/custom/projects/${pid}/data`,{data:{settings:saved.settings,columns:[saved.customConfig.columns[2].id]}})).json();assert.equal(data.rows.length,2);assert.equal(Number(data.rows[0].values[saved.customConfig.columns[2].id]),30);
  await page.getByRole('button',{name:'Manage data',exact:true}).click();await page.getByRole('button',{name:'Prepare data',exact:true}).click();await page.getByRole('button',{name:'Duplicate review',exact:true}).click();await page.getByText('1 duplicate group · 0 need review · 1 record excluded · 2 records included · 0 incomplete keys skipped',{exact:true}).waitFor();
  assert(await page.getByRole('checkbox',{name:'Include source row 3',exact:true}).isChecked());await page.getByRole('button',{name:'Close prepare data',exact:true}).click();assert.deepEqual(errors,[]);await page.close();
 }console.log('PASS duplicate review: desktop/mobile, light/dark, blocking, first/custom selection, saved analysis records and reopened decisions');}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
