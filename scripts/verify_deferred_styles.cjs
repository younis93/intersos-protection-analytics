// Compare live computed styles against the original stylesheet on the same DOM.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function verify(page){
 const baseline=process.env.STYLE_BASELINE_PATH||path.resolve(__dirname,'../tmp/size-loading/styles-before.css');
 if(!fs.existsSync(baseline)){console.log('Original stylesheet unavailable; skipped optional baseline comparison.');return false}
 const motion=await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important}'});
 const properties=['display','position','grid-template-columns','flex-direction','gap','padding','margin','border-radius','border-color','background-color','color','font-size','font-weight','text-align','overflow','max-width','height','min-height'];
 const snapshot=()=>page.evaluate(properties=>Array.from(document.querySelectorAll('.legal-content *, .studio-toolbar *, .studio-canvas *, .legal-header *')).filter(el=>el.getBoundingClientRect().width&& !el.closest('.js-plotly-plot')).map(el=>({tag:el.tagName,classes:el.className,styles:Object.fromEntries(properties.map(p=>[p,getComputedStyle(el).getPropertyValue(p)]))})),properties);
 for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor'])for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.waitForTimeout(350);
  const current=await snapshot(),style=await page.addStyleTag({content:fs.readFileSync(baseline,'utf8')});
  await page.waitForTimeout(350);const original=await snapshot();await style.evaluate(el=>el.remove());
  const differences=current.flatMap((item,index)=>JSON.stringify(item.styles)===JSON.stringify(original[index]?.styles)?[]:[{tag:item.tag,classes:item.classes,current:item.styles,original:original[index]?.styles}]);
  assert.equal(differences.length,0,`Style differences ${theme} ${width}: ${JSON.stringify(differences.slice(0,3))}`);
 }
 await motion.evaluate(el=>el.remove());
 console.log('Deferred styles match original across five themes and two viewports.');
 return true;
};
