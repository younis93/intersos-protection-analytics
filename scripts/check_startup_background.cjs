const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const width of [1440,390])for(const theme of ['glass-light','glass-dark']){
   let expected;
   for(const mode of ['processing','workspace','native']){
    const page=await browser.newPage({viewport:{width,height:900}});
    if(mode==='native')await page.setContent(fs.readFileSync(`output/startup-background-${theme}.html`,'utf8'));
    else{
     await page.route('**/api/**',route=>{if(route.request().url().endsWith('/metadata'))return;return route.fulfill({status:200,contentType:'application/json',body:'{"enabled":false,"available":false,"state":"idle"}',headers:{'access-control-allow-origin':'*'}})});
     await page.goto('http://127.0.0.1:5188/performance-harness.html');
     await page.evaluate(async({mode,theme})=>{
      await import('/src/styles.css');
      const {default:React}=await import('/node_modules/.vite/deps/react.js');const client=await import('/node_modules/.vite/deps/react-dom_client.js');
      const {default:Component}=await import(mode==='processing'?'/src/ProcessingRecords.tsx':'/src/RootApp.tsx');
      localStorage.setItem('legal-platform-theme',theme);document.documentElement.dataset.theme=theme;
      window.location.hash='#/legal/overview';document.body.innerHTML='<div id="test-root"></div>';
      (client.createRoot||client.default.createRoot)(document.getElementById('test-root')).render(React.createElement(Component,mode==='processing'?{progress:{state:'processing',stage:'Validating',dataset:'beneficiaries',percent:50,error:''}}:{}));
     },{mode,theme});
    }
    const root=mode==='processing'?'.legal-upload-overlay':mode==='workspace'?'.app-startup-loading':'.startup';
    const layers='.processing-ring-field';
    await page.locator(layers+'[data-motion=running]').waitFor();
    await page.locator(root).waitFor();
    const styles=await page.evaluate(({root,layers})=>{
     const properties=['width','height','left','top','right','bottom','filter','opacity','backgroundImage','animationDuration','animationDirection','animationName'];
     return {background:getComputedStyle(document.querySelector(root)).backgroundColor,layers:[...document.querySelectorAll(layers)].map(el=>Object.fromEntries(properties.map(key=>[key,getComputedStyle(el)[key]])))};
    },{root,layers});
    if(!expected)expected=styles;else assert.deepEqual(styles,expected,`${mode} at ${width} ${theme}`);
    if(mode!=='processing')await page.screenshot({path:`output/startup-background-${mode}-${width}-${theme}.png`});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.locator(layers+'[data-motion=static]').waitFor();
    await page.close();
   }
  }
  const failed=await browser.newPage();await failed.setContent(fs.readFileSync('output/startup-background-failed.html','utf8'));
  await failed.locator('.processing-ring-field[data-motion=static]').waitFor();await failed.close();
  console.log(JSON.stringify({matchingNativeWorkspaceAndProcessingBackgrounds:true,desktop:true,mobile:true,lightDarkThemes:true,reducedMotion:true,failureStopsMotion:true}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
