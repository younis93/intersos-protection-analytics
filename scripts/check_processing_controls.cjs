const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const width of [1440,390])for(const theme of ['glass-light','glass-dark']){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.goto('http://127.0.0.1:5188/performance-harness.html');
   await page.evaluate(async({theme})=>{
    await import('/src/styles.css');
    const {default:React}=await import('/node_modules/.vite/deps/react.js');
    const client=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default:Processing}=await import('/src/ProcessingRecords.tsx');
    document.documentElement.dataset.theme=theme;
    document.body.innerHTML='<button id="underlying">Browse existing data</button><div id="processing-root"></div>';
    document.getElementById('underlying').onclick=()=>window.browsed=true;
    const root=(client.createRoot||client.default.createRoot)(document.getElementById('processing-root'));
    let props={progress:{operationId:'fixture',state:'processing',stage:'Validating',dataset:'assessments',percent:50,completedWork:5,totalWork:10,error:''},restoring:true,onCancel:()=>{window.cancelClicks=(window.cancelClicks||0)+1},onDismiss:()=>root.render(null)};
    window.updateProcessing=next=>{props={...props,...next};root.render(React.createElement(Processing,props))};
    window.updateProcessing({});
   },{theme});
   await page.getByRole('button',{name:'Minimize',exact:true}).waitFor();
   await page.screenshot({path:`output/processing-controls-${width}-${theme}.png`});
   const card=await page.locator('.legal-upload-progress').boundingBox();
   assert(card.x>=0&&card.x+card.width<=width&&card.y>=0&&card.y+card.height<=900);
   await page.locator('.processing-ring-field[data-motion=running]').waitFor();
   await page.getByRole('button',{name:'Minimize',exact:true}).click();
   await page.getByRole('button',{name:'Browse existing data'}).click();assert(await page.evaluate(()=>window.browsed));
   await page.evaluate(()=>window.updateProcessing({progress:{operationId:'fixture',state:'processing',stage:'Preparing review',dataset:'beneficiaries',percent:76,error:''}}));
   await page.getByText('76%',{exact:true}).waitFor();
   assert.equal(await page.locator('.legal-processing-background').count(),0);
   const compact=await page.locator('.legal-upload-overlay').boundingBox();assert(compact.width<=360&&compact.x>=0&&compact.x+compact.width<=width);
   await page.screenshot({path:`output/processing-compact-${width}-${theme}.png`});
   await page.getByRole('button',{name:'Restore',exact:true}).click();
   await page.getByRole('button',{name:'Cancel',exact:true}).focus();await page.keyboard.press('Enter');
   assert.equal(await page.evaluate(()=>window.cancelClicks),1);
   await page.evaluate(()=>window.updateProcessing({cancelError:'Unable to cancel processing. Please try again.'}));
   await page.getByRole('alert').waitFor();assert(await page.getByRole('button',{name:'Cancel',exact:true}).isEnabled());
   await page.evaluate(()=>window.updateProcessing({cancelError:'',cancelPending:true}));
   assert(await page.getByRole('button',{name:'Cancelling...',exact:true}).isDisabled());
   await page.evaluate(()=>window.updateProcessing({cancelPending:false,progress:{operationId:'fixture',state:'cancelled',percent:76,error:''}}));
   await page.getByRole('heading',{name:'Import cancelled'}).waitFor();assert.equal(await page.locator('.is-processing').count(),0);
   await page.getByRole('button',{name:'Dismiss'}).click();assert.equal(await page.locator('.legal-upload-overlay').count(),0);
   await page.evaluate(()=>window.updateProcessing({progress:{operationId:'fixture',state:'processing',stage:'Validating',dataset:'assessments',percent:50,error:''}}));
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.processing-ring-field[data-motion=static]').waitFor();
   assert.equal(await page.locator('.legal-processing-document').first().evaluate(el=>getComputedStyle(el).animationName),'none');
   await page.evaluate(()=>window.updateProcessing({progress:{operationId:'fixture',state:'error',percent:null,error:'Invalid CSV'}}));
   await page.getByRole('heading',{name:'Import failed'}).waitFor();await page.getByText('Invalid CSV',{exact:true}).waitFor();
   await page.close();
  }
  console.log(JSON.stringify({desktop:true,mobile:true,themes:true,minimizeRestore:true,liveProgress:true,browsing:true,cancelRetry:true,keyboard:true,reducedMotion:true,terminalStates:true}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
