// Compare Kobo against the app's real workspace and verify responsive navigation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=process.env.APP_TEST_URL||'http://127.0.0.1:5191',kobo=process.env.KOBO_TEST_URL||'http://127.0.0.1:5192';
const output=path.resolve(__dirname,'../output/kobo-workspace');fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});let original,id,page;try{
 page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const style=(selector)=>page.locator(selector).first().evaluate(n=>{const c=getComputedStyle(n);return{padding:c.padding,radius:c.borderRadius,font:c.fontFamily,fontSize:c.fontSize,width:c.width}});
 await page.goto(app+'/#/legal/overview');await page.locator('.legal-shell .chart-card').first().waitFor({timeout:60000});
 const sidebarReference=await style('.sidebar'),cardReference=await style('.chart-card'),headingReference=await style('.chart-card h3');
 await page.locator('.brand img').evaluate(n=>n.decode());await page.screenshot({path:path.join(output,'legal-reference.png')});
 const projects=await(await page.request.get(kobo+'/api/kobo/projects')).json();id=projects.find(p=>p.name==='Kobo acceptance example')?.id;assert(id,'Run the Kobo browser check against an isolated database first.');
 const project=await(await page.request.get(`${kobo}/api/kobo/projects/${id}`)).json();original=project.settings;
 await page.request.put(`${kobo}/api/kobo/projects/${id}/settings`,{data:{...original,language:'en'}});
 await page.goto(`${kobo}/#/kobo/${id}`);await page.locator('.kobo-question').first().waitFor();await page.locator('.brand img').evaluate(n=>n.decode());
 assert.deepEqual(await style('.sidebar'),sidebarReference,'Kobo sidebar must share the application dimensions and typography');
 const card=await style('.kobo-question');assert.equal(card.radius,cardReference.radius);assert.equal(card.padding,cardReference.padding);assert.equal((await style('.kobo-question h3')).fontSize,headingReference.fontSize);
 await page.getByRole('button',{name:'Slide menu left',exact:true}).click();assert(await page.locator('.sidebar-collapsed').count());await page.getByRole('button',{name:'Expand menu',exact:true}).click();
 for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
  await page.evaluate(t=>localStorage.setItem('app-theme',t),theme);await page.reload();await page.locator('.kobo-question').first().waitFor();await page.locator('.kobo-question .js-plotly-plot').first().waitFor();
  await page.screenshot({path:path.join(output,theme+'-analysis.png')});
 }
 await page.evaluate(()=>localStorage.setItem('app-theme','glass-light'));await page.reload();await page.locator('.kobo-question').first().waitFor();
 await page.getByRole('button',{name:'Language',exact:true}).click();await page.getByRole('option',{name:'العربية',exact:true}).click();await page.getByText('Updating analysis…',{exact:true}).waitFor({state:'hidden'});
 const sidebar=await page.locator('.sidebar').boundingBox(),main=await page.locator('.kobo-content').boundingBox();assert(sidebar.x>main.x,'Arabic workspace must mirror the sidebar placement');
 await page.screenshot({path:path.join(output,'arabic-analysis.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'arabic-mobile.png')});
 const mobile=await page.locator('.sidebar').boundingBox();assert(mobile.y>=0&&mobile.y+mobile.height<=844);assert(await page.locator('.sidebar').evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.setViewportSize({width:1440,height:1000});assert.equal(await page.locator('.sidebar').getByRole('button',{name:'Report',exact:true}).count(),0);await page.evaluate(id=>window.location.hash=`#/kobo/${id}/report`,id);
 await page.waitForURL(`**/#/kobo/${id}`);await page.locator('.sidebar').getByRole('button',{name:'Projects',exact:true}).click();await page.getByRole('heading',{name:'Your Kobo projects',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,sidebarReference,cardPadding:card.padding,cardRadius:card.radius,errors,output}));
}finally{if(original&&id&&page)await page.request.put(`${kobo}/api/kobo/projects/${id}/settings`,{data:original});await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
