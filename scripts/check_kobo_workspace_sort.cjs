// Run against a production preview. Only synthetic API responses are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/kobo-workspace-sort');
fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(execFileSync(process.env.PYTHON||path.join(root,'.venv/Scripts/python.exe'),['-c',`
import json
from backend.test_kobo import sample
from backend.kobo import new_project_settings,analyze
payload=sample.__wrapped__()[0]
settings=new_project_settings(payload['form'])
ids=[q['id'] for q in payload['form']['questions'] if q['name'] in ['gender','needs']]
settings.dashboardQuestions=ids
settings.report.questions=ids
project={**payload,'id':'sorting-fixture','name':'Sorting fixture','updated':'2026-10-25','issues':[],'warnings':[],'mappings':[],'policies':{},'settings':settings.model_dump()}
analysis=analyze(project,settings)
for question in analysis['questions']:
    if question['id'] in ids:
        question['rows']=[{'id':'10','label':'Answer 10','count':9,'percent':90},{'id':'2','label':'Answer 2','count':10,'percent':100},{'id':'missing','label':'Missing','count':2,'percent':None}]
print(json.dumps({'project':project,'analysis':analysis}))
`],{cwd:root,encoding:'utf8'}));
const base=process.env.KOBO_CHECK_URL||'http://127.0.0.1:5194';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/api/**',route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(p==='/api/kobo/projects')return json([fixture.project]);
   if(p==='/api/kobo/projects/sorting-fixture')return json(fixture.project);
   if(p==='/api/kobo/projects/sorting-fixture/analysis')return json(fixture.analysis);
   if(p==='/api/kobo/projects/sorting-fixture/settings')return json({ok:true});
   return json({detail:'Unused fixture endpoint'},404);
  });
  await page.goto(`${base}/?startupEpoch=1#/kobo/sorting-fixture`,{waitUntil:'domcontentloaded'});
  for(const tab of ['Overview','Reporting']){
   await page.getByRole('button',{name:tab,exact:true}).click();
   const cards=page.locator('.kobo-workspace-summaries article'),first=cards.nth(0),second=cards.nth(1);
   await first.waitFor();
   const labels=card=>card.locator('tbody th').allTextContents();
   const sorted=async(label,expected,direction)=>{
    await first.getByRole('button',{name:`Sort by ${label}`,exact:true}).click();
    assert.deepEqual(await labels(first),expected);
    assert.equal(await first.getByRole('button',{name:`Sort by ${label}`,exact:true}).locator('..').getAttribute('aria-sort'),direction);
   };
   await sorted('Answer',['Answer 2','Answer 10','Missing'],'ascending');
   await sorted('Answer',['Missing','Answer 10','Answer 2'],'descending');
   await sorted('Count',['Answer 2','Answer 10','Missing'],'descending');
   await sorted('Count',['Missing','Answer 10','Answer 2'],'ascending');
   await sorted('% answered',['Answer 2','Answer 10','Missing'],'descending');
   await first.getByRole('button',{name:'Sort by % answered',exact:true}).focus();await page.keyboard.press('Enter');
   assert.deepEqual(await labels(first),['Answer 10','Answer 2','Missing']);
   assert.deepEqual(await labels(second),['Answer 10','Answer 2','Missing']);
   assert.equal(await second.locator('thead th[aria-sort="none"]').count(),3);
   await page.screenshot({path:path.join(out,`${tab.toLowerCase()}-sorted.png`)});
  }
  assert.deepEqual(errors,[]);
  console.log('Kobo Overview and Reporting: answer, numeric count, percentage, keyboard sorting, and independent tables passed.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
