const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture=JSON.parse(fs.readFileSync('output/analysis-features/fixture.json','utf8')),base='http://127.0.0.1:5397';
async function poll(check){for(let i=0;i<120;i++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('State did not settle')}
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 for(const workspace of ['kobo','custom']){
  const fixtureProject=fixture[workspace],page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const get=async()=>await(await page.request.get(`${base}/api/${workspace}/projects/${fixtureProject.id}`)).json();
  await page.goto(`${base}/#/${workspace}/${fixtureProject.id}`);
  const manager=page.getByRole('dialog',{name:'Manage answers',exact:true});
  const open=async()=>{await page.getByRole('button',{name:`Manage answers ${fixtureProject.answerName}`,exact:true}).click();await manager.locator('[data-answer-id="A"]').waitFor()};
  const undo=async check=>{await page.locator('.kobo-edit-notice').getByRole('button',{name:'Undo',exact:true}).click();await poll(check)};
  await open();await manager.getByRole('button',{name:'Rename A',exact:true}).click();
  const rename=manager.getByRole('textbox',{name:'New answer label',exact:true});await rename.fill('إجابة A');await rename.press('Enter');
  await manager.getByRole('button',{name:'Preview rename',exact:true}).click();await manager.getByRole('button',{name:'Apply rename',exact:true}).click();await manager.waitFor({state:'hidden'});
  await poll(async()=>(await get()).form.questions.find(q=>q.id===fixtureProject.ids.answer).choices.some(c=>c.name==='A'&&c.labels.en==='إجابة A'));
  await undo(async()=>(await get()).form.questions.find(q=>q.id===fixtureProject.ids.answer).choices.some(c=>c.name==='A'&&(c.labels.en||c.labels.default)==='A'));
  for(const destination of ['new','same']){
   await open();await manager.getByRole('button',{name:'Merge',exact:true}).click();
   await manager.getByRole('checkbox',{name:'Select A (A)',exact:true}).check();await manager.getByRole('checkbox',{name:'Select B (B)',exact:true}).check();
   await manager.getByRole('textbox',{name:'Combined answer label',exact:true}).fill('Combined');
   if(destination==='new')await manager.getByRole('textbox',{name:'New field name',exact:true}).fill('Recoded answers');
   else await manager.getByRole('radio',{name:'Update this field',exact:true}).check();
   await manager.getByRole('button',{name:'Preview merge',exact:true}).click();await manager.getByRole('button',{name:'Apply merge',exact:true}).click();await manager.waitFor({state:'hidden'});
   await poll(async()=>{const project=await get();return destination==='new'?project.form.questions.some(q=>q.labels.en==='Recoded answers'):project.form.questions.find(q=>q.id===fixtureProject.ids.answer).choices.some(c=>c.labels.en==='Combined')});
   await undo(async()=>{const project=await get();return !project.form.questions.some(q=>q.labels.en==='Recoded answers')&&project.form.questions.find(q=>q.id===fixtureProject.ids.answer).choices.some(c=>(c.labels.en||c.labels.default)==='A')});
  }
  // The independently styled single-response editor still saves and cancels normally.
  await page.getByRole('button',{name:'Table view',exact:true}).click();await page.getByRole('button',{name:'Edit data',exact:true}).click();
  const edit=page.getByRole('button',{name:'Edit Answer, source row 2',exact:true});await edit.click();
  const editor=page.getByRole('dialog',{name:'Edit response',exact:true});await editor.getByRole('textbox',{name:'Find or create option',exact:true}).fill('C');await editor.getByRole('button',{name:'Create new option “C”',exact:true}).click();await editor.getByRole('button',{name:'Save change',exact:true}).click();await editor.waitFor({state:'hidden'});await poll(async()=>(await edit.innerText())==='C');
  const revision=(await get()).dataRevision;await edit.click();await editor.waitFor();await page.keyboard.press('Escape');await editor.waitFor({state:'hidden'});assert.equal((await get()).dataRevision,revision);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',workspace,'real API direct rename/code preservation, merge to new/current field, Undo, Edit response save/cancel');
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
