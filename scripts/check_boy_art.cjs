const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async()=>{
 const out=process.env.BOY_ART_OUTPUT || 'output/boy-redesign';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('export-recovery')?[]:{available:false,ready:false}}));
 await page.clock.install();await page.goto(process.env.APP_URL || 'http://127.0.0.1:5189/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Reveal the cartoon boy'}).click();
 await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.addStyleTag({content:'.welcome-footer{visibility:hidden}'});
 const svg=page.locator('.cartoon-boy');
 const geometry=await page.evaluate(async()=>{
  const {poseAt,ACTIVITIES,DURATIONS}=await import('/src/boyMotion.ts'),{RIG,rotatePoint}=await import('/src/boyRig.ts'),{bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
  const n=document.querySelector('.cartoon-home-avatar'),parts=bindBoy(n),faults=[];
  const screen=(node,p)=>new DOMPoint(...p).matrixTransform(node.getScreenCTM());
  const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<.01;
  for(const activity of [...ACTIVITIES,'greeting','thinking'])for(let t=0;t<=DURATIONS[activity];t+=120){
   const p=poseAt(activity,t,t);paintBoy(parts,p,0,n.offsetHeight/210);
   for(const side of ['L','R']){
    const left=side==='L',joint=RIG.pivots[left?'elbowL':'elbowR'],wrist=RIG.pivots[left?'wristL':'wristR'];
    const arm=n.querySelector('.boy-arm-fill-'+side),hand=n.querySelector('.boy-hand-'+(left?'left':'right'));
    for(const [x,y] of [[0,0],[2,0],[-2,0],[0,2],[0,-2]])if(!arm.isPointInFill(new DOMPoint(joint[0]+x,joint[1]+y)))faults.push(activity+': elbow gap '+side);
    if(!close(screen(arm,rotatePoint(wrist,joint,left?p.elbowL:p.elbowR)),screen(hand,[0,0])))faults.push(activity+': wrist detached '+side);
    const hip=RIG.pivots[left?'legL':'legR'],knee=RIG.pivots[left?'kneeL':'kneeR'],ankle=RIG.pivots[left?'footL':'footR'];
    const delta=(knee[1]-hip[1])*(p.thighScale-1),actualKnee=[knee[0],knee[1]+delta],actualAnkle=[ankle[0],ankle[1]+delta];
    const leg=n.querySelector('.boy-leg-fill-'+side),foot=n.querySelector('.boy-foot-'+(left?'front':'back'));
    const hipFill=n.querySelector('.boy-hips path'),hipScreen=screen(leg,hip),inHip=hipScreen.matrixTransform(hipFill.getScreenCTM().inverse());
    if(!hipFill.isPointInFill(inHip))faults.push(activity+': hip detached '+side);
    if(!leg.isPointInFill(new DOMPoint(...actualKnee)))faults.push(activity+': knee gap '+side);
    if(!close(screen(leg,rotatePoint(actualAnkle,actualKnee,left?p.kneeL:p.kneeR)),screen(foot,[0,0])))faults.push(activity+': ankle detached '+side);
    if(activity==='idle'||activity==='walking'){
     const step=left?p.stepL:p.stepR;
     if(step<.01){
      const sole=screen(foot,[0,RIG.soleDepth]),floor=screen(n.querySelector('svg'),[0,RIG.floor]);
      if(Math.abs(sole.y-floor.y)>1)faults.push(activity+': support sole off floor '+side);
     }
    }
   }
  }
  // An extreme planted bend cannot reach the floor at standing hip height. Keep the
  // leg attached instead of translating its root beyond the trouser overlap.
  const {standingPose}=await import('/src/boyMotion.ts');
  const extreme=standingPose();extreme.kneeL=75;extreme.kneeR=-75;
  paintBoy(parts,extreme,0,n.offsetHeight/210);
  for(const side of ['L','R']){
   const leg=n.querySelector('.boy-leg-fill-'+side),hipFill=n.querySelector('.boy-hips path');
   const hip=screen(leg,RIG.pivots[side==='L'?'legL':'legR']).matrixTransform(hipFill.getScreenCTM().inverse());
   if(!hipFill.isPointInFill(hip))faults.push('extreme bend: hip detached '+side);
  }
  return [...new Set(faults)];
 });
 assert.deepEqual(geometry,[],'Joint silhouettes, wrists, ankles, and support soles must stay connected');
 await page.evaluate(()=>{
  const b=document.querySelector('.cartoon-home-avatar');b.style.width='380px';b.style.height='470px';b.style.left='20px';b.style.bottom='20px';b.style.transform='none';
  const s=b.querySelector('svg');s.setAttribute('viewBox','-15 -20 190 235');s.style.background='#f5f7fa';
 });
 for(const [activity,t] of [['idle',1800],['greeting',1100],['walking',300],['thinking',1600],['reading',1800],['sitting',1800],['playing',1500],['stretching',1200],['celebrating',780],['carried',300],['down',300]]){
  await page.evaluate(async({activity,t})=>{
   const {poseAt}=await import('/src/boyMotion.ts'),{bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
   const n=document.querySelector('.cartoon-home-avatar'),p=poseAt(activity==='carried'||activity==='down'?'idle':activity,t,1800,activity==='carried',activity==='down'?'down':null);
   paintBoy(bindBoy(n),p,0,n.offsetHeight/220);
  },{activity,t});
  await svg.screenshot({path:out+'/'+activity+'.png'});
 }
 for(const [label,bend] of [['straight',0],['partial',55],['folded',125]]){
  await page.evaluate(async bend=>{
   const {standingPose}=await import('/src/boyMotion.ts'),{bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
   const n=document.querySelector('.cartoon-home-avatar'),p=standingPose();
   p.armR=-65;p.elbowR=-bend;p.elbowL=bend;p.openR=1;p.wristR=20;p.wristL=-15;
   p.plant=bend===0?1:0;
   p.kneeL=Math.min(75,bend*.6);p.legR=-15;p.kneeR=-Math.min(75,bend*.6);
   paintBoy(bindBoy(n),p,0,n.offsetHeight/220);
  },bend);
  await svg.screenshot({path:out+'/joint-'+label+'.png'});
 }
 fs.mkdirSync(out+'/greeting-frames',{recursive:true});
 for(let frame=0;frame<=144;frame+=2){
  await page.evaluate(async t=>{
   const {poseAt}=await import('/src/boyMotion.ts'),{bindBoy,paintBoy}=await import('/src/boyRenderer.ts');
   const n=document.querySelector('.cartoon-home-avatar');paintBoy(bindBoy(n),poseAt('greeting',t,t),0,n.offsetHeight/235);
  },frame/60*1000);
  await svg.screenshot({path:out+'/greeting-frames/'+String(frame).padStart(3,'0')+'.png'});
 }
 assert.deepEqual(errors,[]);console.log('PASS: hip/elbow/knee coverage, wrist/ankle attachment, support-foot contact, extreme bend hip overlap across all activities. Art study: '+out);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
