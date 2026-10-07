/* Keyboard regression checks against a running Vite server. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'frontend/src/filterKeyboardCheck.tsx'),html=path.join(root,'frontend/filter-keyboard-check.html');
(async()=>{
  let browser;
  try{
    fs.writeFileSync(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CheckboxMultiSelect,AppSelect} from './components';import './styles.css';
    const values=Array.from({length:new URLSearchParams(location.search).has('large')?2000:3},(_,i)=>'Option '+String(i).padStart(4,'0'));
    function Fixture(){const [selected,setSelected]=useState<string[]>([]),[single,setSingle]=useState('b');return <main style={{padding:20}}><CheckboxMultiSelect label="Options" values={values} selected={selected} onChange={setSelected}/><output>{selected.join(',')}</output><AppSelect label="Single" value={single} onChange={setSingle} options={[['a','Alpha'],['b','Beta'],['c','Gamma']]}/><button>After filters</button></main>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
    fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/filterKeyboardCheck.tsx"></script>');
    browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
    const focused=async selector=>{const node=page.locator(selector);await node.waitFor();await page.waitForFunction(selector=>document.querySelector(selector)===document.activeElement,selector,{timeout:3000}).catch(async()=>{throw new Error('Expected focus: '+selector+'; actual: '+await page.evaluate(()=>document.activeElement?.outerHTML))})};
    for(const width of [390,1280])for(const large of [false,true]){
      await page.setViewportSize({width,height:800});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5178')+'/filter-keyboard-check.html'+(large?'?large':''));
      const trigger=page.locator('.checkbox-multi-select .app-select-trigger');await trigger.focus();await page.keyboard.press('ArrowDown');
      await focused('.multi-select-search input');await page.keyboard.press('ArrowDown');
      await focused('[data-window-index="0"] input');await page.keyboard.press('Enter');assert.equal(await page.locator('output').textContent(),'Option 0000');
      await page.keyboard.press('ArrowDown');await focused('[data-window-index="1"] input');await page.keyboard.press('Space');
      assert.equal(await page.locator('output').textContent(),'Option 0000,Option 0001');
      await page.keyboard.press('End');await page.waitForFunction(index=>document.activeElement?.closest('[data-window-index]')?.getAttribute('data-window-index')===String(index),large?1999:2);
      await page.keyboard.press('Home');await page.waitForFunction(()=>document.activeElement?.closest('[data-window-index]')?.getAttribute('data-window-index')==='0');
      await page.keyboard.press('Tab');
      if(width===390){await focused('[data-window-index="0"] .filter-option-more');await page.keyboard.press('Enter');await page.keyboard.press('Tab');}
      await focused('[data-window-index="0"] .filter-option-actions button:first-child');await page.keyboard.press('Tab');await focused('[data-window-index="0"] .filter-option-actions button:last-child');
      await page.keyboard.press('Tab');await focused('[data-window-index="1"] input');await page.keyboard.press('Shift+Tab');await focused('[data-window-index="0"] .filter-option-actions button:last-child');
      if(width===390){await page.keyboard.press('Escape');await focused('[data-window-index="0"] .filter-option-more');assert.equal(await page.locator('.checkbox-multi-menu').count(),1);}
      await page.keyboard.press('Escape');assert.equal(await page.locator('.checkbox-multi-menu').count(),0);assert(await trigger.evaluate(node=>node===document.activeElement));
      await page.keyboard.press('Enter');await page.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Enter');assert(await trigger.evaluate(node=>node===document.activeElement));
      await page.keyboard.press('Enter');await page.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.checkbox-multi-menu').count(),0);
      const single=page.getByRole('button',{name:'Single',exact:true});await single.focus();await page.keyboard.press('ArrowDown');await focused('[role=option][aria-selected=true]');
      await page.keyboard.press('End');await focused('[role=option]:last-child');await page.keyboard.press('Enter');assert(await single.evaluate(node=>node===document.activeElement));assert.equal(await single.textContent(),'Gamma');
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({mobile:true,desktop:true,smallLists:true,virtualLists:true,arrowNavigation:true,homeEnd:true,enterSpace:true,rowActionsReachable:true,escapeFocus:true,doneFocus:true,tabExit:true,errors}));
  }finally{await browser?.close();fs.rmSync(fixture,{force:true});fs.rmSync(html,{force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
