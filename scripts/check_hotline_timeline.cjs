// Exercise the actual Hotline page using synthetic monthly totals only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/hotlineTimelineCheck.tsx'),html=path.join(root,'frontend/hotline-timeline-check.html');
(async()=>{
 assert(!fs.existsSync(entry)&&!fs.existsSync(html));let browser;
 try{
  fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {HotlineDashboard} from './LegalHotlinePage';import './styles.css';import './workspace.css';const theme=(new URLSearchParams(location.search).get('theme')||'glass-light') as any;document.documentElement.dataset.theme=theme;createRoot(document.getElementById('root')!).render(<main className="app-shell legal-shell" style={{display:'block',padding:16}}><HotlineDashboard metadata={{revision:'synthetic',source:'Synthetic hotline contacts',availability:{legalhotlines:true}} as any} theme={theme}/></main>);`);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/hotlineTimelineCheck.tsx"></script>');
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  const months=[{label:'2026-08',count:10,detained:7,notDetained:3},{label:'2026-09',count:6,detained:2,notDetained:4},{label:'2026-10',count:1,detained:1,notDetained:0}];
  await page.route('**/api/**',async route=>{
   if(!route.request().url().includes('/hotline-dashboard'))return route.fulfill({json:{columns:[],rows:[],total:0,page:1,pageSize:100}});
   const filters=route.request().postDataJSON().filters,selection=filters['Contact Date']||[],rows=selection.length?months.filter(row=>selection.includes(row.label)):months,total=rows.reduce((sum,row)=>sum+row.count,0);
   await route.fulfill({json:{page:'hotline',total,filteredRows:total,trend:rows.map(row=>({...row,percent:total?row.count/total:0})),charts:[],kpis:[],filterOptions:{'Contact Date':months.map(row=>row.label)},missingContactDates:0,map:{items:[]}}});
  });
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/hotline-timeline-check.html');
   const card=page.locator('article.chart-card').filter({has:page.getByRole('heading',{name:'Monthly hotline contacts',exact:true})});
   const graph=card.locator('.js-plotly-plot');
   await page.waitForFunction(()=>document.querySelector('.trend .js-plotly-plot')?.data?.[0]?.type==='scatter');
   await card.locator('.timeline-chips button').filter({hasText:'Sep 2026'}).click();
   await page.waitForFunction(()=>{const data=document.querySelector('.trend .js-plotly-plot')?.data;return data?.length===2&&data[0].type==='bar'&&data[0].y[0]===2&&data[1].y[0]===4});
   assert.deepEqual(await graph.evaluate(node=>node.data.map(trace=>({name:trace.name,y:trace.y,color:trace.marker.color}))),[{name:'Detained',y:[2],color:'#d4852f'},{name:'Not detained',y:[4],color:'#2f9e68'}]);
   assert.equal(await graph.evaluate(node=>node.layout.showlegend),true);assert.equal(await graph.evaluate(node=>node.layout.barmode),'group');
   await graph.locator('.barlayer .point path').last().hover({force:true});await graph.locator('.hoverlayer').getByText('Not detained',{exact:false}).waitFor();
   await card.getByRole('button',{name:'Pivot table',exact:true}).click();await page.getByRole('dialog').getByText('6',{exact:true}).waitFor();await page.getByRole('button',{name:'Close pivot table',exact:true}).click();
   fs.mkdirSync(path.join(root,'output'),{recursive:true});await card.screenshot({path:path.join(root,`output/hotline-single-month-${width}.png`)});
   await card.getByRole('button',{name:'Remove 2026-09 filter',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.trend .js-plotly-plot')?.data?.[0]?.type==='scatter');
   await page.getByRole('button',{name:'All contact date (month)',exact:true}).click();await page.getByRole('checkbox',{name:'2026-10',exact:true}).check();await page.getByRole('button',{name:'Done',exact:true}).click();
   await page.waitForFunction(()=>{const data=document.querySelector('.trend .js-plotly-plot')?.data;return data?.length===2&&data[0].type==='bar'&&data[0].y[0]===1&&data[1].y[0]===0});
   assert.deepEqual(await graph.evaluate(node=>node.data.map(trace=>trace.text[0])),['1','0']);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Hotline timeline overflows the viewport');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({actualHotlinePage:true,mobile:true,desktop:true,monthClick:true,monthDropdown:true,twoStatusBars:true,counts:true,legend:true,hover:true,zeroStatus:true,clearRestoresTrend:true,pivotKeepsContactTotal:true,pageErrors:errors}));
 }finally{await browser?.close();for(const file of [entry,html])fs.rmSync(file,{force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
