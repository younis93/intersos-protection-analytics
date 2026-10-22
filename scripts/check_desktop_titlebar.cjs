// Isolated desktop-shell checks. No user data or running app is required.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/desktop-titlebar');
fs.mkdirSync(out,{recursive:true});
const generated=require('node:child_process').spawnSync(process.env.PYTHON||path.join(root,'.venv/Scripts/python.exe'),['-c',`from pathlib import Path
import desktop_launcher as launcher
out=Path('output/desktop-titlebar')
for theme in launcher.THEME_NAMES:
    (out/f'{theme}.html').write_text(launcher.startup_html(theme),encoding='utf-8')
(out/'failed.html').write_text(launcher.startup_html('glass-light',failed=True),encoding='utf-8')
`],{cwd:root,encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr||String(generated.error||''));
const css=fs.readFileSync(path.join(root,'frontend/public/desktop-titlebar.css'),'utf8');
const js=fs.readFileSync(path.join(root,'frontend/public/desktop-titlebar.js'),'utf8');
const appCss=fs.readFileSync(path.join(root,'frontend/src/styles.css'),'utf8').replace(/^@import[^;]+;/,'');
const icon='data:image/png;base64,'+fs.readFileSync(path.join(root,'frontend/public/intersos-symbol-transparent.png')).toString('base64');
const mock=`window.__desktopShell=true;window.__desktopIcon=${JSON.stringify(icon)};window.calls=[];window.state={maximized:true,fullscreen:false,version:'1.0.58'};window.pywebview={api:{get_window_state:async()=>window.state,minimize_window:async()=>calls.push('minimize'),toggle_maximize_window:async()=>{calls.push('maximize');state={...state,maximized:!state.maximized};return state},close_window:async()=>calls.push('close'),begin_window_drag:async()=>calls.push('drag'),begin_window_resize:async edge=>calls.push('resize:'+edge)}};`;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  let scenarios=0;
  for(const scale of [1,1.5]){
   const context=await browser.newContext({deviceScaleFactor:scale});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   for(const [width,height] of [[720,700],[1100,700],[1440,900]])for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor']){
    await page.setViewportSize({width,height});
    await page.setContent(`<html data-theme="${theme}"><head><style>${appCss}\n${css}</style></head><body><div id="root"><div class="app-shell"><aside class="sidebar">Navigation</aside><main><h1>Analysis workspace</h1><div style="position:fixed;inset:0;background:var(--bg);z-index:99999">Loading overlay</div></main></div></div><script>${mock}</script><script>${js}</script></body></html>`);
    await page.getByRole('button',{name:'Restore down',exact:true}).waitFor();
    const geometry=await page.evaluate(()=>({bar:document.querySelector('.desktop-titlebar').getBoundingClientRect().toJSON(),root:document.querySelector('#root').getBoundingClientRect().toJSON(),main:document.querySelector('main').getBoundingClientRect().toJSON(),border:getComputedStyle(document.querySelector('.desktop-titlebar')).borderBottomWidth,logo:document.querySelector('.desktop-titlebar-brand img').getBoundingClientRect().height,control:document.querySelector('.desktop-titlebar-close').getBoundingClientRect().width,top:document.elementFromPoint(innerWidth-24,16).closest('button')?.title}));
    assert.equal(geometry.bar.height,32);assert.equal(geometry.root.y,32);assert.equal(geometry.root.height,height-32);assert.equal(geometry.main.height,height-32);assert.equal(geometry.top,'Close');assert.equal(geometry.border,'0px');assert.equal(geometry.logo,20);assert.equal(geometry.control,46);
    if(scale===1&&width===1440)await page.screenshot({path:path.join(out,`${theme}.png`)});
    scenarios++;
   }
   // Run real shared script handlers against a mocked native bridge.
   await page.getByRole('button',{name:'Restore down',exact:true}).click();
   await page.getByRole('button',{name:'Maximize',exact:true}).waitFor();
   await page.locator('.desktop-titlebar-brand').dblclick();
   await page.getByRole('button',{name:'Restore down',exact:true}).waitFor();
   await page.getByRole('button',{name:'Minimize',exact:true}).click();
   await page.getByRole('button',{name:'Close',exact:true}).focus();
   await page.keyboard.press('Enter');
   assert.deepEqual(await page.evaluate(()=>calls),['maximize','maximize','minimize','close']);
   await page.getByRole('button',{name:'Restore down',exact:true}).click();
   await page.mouse.move(page.viewportSize().width-1,400);await page.mouse.down();await page.mouse.up();
   assert((await page.evaluate(()=>calls)).includes('resize:right'));
   await page.mouse.move(250,24);await page.mouse.down();await page.mouse.move(280,24);await page.mouse.up();
   assert((await page.evaluate(()=>calls)).includes('drag'));
   await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('desktopwindowstate',{detail:{...state,nativeDrag:true}}));
    calls=[];
    const brand=document.querySelector('.desktop-titlebar-brand');
    brand.dispatchEvent(new MouseEvent('mousedown',{button:0,screenX:20,screenY:15}));
    window.dispatchEvent(new MouseEvent('mousemove',{screenX:100,screenY:15}));
    window.dispatchEvent(new MouseEvent('mouseup'));
    brand.dispatchEvent(new MouseEvent('dblclick'));
   });
   assert.deepEqual(await page.evaluate(()=>calls),[]);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.desktop-titlebar-brand')).getPropertyValue('app-region')),'drag');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.desktop-titlebar-controls')).getPropertyValue('app-region')),'no-drag');
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('desktopwindowstate',{detail:{...state,fullscreen:true}})));
   assert.equal(await page.locator('.desktop-titlebar').isVisible(),false);
   assert.equal((await page.locator('#root').boundingBox()).y,0);
   assert.deepEqual(errors,[]);
   await context.close();
  }
  const page=await browser.newPage();
  await page.setContent(`<div id="root">Browser workspace</div><script>${js}</script>`);
  assert.equal(await page.locator('.desktop-titlebar').count(),0);
  // Inspect the actual generated offline startup and error documents too.
  for(const theme of ['glass-light','glass-dark','unhcr','executive','multicolor','failed']){
   const fixture=path.join(out,`${theme}.html`);
   if(!fs.existsSync(fixture))throw Error('Generate startup fixtures with desktop_launcher.startup_html before running this check.');
   await page.evaluate(()=>{delete window.pywebview});
   await page.setContent(fs.readFileSync(fixture,'utf8'));
   assert.equal(await page.locator('.desktop-titlebar').count(),1);
   assert.equal((await page.locator('#root').boundingBox()).y,0);
   assert.equal(await page.locator('.desktop-titlebar').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
   assert.equal(await page.getByRole('button',{name:'Close',exact:true}).isDisabled(),true);
   await page.evaluate(mock+`;window.dispatchEvent(new Event('pywebviewready'));`);
   await page.getByRole('button',{name:'Close',exact:true}).click();
   assert((await page.evaluate(()=>calls)).includes('close'));
  }
  // Loading/preparation surfaces clear the bar, while normal workspaces and
  // minimized background processing retain their solid toolbar.
  for(const shell of ['legal-shell','kobo-shell']){
   await page.setContent(`<style>${appCss}\n${css}</style><div id="root"><main class="app-shell ${shell}"><div class="legal-upload-overlay"><div class="legal-processing-background"></div></div></main></div><script>${mock}</script><script>${js}</script>`);
   const background=()=>page.locator('.desktop-titlebar').evaluate(node=>getComputedStyle(node).backgroundColor);
   assert.equal(await background(),'rgba(0, 0, 0, 0)');
   assert.equal((await page.locator('#root').boundingBox()).y,0);
   await page.locator('.legal-upload-overlay').evaluate(node=>node.classList.add('is-minimized'));
   assert.notEqual(await background(),'rgba(0, 0, 0, 0)');
   assert.equal((await page.locator('#root').boundingBox()).y,32);
   await page.locator('.legal-upload-overlay').evaluate(node=>node.remove());
   assert.notEqual(await background(),'rgba(0, 0, 0, 0)');
   await page.locator('#root').evaluate(node=>node.insertAdjacentHTML('beforeend','<section class="app-startup-loading"></section>'));
   assert.equal(await background(),'rgba(0, 0, 0, 0)');
  }
  await page.setContent(`<style>${appCss}\n${css}</style><div id="root"><main class="kobo-module-loading">Preparing your workspace</main></div><script>${mock}</script><script>${js}</script>`);
  assert.equal(await page.locator('.desktop-titlebar').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal((await page.locator('#root').boundingBox()).y,0);
  console.log(`Passed ${scenarios} theme/size/scaling layouts, window controls, drag/resize dispatch, fullscreen, browser isolation, and 6 offline startup/error documents.`);
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
