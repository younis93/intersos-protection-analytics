const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 fs.mkdirSync('output/custom-analysis',{recursive:true});
 try{
  for(const theme of (process.argv.includes('--quick')?['glass-light','glass-dark']:['glass-light','glass-dark','unhcr','multicolor','executive']))for(const width of [1440,390]){
   console.log('Checking',theme,width);
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
   await page.route('**/api/app/**',route=>route.fulfill({json:{available:false}}));
   await page.goto('http://127.0.0.1:5399/#/');
   await page.getByRole('link').filter({hasText:'Custom Analysis'}).click();
   await page.getByRole('heading',{name:'Your Custom Analysis projects'}).waitFor();
   await page.getByRole('button',{name:'New project',exact:true}).click();
   const dialog=page.getByRole('dialog');
   await page.getByLabel('Choose analysis data',{exact:true}).setInputFiles({name:`Sample-${theme}-${width}.csv`,mimeType:'text/csv',buffer:Buffer.from('Code,Age,Date,City\n001,20,04/05/2026 09:30:00,Mosul\n002,30,15/05/2026,Baghdad\n003,40,25/05/2026,Mosul\n')});
   await page.getByRole('button',{name:'Read file',exact:true}).click();
   await page.getByRole('heading',{name:'Select your data table'}).waitFor();
   await page.getByRole('button',{name:'Prepare data',exact:true}).click();

   await page.getByRole('heading',{name:'Prepare your data'}).waitFor();
   assert.equal(await page.locator('.custom-steps>span').count(),5);
   assert.equal(await page.getByText('Configure columns',{exact:true}).count(),0);
   await page.getByLabel('Column display label',{exact:true}).fill('Record ID');
   await page.getByLabel('Column group',{exact:true}).fill('Identity');
   await page.locator('.custom-column-list button').nth(3).click();
   await page.getByLabel('Include in analysis',{exact:true}).uncheck();
   await page.locator('.custom-column-list button').nth(2).click();
   await page.getByText('These dates could use UK or US format.').waitFor();
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Choose filters'&&!b.disabled));
   await page.getByRole('button',{name:'Column date convention',exact:true}).click();
   await page.getByRole('option',{name:'UK - day/month/year',exact:true}).click();
   await page.getByText('4 May 2026',{exact:true}).waitFor();
   await page.getByLabel('Include time in a separate column',{exact:true}).check();
   await page.getByLabel('Time column label',{exact:true}).fill('Start time');
   await page.getByText('09:30:00',{exact:true}).waitFor();
   assert.equal(await dialog.locator('select').count(),0);
   await page.getByRole('button',{name:'Column type',exact:true}).click();
   assert(await page.getByRole('listbox',{name:'Column type options'}).evaluate(el=>el.matches(':popover-open')));
   await page.keyboard.press('Escape');assert(await dialog.isVisible());
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Choose filters'&&!b.disabled));
   await page.screenshot({path:`output/custom-analysis/${theme}-${width}-columns.png`});
   assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Dialog must fit viewport');
   await page.getByRole('button',{name:'Choose filters',exact:true}).click();
   await page.getByRole('heading',{name:'Choose filter columns',exact:true}).waitFor();
   assert.equal(await page.locator('.custom-filter-list input:checked').count(),0);
   assert.equal(await page.getByRole('checkbox',{name:'Use City as a filter',exact:true}).count(),0);
   await page.getByRole('checkbox',{name:'Use Record ID as a filter',exact:true}).check();
   await page.getByRole('checkbox',{name:'Use Start time as a filter',exact:true}).check();
   await page.getByRole('button',{name:'Back',exact:true}).click();
   await page.locator('.custom-column-list button').nth(0).click();
   await page.getByLabel('Include in analysis',{exact:true}).uncheck();
   await page.getByRole('button',{name:'Choose filters',exact:true}).click();
   assert.equal(await page.getByRole('checkbox',{name:'Use Record ID as a filter',exact:true}).count(),0);
   await page.getByRole('button',{name:'Back',exact:true}).click();
   await page.getByLabel('Include in analysis',{exact:true}).check();
   await page.getByRole('button',{name:'Choose filters',exact:true}).click();
   assert(!(await page.getByRole('checkbox',{name:'Use Record ID as a filter',exact:true}).isChecked()));
   await page.screenshot({path:`output/custom-analysis/${theme}-${width}-filters.png`});
   await page.getByRole('button',{name:'Review',exact:true}).click();
   await page.getByRole('heading',{name:'Review your analysis project'}).waitFor();
   await page.getByRole('button',{name:'Create project',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Manage data',exact:true}).waitFor();
   assert(page.url().includes('#/custom/'));
   const projectId=page.url().split('#/custom/')[1];
   const saved=await(await page.request.get(`http://127.0.0.1:5399/api/custom/projects/${projectId}`)).json();
   assert.equal(saved.customConfig.columns[0].label,'Record ID');
   assert.equal(saved.customConfig.columns[0].group,'Identity');
   assert.equal(saved.customConfig.columns[3].included,false);
   await page.getByRole('button',{name:'Manage data',exact:true}).click();await page.getByRole('button',{name:'Prepare data',exact:true}).click();
   await page.getByRole('heading',{name:'Prepare your data'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Column date convention',exact:true}).count(),0);
   assert.equal(await page.getByLabel('Column display label',{exact:true}).inputValue(),'Record ID');
   assert.equal(await page.getByLabel('Column group',{exact:true}).inputValue(),'Identity');
   assert(await page.getByLabel('Include time in a separate column',{exact:true}).count()===0);
   await page.locator('.custom-column-list button').nth(2).click();
   assert.equal(await page.getByRole('button',{name:'Column date convention',exact:true}).innerText(),'UK - day/month/year');
   assert(await page.getByLabel('Include time in a separate column',{exact:true}).isChecked());
   await page.getByRole('button',{name:'Choose filters',exact:true}).click();
   await page.getByRole('checkbox',{name:'Use Start time as a filter',exact:true}).waitFor();
   assert(await page.getByRole('checkbox',{name:'Use Start time as a filter',exact:true}).isChecked());
   await page.getByRole('button',{name:'Close prepare data'}).click();
   for(const name of ['Overview','Geography','Reporting','Analysis']){
    if(width>760)await page.getByRole('button',{name,exact:true}).click();
    else {await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();}
    await page.waitForTimeout(200);
   }
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`output/custom-analysis/${theme}-${width}-analysis.png`});
   await page.close();
  }
  console.log('PASS: shared dropdowns, separated settings/preview, date ambiguity, optional time column, empty default filters, selected-filter persistence, all four pages, five themes, desktop and mobile.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
