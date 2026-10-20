const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const labels=['Refugee registered with UNHCR or authorities','Refugee/asylum seeker not currently registered','IDP','Returnee displaced again (Al-Amal)','Other, please specify'];
 const calls=await mock(page,2,f=>{f.results.forEach((q,i)=>{q.chart=i?'bar':'column';q.breakdowns=q.breakdowns.slice(0,2).map((b,index)=>({...b,id:index?'m':'f',label:index?'Male':'Female',labels:[index?'Male':'Female'],values:[index?'m':'f']}));q.breakdownFields=[{id:'gender',label:'Gender'}];q.rows=labels.map((label,j)=>({id:'a'+j,label,count:30+j,percent:10+j,series:q.breakdowns.map(b=>({id:b.id,count:10+j,percent:10+j}))}))})});
 await page.goto((process.argv[2]||'http://127.0.0.1:5358')+'/#/kobo/scroll');
 const chart=page.locator('#question-q0 .js-plotly-plot');await chart.waitFor();fs.mkdirSync('output/kobo-chart-labels',{recursive:true});
 for(const width of [1440,800,390]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(350);await chart.evaluate(el=>el.scrollIntoView({block:'center'}));
  const geometry=await chart.evaluate(el=>({horizontal:el.data[0].orientation==='h',plotLeft:el.getBoundingClientRect().left+el._fullLayout._size.l,ticks:[...el.querySelectorAll(el.data[0].orientation==='h'?'.ytick text':'.xtick text')].map(n=>n.getBoundingClientRect().toJSON()),legend:el.querySelector('.legend')?.getBoundingClientRect().toJSON(),angle:(el.data[0].orientation==='h'?el._fullLayout.yaxis:el._fullLayout.xaxis).tickangle,hover:el.data[0].customdata.map(d=>d[2])}));
  assert.equal(geometry.angle,0);assert.deepEqual(geometry.hover,labels);if(geometry.horizontal){geometry.ticks.sort((a,b)=>a.top-b.top);for(let i=1;i<geometry.ticks.length;i++)assert(geometry.ticks[i-1].bottom<geometry.ticks[i].top);assert(geometry.ticks.every(tick=>tick.right<geometry.plotLeft));}else for(let i=1;i<geometry.ticks.length;i++)assert(geometry.ticks[i-1].right<=geometry.ticks[i].left+1,JSON.stringify({width,geometry}));
  assert(Math.max(...geometry.ticks.map(r=>r.bottom))<geometry.legend.top,JSON.stringify({width,geometry}));await chart.screenshot({path:`output/kobo-chart-labels/column-${width}.png`});
 }
 await page.setViewportSize({width:800,height:1000});const bar=page.locator('#question-q1 .js-plotly-plot');await page.locator('#question-q1').scrollIntoViewIfNeeded();await bar.waitFor();await page.waitForTimeout(350);const rows=await bar.locator('.ytick text').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()).sort((a,b)=>a.top-b.top));for(let i=1;i<rows.length;i++)assert(rows[i-1].bottom<rows[i].top);await bar.screenshot({path:'output/kobo-chart-labels/bar.png'});assert.equal(calls(),1);assert.deepEqual(errors,[]);
 console.log('PASS: long labels wrap without overlapping ticks or legends at desktop/tablet/mobile widths; horizontal labels have row spacing; full hover text and no analysis requests.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
