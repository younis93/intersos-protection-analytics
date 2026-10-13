// Verify the real shared control against every page's CSS, including deferred styles.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/filterColorCheck.tsx'),html=path.join(root,'frontend/filter-color-check.html');
const contexts=[['professional-overview','overview-filter-bar'],['indicator-reporting','indicator-filter-bar'],['hotline-dashboard','hotline-filter-bar'],['legal-deportation-dashboard','deportation-quick-filters'],['lawyer-overview-page','lawyer-overview-filter-bar'],['lawyer-overview-page','intelligence-filter-row'],['legal-analytics-studio','studio-quick-fields'],['send-issues','si-top-filters'],['','reconciliation-project-select'],['detention-page','detention-toolbar'],['','detention-header-filters'],['','legal-toolbar'],['','indicator-filter-drawer-controls'],['','explorer-filter-grid'],['review-filters-drawer','review-filter-field']];
(async()=>{
 assert(!fs.existsSync(entry)&&!fs.existsSync(html));let browser;
 try{
  fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {CheckboxMultiSelect} from './SelectionControls';import './styles.css';import './workspace.css';import './indicators.css';import './studio.css';import './detention.css';import './sendIssues.css';createRoot(document.getElementById('root')!).render(<main className="app-shell legal-shell" style={{display:'block',padding:24}}><div id="page-context"><div id="filter-context"><CheckboxMultiSelect label="Project" hideLabel values={['Project A']} selected={[]} onChange={()=>{}}/><div id="action-wrapper"><button id="filter-action" className="soft case-filter-button">Filters</button></div></div></div></main>);`);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/filterColorCheck.tsx"></script>');
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5186')+'/filter-color-check.html');await page.locator('.checkbox-multi-select').waitFor();
  await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
  const session=await page.context().newCDPSession(page);await session.send('DOM.enable');await session.send('CSS.enable');
  const {root:documentNode}=await session.send('DOM.getDocument');const {nodeId}=await session.send('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'.checkbox-multi-select'});
  const {nodeId:actionId}=await session.send('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'#filter-action'});
  let comparisons=0;
  for(const width of [390,1440])for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const state of ['default','hover','selected','open']){
    await session.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state==='hover'?['hover']:[]});await session.send('CSS.forcePseudoState',{nodeId:actionId,forcedPseudoClasses:state==='hover'?['hover']:[]});let expected,expectedAction;
    for(const [outer,inner] of contexts){
     const actual=await page.evaluate(({outer,inner,state})=>{
      document.getElementById('page-context').className=outer;document.getElementById('filter-context').className=inner;
      document.getElementById('action-wrapper').className=inner==='detention-toolbar'?'detention-toolbar-actions':inner==='deportation-quick-filters'?'deportation-toolbar-actions':'';
      const control=document.querySelector('.checkbox-multi-select');control.classList.toggle('has-selection',state==='selected');control.classList.toggle('open',state==='open');
      const color=(node,properties)=>Object.fromEntries(properties.map(property=>[property,getComputedStyle(node).getPropertyValue(property)]));
      return {control:color(control,['background-color','border-color']),button:color(control.querySelector('.app-select-trigger'),['background-color','border-color','color']),label:color(control.querySelector('.app-select-trigger>span'),['color']),icon:color(control.querySelector('.app-select-trigger>svg'),['color'])};
     },{outer,inner,state});
     if(!expected)expected=actual;else assert.deepEqual(actual,expected,`${theme} ${width} ${state}: ${outer}/${inner}`);comparisons++;
     if(['overview-filter-bar','deportation-quick-filters','detention-toolbar'].includes(inner)){
      const action=await page.locator('#filter-action').evaluate(node=>{const style=getComputedStyle(node);return {background:style.backgroundColor,color:style.color,border:style.borderColor}});
      if(!expectedAction)expectedAction=action;else assert.deepEqual(action,expectedAction,`Filters action differs from Overview: ${theme} ${width} ${state} ${inner}`);
     }
    }
   }
  }
  assert.deepEqual(errors,[]);const result={pageContexts:contexts.length,themes:5,widths:2,states:['default','hover','selected','open'],comparisons,pageErrors:errors};
  fs.mkdirSync(path.join(root,'output/performance'),{recursive:true});fs.writeFileSync(path.join(root,'output/performance/filter-colors.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser?.close();for(const file of [entry,html])fs.rmSync(file,{force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
