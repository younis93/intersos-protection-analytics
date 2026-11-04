import {clearFrame,composite,createFrame,createFx,type Effect} from './vendor/pixelfx/core/index.js';
import * as poof from './vendor/pixelfx/fx/spawn/poof.js';
import * as hitSpark from './vendor/pixelfx/fx/impacts/hit-spark.js';
import {getGhostAtlas,ghostFacePose,GHOST_COLUMNS,GHOST_FRAME_COUNT,GHOST_FRAME_SIZE} from './halloweenGhostAtlas';
import {staffPose,mageLegPose,type HuntState,type Point} from './halloweenSimulation';

// Keep the body anchored; animate limbs and the staff rather than shaking the head.
function mage(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean){
  ctx.save();ctx.translate(s.mage.x,s.mage.y);
  ctx.scale(s.facing*2,2);
  const tint=s.mode==='manual'?Math.max(Math.max(0,1-s.hurtTime/.3)*.6,s.invulnerable>0?.1*Math.min(1,s.invulnerable):0):0;
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{
    if(tint){const rgb=parseInt(color.slice(1),16);ctx.fillStyle=`rgb(${Math.round((rgb>>16)*(1-tint)+255*tint)},${Math.round(((rgb>>8)&255)*(1-tint)+190*tint)},${Math.round((rgb&255)*(1-tint)+140*tint)})`}
    else ctx.fillStyle=color;
    ctx.fillRect(x,y,w,h);
  };
  // Rasterized segments stay crisp at both device pixel densities.
  const limb=(a:Point,b:Point,width:number,color:string)=>{
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2));
    for(let i=0;i<=n;i++)rect(Math.round(a.x+(b.x-a.x)*i/n-width/2),Math.round(a.y+(b.y-a.y)*i/n-width/2),width,width,color);
  };
  const phase=!reduced&&s.moving?s.walkPhase:0;
  rect(-12,22,24,2,'#110b20');
  for(const {root,knee,ankle} of mageLegPose(s,reduced)){
    limb(root,knee,4,'#35213f');limb(knee,ankle,3,'#614071');
    const x=Math.round(ankle.x),y=Math.round(ankle.y);
    rect(x-2,y-2,4,4,'#432c50');rect(x-1,y-2,3,3,'#9869b4');
    rect(x-2,y+1,6,2,'#714982');rect(x+2,y+1,2,1,'#b58ad0');
    rect(x-2,y+3,6,1,'#281d36');rect(x-2,y+1,1,2,'#50345f');
  }
  // A small shoulder-led free-arm swing, never detached from the robe.
  const swing=!reduced&&s.moving?Math.sin(phase)*1.5:0;
  const shoulder={x:-8,y:-6},elbow={x:-11+swing*.4,y:-1},wrist={x:-11+swing,y:4};
  limb(shoulder,elbow,5,'#382042');limb(elbow,wrist,4,'#7048a5');
  limb({x:shoulder.x-1,y:shoulder.y},elbow,2,'#9862b9');
  rect(Math.round(wrist.x)-2,2,4,2,'#bd92d3');
  rect(Math.round(wrist.x)-2,4,3,4,'#ed9b61');rect(Math.round(wrist.x)-2,4,1,3,'#ffcf94');
  rect(-8,-8,16,17,'#281737');rect(-6,-8,12,15,'#7048a5');
  rect(-1,-8,4,7,'#ffbf64');rect(-1,0,4,6,'#f48235');
  rect(-9,-23,18,14,'#a54020');rect(-11,-20,22,8,'#c45521');
  rect(-9,-22,18,11,'#f58b2b');rect(-5,-24,10,15,'#ffad3d');
  rect(-1,-27,3,4,'#6d9a51');rect(1,-28,4,2,'#9dc568');
  rect(-6,-19,4,3,'#3b1630');rect(4,-19,4,3,'#3b1630');
  rect(-5,-18,2,1,'#fff2ad');rect(5,-18,2,1,'#fff2ad');
  rect(-4,-13,10,2,'#542032');rect(-2,-11,6,1,'#542032');
  rect(-9,-21,2,6,'#ffe098');
  ctx.restore();
  const pose=staffPose(s);
  // Shoulder, elbow and hand follow the same pose that determines the muzzle.
  const segment=(a:Point,b:Point,width:number,color:string)=>{
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
    ctx.fillStyle=color;
    for(let i=0;i<=n;i++)ctx.fillRect(Math.round((a.x+(b.x-a.x)*i/n-width/2)/2)*2,Math.round((a.y+(b.y-a.y)*i/n-width/2)/2)*2,width,width);
  };
  segment(pose.shoulder,pose.elbow,8,'#382042');segment(pose.elbow,pose.hand,6,'#7048a5');
  segment({x:pose.shoulder.x,y:pose.shoulder.y-2},{x:pose.elbow.x,y:pose.elbow.y-2},4,'#9862b9');
  ctx.save();ctx.translate(pose.hand.x,pose.hand.y);ctx.rotate(pose.angle);
  ctx.fillStyle='#583544';ctx.fillRect(-17,-3,47,6);
  ctx.fillStyle='#b58155';ctx.fillRect(-16,-2,45,3);
  ctx.fillStyle='#efc083';ctx.fillRect(16,-4,5,8);
  ctx.fillStyle='#e8872f';ctx.beginPath();ctx.moveTo(23,0);ctx.lineTo(30,-7);ctx.lineTo(37,0);ctx.lineTo(30,7);ctx.closePath();ctx.fill();
  ctx.fillStyle='#fff2ae';ctx.fillRect(27,-3,6,6);ctx.restore();
  // Cuff and a compact grip in staff coordinates: fingers cross the shaft, thumb curls beneath.
  ctx.save();ctx.translate(pose.hand.x,pose.hand.y);ctx.rotate(pose.angle);
  ctx.fillStyle='#b589ce';ctx.fillRect(-4,1,7,3);
  ctx.fillStyle='#d98b59';ctx.fillRect(-3,-4,6,6);
  ctx.fillStyle='#ffcc91';ctx.fillRect(-3,-4,2,5);ctx.fillRect(0,-4,2,5);
  ctx.fillStyle='#ffb978';ctx.fillRect(2,0,3,3);
  ctx.fillStyle='#ffe0ad';ctx.fillRect(3,0,2,1);ctx.restore();
  if(!reduced&&(pose.charge>0||s.castTime<.17)){
    const strength=pose.charge||Math.max(0,1-s.castTime/.17);
    const radius=12+strength*20;
    const glow=ctx.createRadialGradient(pose.tip.x,pose.tip.y,0,pose.tip.x,pose.tip.y,radius);
    glow.addColorStop(0,'#fff4bbee');glow.addColorStop(.3,'#ffb94a99');glow.addColorStop(1,'#fb682000');
    ctx.fillStyle=glow;ctx.fillRect(pose.tip.x-radius,pose.tip.y-radius,radius*2,radius*2);
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+s.time*3,r=(1-strength)*19+8;
      ctx.fillStyle=i%2?'#ffb45b':'#ffecb0';ctx.fillRect(pose.tip.x+Math.cos(angle)*r-1,pose.tip.y+Math.sin(angle)*r-1,3,3);
    }
  }
}
export function createHalloweenRenderer(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const atlas=getGhostAtlas();
  const frame=createFrame(160,144),pixels=new ImageData(160,144),buffer=document.createElement('canvas');
  buffer.width=160;buffer.height=144;const bufferContext=buffer.getContext('2d');
  let effects:{point:Point;fx:Effect}[]=[];
  return {
    hit(point:Point){if(effects.length<8)effects.push({point:{...point},fx:createFx(poof,{x:80,y:100,seed:Math.floor(point.x+point.y),light:.45,palette:['#30132e','#67335d','#a34e74','#f59853','#ffd390','#fff1c7']})})},
    hurt(point:Point){if(effects.length>=12)effects.shift();effects.push({point:{x:point.x,y:point.y-20},fx:createFx(hitSpark,{x:80,y:103,seed:Math.floor(point.x+point.y),light:.45,aim:-.65,palette:['#351531','#673867','#a75c89','#ed996a','#ffc38a','#ffe6be','#fff1dc']})})},
    draw(s:HuntState,dt:number,reduced:boolean){
      const scale=Math.min(window.devicePixelRatio||1,2);
      const w=Math.round(s.width*scale),h=Math.round(s.height*scale);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;
      if(!reduced){
        for(let i=0;i<24;i++){
          const x=(i*173.7)%s.width,y=(i*97.3+Math.sin(s.time*.3+i)*10)%s.height;
          ctx.fillStyle=i%3?'#bd8cdf55':'#ffb45a77';ctx.fillRect(x,y,2,2);
        }
      }
      for(const g of s.ghosts){
        const phase=g.phase/(Math.PI*2)*GHOST_FRAME_COUNT;
        const index=Math.floor((reduced?phase:s.time*30+phase)%GHOST_FRAME_COUNT);
        ctx.save();ctx.globalAlpha=Math.min(1,(g.age??1)/.7);ctx.translate(g.x,g.y);
        const facing=g.facing??(s.mage.x<g.x?-1:1);
        ctx.scale(facing*1.65,1.65);
        // The anchored sheet's visual center is (64,71), independent of facing.
        ctx.drawImage(atlas,(index%GHOST_COLUMNS)*GHOST_FRAME_SIZE,Math.floor(index/GHOST_COLUMNS)*GHOST_FRAME_SIZE,GHOST_FRAME_SIZE,GHOST_FRAME_SIZE,-64,-71,GHOST_FRAME_SIZE,GHOST_FRAME_SIZE);
        const face=ghostFacePose(index),dx=s.mage.x-g.x,dy=s.mage.y-g.y;
        const look=Math.round(Math.max(-1,Math.min(1,dx/70)))*facing;
        const y=face.y-71+Math.round(Math.max(-1,Math.min(1,dy/100)));
        ctx.globalAlpha*=.95;
        for(const eye of [-4,3]){
          ctx.fillStyle=face.blink?'#232c52':'#10142a';ctx.fillRect(eye+look,y+(face.blink?2:0),2,face.blink?1:4);
          if(!face.blink){ctx.fillStyle='#3e4f86';ctx.fillRect(eye+look+(look<0?0:1),y,1,1)}
        }
        ctx.fillStyle='#232c52';ctx.fillRect(look-1,y+6,2,1);
        if(face.mouthOpen){ctx.fillStyle='#10142a';ctx.fillRect(look-1,y+7,2,1)}
        ctx.restore();
      }
      for(const shot of s.shots){
        const trail=Math.min(shot.age??.06,.06);
        if(!reduced){
          const glow=ctx.createRadialGradient(shot.x,shot.y,1,shot.x,shot.y,17);
          glow.addColorStop(0,'#ffca6c99');glow.addColorStop(1,'#ef642000');
          ctx.fillStyle=glow;ctx.fillRect(shot.x-17,shot.y-17,34,34);
        }
        ctx.lineCap='round';ctx.strokeStyle='#e6662799';ctx.lineWidth=9;ctx.beginPath();
        ctx.moveTo(shot.x-shot.vx*trail,shot.y-shot.vy*trail);ctx.lineTo(shot.x,shot.y);ctx.stroke();
        ctx.strokeStyle='#ffb84d';ctx.lineWidth=4;ctx.stroke();
        ctx.fillStyle='#ffe7a0';ctx.fillRect(shot.x-4,shot.y-4,8,8);ctx.fillStyle='#fff6d5';ctx.fillRect(shot.x-2,shot.y-2,4,4);
      }
      if(s.dead){
        ctx.save();ctx.globalAlpha=Math.max(0,1-s.deathTime/.65);
        if(!reduced){ctx.translate(s.mage.x,s.mage.y);ctx.rotate(Math.min(.7,s.deathTime)*s.facing);ctx.translate(-s.mage.x,-s.mage.y)}
        mage(ctx,s,reduced);ctx.restore();
        if(!reduced&&s.deathTime<.8)for(let i=0;i<12;i++){
          const angle=i*Math.PI/6,d=s.deathTime*95;
          ctx.globalAlpha=Math.max(0,1-s.deathTime/.8);ctx.fillStyle=i%2?'#ffba69':'#b58ad5';ctx.fillRect(s.mage.x+Math.cos(angle)*d,s.mage.y-20+Math.sin(angle)*d,4,4);
        }
        ctx.globalAlpha=1;
      }else{
        ctx.save();
        if(!reduced&&s.hurtTime<.18)ctx.translate(-s.facing*Math.sin(s.hurtTime/.18*Math.PI)*6,0);
        mage(ctx,s,reduced);ctx.restore();
      }
      if(!reduced&&bufferContext){
        effects=effects.filter(({point,fx})=>{
          fx.update(dt);clearFrame(frame);fx.draw(frame);composite(frame,pixels.data);bufferContext.putImageData(pixels,0,0);
          ctx.drawImage(buffer,point.x-80,point.y-83);return !fx.done();
        });
      }else effects=[];
    },
  };
}
