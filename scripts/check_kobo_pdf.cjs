// Export complete bilingual reports from the isolated browser verification database.
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const page=await browser.newPage();const base=process.env.KOBO_TEST_URL||'http://127.0.0.1:5188';
 const projects=await(await page.request.get(base+'/api/kobo/projects')).json();const projectId=process.env.KOBO_TEST_PROJECT||projects.find(p=>p.name==='Kobo acceptance example')?.id;
 assert(projectId,'Run check_kobo_browser.cjs first against an isolated database.');
 for(const language of ['en','ar']){
  const project=await(await page.request.get(base+'/api/kobo/projects/'+projectId)).json();project.settings.language=language;
  await page.request.put(base+'/api/kobo/projects/'+projectId+'/settings',{data:project.settings});
  await page.goto(`${base}/?pdfVerification=${language}#/kobo/${projectId}`);
  await page.locator('.kobo-question').first().waitFor({timeout:120000});assert.equal(await page.locator('.kobo-shell').getAttribute('dir'),language==='ar'?'rtl':'ltr');
  const download=page.waitForEvent('download',{timeout:240000});await page.getByRole('button',{name:'Report PDF',exact:true}).click();
  const target=path.resolve(__dirname,`../output/kobo/full-${language}.pdf`);await(await download).saveAs(target);console.log(language+' full report saved');
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
