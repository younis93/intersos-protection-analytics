// Actual page components against the memory-only synthetic API fixture on 8018.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/sectionIconCheck.tsx'),html=path.join(root,'frontend/section-icon-check.html');
(async()=>{let browser;assert(!fs.existsSync(entry)&&!fs.existsSync(html));try{
 fs.writeFileSync(entry,`import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {LegalAnalyticsStudio} from './LegalStudioPage';import {DetentionCases} from './LegalDetentionPage';import {IndicatorReporting} from './LegalIndicatorsPage';import {Cases} from './LegalCasesPage';import Studio from './Studio';import {getLegalStudio} from './api';import './styles.css';import './workspace.css';import './studio.css';import './indicators.css';import './detention.css';
 const kind=new URLSearchParams(location.search).get('kind');const noop=()=>{};
 function Fixture(){const [metadata,setMetadata]=useState<any>(null);useEffect(()=>{fetch('http://127.0.0.1:8000/api/legal/metadata').then(response=>response.json()).then(setMetadata)},[]);if(!metadata)return <p>Loading</p>;
 const builder:any={ready:true,pages:Object.fromEntries(metadata.sheets.map((sheet:any)=>[sheet.id,{rows:sheet.rows,filters:{},dimensions:sheet.columns}]))};
 return <div className="legal-shell"><main className="legal-content">{kind==='studio'?<LegalAnalyticsStudio metadata={metadata} theme="glass-light" onOpenCase={noop}/>:kind==='detention'?<DetentionCases theme="glass-light" onOpenCase={noop}/>:kind==='indicators'?<IndicatorReporting revision={1}/>:kind==='cases'?<Cases metadata={metadata} initialQuery="" onQueryUsed={noop} onOpenCase={noop}/>:<Studio metadata={builder} theme="glass-light" sourceOptions={[['assessments','Assessments']]} studioLoader={getLegalStudio}/>}</main></div>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
 fs.writeFileSync(html,'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/src/sectionIconCheck.tsx"></script>');
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage(),errors=[],results=[];page.on('pageerror',error=>errors.push(String(error)));await page.routeWebSocket('**',()=>{});
 await page.route('http://127.0.0.1:8000/**',async route=>{try{if(route.request().url().endsWith('/indicators/reconciliation/metadata')){await route.fulfill({json:{available:false,months:[],sheets:[]},headers:{'access-control-allow-origin':'*'}});return;}const response=await route.fetch({url:route.request().url().replace(':8000',':8018')});await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})}catch{await route.abort().catch(()=>{})}});
 for(const kind of ['studio','detention','indicators','cases','builder']){
  console.log('Section icons:',kind);await page.setViewportSize({width:1440,height:1000});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/section-icon-check.html?kind='+kind);await page.locator('.animated-section-icon').first().waitFor();
  const selector=kind==='studio'?'.studio-section-tabs':kind==='detention'?'.detention-tabs':kind==='indicators'?'.indicator-subnav':kind==='cases'?'.case-view-switch':null;
  let count=0;
  if(selector){
   const tabs=page.locator(selector),buttons=tabs.getByRole('button');count=await buttons.count();
   for(let index=0;index<count;index++){
    await buttons.nth(index).click();await page.waitForFunction(selector=>document.querySelector(selector+' button.active .animated-section-icon [data-nav-part]'),selector);
    const active=tabs.locator('button.active .animated-section-icon');
    const check=await active.evaluate(icon=>{const animations=icon.getAnimations({subtree:true});return {parts:animations.length,html:animations.every(animation=>animation.effect.target instanceof HTMLElement),size:icon.getBoundingClientRect().width}});
    assert(check.parts>=2&&check.html,'Missing composited section animation');assert.equal(check.size,kind==='cases'?15:17);
   }
   if(count>1){await buttons.first().click();await page.waitForTimeout(30);await buttons.last().click();await page.waitForTimeout(30);assert.equal(await tabs.locator('button.active').count(),1);}
  }
  for(const width of [390,1440])for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
   await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const sizes=await page.locator('.animated-section-icon').evaluateAll(icons=>icons.filter(icon=>icon.getClientRects().length).map(icon=>{const bounds=icon.getBoundingClientRect();return {width:bounds.width,height:bounds.height,expected:Number.parseFloat(icon.style.getPropertyValue('--animated-icon-size'))}}));
   assert(sizes.length>0);assert(sizes.every(size=>size.width===size.expected&&size.height===size.expected),'Section icon layout changed');
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert(await page.locator('.animated-section-icon .legal-nav-icon-part').evaluateAll(parts=>parts.every(part=>getComputedStyle(part).animationName==='none')));await page.emulateMedia({reducedMotion:'no-preference'});
  assert.deepEqual(errors,[]);results.push({page:kind,tabs:count,themes:5,mobileDesktop:true});
 }
 console.log(JSON.stringify({results,errors}));
}finally{await browser?.close();fs.rmSync(entry,{force:true});fs.rmSync(html,{force:true})}})().catch(error=>{console.error(error);process.exitCode=1});
