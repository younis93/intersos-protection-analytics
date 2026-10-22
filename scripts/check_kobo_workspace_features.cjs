const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const fixture=JSON.parse(fs.readFileSync('output/kobo-customize/fixture.json','utf8'));const root='http://127.0.0.1:5207';
 await page.goto(`${root}/#/kobo/${fixture.id}`);await page.getByRole('navigation',{name:'Kobo navigation'}).waitFor();
 const nav=page.getByRole('navigation',{name:'Kobo navigation'});
 const chooseLocation=async(value)=>{await page.getByRole('button',{name:'Location field',exact:true}).click();const search=page.getByRole('textbox',{name:'Search location field',exact:true});if(value){await search.fill('unmatched_location_test');await page.getByText('No matching options',{exact:true}).waitFor();await search.fill('Location')}await page.getByRole('option',{name:value?'Location':'Choose a governorate, district, site or geopoint',exact:true}).click()};

 await nav.getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('heading',{name:'Project overview'}).waitFor();
 await page.locator('.kobo-workspace-choices input').first().check();await page.locator('.kobo-workspace-summaries article').waitFor();
 await nav.getByRole('button',{name:'Reporting',exact:true}).click();await page.getByLabel('Report title',{exact:true}).fill('Protection monitoring report');
 await page.getByLabel('Findings',{exact:true}).fill('Priority needs recorded in this assessment.');await page.locator('.kobo-workspace-choices input').first().check();
 const reportDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF report',exact:true}).click();const report=await reportDownload;await report.saveAs('output/kobo-workspace-features/report.pdf');
 assert.equal(fs.readFileSync('output/kobo-workspace-features/report.pdf').subarray(0,5).toString(),'%PDF-');
 await nav.getByRole('button',{name:'Geography',exact:true}).click();await chooseLocation('group/location');await page.locator('.kobo-workspace-card table').waitFor();
 await page.screenshot({path:'output/kobo-workspace-features/geography-desktop.png',fullPage:true});
 await page.route('**/geography',route=>route.fulfill({json:{total:2,missing:0,invalid:0,spatial:false,rows:[{label:'Baghdad',count:2}],cells:[],governorates:{Baghdad:2},matches:[{source:'Baghdad',governorate:'Baghdad'}],unmapped:0}}));await chooseLocation('');await chooseLocation('group/location');await page.getByRole('img',{name:'Submissions by Iraq governorate',exact:true}).waitFor();assert.equal(await page.getByRole('img',{name:'Submissions by Iraq governorate',exact:true}).locator('path').count(),18);await page.getByRole('img',{name:'Submissions by Iraq governorate',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'output/kobo-workspace-features/governorate-map.png'});await page.unroute('**/geography');
 const dl=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Back up project',exact:true}).click();const backup=await dl;await backup.saveAs('output/kobo-workspace-features/project.kobo-backup.zip');
 await page.reload();await nav.waitFor();await page.getByRole('button',{name:'Prepare AI report prompt',exact:true}).waitFor();await nav.getByRole('button',{name:'Reporting',exact:true}).click();await page.getByLabel('Findings',{exact:true}).waitFor();assert.equal(await page.getByLabel('Findings',{exact:true}).inputValue(),'Priority needs recorded in this assessment.');
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Findings',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'output/kobo-workspace-features/report-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'horizontal overflow');
 await page.goto(`${root}/#/kobo`);await page.locator('.kobo-project-header-actions').getByRole('button',{name:'Import project',exact:true}).waitFor();await page.locator('input[aria-label="Import saved project ZIP"]').setInputFiles('output/kobo-workspace-features/project.kobo-backup.zip');await nav.waitFor();assert(!page.url().includes(fixture.id));assert.equal(errors.length,0,errors.join('\n'));console.log('Desktop/mobile overview, reporting, geography, persistence, backup and restore passed.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
