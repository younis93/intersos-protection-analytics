const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/halloween-audio');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[path.join(root,'frontend')]})).href);
 await build({root:path.join(root,'frontend'),configFile:false,logLevel:'error',build:{outDir:path.join(output,'bundle'),emptyOutDir:false,copyPublicDir:false,lib:{entry:path.join(root,'frontend/src/halloweenAudio.ts'),formats:['es'],fileName:()=> 'audio.js'},minify:false}});
 const server=http.createServer((request,response)=>{
  if(request.url==='/audio.js'){response.setHeader('Content-Type','application/javascript');response.end(fs.readFileSync(path.join(output,'bundle/audio.js')))}
  else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><button id="unlock">Enable audio</button>')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const rendered=await page.evaluate(async()=>{
   const {HalloweenSoundStage,HALLOWEEN_WALTZ,DEFAULT_HALLOWEEN_MIX}=await import('/audio.js');
   const render=async(type)=>{
    const sampleRate=24000,duration=type==='music'?HALLOWEEN_WALTZ.length*3*60/112+1.2:type==='burn'?2.25:8;
    const context=new OfflineAudioContext(2,Math.ceil(sampleRate*duration),sampleRate),stage=new HalloweenSoundStage(context);
    stage.setMix(DEFAULT_HALLOWEEN_MIX);
    if(type==='music')for(let i=0;i<HALLOWEEN_WALTZ.length;i++)stage.scheduleBar(i,.08+i*3*60/112);
    else if(type==='burn'){stage.sound('burn',.05);stage.sound('burn-open',1.25)}
    else ['cast','shot','ghost','hit','death','hurt','defeat','burn'].forEach((kind,i)=>{stage.sound(kind,.1+i*.8,i%2?.35:-.35,i);if(kind==='burn')stage.sound('burn-open',1.3+i*.8)});
    const buffer=await context.startRendering(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    let peak=0,sum=0;for(let i=0;i<left.length;i++){peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));sum+=(left[i]**2+right[i]**2)/2}
    const wav=new ArrayBuffer(44+left.length*4),view=new DataView(wav);
    const text=(offset,s)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i))};
    text(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,wav.byteLength-44,true);
    for(let i=0;i<left.length;i++){view.setInt16(44+i*4,Math.max(-1,Math.min(1,left[i]))*32767,true);view.setInt16(46+i*4,Math.max(-1,Math.min(1,right[i]))*32767,true)}
    const bytes=new Uint8Array(wav);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {base64:btoa(binary),peak,rms:Math.sqrt(sum/left.length),duration,voicesAfterRendering:stage.activeVoices};
   };
   const stressContext=new OfflineAudioContext(2,24000*4,24000),stressStage=new HalloweenSoundStage(stressContext);
   stressStage.setMix({muted:false,music:1,effects:1});stressStage.scheduleBar(0,.08);
   for(let i=0;i<40;i++)for(const kind of ['shot','hit','death'])stressStage.sound(kind,.15+i*.02,.3,i);
   const stressed=await stressContext.startRendering();let stressPeak=0;
   for(let channel=0;channel<2;channel++)for(const sample of stressed.getChannelData(channel))stressPeak=Math.max(stressPeak,Math.abs(sample));
   const mutedContext=new OfflineAudioContext(2,24000*2,24000),mutedStage=new HalloweenSoundStage(mutedContext);
   mutedStage.setMix({muted:true,music:1,effects:1});mutedStage.scheduleBar(0,.15);mutedStage.sound('shot',.2);
   const muted=await mutedContext.startRendering();let mutedPeak=0;
   for(const sample of muted.getChannelData(0))mutedPeak=Math.max(mutedPeak,Math.abs(sample));
   return {music:await render('music'),effects:await render('effects'),burn:await render('burn'),stressPeak,mutedPeak};
  });
  assert(rendered.stressPeak<.95,'Overlapping effects clip at maximum volume');assert(rendered.mutedPeak<.00001,'Muted output remains audible');
  console.log('maximum-volume stress peak',rendered.stressPeak,'muted peak',rendered.mutedPeak);
  for(const name of ['music','effects','burn']){const result=rendered[name];
   assert(result.peak<.95,`${name} clips`);assert(result.rms>.002,`${name} is inaudible`);assert.equal(result.voicesAfterRendering,0);
   fs.writeFileSync(path.join(output,`${name}-preview.wav`),Buffer.from(result.base64,'base64'));
   const {base64,...metrics}=result;console.log(name,metrics);
  }
  await page.evaluate(async()=>{
   const {createHalloweenAudio}=await import('/audio.js');window.audioStates=[];
   window.huntAudio=createHalloweenAudio(state=>window.audioStates.push(state));
   document.querySelector('button').onclick=()=>window.huntAudio.unlock();
  });
  await page.click('#unlock');await page.waitForFunction(()=>window.audioStates.includes('running'));
  await page.evaluate(()=>window.huntAudio.setPaused(true));await page.waitForFunction(()=>window.audioStates.at(-1)==='paused');
  await page.evaluate(()=>window.huntAudio.setPaused(false));await page.waitForFunction(()=>window.audioStates.at(-1)==='running');
  await page.evaluate(()=>window.huntAudio.dispose());await page.waitForTimeout(150);
  console.log('PASS: offline music/SFX render without clipping, all scheduled voices end, live unlock/pause/resume/disposal.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
