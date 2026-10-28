const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],calls=[];page.on('pageerror',error=>errors.push(String(error)));
  const combined='4. What is your current status in Iraq? (Combined)';let example;
  await mock(page,3,f=>{example=structuredClone(f.results[0]);f.questions.push({id:'combined',name:'status_combined',labels:{en:combined},type:'select_one',kind:'category',group:'g',repeat:'',metadata:false,identifying:false,addedFromData:true,choices:[]});f.settings.hidden=['combined'];});
  let fail=false,release=null;
  await page.route('**/analysis/preview',async route=>{
   const body=route.request().postDataJSON();calls.push(body);if(release)await release.promise;if(fail){await route.fulfill({status:500,json:{detail:'Added question unavailable'}});return}
   const result={...structuredClone(example),percentageDecimals:1,id:body.question,name:body.question==='combined'?'status_combined':body.question,label:body.question==='combined'?combined:example.label,kind:body.question==='combined'?'category':'multiple',addedFromData:body.question==='combined',breakdowns:[],breakdownFields:[],rows:[{id:'refugee',label:'Refugee',count:200,percent:62.5},{id:'resident',label:'Resident',count:120,percent:37.5}]};
   const fields=body.settings.questions[body.question]?.breakdowns||[];if(fields.length){result.breakdownFields=[{id:fields[0],label:combined}];result.breakdowns=[{id:'refugee',label:'Refugee',denominator:200}];result.rows=result.rows.map(row=>({...row,series:[{id:'refugee',count:100,percent:50}]}));}
   await route.fulfill({json:result});
  });
  await page.goto((process.argv[2]||'http://127.0.0.1:5368')+'/#/kobo/scroll',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Prepare AI report prompt',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Prepare AI report prompt',exact:true}),search=dialog.getByRole('textbox',{name:'Search questions',exact:true}),editor=dialog.getByRole('textbox',{name:'Prompt preview',exact:true});
  await search.fill('Combined');const added=dialog.getByRole('group',{name:'Select report questions'}).getByRole('checkbox');assert.equal(await added.count(),1);assert(await added.isEnabled());await added.check();assert(await dialog.getByText('Added question',{exact:true}).isVisible());assert(await dialog.getByText('Results prepared in preview',{exact:true}).isVisible());
  fs.mkdirSync('output/kobo-report-added-fields',{recursive:true});await dialog.screenshot({path:'output/kobo-report-added-fields/combined-selection.png'});
  let resume;release={promise:new Promise(resolve=>resume=resolve)};await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();await dialog.getByRole('heading',{name:'Preparing selected results',exact:true}).waitFor();assert(await dialog.getByRole('button',{name:'Copy prompt',exact:true}).isDisabled());resume();release=null;await editor.waitFor();assert((await editor.inputValue()).includes(combined));assert((await editor.inputValue()).includes('| Refugee | 200 | 62.5% |'));assert.equal(calls.length,1);assert.deepEqual(calls[0].settings.hidden,['combined']);
  // Hidden added questions can use existing breakdowns too, with a retry on failure.
  await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();await dialog.getByRole('radio',{name:/Current question breakdowns/}).check();fail=true;await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Added question unavailable'}).waitFor();assert(await dialog.getByRole('button',{name:'Copy prompt',exact:true}).isDisabled());fail=false;await dialog.getByRole('button',{name:'Try again',exact:true}).click();await editor.waitFor();assert((await editor.inputValue()).includes(combined));
  // The same added question can be a disaggregation for a different main question.
  await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();await dialog.getByRole('button',{name:'Clear selection',exact:true}).click();await search.fill('q0');await dialog.getByRole('group',{name:'Select report questions'}).getByRole('checkbox').check();await dialog.getByRole('radio',{name:/Choose shared disaggregation fields/}).check();await dialog.getByRole('group',{name:'Disaggregation fields',exact:true}).getByRole('checkbox',{name:combined,exact:true}).check();await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();await editor.waitFor();assert((await editor.inputValue()).includes('Separate comparison by 4. What is your current status in Iraq? (Combined)'));assert.deepEqual(calls.at(-1).settings.questions.q0.breakdowns,['combined']);
  // Selecting it as both main and disaggregation skips its self-comparison.
  await dialog.getByRole('button',{name:'Edit selection',exact:true}).click();await dialog.getByRole('button',{name:'Clear selection',exact:true}).click();await search.fill('Combined');await added.check();const count=calls.length;await dialog.getByRole('button',{name:'Preview prompt',exact:true}).click();await editor.waitFor();assert.equal(calls.length,count+1);assert((await editor.inputValue()).includes(combined));assert(!(await editor.inputValue()).includes('#### Separate comparison by'));
  assert.deepEqual(errors,[]);console.log('PASS: added Combined field searchable/selectable as main question while hidden; real overall evidence; loading/copy guards; current mode error/retry; custom disaggregation; self-comparison skipped.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
