const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = process.env.BOY_OUTPUT || 'output/boy-motion';
const url = process.env.APP_URL || 'http://127.0.0.1:5189/';
(async () => {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('export-recovery')?[]:{available:false,ready:false,availability:{},sheets:[],features:{}}}));
    await page.clock.install();
    await page.goto(url,{waitUntil:'domcontentloaded'});
    const reveal=page.getByRole('button',{name:'Reveal the cartoon boy'});
    const boy=page.locator('.cartoon-home-avatar');
    await reveal.click();
    await page.clock.runFor(100);
    assert.equal(await boy.getAttribute('data-activity'),'greeting');
    const svg=await boy.locator('svg').elementHandle();
    const advance=async(ms,activity)=>{await page.clock.fastForward(ms);await page.clock.runFor(40);assert.equal(await boy.getAttribute('data-activity'),activity)};
    await advance(2400,'idle');
    await boy.focus();await page.keyboard.press('Enter');
    assert.equal(await boy.getAttribute('data-activity'),'greeting');
    assert(await svg.evaluate(n=>n===document.querySelector('.cartoon-boy')),'Clicking must retain the SVG rig');
    await page.clock.runFor(900);
    const before=await boy.locator('.boy-arm-right').getAttribute('transform');
    await page.keyboard.press('Space');
    const repeated=await boy.locator('.boy-arm-right').getAttribute('transform');
    const armAngle=value=>Number(value.match(/rotate\(([-\d.]+)/)[1]);
    assert(Math.abs(armAngle(repeated)-armAngle(before))<5,'Repeated greeting must keep current pose');
    await advance(2500,'idle');await advance(8100,'thinking');await advance(4100,'reading');
    await advance(6600,'idle');await advance(4600,'walking');
    assert.equal(await boy.getAttribute('data-facing'),'right');
    await page.clock.runFor(600);
    const x=(await boy.boundingBox()).x;
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
    await page.clock.runFor(80);
    const pausedX=(await boy.boundingBox()).x;
    const pausedPose=await boy.locator('.boy-rig').getAttribute('transform');
    await page.clock.fastForward(30000);
    assert.equal((await boy.boundingBox()).x,pausedX);assert.equal(await boy.locator('.boy-rig').getAttribute('transform'),pausedPose);
    assert.equal(await boy.getAttribute('data-activity'),'walking');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});
    await page.clock.runFor(100);
    assert(Math.abs((await boy.boundingBox()).x-pausedX)<15,'Resume must not jump across the screen');
    await page.clock.runFor(600);assert((await boy.boundingBox()).x>x);
    await advance(15000,'idle');await advance(4600,'playing');await advance(4600,'sitting');
    await advance(5100,'idle');await advance(4600,'stretching');await advance(3300,'looking');await advance(3700,'celebrating');await advance(2300,'idle');
    await advance(4600,'thinking');await advance(4100,'reading');await advance(6600,'idle');await advance(4600,'walking');
    assert.equal(await boy.getAttribute('data-facing'),'left');
    const rightEdge=(await boy.boundingBox()).x;await page.clock.runFor(800);
    assert((await boy.boundingBox()).x<rightEdge,'Body must travel in the direction it faces');
    const interrupted=(await boy.boundingBox()).x;await boy.focus();await page.keyboard.press('Enter');
    assert(Math.abs((await boy.boundingBox()).x-interrupted)<2,'Interrupting a leftward walk must retain its position');
    // Pause/resume when the whole actor is outside the viewport.
    await boy.evaluate(n=>n.style.left='-2000px');await page.clock.runFor(100);
    assert.equal(await boy.getAttribute('data-paused'),'true');
    const offscreenPose=await boy.locator('.boy-rig').getAttribute('transform');
    await page.clock.fastForward(20000);
    assert.equal(await boy.locator('.boy-rig').getAttribute('transform'),offscreenPose);
    await boy.evaluate(n=>n.style.left='');await page.clock.runFor(100);
    assert.equal(await boy.getAttribute('data-paused'),null);
    await boy.focus();await page.keyboard.press('Enter');await page.clock.runFor(600);
    const drag=async()=>{
      const r=await boy.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();
      await page.mouse.move(Math.max(70,r.x+r.width/2-80),r.y+r.height/2-140,{steps:8});
      await page.clock.runFor(320);
      assert.equal(await boy.getAttribute('data-dragging'),'true');
      assert(Number(await boy.locator('.boy-shadow').getAttribute('opacity'))>0,'Airborne shadow remains on the floor');
    };
    await drag();await page.mouse.up();assert.equal(await boy.getAttribute('data-recovery'),'falling');
    await page.clock.runFor(300);await boy.screenshot({path:output+'/falling.png'});
    await advance(900,'idle');assert.equal(await boy.getAttribute('data-recovery'),'down');
    await page.clock.runFor(100);await boy.screenshot({path:output+'/down.png'});
    await advance(600,'idle');assert.equal(await boy.getAttribute('data-recovery'),'getting-up');
    await advance(1750,'idle');assert.equal(await boy.getAttribute('data-recovery'),null);
    assert.equal(await boy.evaluate(n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).m42),0,'Recovery must finish on the floor even after a skipped frame');
    // Resize clamps travel and preserves the responsive dimensions.
    await page.setViewportSize({width:390,height:844});await page.clock.runFor(100);
    const r=await boy.boundingBox();
    assert(r.x>=0&&r.x+r.width<=390&&r.y>=0&&r.y+r.height<=844,JSON.stringify(r));
    await drag();await boy.evaluate(n=>n.releasePointerCapture(1));await page.mouse.up();
    await advance(1300,'idle');await advance(700,'idle');await advance(1750,'idle');
    await boy.click();assert.equal(await boy.getAttribute('data-activity'),'greeting');
    await drag();await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(100);await page.mouse.up();
    assert.equal(await boy.getAttribute('data-dragging'),null);assert.equal(await boy.getAttribute('data-recovery'),null);
    const still=await boy.locator('.boy-rig').getAttribute('transform');
    await page.clock.fastForward(30000);await boy.focus();await page.keyboard.press('Enter');
    assert.equal(await boy.getAttribute('data-activity'),'idle');assert.equal(await boy.locator('.boy-rig').getAttribute('transform'),still);
    assert.equal(await boy.evaluate(n=>n.getAnimations({subtree:true}).length),0);
    await page.getByRole('button',{name:'Hide the cartoon boy'}).click();assert.equal(await boy.count(),0);
    await reveal.click();assert.equal(await boy.count(),1);
    await page.emulateMedia({reducedMotion:'no-preference'});
    // Stop wall time so screenshots cannot be overwritten by the live RAF while capturing.
    await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
    assert(await boy.evaluate(async node=>{
      const {poseAt}=await import('/src/boyMotion.ts');const {bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
      const parts=bindBoy(node);
      for(const direction of [1,-1])for(let t=0;t<=780;t+=40){
        const pose=poseAt('walking',1140+t,t,false,null,440,780,{direction,walkMs:6000,strideUnits:60});
        paintBoy(parts,pose,0,node.offsetHeight/210);
        if(pose.facing!==direction||pose.shoeL!==direction||pose.shoeR!==direction)return false;
      }
      return node.getAnimations({subtree:true}).length===0;
    }),'Body and shoes must face the travel direction without competing CSS animations');
    // Deterministic samples from the same production pose evaluator and renderer.
    for(const width of [1440,390])for(const theme of ['glass-light','glass-dark']){
      await page.setViewportSize({width,height:width===390?844:900});await page.clock.runFor(80);
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      for(const [activity,t] of [['greeting',900],['walking',300],['thinking',1600],['reading',1800],['sitting',1700],['playing',1500],['stretching',1200],['looking',2300],['celebrating',780]]){
        await page.evaluate(async({activity,t})=>{
          const {poseAt}=await import('/src/boyMotion.ts');const {bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
          const node=document.querySelector('.cartoon-home-avatar');node.style.transform='translate3d(0,0,0)';
          paintBoy(bindBoy(node),poseAt(activity,t,1800),0,node.offsetHeight/210);
        },{activity,t});
        // Capture without advancing the virtual clock.
        await page.screenshot({path:output+'/'+width+'-'+theme+'-'+activity+'.png',clip:{x:0,y:(width===390?844:900)-245,width:250,height:245}});
      }
      await page.screenshot({path:output+'/'+width+'-'+theme+'-page.png'});
    }
    // Every fourth frame of the greeting at 60 fps, for seams and follow-through.
    for(let frame=0;frame<=144;frame+=4){
      await page.evaluate(async t=>{
        const {poseAt}=await import('/src/boyMotion.ts');const {bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
        const n=document.querySelector('.cartoon-home-avatar');paintBoy(bindBoy(n),poseAt('greeting',t,t),0,n.offsetHeight/210);
      },frame/60*1000);
      await page.screenshot({path:output+'/frame-'+String(frame).padStart(3,'0')+'.png',clip:{x:0,y:599,width:250,height:245}});
    }
    // Touch cancellation follows the same recovery path and does not swallow the next tap.
    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    touch.on('pageerror',e=>errors.push(e.message));
    await touch.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('export-recovery')?[]:{available:false}}));
    await touch.clock.install();await touch.goto(url,{waitUntil:'domcontentloaded'});await touch.getByRole('button',{name:'Reveal the cartoon boy'}).tap();
    const tb=touch.locator('.cartoon-home-avatar'),box=await tb.boundingBox(),cdp=await touch.context().newCDPSession(touch);
    const point={x:box.x+box.width/2,y:box.y+box.height/2,id:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x+60,y:point.y-120}]});
    assert.equal(await tb.getAttribute('data-dragging'),'true');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    for(const ms of [1300,700,1750]){await touch.clock.fastForward(ms);await touch.clock.runFor(40)}
    assert.equal(await tb.getAttribute('data-recovery'),null);await tb.tap();
    assert.equal(await tb.getAttribute('data-activity'),'greeting');
    assert.deepEqual(errors,[]);
    await page.getByRole('link',{name:/Enter workspace/}).first().click();await page.clock.runFor(100);assert.equal(await boy.count(),0);
    console.log('PASS: full routine, continuous interruptions, retained rig, hidden/offscreen pause, recovery, resize, mouse/touch cancellation, reduced motion, keyboard, themes, reveal/hide, route cleanup. Visual samples: '+output);
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
