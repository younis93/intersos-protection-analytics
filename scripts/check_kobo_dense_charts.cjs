// Reproduce district/city comparisons with long labels and small values.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));let fixture;
 const labels=['Al-Falluja','Abu Ghraib','Al-Muqdadiya','Makhmur','Chamchamal','Tikrit','Other, please specify','Erbil','Baghdad','Anbar','Kirkuk','A long district name that needs several lines without overlapping the chart'];
 const calls=await mock(page,2,f=>{fixture=f;f.results.forEach((q,i)=>{q.chart='column';q.appearance={height:320};q.breakdowns=[{id:'f',label:'Female',denominator:134},{id:'m',label:'Male',denominator:134}];q.breakdownFields=[{id:'sex',label:'Sex'}];q.rows=labels.map((label,j)=>({id:'a'+j,label,count:j+1,percent:(j+1)/268*100,series:[{id:'f',count:[45,9,20,12,25,6,1,3,2,1,14,7][j],percent:10},{id:'m',count:[44,23,37,19,13,3,1,6,1,2,20,1][j],percent:10}]}));if(i)q.appearance.legend='left';})});
 await page.goto((process.argv[2]||'http://127.0.0.1:5359')+'/#/kobo/scroll');const chart=page.locator('#question-q0 .js-plotly-plot');await chart.waitFor();fs.mkdirSync('output/kobo-dense-charts',{recursive:true});
 for(const width of [1440,800,390]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(350);
  const geometry=await chart.evaluate(el=>{const plot=el._fullLayout._size,root=el.getBoundingClientRect(),rect=n=>n.getBoundingClientRect().toJSON();return{orientation:el.data[0].orientation,plotLeft:root.left+plot.l,ticks:[...el.querySelectorAll('.ytick text')].map(rect).sort((a,b)=>a.top-b.top),values:[...el.querySelectorAll('.bartext')].filter(n=>n.textContent.trim()).map(rect),texts:el.data.map(trace=>trace.text),hover:el.data[0].customdata.map(data=>data[2])}});
  assert.equal(geometry.orientation,'h');assert.equal(geometry.ticks.length,12);assert.equal(geometry.values.length,24);assert(geometry.ticks.every(t=>t.right<geometry.plotLeft));assert.deepEqual(geometry.hover,[...labels].reverse());
  for(let i=1;i<geometry.ticks.length;i++)assert(geometry.ticks[i-1].bottom<geometry.ticks[i].top);
  for(let i=0;i<geometry.values.length;i++)for(let j=i+1;j<geometry.values.length;j++){const a=geometry.values[i],b=geometry.values[j];assert(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=.5||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=.5,'Value labels overlap');}
  assert(await page.locator('#question-q0 [aria-label="Scrollable chart, all categories"]').isVisible());await page.locator('#question-q0 .kobo-chart').screenshot({path:`output/kobo-dense-charts/chart-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('#question-q1').scrollIntoViewIfNeeded();const other=page.locator('#question-q1 .js-plotly-plot');await other.waitFor();await page.waitForTimeout(200);assert(await other.evaluate(el=>{const legend=el.querySelector('.legend').getBoundingClientRect();return [...el.querySelectorAll('.ytick text')].every(tick=>legend.right<tick.getBoundingClientRect().left)}));
 await page.locator('#question-q0').scrollIntoViewIfNeeded();const png=page.waitForEvent('download');await page.locator('#question-q0').getByRole('button',{name:'Export question',exact:true}).click();await page.getByRole('button',{name:'Chart PNG',exact:true}).click();await(await png).saveAs('output/kobo-dense-charts/chart.png');
 const pdf=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Report PDF',exact:true}).click();await(await pdf).saveAs('output/kobo-dense-charts/report.pdf');assert.equal(calls(),1);assert.deepEqual(errors,[]);
 console.log('PASS: all 24 positive values visible, no overlapping values or category labels, desktop/tablet/mobile, left legend, PNG and segmented PDF, no extra analysis requests.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
