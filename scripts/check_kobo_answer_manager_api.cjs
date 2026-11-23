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
  const openAnswerAction=async action=>{
   const trigger=page.getByRole('button',{name:'Answer options: A',exact:true});
   await trigger.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   await trigger.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await trigger.press('ArrowDown');
   await page.getByRole('menuitem',{name:action,exact:true}).press('Enter');
  };
  const open=async()=>{
   await openAnswerAction('Manage answers');
   await manager.locator('[data-answer-id="A"]').waitFor();
  };
  const undo=async check=>{await page.locator('.kobo-edit-notice').getByRole('button',{name:'Undo',exact:true}).click();await poll(check)};
  for(const destination of ['same','new']){
   await open();
   const rename=manager.getByRole('textbox',{name:'New answer label',exact:true});
   const renameA=manager.getByRole('button',{name:'Rename A',exact:true});
   const renameB=manager.getByRole('button',{name:'Rename B',exact:true});
   await renameA.click();await rename.fill('إجابة A');
   assert(await renameB.isDisabled());
   await manager.getByRole('button',{name:'Done',exact:true}).click();
   assert(await renameB.isEnabled());
   await renameB.click();await rename.fill('Answer B');await rename.press('Enter');
   if(destination==='new'){
    await manager.getByRole('radio',{name:'Create a new field',exact:true}).check();
    await manager.getByRole('textbox',{name:'New field name',exact:true}).fill('Renamed copy');
   }
   const preview=manager.getByRole('button',{name:'Preview renames',exact:true});
   const apply=manager.getByRole('button',{name:'Apply renames',exact:true});
   await preview.click();await apply.waitFor();
   const review=manager.getByRole('region',{name:'Answer change preview'});
   assert.match(await review.innerText(),/إجابة A/);
   assert.match(await review.innerText(),/Answer B/);
   await manager.getByRole('button',{name:'Edit rename for B',exact:true}).click();
   await rename.fill('Discard this input');await rename.press('Escape');
   assert.equal(await apply.count(),0);
   assert(await manager.getByText('Answer B',{exact:true}).isVisible());
   await manager.getByRole('button',{name:'Discard rename for B',exact:true}).click();
   assert(await manager.getByRole('button',{name:'Preview rename',exact:true}).isEnabled());
   await renameB.click();await rename.fill('Revised B');await rename.press('Enter');
   const before=await get();
   await preview.click();await apply.click();await manager.waitFor({state:'hidden'});
   await poll(async()=>{
    const project=await get();
    const question=project.form.questions.find(q=>destination==='same'?q.id===fixtureProject.ids.answer:q.labels.en==='Renamed copy');
    return project.dataRevision===before.dataRevision+1&&question?.choices.some(c=>c.name==='A'&&c.labels.en==='إجابة A')
     &&question.choices.some(c=>c.name==='B'&&c.labels.en==='Revised B');
   });
   await undo(async()=>{
    const project=await get(),question=project.form.questions.find(q=>q.id===fixtureProject.ids.answer);
    return !project.form.questions.some(q=>q.labels.en==='Renamed copy')
     &&['A','B'].every(id=>question.choices.some(c=>c.name===id&&(c.labels.en||c.labels.default)===id));
   });
  }
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
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',workspace,'real API batch rename to new/current field, code preservation, merge to new/current field, Undo, Edit response save/cancel');
 }
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
