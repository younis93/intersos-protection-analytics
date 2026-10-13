const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'frontend/src/updateNotesCheck.tsx'),html=path.join(root,'frontend/update-notes-check.html');
(async()=>{let browser;try{
  fs.writeFileSync(fixture,`import React from 'react';import {createRoot} from 'react-dom/client';import Welcome from './Welcome';import LegalPlatform from './LegalPlatform';import './styles.css';
    createRoot(document.getElementById('root')!).render(location.search.includes('workspace')?<LegalPlatform/>:<Welcome foxUnlocked={false} onFoxUnlock={()=>{}}/>);`);
  fs.writeFileSync(html,'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/src/updateNotesCheck.tsx"></script>');
  const notes=fs.readFileSync(path.join(root,'RELEASE_NOTES.md'),'utf8').split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).join('\n');
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const results=[],errors=[],output=path.join(root,'output/update-release-notes');fs.mkdirSync(output,{recursive:true});
  for(const surface of ['home','workspace']){
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(String(error)));
    let phase='downloading';
    await page.route('**/api/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/api/update/check')return route.fulfill({json:{enabled:true,available:true,currentVersion:'1.0.49',latestVersion:'1.0.50',notes,sizeBytes:84183192}});
      if(url.pathname==='/api/update/install'||url.pathname==='/api/update/status')return route.fulfill({json:{phase,progress:1,downloadedBytes:0,totalBytes:84183192,currentVersion:'1.0.49',error:phase==='error'?'Synthetic download failure':null}});
      if(url.pathname==='/api/legal/metadata')return route.fulfill({json:{ready:false,source:null,availability:{},sheets:[],months:[],reviewCounts:{},warnings:[]}});
      if(url.pathname==='/api/legal/import-progress')return route.fulfill({json:{active:false,phase:'idle'}});
      return route.fulfill({json:{}});
    });
    await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5188')+'/update-notes-check.html'+(surface==='workspace'?'?workspace':''));
    await page.getByRole('dialog',{name:'Application update'}).waitFor();
    assert.equal(await page.locator('.update-release-notes li').count(),2);
    assert.equal(await page.locator('.update-release-notes h4').first().textContent(),'Improved app performance and speed');
    assert.equal(await page.locator('.update-icon svg').evaluate(node=>getComputedStyle(node).animationName),'none');
    await page.getByRole('button',{name:'Update now',exact:true}).click();await page.getByText('Downloading',{exact:false}).first().waitFor();
    assert.equal(await page.locator('.update-icon svg').evaluate(node=>getComputedStyle(node).animationName),'update-icon-turn');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.update-icon svg').evaluate(node=>getComputedStyle(node).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor'])for(const width of [1440,390]){
      await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      const layout=await page.evaluate(()=>{const card=document.querySelector('.update-modal'),notes=document.querySelector('.update-release-notes');return {left:card.getBoundingClientRect().left,right:card.getBoundingClientRect().right,height:card.getBoundingClientRect().height,overflow:card.scrollWidth>card.clientWidth,align:getComputedStyle(notes).textAlign}});
      assert(layout.left>=0&&layout.right<=width,'Modal exceeds viewport');assert(layout.height<=900,'Modal exceeds viewport height');assert.equal(layout.overflow,false);assert.equal(layout.align,'left');
      const file=`${surface}-${theme}-${width}.png`;await page.screenshot({path:path.join(output,file)});results.push(file);
    }
    phase='error';await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
    assert.equal(await page.locator('.update-icon svg').evaluate(node=>getComputedStyle(node).animationName),'none');
    phase='installing';await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.update-actions button')].some(button=>button.textContent==='Later'&&button.disabled));
    assert.equal(await page.getByRole('button',{name:'Later',exact:true}).isDisabled(),true);
    assert.equal(await page.locator('.update-icon svg').evaluate(node=>getComputedStyle(node).animationName),'update-icon-turn');
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({surfaces:2,themeLayouts:results.length,downloadErrorAndInstalling:true,pageErrors:errors}));
}finally{await browser?.close();for(const file of [fixture,html])fs.rmSync(file,{force:true});}})().catch(error=>{console.error(error);process.exit(1)});
