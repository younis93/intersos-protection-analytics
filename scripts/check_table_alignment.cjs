/* Check the actual table styles across page contexts without loading case data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const page=await browser.newPage();
    const root=path.resolve(__dirname,'..');
    const css=['styles.css','sendIssues.css'].map(file=>fs.readFileSync(path.join(root,'frontend/src',file),'utf8')).join('\n');
    const contexts=['detention-table-card','deportation-records-table','hotline-records-table','studio-records-table','compact-explorer','hierarchical-case-table','finding-table-section','lawyer-workload','indicator-table-wrap','indicator-analysis-table-wrap','indicator-reconciliation-table','drilldown-table','narrative-table','studio-table','si-table-scroll'];
    for(const width of [390,1280]){
      await page.setViewportSize({width,height:900});
      for(const context of contexts){
        await page.setContent(`<style>${css}</style><main class="legal-shell"><section class="legal-table-card legal-analytics-studio send-issues ${context}"><div class="legal-table-wrap"><table class="${context}"><thead><tr><th><input type="checkbox" aria-label="Select rows"></th><th><button><span>Project location</span><b>↕</b></button></th><th class="no-sort">Name</th><th class="no-sort">Action</th></tr></thead><tbody><tr><td><input type="checkbox" aria-label="Select row"></td><td>AMAL Camp</td><td dir="rtl">اسم المستفيد</td><td><button class="table-action">Open case</button></td></tr></tbody></table></div></section></main>`);
        const cells=await page.locator('th,td').evaluateAll(nodes=>nodes.map(node=>({align:getComputedStyle(node).textAlign,vertical:getComputedStyle(node).verticalAlign})));
        for(const cell of cells){assert.equal(cell.align,'center',`${context} at ${width}`);assert.equal(cell.vertical,'middle',`${context} at ${width}`)}
        const header=await page.locator('th>button').evaluate(node=>({align:getComputedStyle(node).textAlign,justify:getComputedStyle(node).justifyContent}));
        assert.equal(header.align,'center');assert.equal(header.justify,'center');
      }
    }
    console.log(JSON.stringify({pageContexts:contexts.length,viewports:2,headersCentered:true,dataCentered:true,verticalAlignment:true}));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
