import {useEffect,useRef} from 'react';
import orbFrames from './assistant-orb-frames.png';

const frameSize=224;
const center=frameSize/2;
const radius=88;
const tau=2*Math.PI;

function prepareTexture(image:HTMLImageElement){
 const sheet=document.createElement('canvas');
 sheet.width=image.naturalWidth;
 sheet.height=image.naturalHeight;
 const ctx=sheet.getContext('2d');
 if(!ctx)return null;
 ctx.drawImage(image,0,0);

 // Remove the white backing so the supplied frames work on every app theme.
 const pixels=ctx.getImageData(0,0,sheet.width,sheet.height);
 const rgba=pixels.data;
 for(let i=0;i<rgba.length;i+=4){
  const red=rgba[i],green=rgba[i+1],blue=rgba[i+2];
  const alpha=255-Math.min(red,green,blue);
  if(alpha===0||Math.max(red,green,blue)-Math.min(red,green,blue)<12){
   rgba[i+3]=0;
   continue;
  }
  const white=255-alpha;
  rgba[i]=(red-white)*255/alpha;
  rgba[i+1]=(green-white)*255/alpha;
  rgba[i+2]=(blue-white)*255/alpha;
  rgba[i+3]=alpha;
 }
 ctx.putImageData(pixels,0,0);
 const texture=document.createElement('canvas');
 texture.width=texture.height=frameSize;
 const face=texture.getContext('2d');
 if(!face)return null;

 // Replace the sheet's fixed bubble and center line with artwork from a clean area.
 const patch=document.createElement('canvas');
 patch.width=patch.height=frameSize;
 const patchContext=patch.getContext('2d');
 if(!patchContext)return null;
 patchContext.drawImage(sheet,888-center,376-center,frameSize,frameSize,0,0,frameSize,frameSize);
 const fade=patchContext.createLinearGradient(0,0,0,frameSize);
 fade.addColorStop(0,'black');
 fade.addColorStop((center-78)/frameSize,'black');
 fade.addColorStop((center-61)/frameSize,'transparent');
 fade.addColorStop((center-11)/frameSize,'transparent');
 fade.addColorStop((center-5)/frameSize,'black');
 fade.addColorStop((center+15)/frameSize,'black');
 fade.addColorStop((center+24)/frameSize,'transparent');
 patchContext.globalCompositeOperation='destination-in';
 patchContext.fillStyle=fade;
 patchContext.fillRect(0,0,frameSize,frameSize);

 face.beginPath();
 face.arc(center,center,radius,0,tau);
 face.clip();
 face.drawImage(sheet,130-center,122-center,frameSize,frameSize,0,0,frameSize,frameSize);
 face.globalCompositeOperation='destination-out';
 face.fillStyle=fade;
 face.fillRect(0,0,frameSize,frameSize);
 face.globalCompositeOperation='lighter';
 face.drawImage(patch,0,0);
 return texture;
}

function paintOrb(ctx:CanvasRenderingContext2D,texture:HTMLCanvasElement,elapsed:number){
 const phase=elapsed*tau/4000;
 const breath=(1-Math.cos(phase))/2;
 const orbit=elapsed*tau/8000-Math.PI/2;
 const scale=.97+.055*breath;

 ctx.clearRect(0,0,frameSize,frameSize);
 ctx.save();
 ctx.translate(center,center);
 ctx.scale(scale,scale);

 const halo=ctx.createRadialGradient(0,0,radius-4,0,0,radius+10);
 halo.addColorStop(0,'transparent');
 halo.addColorStop(.32,`rgba(60,222,255,${.2+.16*breath})`);
 halo.addColorStop(1,'rgba(60,222,255,0)');
 ctx.fillStyle=halo;
 ctx.fillRect(-radius-10,-radius-10,(radius+10)*2,(radius+10)*2);

 ctx.save();
 ctx.rotate(.045*Math.sin(phase));
 ctx.drawImage(texture,-center,-center);
 ctx.restore();

 ctx.save();
 ctx.beginPath();
 ctx.arc(0,0,radius-1,0,tau);
 ctx.clip();
 ctx.beginPath();
 for(let x=-radius;x<=radius;x+=2){
  const taper=Math.cos(x/radius*Math.PI/2);
  const y=4+Math.sin(x*.098-phase*2)*(7+6*breath)*taper;
  if(x===-radius)ctx.moveTo(x,y);
  else ctx.lineTo(x,y);
 }
 ctx.lineWidth=2;
 ctx.strokeStyle=`rgba(144,246,255,${.72+.18*breath})`;
 ctx.shadowColor='#46dfff';
 ctx.shadowBlur=7;
 ctx.stroke();
 ctx.restore();

 ctx.beginPath();
 ctx.arc(0,0,radius,0,tau);
 ctx.strokeStyle=`rgba(88,230,255,${.48+.27*breath})`;
 ctx.lineWidth=1.4;
 ctx.stroke();

 const orbitX=radius+1;
 const orbitY=radius*.96;
 ctx.beginPath();
 ctx.ellipse(0,0,orbitX,orbitY,0,orbit-.7,orbit);
 ctx.strokeStyle=`rgba(103,238,255,${.38+.22*breath})`;
 ctx.stroke();

 const x=orbitX*Math.cos(orbit);
 const y=orbitY*Math.sin(orbit);
 const bubbleRadius=10.4+2.8*breath;
 const glass=ctx.createRadialGradient(x-3,y-4,1,x,y,bubbleRadius);
 glass.addColorStop(0,'rgba(231,255,255,.65)');
 glass.addColorStop(.43,'rgba(67,213,244,.17)');
 glass.addColorStop(1,'rgba(51,230,255,.62)');
 ctx.beginPath();
 ctx.arc(x,y,bubbleRadius,0,tau);
 ctx.fillStyle=glass;
 ctx.fill();
 ctx.strokeStyle='#91f2ff';
 ctx.lineWidth=1.7;
 ctx.shadowColor='#4ae7ff';
 ctx.shadowBlur=4+4*breath;
 ctx.stroke();
 ctx.shadowBlur=0;
 ctx.beginPath();
 ctx.arc(x,y,bubbleRadius-2.5,3.85,5.35);
 ctx.strokeStyle='rgba(231,255,255,.85)';
 ctx.lineWidth=1.3;
 ctx.stroke();
 ctx.restore();
}

export default function AssistantOrb(){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const node=canvas.current;
  const ctx=node?.getContext('2d');
  if(!node||!ctx)return;

  const target=node;
  const context=ctx;
  const image=new Image();
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let texture:HTMLCanvasElement|null=null;
  let animation=0;
  let elapsed=0;
  let previousTime:number|undefined;

  function tick(now:number){
   if(previousTime!==undefined)elapsed+=now-previousTime;
   previousTime=now;
   if(texture)paintOrb(context,texture,elapsed);
   animation=window.requestAnimationFrame(tick);
  }

  function sync(){
   window.cancelAnimationFrame(animation);
   previousTime=undefined;
   if(!texture)return;
   paintOrb(context,texture,motion.matches?0:elapsed);
   if(!motion.matches&&!document.hidden){
    animation=window.requestAnimationFrame(tick);
   }
  }

  image.onload=()=>{
   texture=prepareTexture(image);
   if(texture)target.dataset.ready='true';
   sync();
  };
  image.src=orbFrames;
  motion.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  return ()=>{
   image.onload=null;
   window.cancelAnimationFrame(animation);
   motion.removeEventListener('change',sync);
   document.removeEventListener('visibilitychange',sync);
  };
 },[]);
 return <canvas ref={canvas} className="assistant-orb" width={frameSize} height={frameSize} aria-hidden="true"/>;
}
