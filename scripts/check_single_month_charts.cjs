// Run with Vite on port 5190. Uses synthetic chart values only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/singleMonthCheck.tsx'),html=path.join(root,'frontend/single-month-check.html');
(async()=>{
 let browser;const created=[];
 try{
  assert(!fs.existsSync(entry)&&!fs.existsSync(html));
  fs.writeFileSync(entry,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TrendCard} from './components';import SingleMonthIndicatorChart from './SingleMonthIndicatorChart';import './styles.css';
   function Harness(){const [config,setConfig]=useState<any>({months:['2026-09'],values:[43],comparison:[32],theme:'glass-light',display:'count'}),[selected,setSelected]=useState<string[]>([]);(window as any).updateChart=(next:any)=>{setSelected([]);setConfig(next)};const rows=config.months.map((label:string,index:number)=>({label,count:config.values[index],percent:config.values[index]/100}));return <main style={{padding:12}}><TrendCard rows={rows} comparisonRows={config.comparison?config.months.map((label:string,index:number)=>({label,count:config.comparison[index],percent:config.comparison[index]/100})):undefined} primaryLabel="Detained assessments" comparisonLabel="Released" title="Detained assessments and releases" theme={config.theme} display={config.display} selected={selected} onSelect={setSelected} onRemove={month=>setSelected(current=>current.filter(value=>value!==month))}/><output data-testid="selected">{selected.join(',')}</output><SingleMonthIndicatorChart month="2026-09" series={[{label:'Detained assessments',values:[config.values[0]],color:'#1683d8'},{label:'Released',values:[config.comparison?.[0]||0],color:'#2f9e68'}]}/></main>};createRoot(document.getElementById('root')!).render(<Harness/>);`);created.push(entry);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/singleMonthCheck.tsx"></script>');created.push(html);
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5190')+'/single-month-check.html');
  const graph=page.locator('.js-plotly-plot');
  await page.waitForFunction(()=>document.querySelector('.js-plotly-plot')?.data?.[0]?.type==='bar');
  const initialHeight=await graph.evaluate(node=>node.getBoundingClientRect().height);assert.equal(initialHeight,330);
  assert.deepEqual(await graph.evaluate(node=>node.data.map(trace=>[trace.type,trace.y,trace.text])),[['bar',[43],['43']],['bar',[32],['32']]]);
  assert.equal(await graph.locator('.xtick text').textContent(),'September 2026');
  const bars=graph.locator('.barlayer .point path');await bars.nth(1).hover({force:true});
  await page.locator('.hoverlayer').getByText('Released',{exact:false}).waitFor();
  await bars.nth(1).click({force:true});
  await page.waitForFunction(()=>document.querySelector('[data-testid=selected]').textContent==='2026-09');
  await page.getByRole('button',{name:'Remove 2026-09 filter',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid=selected]').textContent==='');
  await page.getByRole('button',{name:'Pivot table',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close pivot table',exact:true}).click();
  const output=path.join(root,'output-test');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'single-month-desktop.png'),fullPage:true});
  await page.locator('.chart-card').screenshot({path:path.join(output,'single-month-bars-preview.png')});
  for(const format of ['PNG','PDF']){
   const downloading=page.waitForEvent('download');await page.getByRole('button',{name:format,exact:true}).click();const download=await downloading;
   await download.saveAs(path.join(output,download.suggestedFilename()));assert.equal(await download.failure(),null);
  }
  const update=async config=>{await page.evaluate(next=>window.updateChart(next),config);await page.waitForFunction(expected=>{const data=document.querySelector('.js-plotly-plot')?.data;return data?.[0]?.y?.[0]===expected.value&&data[0].type===expected.type&&data.length===expected.traces},{value:config.display==='percent'?config.values[0]/100:config.values[0],type:config.months.length===1?'bar':'scatter',traces:config.comparison?2:1})};
  for(const values of [[0,0],[10,10],[1234567,0]]){
   await update({months:['2026-09'],values:[values[0]],comparison:[values[1]],theme:'glass-light',display:'count'});
   assert.deepEqual(await graph.evaluate(node=>node.data.map(trace=>trace.text[0])),values.map(value=>value.toLocaleString('en-US')));
  }
  await update({months:['2026-09'],values:[43],theme:'glass-light',display:'percent'});
  assert.equal(await graph.evaluate(node=>node.data[0].text[0]),'43%');
  await update({months:['2026-08','2026-09'],values:[0,43],comparison:[0,32],theme:'glass-light',display:'count'});
  assert.equal(await graph.evaluate(node=>node.getBoundingClientRect().height),initialHeight);
  for(const theme of ['glass-light','glass-dark'])for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await update({months:['2026-09'],values:[43],comparison:[32],theme,display:'count'});
   await page.waitForFunction(()=>document.querySelector('.js-plotly-plot')?.layout?.xaxis?.tickangle===0);
   await page.screenshot({path:path.join(output,`single-month-${theme}-${width}.png`),fullPage:true});
   await page.locator(".indicator-analysis-chart").screenshot({path:path.join(output,`single-month-indicator-${theme}-${width}.png`)});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Chart overflows viewport');
  }
  assert.deepEqual(errors,[]);console.log('Single-month bars: values, zero/equal/large values, percentage, hover, selection/removal, pivot, PNG/PDF, line switching, fixed height, mobile and light/dark passed.');
 }finally{if(browser)await browser.close();for(const file of created)fs.unlinkSync(file)}
})().catch(error=>{console.error(error);process.exitCode=1});
