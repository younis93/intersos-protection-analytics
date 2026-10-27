const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const out=process.env.BOY_DIRECTION_OUTPUT||'output/boy-direction';fs.mkdirSync(out+'/recovery-frames',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('export-recovery')?[]:{available:false,ready:false}}));
  await page.clock.install();await page.goto(process.env.APP_URL||'http://127.0.0.1:5189/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Reveal the cartoon boy'}).click();
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
  await page.evaluate(()=>{
   const stage=document.createElement('div');stage.id='boy-direction-stage';
   Object.assign(stage.style,{position:'fixed',left:'20px',top:'20px',width:'500px',height:'650px',background:'#f5f7fa',zIndex:'9999',overflow:'hidden'});
   document.body.append(stage);const node=document.querySelector('.cartoon-home-avatar');stage.append(node);
   Object.assign(node.style,{position:'absolute',left:'0',bottom:'0',width:'500px',height:'470px',maxWidth:'none',maxHeight:'none',transform:'none'});
   node.querySelector('svg').setAttribute('viewBox','-45 -20 250 235');
  });
  const stage=page.locator('#boy-direction-stage');
  const paint=async(data)=>page.evaluate(async data=>{
   const {poseAt,BOY}=await import('/src/boyMotion.ts'),{RIG}=await import('/src/boyRig.ts'),{bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
   const node=document.querySelector('.cartoon-home-avatar'),scale=2;
   const height=data.recovery==='falling'?180*(1-Math.min(1,data.t/500)**2):0;
   node.style.transform='translate3d(0,'+(-height)+'px,0)';
   const pose=poseAt(data.activity||'idle',data.t,data.idleTime??data.t,false,data.recovery||null,500,780,{direction:data.direction||1,walkMs:6000,strideUnits:60});
   paintBoy(bindBoy(node),pose,height,scale);
   return {facing:pose.facing,shoeL:pose.shoeL,shoeR:pose.shoeR};
  },data);
  // Opposing gait phases, both directions, with actual forward-facing shoes.
  for(const direction of [1,-1])for(let frame=0;frame<8;frame++){
   const state=await paint({activity:'walking',t:360+780+frame*780/8,direction});
   assert.equal(state.facing,direction);assert.equal(state.shoeL,direction);assert.equal(state.shoeR,direction);
   await stage.screenshot({path:out+'/walk-'+(direction===1?'right':'left')+'-'+frame+'.png'});
  }
  // Verify a stance foot stays still in world space as the body travels forward.
  const drift=await page.evaluate(async()=>{
   const {poseAt}=await import('/src/boyMotion.ts'),{bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
   const node=document.querySelector('.cartoon-home-avatar'),parts=bindBoy(node),positions=[];
   for(const direction of [1,-1])for(const strideUnits of [60,78]){
    const values=[];
    for(let phase=.08;phase<=.42;phase+=.04){
     const elapsed=(1+phase)*780,p=poseAt('walking',360+elapsed,1000,false,null,500,780,{direction,walkMs:6000,strideUnits});
     node.style.transform='translate3d('+(direction*elapsed/780*strideUnits*2)+'px,0,0)';paintBoy(parts,p,0,2);
     const point=new DOMPoint(0,0).matrixTransform(node.querySelector('.boy-foot-front').getScreenCTM());values.push(point.x);
    }
    positions.push(Math.max(...values)-Math.min(...values));
   }
   node.style.transform='none';return positions;
  });
  assert(drift.every(d=>d<1),'Planted foot must not slide with body travel: '+drift);
  const times=await page.evaluate(async()=>{const{BOY}=await import('/src/boyMotion.ts');return {tumble:BOY.tumble,down:BOY.down,getUp:BOY.getUp}});
  let index=0;
  const capture=async(recovery,duration,offset=0)=>{
   for(let t=0;t<=duration;t+=1000/30){
    await paint({recovery,t:t+offset});
    await stage.screenshot({path:out+'/recovery-frames/'+String(index++).padStart(3,'0')+'.png'});
   }
  };
  await capture('falling',500+times.tumble);
  await capture('down',times.down);
  await capture('getting-up',times.getUp);
  await capture(null,400);
  // Recovery silhouette contacts the floor rather than clipping below it.
  for(const [recovery,t] of [['falling',900],['down',200],['getting-up',250],['getting-up',650],['getting-up',1100],['getting-up',1600]]){
   await paint({recovery,t});
   const ground=await page.evaluate(()=>{
    const n=document.querySelector('.cartoon-home-avatar'),root=n.querySelector('svg'),inverse=root.getScreenCTM().inverse();
    let max=-Infinity;
    for(const node of n.querySelectorAll('.boy-arm-fill-L,.boy-arm-fill-R,.boy-leg-fill-L,.boy-leg-fill-R,.boy-hand-fill-L,.boy-hand-fill-R,.boy-shoe-sole-L,.boy-shoe-sole-R,.boy-body-shell,.boy-head-shell,.boy-cap-shell')){
     const box=node.getBBox(),m=inverse.multiply(node.getScreenCTM());
     for(const [x,y]of [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]])max=Math.max(max,new DOMPoint(x,y).matrixTransform(m).y);
    }
    return max;
   });
   assert(Math.abs(ground-199)<.1,recovery+' floor contact: '+ground);
   await stage.screenshot({path:out+'/'+recovery+'-'+t+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('PASS: both travel directions, shoe orientation, planted-foot world contact, staged fall/get-up floor contact. Preview frames: '+out);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
