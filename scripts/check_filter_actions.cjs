/* Run against Vite using the bundled Playwright package. Temporary fixtures are removed. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'frontend/src/filterActionCheck.tsx'),html=path.join(root,'frontend/filter-action-check.html');
(async()=>{
  let browser;
  try {
    fs.writeFileSync(fixture,`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CheckboxMultiSelect,ActiveFilters,FilterValueList} from './components';import {matchesSelection} from './filterSelection';import './styles.css';import './sendIssues.css';
    function Fixture(){const [selected,setSelected]=useState<string[]>([]),[values,setValues]=useState(['Baghdad','Erbil','Basra']);return <div className="legal-shell"><main style={{padding:20}}><div id="page-context"><div id="filter-context" className="send-issues si-top-filters" style={{overflow:'hidden',height:100,transform:'translateZ(0)'}}>{new URLSearchParams(window.location.search).has("drawer")?<div className="case-filter-scroll"><details open><summary>Governorates</summary><div><FilterValueList values={values} selected={selected} onChange={setSelected}/></div></details></div>:<CheckboxMultiSelect label="Governorates" guidance="Available options follow your linked filters." values={values} selected={selected} onChange={setSelected}/>}</div></div><ActiveFilters filters={{Governorate:selected}} onRemove={(_,value)=>setSelected(current=>current.filter(item=>item!==value))}/><output data-testid="result">{values.filter(value=>matchesSelection(value,selected)).join(',')}</output><button onClick={()=>setValues(current=>[...current,'New governorate'])}>Add value</button></main></div>};createRoot(document.getElementById('root')!).render(<Fixture/>);`);
    fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/filterActionCheck.tsx"></script>');
    browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));
    const contexts=[['indicator-reporting','indicator-filter-bar'],['hotline-dashboard','hotline-filter-bar'],['legal-deportation-dashboard','deportation-quick-filters'],['lawyer-overview-page','lawyer-overview-filter-bar'],['legal-analytics-studio','studio-quick-fields'],['send-issues','si-top-filters'],['','reconciliation-project-select'],['detention-page','detention-toolbar'],['','detention-header-filters'],['','legal-toolbar'],['','indicator-filter-drawer-controls'],['','explorer-filter-grid']];
    for(const width of [320,390,768,1280]) {for(const [pageContext,filterContext] of contexts) {
      await page.setViewportSize({width,height:600});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5178')+'/filter-action-check.html');
      await page.locator('#page-context').evaluate((node,cls)=>node.className=cls,pageContext);await page.locator('#filter-context').evaluate((node,cls)=>node.className=cls,filterContext);
      const menu=page.locator('.checkbox-multi-menu');
      const action=async(name,value)=>{const row=menu.locator('.filter-option-row').filter({has:page.getByText(value,{exact:true})});if(width<=760)await row.getByRole('button',{name:`Actions for ${value}`,exact:true}).click();else await row.hover();await row.getByRole('button',{name:`${name} ${value}`,exact:true}).click();};
      await page.getByRole('button',{name:'All governorates',exact:true}).click();
      assert.equal(await menu.locator('.filter-link-guidance').textContent(),'Available options follow your linked filters.');
      const rowHeight=await menu.locator('.filter-option-row').first().evaluate(node=>node.getBoundingClientRect().height);assert(rowHeight<=52,`Oversized filter row: ${filterContext} ${width} ${rowHeight}`);
      const searchHeight=await menu.locator('.multi-select-search').evaluate(node=>node.getBoundingClientRect().height);assert(searchHeight<=42,`Oversized search: ${filterContext} ${searchHeight}`);
      await menu.getByRole('checkbox',{name:'Baghdad',exact:true}).check();
      await menu.getByRole('checkbox',{name:'Baghdad',exact:true}).uncheck();
      assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Erbil,Basra');
      assert.equal(await menu.locator('input[type=checkbox]:checked').count(),0);
      assert.equal(await page.getByRole('button',{name:'All governorates',exact:true}).count(),1);
      await action('Only','Baghdad');assert.equal(await page.getByTestId('result').textContent(),'Baghdad');
      await action('Exclude','Baghdad');assert.equal(await page.getByTestId('result').textContent(),'Erbil,Basra');
      assert.equal(await menu.locator('.filter-exclusion-chips').count(),0);assert.equal(await menu.locator('input[type=checkbox]:checked').count(),2);assert.equal(await menu.getByRole('checkbox',{name:'Baghdad',exact:true}).isChecked(),false);
      await action('Exclude','Erbil');assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Basra');
      const box=await menu.boundingBox();assert(box.x>=11&&box.x+box.width<=width-11&&box.y+box.height<=589);
      if(process.env.FILTER_SCREENSHOT_PATH&&width===320)await page.screenshot({path:process.env.FILTER_SCREENSHOT_PATH});
      await menu.getByRole('button',{name:'Done',exact:true}).click();
      await page.getByRole('button',{name:'Add value',exact:true}).click();assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Basra');
      await page.getByRole('button',{name:'Governorate (2)',exact:true}).click();
      await menu.getByRole('checkbox',{name:'Erbil',exact:true}).check();assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Erbil,Basra');
      await menu.getByRole('checkbox',{name:'Baghdad',exact:true}).uncheck();assert.equal(await page.getByTestId('result').textContent(),'Erbil,Basra');
      await action('Only','Basra');assert.equal(await page.getByTestId('result').textContent(),'Basra');
      await menu.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Erbil,Basra,New governorate');
      await menu.getByPlaceholder('Search governorates').fill('Baghdad');
      assert.equal(await menu.getByRole('button',{name:/^Select all/}).count(),0);
      await menu.getByRole('button',{name:'Select matching (1)',exact:true}).click();
      assert.equal(await page.getByTestId('result').textContent(),'Baghdad');
      await action('Exclude','Baghdad');assert.equal(await page.getByTestId('result').textContent(),'Erbil,Basra,New governorate');
      await menu.getByPlaceholder('Search governorates').fill('');
      await menu.getByRole('button',{name:/^Select all (?:\(\d+\)|\d+)$/}).click();
      assert.equal(await menu.locator('input[type=checkbox]:checked').count(),4);
      assert(await menu.getByRole('button',{name:/^Select all (?:\(\d+\)|\d+)$/}).isDisabled());
      await menu.getByPlaceholder('Search governorates').fill('No matching governorate');
      assert(await menu.getByRole('button',{name:'Select matching (0)',exact:true}).isDisabled());
      assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Erbil,Basra,New governorate');
      await menu.getByPlaceholder('Search governorates').fill('  BAGHDAD  ');
      await menu.getByRole('button',{name:'Select matching (1)',exact:true}).click();
      assert.equal(await page.getByTestId('result').textContent(),'Baghdad');
      await menu.getByPlaceholder('Search governorates').fill('');
      assert.equal(await menu.getByRole('button',{name:/^Select matching/}).count(),0);
      await action('Exclude','Baghdad');
      await menu.getByRole('button',{name:/^Select all (?:\(\d+\)|\d+)$/}).click();
      assert.equal(await menu.locator('.filter-exclusion-chips').count(),0);
      assert.equal(await menu.locator('input[type=checkbox]:checked').count(),4);
      await menu.getByPlaceholder('Search governorates').focus();await page.keyboard.press('Escape');assert.equal(await menu.count(),0);
    }
    }
    for(const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:600});await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5178')+'/filter-action-check.html?drawer');
      await page.locator('#page-context').evaluate(node=>node.className='case-filter-drawer');
      await page.locator('#filter-context').evaluate(node=>{node.className='';node.style.cssText='height:auto;overflow:visible';});
      const drawer=page.locator('#filter-context');
      await drawer.getByRole('checkbox',{name:'Baghdad',exact:true}).check();
      await drawer.getByRole('checkbox',{name:'Baghdad',exact:true}).uncheck();
      assert.equal(await page.getByTestId('result').textContent(),'Baghdad,Erbil,Basra');
      assert.equal(await drawer.locator('input[type=checkbox]:checked').count(),0);
      await drawer.getByRole('button',{name:/^Select all (?:\(\d+\)|\d+)$/}).click();
      assert.equal(await drawer.locator('input[type=checkbox]:checked').count(),3);
      const row=drawer.locator('.filter-option-row').filter({has:page.getByText('Baghdad',{exact:true})});
      if(width<=760)await row.getByRole('button',{name:'Actions for Baghdad'}).click();else await row.hover();
      await row.getByRole('button',{name:'Exclude Baghdad',exact:true}).click();assert.equal(await page.getByTestId('result').textContent(),'Erbil,Basra');
      await drawer.getByRole('button',{name:/^Select all (?:\(\d+\)|\d+)$/}).click();assert.equal(await drawer.locator('input[type=checkbox]:checked').count(),3);
      const bounds=await drawer.getByRole('button',{name:/^Select all (?:\(\d+\)|\d+)$/}).boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width);
      await drawer.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await drawer.locator('input[type=checkbox]:checked').count(),0);
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({viewports:4,pageContexts:contexts.length,drawerViewports:4,only:true,exclude:true,selectAllOthers:true,newValuesNotAutoSelected:true,noExclusionLabels:true,selectAll:true,searchUsesMatching:true,selectMatching:true,noMatchesDisabled:true,linkedGuidance:true,reset:true,escape:true,errors}));
  } finally {await browser?.close();fs.rmSync(fixture,{force:true});fs.rmSync(html,{force:true});}
})().catch(error=>{console.error(error);process.exit(1)});
