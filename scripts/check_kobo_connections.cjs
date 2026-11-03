const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='http://127.0.0.1:5796',fixture=JSON.parse(fs.readFileSync('output/conditional-questions/fixture.json','utf8'));
async function until(check){for(let i=0;i<120;i++){if(await check())return;await new Promise(r=>setTimeout(r,100))}throw new Error('State did not settle')}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const [language,width,theme] of [['en',1440,'glass-light'],['en',390,'glass-dark'],['ar',1440,'glass-dark'],['ar',390,'glass-light']]){
  const page=await browser.newPage({viewport:{width,height:960}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const settings=structuredClone(fixture.settings);settings.language=language;
  settings.questions.follow={...settings.questions.follow,percentageBase:'parent',percentageParent:'main',percentageMode:'grand-total'};
  const saved=await page.request.put(`${base}/api/kobo/projects/${fixture.id}/settings`,{data:settings});assert(saved.ok(),await saved.text());
  await page.addInitScript(theme=>localStorage.setItem('app-theme',theme),theme);
  await page.goto(`${base}/#/kobo/${fixture.id}`);
  const group=page.getByRole('button',{name:language==='ar'?'أسئلة المتابعة':'Follow-up questions',exact:true});await group.waitFor();if(await group.getAttribute('aria-expanded')==='false')await group.click();
  const card=page.locator('[data-question-id="follow"]');await card.locator('table').waitFor();
  const trigger=card.locator('.kobo-connections-trigger');await trigger.click();
  const dialog=page.locator('.kobo-connections-dialog');await dialog.waitFor();
  assert.equal(await dialog.locator('li').count(),2);assert((await dialog.innerText()).includes('100'));
  assert((await dialog.locator('.kobo-connection-formula').innerText()).includes('÷'));
  assert(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'dialog overflow');
  await page.screenshot({path:`output/conditional-questions/connections-${language}-${width}.png`,fullPage:false});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert(await trigger.evaluate(node=>node===document.activeElement));
  await card.getByRole('button',{name:'Configure follow',exact:true}).click();
  const customize=page.getByRole('dialog',{name:'Customize follow'});await customize.getByRole('button',{name:'Values & connections',exact:true}).click();
  assert(await customize.locator('.kobo-connection-settings').isVisible());
  assert(await customize.getByRole('button',{name:language==='ar'?'السؤال الذي يحدد القاعدة':'Question supplying the base',exact:true}).isVisible());
  await page.screenshot({path:`output/conditional-questions/customize-${language}-${width}.png`,fullPage:false});
  if(language==='en'&&width===1440){
   await customize.getByRole('button',{name:'Respondent group',exact:true}).click();await page.getByRole('option',{name:'This question’s answered group',exact:true}).click();
   const apply=customize.getByRole('button',{name:'Apply changes',exact:true});await until(async()=>await apply.isEnabled());await apply.click();
   await until(async()=>(await card.locator('td.kobo-pivot-percent').first().innerText()).includes('60%'));
   await card.getByRole('button',{name:'Configure follow',exact:true}).click();await customize.getByRole('button',{name:'Values & connections',exact:true}).click();
   await customize.getByRole('button',{name:'Respondent group',exact:true}).click();await page.getByRole('option',{name:'Connected question’s answered group',exact:true}).click();
   await until(async()=>await apply.isEnabled());await apply.click();await until(async()=>(await card.locator('td.kobo-pivot-percent').first().innerText()).includes('3%'));
  }else await customize.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 const settings=structuredClone(fixture.settings);settings.questions.follow={...settings.questions.follow,percentageBase:'parent',percentageParent:'main'};
 await page.request.put(`${base}/api/kobo/projects/${fixture.id}/settings`,{data:settings});await page.goto(`${base}/#/kobo/${fixture.id}`);
 const group=page.getByRole('button',{name:'Follow-up questions',exact:true});await group.waitFor();if(await group.getAttribute('aria-expanded')==='false')await group.click();
 const card=page.locator('[data-question-id="follow"]');await card.locator('.kobo-connections-trigger').click();
 await page.locator('.kobo-connections-dialog').getByRole('button',{name:'main',exact:true}).click();
 await until(async()=>await page.locator('#kobo-question-main').evaluate(node=>node===document.activeElement));
 settings.hidden=['main'];settings.questions.main={...settings.questions.follow,percentageBase:'question',percentageParent:'',hiddenAnswers:['other']};
 await page.request.put(`${base}/api/kobo/projects/${fixture.id}/settings`,{data:settings});await page.reload();await group.waitFor();if(await group.getAttribute('aria-expanded')==='false')await group.click();
 await card.locator('.kobo-connections-trigger').click();const dialog=page.locator('.kobo-connections-dialog');assert(await dialog.getByText('Hidden',{exact:true}).isVisible());assert.equal(await dialog.getByRole('button',{name:'main',exact:true}).count(),0);
 const analysis=await(await page.request.post(`${base}/api/kobo/projects/${fixture.id}/analysis`,{data:{settings}})).json();assert.equal(analysis.questions.find(q=>q.id==='follow').rows[0].percent,3);
 await page.close();console.log('PASS connection dialogs, parent navigation, hidden parents, Arabic, mobile, both themes');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
