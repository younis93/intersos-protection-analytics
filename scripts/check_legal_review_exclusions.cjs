const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.LEGAL_REVIEW_TEST_URL || 'http://127.0.0.1:5193';
const ageRule = 'Invalid age', contactRule = 'Invalid contact number';

(async () => {
  const browser = await chromium.launch({executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
  try {
    console.log('Browser started');
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    page.setDefaultTimeout(10000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(String(error)));
    let exclusions = [], failSave = false, delayReview = false;
    const releases = [];
    const record = (id, rule) => ({dataset:'beneficiaries',rule,caseId:id,recordId:id,row:Number(id.slice(1)),name:`Person ${id}`,project:'P1',lawyer:'Lawyer A',detail:rule,action:'Check record'});
    const source = [...Array.from({length:12}, (_,i) => record(`B${i+1}`,ageRule)),record('B99',contactRule)];
    await page.route('**/legal-review-test', route => route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));
    await page.route('**/api/legal/**', async route => {
      const request=route.request(), url=new URL(request.url());
      if(url.pathname==='/api/legal/review') {
        const body=request.postDataJSON();requests.push(body.rule);
        if(delayReview)await new Promise(resolve=>releases.push(resolve));
        const rows=source.filter(row=>!exclusions.some(entry=>entry.rule===row.rule&&entry.caseId===row.caseId));
        const ruleCounts=Object.fromEntries([ageRule,contactRule].map(rule=>[rule,rows.filter(row=>row.rule===rule).length]));
        return route.fulfill({json:{dataset:'beneficiaries',rows:rows.filter(row=>!body.rule||row.rule===body.rule),total:rows.filter(row=>!body.rule||row.rule===body.rule).length,page:1,pageSize:5000,rules:[ageRule,contactRule],ruleCounts,filterOptions:{severity:[],lawyer:['Lawyer A'],project:['P1'],location:[],date:[]},availableMonths:[],activeComparisonMonth:'',nameRecordCount:0,eligibleNameRecordCount:0}});
      }
      if(url.pathname.startsWith('/api/legal/duplicate-exclusions')) {
        if(request.method()!=='GET') {
          if(failSave)return route.fulfill({status:500,json:{detail:'Test save failed'}});
          if(request.method()==='DELETE') {
            const id=decodeURIComponent(url.pathname.split('/').at(-1)),rule=url.searchParams.get('rule');
            exclusions=exclusions.filter(entry=>!(entry.caseId===id&&entry.rule===rule));
          } else if(url.pathname.endsWith('/import')) {
            exclusions.push({...record('B4',ageRule),identifierType:'caseId',identifierValue:'B4'});
          } else {
            const body=request.postDataJSON();exclusions.push(...(body.records||[body]));
          }
        }
        return route.fulfill({json:{rows:exclusions,count:exclusions.length,imported:1,duplicates:0,invalid:0,column:'Case ID'}});
      }
      return route.fulfill({json:{rows:[]}});
    });
    await page.goto(`${base}/legal-review-test`);
    console.log('Test page opened');
    await page.evaluate(async()=>{
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {ReviewPageBody:Review}=await import('/src/LegalReviewPage.tsx');
      const {setLegalRevision}=await import('/src/legalQueryCache.ts');
      const {legalLoadScheduler}=await import('/src/legalLoadScheduler.ts');
      setLegalRevision('exclusions-browser-test');
      window.taskRuns=0;
      legalLoadScheduler.startTasks([{id:'unrelated',page:'other',phase:'main',priority:'main-background',available:()=>true,run:async()=>{window.taskRuns++}}],'other');
      createRoot(document.getElementById('root')).render(React.createElement(Review,{dataset:'beneficiaries',comparisonMonth:'',onOpenCase:()=>{}}));
      // Keep the test layout stable, with room below the tables for scroll checks.
      const style=document.createElement('style');style.textContent='body{font:14px Arial;margin:0;padding-bottom:1800px}td{height:36px}.duplicate-exclusion-modal{position:fixed;inset:0;z-index:10;background:white}.case-modal-backdrop{display:none}.column-filter-popup{position:fixed;z-index:20;background:white}';document.head.append(style);
    });
    console.log('Review mounted');
    const table=rule=>page.locator('.finding-table-section').filter({has:page.getByRole('heading',{name:rule,exact:true})});
    const age=table(ageRule),contact=table(contactRule);
    const rowCount=async(section,count)=>{await page.waitForFunction(({rule,count})=>[...document.querySelectorAll('.finding-table-section')].find(el=>el.querySelector('h3')?.textContent===rule)?.querySelectorAll('tbody tr').length===count,{rule:section===age?ageRule:contactRule,count})};
    await rowCount(age,12);await rowCount(contact,1);
    console.log('Initial findings loaded');
    const contactRequests=()=>requests.filter(rule=>rule===contactRule).length;
    const contactBaseline=contactRequests();
    await age.getByRole('button',{name:'Filter Project',exact:true}).click();
    const filter=page.getByRole('dialog',{name:'Filter Project',exact:true});
    await filter.getByRole('button',{name:'Deselect all',exact:true}).click();
    await filter.getByRole('checkbox',{name:'P1',exact:true}).check();
    await filter.getByRole('button',{name:'Apply',exact:true}).click();
    assert.equal(await age.locator('.column-filter-trigger.is-active').count(),1);

    // A failed save leaves the table and confirmation available for retry.
    await age.locator('tbody tr').first().dispatchEvent('contextmenu');
    await page.getByRole('menuitem',{name:'Exclude this record from this finding',exact:true}).click();
    failSave=true;
    await page.getByRole('button',{name:'Exclude record',exact:true}).click();
    await page.locator('.error').filter({hasText:'Test save failed'}).waitFor();
    await rowCount(age,12);assert.equal(exclusions.length,0);
    failSave=false;delayReview=true;
    const before=requests.length;
    await page.getByRole('button',{name:'Exclude record',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.duplicate-exclusion-panel'));
    await rowCount(age,12);assert.equal(await age.locator('.column-filter-trigger.is-active').count(),1);
    await page.evaluate(()=>window.scrollTo(0,200));
    const scroll=await page.evaluate(()=>window.scrollY);
    await page.waitForTimeout(100);
    delayReview=false;releases.splice(0).forEach(resolve=>resolve());
    await rowCount(age,11);
    assert.equal(await page.evaluate(()=>window.scrollY),scroll);
    assert.deepEqual(requests.slice(before).sort(),['',ageRule].sort());
    assert.equal(contactRequests(),contactBaseline);

    // Bulk exclusion and restore must not reset another rule's revision.
    for(const id of ['B2','B3'])await age.getByRole('checkbox',{name:`Select Person ${id}`,exact:true}).check();
    await age.getByRole('button',{name:'Exclude selected',exact:true}).click();
    await page.getByRole('button',{name:'Exclude 2 records',exact:true}).click();
    await rowCount(age,9);
    await contact.locator('tbody tr').first().dispatchEvent('contextmenu');
    await page.getByRole('menuitem',{name:'Exclude this record from this finding',exact:true}).click();
    await page.getByRole('button',{name:'Exclude record',exact:true}).click();
    await contact.getByRole('heading',{name:'No matching records',exact:true}).waitFor();
    const contactAfterExclude=contactRequests();
    await page.getByRole('button',{name:'Exclude',exact:true}).click();
    await page.getByRole('menuitem').filter({hasText:'Excluded findings for this page'}).click();
    const manager=page.getByRole('dialog',{name:'Local exclusion register',exact:true});
    for(const id of ['B2','B3'])await manager.getByRole('checkbox',{name:`Select ${id}`,exact:true}).check();
    await manager.getByRole('button',{name:'Restore selected (2)',exact:true}).click();
    await page.getByRole('button',{name:'Confirm restore',exact:true}).click();
    await rowCount(age,11);assert.equal(contactRequests(),contactAfterExclude);
    await manager.locator('tbody tr').filter({hasText:'B1'}).getByRole('button',{name:'Restore',exact:true}).click();
    await page.getByRole('button',{name:'Confirm restore',exact:true}).click();
    await rowCount(age,12);
    await manager.locator('header button').click();

    await page.getByRole('button',{name:'Exclude',exact:true}).click();
    await page.getByRole('menuitem',{name:'Import exclusions',exact:true}).click();
    const importer=page.getByRole('dialog',{name:'Import exclusions',exact:true});
    await importer.getByRole('checkbox',{name:ageRule,exact:true}).check();
    await importer.locator('input[type=file]').setInputFiles({name:'exclusions.csv',mimeType:'text/csv',buffer:Buffer.from('Case ID\nB4')});
    await importer.getByRole('button',{name:'Import exclusions',exact:true}).click();
    await importer.getByRole('status').waitFor();await rowCount(age,11);
    assert.equal(await age.locator('.column-filter-trigger.is-active').count(),1);
    assert.equal(contactRequests(),contactAfterExclude);
    assert.equal(await page.evaluate(()=>window.taskRuns),1);
    assert.deepEqual(errors,[]);
    console.log('PASS: single/bulk exclusion, failed save retry, delayed refresh, column filters, scroll, last row, single/bulk restore, import, unaffected tables and scheduler.');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
