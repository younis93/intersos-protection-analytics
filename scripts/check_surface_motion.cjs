const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/surfaceMotionCheck.tsx'),html=path.join(root,'frontend/surface-motion-check.html');
(async()=>{let browser;assert(!fs.existsSync(entry)&&!fs.existsSync(html));try{
 fs.writeFileSync(entry,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {SharedFilterDrawer} from './SharedFilterDrawer';import NotificationToast from './NotificationToast';import Plot from './LazyPlot';import SingleMonthIndicatorChart from './SingleMonthIndicatorChart';import './styles.css';
 function Fixture(){const [open,setOpen]=useState(false),[selected,setSelected]=useState(['A']),[message,setMessage]=useState(''),[value,setValue]=useState(5),[tick,setTick]=useState(0);Object.assign(window,{setValue,setMessage,setOpen,setTick});return <main className="legal-shell" style={{display:'block',padding:20}}><button id="open" onClick={()=>setOpen(true)}>Filters</button><button id="notice" onClick={()=>setMessage('Saved')}>Notify</button><output>{tick}:{selected.join(',')}</output>{open&&<SharedFilterDrawer title="Filter records" eyebrow="FILTERS" fields={[{key:'project',label:'Project',values:['A','B'],selected,onChange:setSelected}]} onReset={()=>setSelected([])} onClose={()=>{(window as any).drawerCloseCount=((window as any).drawerCloseCount||0)+1;setOpen(false)}}/>}<NotificationToast message={message} onDismiss={()=>setMessage('')}/><Plot divId="motion-plot" data={[{type:'bar',x:['A','B'],y:[value,2]}]} layout={{height:280}}/><SingleMonthIndicatorChart month="2026-01" series={[{label:'Test',color:'#1683d8',values:[value]}]}/></main>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
 fs.writeFileSync(html,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/src/surfaceMotionCheck.tsx"></script>');
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.routeWebSocket('**',()=>{});
 await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/surface-motion-check.html');await page.waitForFunction(()=>document.querySelector('#motion-plot')?.data?.[0]?.y?.[0]===5);
 for(const width of [390,1440])for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.locator('#open').click();const drawer=page.locator('.shared-filter-drawer');await drawer.waitFor();
   assert.equal(await drawer.evaluate(node=>getComputedStyle(node).animationName),'surface-drawer-enter');
   assert.equal(await page.locator('.filter-backdrop').evaluate(node=>getComputedStyle(node).animationName),'surface-backdrop-enter');
   await drawer.getByRole('checkbox',{name:'B',exact:true}).check();assert.match(await page.locator('output').textContent(),/A,B/);
   await drawer.getByRole('button',{name:'Done',exact:true}).evaluate(node=>node.click());
   assert.equal(await drawer.evaluate(node=>getComputedStyle(node).animationName),'surface-drawer-exit');assert(await drawer.getAttribute('inert')!==null);
   await drawer.waitFor({state:'detached'});
   await page.locator('#open').click();await drawer.getByRole('checkbox',{name:'B',exact:true}).waitFor();assert(await drawer.getByRole('checkbox',{name:'B',exact:true}).isChecked());
   await drawer.getByRole('button',{name:'Close filters',exact:true}).click();await drawer.waitFor({state:'detached'});
   await page.locator('#open').click();await drawer.waitFor();await page.locator('.filter-backdrop').click({position:{x:1,y:400}});await drawer.waitFor({state:'detached'});
 }
 await page.locator('#notice').click();const toast=page.locator('.legal-copy-toast');assert.equal(await toast.evaluate(node=>getComputedStyle(node).animationName),'surface-notice-enter');
 await page.getByRole('button',{name:'Dismiss notification'}).click();assert(await toast.getAttribute('aria-hidden')==='true');assert.equal(await toast.evaluate(node=>getComputedStyle(node).animationName),'surface-notice-exit');
 await page.evaluate(()=>window.setMessage('Latest'));await page.waitForTimeout(240);assert.equal(await toast.locator('strong').textContent(),'Latest','Previous exit removed a new notification');
 await page.evaluate(()=>window.setMessage(''));await toast.waitFor({state:'detached'});
 await page.evaluate(()=>window.setValue(8));await page.waitForFunction(()=>document.querySelector('#motion-plot').data[0].y[0]===8);await page.waitForTimeout(260);
 assert.equal(await page.locator('#motion-plot').evaluate(node=>(node.layout.transition?.duration??0)),0,'Number labels must commit once without transition flicker');
 await page.evaluate(()=>{window.setValue(12);requestAnimationFrame(()=>window.setValue(19))});await page.waitForFunction(()=>document.querySelector('#motion-plot').data[0].y[0]===19);await page.waitForTimeout(300);
 assert.equal(await page.locator('.single-month-value').textContent(),'19');assert.equal(await page.locator('#motion-plot').evaluate(node=>node.getAnimations().length),0);
 await page.evaluate(()=>window.setTick(1));await page.waitForTimeout(80);assert.equal(await page.locator('.indicator-analysis-chart').evaluate(node=>node.getAnimations().length),0,'Unchanged chart replayed on an ordinary render');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>(document.querySelector('#motion-plot').layout.transition?.duration??0)===0);
 await page.locator('#open').click();assert.equal(await page.locator('.shared-filter-drawer').evaluate(node=>node.getAnimations().length),0);await page.getByRole('button',{name:'Done',exact:true}).click();await page.locator('.shared-filter-drawer').waitFor({state:'detached'});
 await page.locator('#notice').click();assert.equal(await toast.evaluate(node=>node.getAnimations().length),0);await page.getByRole('button',{name:'Dismiss notification'}).click();await toast.waitFor({state:'detached'});
 await page.evaluate(()=>window.setValue(23));await page.waitForFunction(()=>document.querySelector('#motion-plot').data[0].y[0]===23);assert.equal(await page.locator('.indicator-analysis-chart').evaluate(node=>node.getAnimations().length),0);
 assert.deepEqual(errors,[]);console.log('Chart updates/latest results, notification replacement/exit, drawer Done/X/backdrop/persistence, five themes, mobile/desktop and reduced motion passed.');
}finally{await browser?.close();fs.rmSync(entry,{force:true});fs.rmSync(html,{force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
