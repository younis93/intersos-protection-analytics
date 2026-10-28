const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.argv[2]||'http://127.0.0.1:5420';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/api/app/**',route=>route.fulfill({json:{available:false}}));
  const open=async(raw)=>{
   await page.goto(`${base}/#/custom`);await page.getByRole('button',{name:'New project',exact:true}).click();
   await page.getByLabel('Choose analysis data',{exact:true}).setInputFiles({name:'Large answers.csv',mimeType:'text/csv',buffer:Buffer.from(raw)});
   await page.getByRole('button',{name:'Read file',exact:true}).click();await page.getByRole('button',{name:'Prepare data',exact:true}).click();
   await page.getByRole('heading',{name:'Prepare your data',exact:true}).waitFor();
  };
  await open('Comment,Amount,City\n'+Array.from({length:205},(_,i)=>`Response ${i},${i},${i%2?'Mosul':'Baghdad'}`).join('\n'));
  const included=page.getByRole('checkbox',{name:'Include in analysis',exact:true});
  assert.equal(await included.isChecked(),false);await page.getByText('205 distinct text answers.',{exact:false}).waitFor();
  await page.locator('.custom-column-list button').nth(1).click();assert(await included.isChecked());
  await page.locator('.custom-column-list button').nth(0).click();await included.check();
  await page.getByRole('button',{name:'Choose filters',exact:true}).click();await page.getByRole('button',{name:'Review',exact:true}).click();
  await page.getByRole('button',{name:'Create project',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Manage data',exact:true}).click();await page.getByRole('button',{name:'Prepare data',exact:true}).click();
  await page.getByRole('heading',{name:'Prepare your data',exact:true}).waitFor();assert(await included.isChecked());
  await page.getByRole('button',{name:'Close prepare data',exact:true}).click();
  await open('Comment\n'+Array.from({length:205},(_,i)=>`Response ${i}`).join('\n'));
  assert.equal(await included.isChecked(),false);
  await page.getByText('Include at least one column to continue.',{exact:false}).waitFor();
  assert(await page.getByRole('button',{name:'Choose filters',exact:true}).isDisabled());
  await included.check();await page.getByRole('button',{name:'Choose filters',exact:true}).click();
  await page.getByRole('heading',{name:'Choose filter columns',exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();console.log('PASS large-field defaults, manual inclusion, save/reopen and all-excluded preview',width);
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
