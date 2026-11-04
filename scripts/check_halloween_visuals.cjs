const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/halloween-visuals'),bundle=path.join(output,'bundle');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'frontend')]})).href);
 const entry=Object.fromEntries(['halloweenGhostAtlas','halloweenRenderer','halloweenGraveyard','halloweenBurnRenderer','halloweenSimulation'].map(name=>[name,path.join(root,'frontend/src',name+'.ts')]));
 await build({root:path.join(root,'frontend'),configFile:false,logLevel:'error',build:{outDir:bundle,emptyOutDir:false,copyPublicDir:false,lib:{entry,formats:['es'],fileName:(_,name)=>name+'.js'}}});
 const server=http.createServer((request,response)=>{
  const relative=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/+/,''),target=path.resolve(bundle,relative);
  if(target.startsWith(bundle+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile()){response.setHeader('Content-Type','application/javascript');response.end(fs.readFileSync(target))}
  else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><style>body{margin:0;background:#100c1b}canvas{display:block}</style><canvas id="canvas"></canvas>')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1536,height:900}});await page.goto(`http://127.0.0.1:${server.address().port}`);
  const atlas=await page.evaluate(async()=>{
   const {getGhostAtlas}=await import('/halloweenGhostAtlas.js'),a=getGhostAtlas(),c=document.querySelector('canvas');
   c.width=1536;c.height=256;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
   const native=a.getContext('2d');let maxOffset=0,maxHorizontalOffset=0,blue=0;const hashes=[];
   for(let i=0;i<72;i++){
    const data=native.getImageData(i%8*128,Math.floor(i/8)*128,128,128).data;let x=0,y=0,count=0,sum=0,crownX=0,crownCount=0;
    for(let p=0;p<data.length;p+=4){sum=(Math.imul(sum,31)+data[p]+data[p+3])|0;if(data[p+3]>200){x+=(p/4)%128;y+=Math.floor(p/4/128);count++;if(Math.floor(p/4/128)<65){crownX+=(p/4)%128;crownCount++}if(data[p+2]>data[p]+12)blue++}}
    if(count){maxOffset=Math.max(maxOffset,Math.hypot(x/count-64,y/count-71));maxHorizontalOffset=Math.max(maxHorizontalOffset,Math.abs(crownX/crownCount-64))}hashes.push(sum);
   }
   for(let i=0;i<6;i++){const n=i*12;ctx.drawImage(a,n%8*128,Math.floor(n/8)*128,128,128,i*256,0,256,256)}
   return {cached:a===getGhostAtlas(),maxOffset,maxHorizontalOffset,blue,uniqueFrames:new Set(hashes).size};
  });
  console.log('atlas alignment',atlas);
  assert(atlas.cached);assert(atlas.maxHorizontalOffset<1.5,'Body retains whole-frame horizontal drift');assert(atlas.maxOffset*1.65<26,'Ghost appearance lies outside contact radius');assert(atlas.blue>1000);assert(atlas.uniqueFrames>60);
  await page.locator('canvas').screenshot({path:path.join(output,'ghost-animation.png')});console.log('ghost atlas',atlas);
  await page.evaluate(async()=>{
   const {createHalloweenRenderer}=await import('/halloweenRenderer.js'),{createHunt,controlHunt}=await import('/halloweenSimulation.js');
   const canvas=document.querySelector('canvas');window.renderer=createHalloweenRenderer(canvas);window.hunt=createHunt(1440,900);controlHunt(window.hunt,'manual');
   window.hunt.mage={x:180,y:160};window.hunt.invulnerable=0;window.hunt.hurtTime=100;window.renderer.draw(window.hunt,0,false);
  });
  await page.screenshot({path:path.join(output,'character-clean.png'),clip:{x:95,y:80,width:210,height:155}});
  // Review left/right gait, idle and vertical casting poses at native and high density.
  for(const density of [1,2]){
   const poses=await browser.newPage({viewport:{width:1200,height:720},deviceScaleFactor:density});
   await poses.goto(`http://127.0.0.1:${server.address().port}`);
   await poses.evaluate(async()=>{
    const {createHalloweenRenderer}=await import('/halloweenRenderer.js'),{createHunt}=await import('/halloweenSimulation.js');
    const source=document.querySelector('canvas'),renderer=createHalloweenRenderer(source),sheet=document.createElement('canvas');
    sheet.width=1200;sheet.height=720;const ctx=sheet.getContext('2d');ctx.imageSmoothingEnabled=false;
    for(let row=0;row<4;row++)for(let col=0;col<6;col++){
     const s=createHunt(320,240);s.mage={x:150,y:140};s.facing=col<3?1:-1;s.staffAngle=[-.4,-Math.PI/2,Math.PI/2,-Math.PI+.4,-Math.PI/2,Math.PI/2][col];
     s.moving=row>0;s.walkPhase=(row-1)*Math.PI/2;s.castTime=row===3?.05:10;
     renderer.draw(s,0,false);const d=source.width/320;
     ctx.drawImage(source,70*d,65*d,160*d,135*d,col*200,row*180,200,169);
     ctx.fillStyle='#b6a4c5';ctx.font='12px monospace';ctx.fillText(`${s.facing>0?'right':'left'} / ${row===0?'idle':row===3?'cast':'walk'}`,col*200+12,row*180+175);
    }
    source.style.display='none';sheet.id='poses';document.body.append(sheet);
   });
   await poses.locator('#poses').screenshot({path:path.join(output,`mage-poses-${density}x.png`)});await poses.close();
  }
  await page.evaluate(()=>{window.hunt.hurtTime=0;window.hunt.invulnerable=1.25;window.renderer.hurt(window.hunt.mage);window.renderer.draw(window.hunt,.016,false)});
  await page.screenshot({path:path.join(output,'character-impact.png'),clip:{x:95,y:80,width:210,height:155}});
  await page.evaluate(async()=>{
   const {drawGraveyardBat}=await import('/halloweenGraveyard.js');const c=document.querySelector('canvas');
   c.width=720;c.height=210;const ctx=c.getContext('2d');ctx.fillStyle='#777a91';ctx.fillRect(0,0,720,210);
   for(let i=0;i<5;i++){
    ctx.save();ctx.translate(72+i*144,105);ctx.scale(4,4);drawGraveyardBat(ctx,[-1,-.5,0,.5,1][i]);ctx.restore();
   }
  });
  await page.locator('canvas').screenshot({path:path.join(output,'bat-flight-poses.png')});
  await page.evaluate(async()=>{const{createGraveyardScene}=await import('/halloweenGraveyard.js');window.scene=createGraveyardScene(document.querySelector('canvas'));window.scene.draw(1440,900,8,false)});
  await page.locator('canvas').screenshot({path:path.join(output,'graveyard.png')});
  assert(await page.evaluate(()=>{const c=document.querySelector('canvas');window.scene.draw(1440,900,0,true);const first=c.toDataURL();window.scene.draw(1440,900,90,true);return c.toDataURL()===first}),'Reduced-motion scenery moved');
  const coverage=await page.evaluate(async()=>{
   const{createBurnRenderer}=await import('/halloweenBurnRenderer.js');const c=document.querySelector('canvas');window.burn=createBurnRenderer(c);
   const result=[];for(const time of [0,.4,.9,1.4,2]){window.burn.draw(time);const d=c.getContext('2d').getImageData(0,0,320,180).data;let opaque=0,nonempty=0;for(let i=3;i<d.length;i+=4){if(d[i]>250)opaque++;if(d[i]>0)nonempty++}result.push({time,opaque:opaque/(320*180),nonempty:nonempty/(320*180)})}return result;
  });
  assert(coverage[2].opaque>.97,'Theme switch is not fully covered');assert(coverage.at(-1).nonempty<.01,'Burn leaves residual pixels');
  console.log('burn coverage',coverage);console.log('PASS: cached 72-frame PixelFX ghost, collision alignment, character impact, static reduced-motion scenery, full-cover burn and clean ending.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
