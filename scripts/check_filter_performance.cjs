// Synthetic options only. Run against Vite; use --baseline before the optimization.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'frontend/src/filterPerformanceCheck.tsx'),html=path.join(root,'frontend/filter-performance-check.html');
const baseline=process.argv.includes('--baseline');
(async()=>{
 let browser;
 assert(!fs.existsSync(fixture)&&!fs.existsSync(html));
 try{
  fs.writeFileSync(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CheckboxMultiSelect,AppSelect,FilterValueList} from './SelectionControls';import {FilterSection} from './FilterDrawerShell';import './styles.css';import './workspace.css';import './sendIssues.css';
  const params=new URLSearchParams(location.search),count=Number(params.get('count')||2000),values=Array.from({length:count},(_,i)=>'Option '+String(i).padStart(5,'0')),options=values.map(value=>[value,value] as [string,string]);
  function Fixture(){const [selected,setSelected]=useState<string[]>([]),[single,setSingle]=useState('Option 00000'),[drawer,setDrawer]=useState(false);return <div className="app-shell legal-shell" style={{display:'block'}}><main style={{padding:20}}><div className={params.get('page')||'professional-overview'}><div className={params.get('bar')||'overview-filter-bar'}><CheckboxMultiSelect label="Options" values={values} selected={selected} onChange={setSelected}/></div></div><AppSelect searchable label="Single" value={single} onChange={setSingle} options={options}/><AppSelect label="Plain" value={single} onChange={setSingle} options={options}/><output>{selected.join(',')||single}</output><button onClick={()=>setDrawer(true)}>Open drawer</button>{drawer&&<aside className="case-filter-drawer"><div className="case-filter-scroll">{Array.from({length:8},(_,i)=><FilterSection key={i} label={'Field '+i}><div><FilterValueList values={values} selected={selected} onChange={setSelected}/></div></FilterSection>)}</div></aside>}</main></div>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/filterPerformanceCheck.tsx"></script>');
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage(),errors=[],runs=[];page.on('pageerror',error=>errors.push(String(error)));
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const contexts=[['professional-overview','overview-filter-bar'],['indicator-reporting','indicator-filter-bar'],['detention-page','detention-toolbar'],['send-issues','si-top-filters']];
  for(const width of [390,1280])for(const [context,bar] of contexts){
   console.log('Checking',context,width);await page.setViewportSize({width,height:800});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/filter-performance-check.html?'+new URLSearchParams({page:context,bar,count:'2000'}));
   const trigger=page.getByRole('button',{name:'All options',exact:true});await trigger.waitFor();await settle();
   let at=performance.now();await trigger.click();await settle();const openMs=performance.now()-at;
   const menu=page.locator('.checkbox-multi-menu'),list=menu.locator(':scope>div').last();
   const mounted=await list.locator('.filter-option-row').count();if(!baseline)assert(mounted<60);
   at=performance.now();await list.evaluate(node=>node.scrollTop=node.scrollHeight);await menu.getByRole('checkbox',{name:'Option 01999',exact:true}).waitFor();await settle();const scrollMs=performance.now()-at;
   await menu.getByRole('checkbox',{name:'Option 01999',exact:true}).check();assert.equal(await page.locator('output').textContent(),'Option 01999');
   await menu.getByPlaceholder('Search options').fill('00010');await menu.getByRole('checkbox',{name:'Option 00010',exact:true}).waitFor();
   await page.keyboard.press('Escape');
   at=performance.now();await page.getByRole('button',{name:'Single',exact:true}).click();await settle();const singleMs=performance.now()-at;
   if(!baseline){assert(await page.getByRole('option').count()<60);await page.getByPlaceholder('Search single').focus();await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>document.activeElement?.textContent==='Option 01999');await page.keyboard.press('Home');await page.waitForFunction(()=>document.activeElement?.textContent==='Option 00000');}
   await page.getByPlaceholder('Search single').fill('01999');await page.getByRole('option',{name:'Option 01999',exact:true}).click();
   if(!baseline){await page.getByRole('button',{name:'Plain',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='Option 01999');await page.keyboard.press('Home');await page.waitForFunction(()=>document.activeElement?.textContent==='Option 00000');await page.keyboard.press('End');await page.waitForFunction(()=>document.activeElement?.textContent==='Option 01999');await page.keyboard.press('Escape');} at=performance.now();await page.getByRole('button',{name:'Open drawer',exact:true}).click();await page.locator('.case-filter-scroll summary').first().waitFor();await settle();const drawerMs=performance.now()-at;
   const drawerRows=await page.locator('.case-filter-scroll .filter-option-row').count();if(!baseline)assert.equal(drawerRows,0);
   await page.locator('.case-filter-scroll summary').first().click();await page.locator('.case-filter-scroll input[type=checkbox]').first().waitFor();
   if(!baseline){const drawerList=page.locator('.case-filter-scroll [data-virtual-rows]');assert(await drawerList.locator('.filter-option-row').count()<60);await drawerList.evaluate(node=>node.scrollTop=node.scrollHeight);await drawerList.getByRole('checkbox',{name:'Option 01999',exact:true}).waitFor()}
   runs.push({context,width,openMs,scrollMs,singleMs,drawerMs,mounted,drawerRows});
  }
  assert.deepEqual(errors,[]);fs.mkdirSync(path.join(root,'output/performance'),{recursive:true});fs.writeFileSync(path.join(root,'output/performance/filter-menu-'+(baseline?'before':'after')+'.json'),JSON.stringify({synthetic:true,runs,errors},null,2));console.log(JSON.stringify(runs));
 }finally{await browser?.close();fs.rmSync(fixture,{force:true});fs.rmSync(html,{force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
