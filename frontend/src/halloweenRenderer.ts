import {CRITTER_COLUMNS,CRITTER_TILE,getCritterAtlas} from './halloweenCritterAtlas';
import {ABILITY_ICONS,abilityPixels} from './halloweenAbilityIcons';
import hexWraithUrl from './halloween-hex-wraith.png';
import hexKingUrl from './halloween-hex-king.png';
import tyrantUrl from './halloween-winged-tyrant.png';
import phantomUrl from './halloween-crowned-phantom.png';
import mageUrl from './halloween-pumpkin-mage.png';
import mageLiveUrl from './halloween-pumpkin-mage-live.png';
import gravekeeperUrl from './halloween-gravekeeper.png';
import {clearFrame,composite,createFrame,createFx,type Effect} from './vendor/pixelfx/core/index.js';
import * as poof from './vendor/pixelfx/fx/spawn/poof.js';
import * as hitSpark from './vendor/pixelfx/fx/impacts/hit-spark.js';
import {getGhostAtlas,ghostFacePose,GHOST_COLUMNS,GHOST_FRAME_COUNT,GHOST_FRAME_SIZE} from './halloweenGhostAtlas';
import {staffPose,mageLegPose,ghostBehavior,gravekeeperAttackOrigin,hexSwarmOrbit,phantomBarrageOrigin,phantomBoltSpread,escapePoint,BOSSES,GRAVEKEEPER_SCALE,HEX_CLAW_HALF_ANGLE,HEX_SWARM_COUNT,TYRANT_FIRE_HALF_ANGLE,PHANTOM_TONGUE_HALF_ANGLE,type BossCue,type HuntState,type Point,type Shot} from './halloweenSimulation';
import {DODGE_TRAIL_TIME,MAGE_CAST_WINDUP,MAGE_CAST_RECOVERY,MAGE_DEFEAT_TIMING} from './halloweenSimulation';

function pixelHalo(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,color:string){
  const step=4;
  const cx=Math.round(x/step)*step,cy=Math.round(y/step)*step;
  const extent=Math.floor(radius/step)*step;
  for(let dy=-extent;dy<=extent;dy+=step){
    for(let dx=-extent;dx<=extent;dx+=step){
      const distance=(Math.abs(dx)+Math.abs(dy))/radius;
      if(distance>1||(distance>.55&&(dx+dy)%(step*2)!==0))continue;
      ctx.fillStyle=color+(distance<.25?'70':distance<.55?'38':'19');
      ctx.fillRect(cx+dx-2,cy+dy-2,step,step);
    }
  }
}

function pixelTrail(ctx:CanvasRenderingContext2D,x:number,y:number,dx:number,dy:number,outer:string,inner:string){
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/4));
  for(let i=steps;i>=1;i--){
    const progress=i/steps;
    const px=Math.round((x-dx*progress)/2)*2,py=Math.round((y-dy*progress)/2)*2;
    const size=progress<.5?6:progress<.8?4:2;
    ctx.fillStyle=outer;ctx.fillRect(px-size/2,py-size/2,size,size);
    ctx.fillStyle=inner;ctx.fillRect(px-1,py-1,2,2);
  }
}

// Keep the body anchored; animate limbs and the staff rather than shaking the head.
function drawFallbackMageBody(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean){
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
}

function drawStaffShaft(ctx:CanvasRenderingContext2D,hand:Point,angle:number,lit=true){
  ctx.save();ctx.translate(hand.x,hand.y);ctx.rotate(angle);
  ctx.fillStyle='#583544';ctx.fillRect(-17,-3,47,6);
  ctx.fillStyle='#b58155';ctx.fillRect(-16,-2,45,3);
  ctx.fillStyle='#efc083';ctx.fillRect(16,-4,5,8);
  ctx.fillStyle=lit?'#e8872f':'#66425c';
  ctx.fillRect(23,-2,14,4);ctx.fillRect(25,-4,10,8);ctx.fillRect(27,-6,6,12);
  ctx.fillStyle=lit?'#fff2ae':'#9b6671';ctx.fillRect(27,-3,6,6);ctx.restore();
}

function drawMageStaff(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean){
  const pose=staffPose(s);
  // Shoulder, elbow and hand follow the same pose that determines the muzzle.
  const segment=(a:Point,b:Point,width:number,color:string)=>{
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
    ctx.fillStyle=color;
    for(let i=0;i<=n;i++)ctx.fillRect(Math.round((a.x+(b.x-a.x)*i/n-width/2)/2)*2,Math.round((a.y+(b.y-a.y)*i/n-width/2)/2)*2,width,width);
  };
  segment(pose.shoulder,pose.elbow,8,'#382042');segment(pose.elbow,pose.hand,6,'#7048a5');
  segment({x:pose.shoulder.x,y:pose.shoulder.y-2},{x:pose.elbow.x,y:pose.elbow.y-2},4,'#9862b9');
  drawStaffShaft(ctx,pose.hand,pose.angle);
  // Cuff and a compact grip in staff coordinates: fingers cross the shaft, thumb curls beneath.
  ctx.save();ctx.translate(pose.hand.x,pose.hand.y);ctx.rotate(pose.angle);
  ctx.fillStyle='#b589ce';ctx.fillRect(-4,1,7,3);
  ctx.fillStyle='#d98b59';ctx.fillRect(-3,-4,6,6);
  ctx.fillStyle='#ffcc91';ctx.fillRect(-3,-4,2,5);ctx.fillRect(0,-4,2,5);
  ctx.fillStyle='#ffb978';ctx.fillRect(2,0,3,3);
  ctx.fillStyle='#ffe0ad';ctx.fillRect(3,0,2,1);ctx.restore();
  if(!reduced&&(pose.charge>0||s.castTime<MAGE_CAST_RECOVERY)){
    const strength=pose.charge||Math.max(0,1-s.castTime/MAGE_CAST_RECOVERY);
    const radius=12+strength*20;
    pixelHalo(ctx,pose.tip.x,pose.tip.y,radius,'#ffad46');
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3+s.time*3,r=(1-strength)*19+8;
      ctx.fillStyle=i%2?'#ffb45b':'#ffecb0';ctx.fillRect(pose.tip.x+Math.cos(angle)*r-1,pose.tip.y+Math.sin(angle)*r-1,3,3);
    }
  }
  if(pose.charge>.56){
    drawPumpkinHead(ctx,pose.tip.x,pose.tip.y,pose.charge>.86?2:1);
  }
}

const MAGE_CELL=144;
function drawMageCell(ctx:CanvasRenderingContext2D,sheet:HTMLImageElement,row:number,column:number,s:Pick<HuntState,'mage'|'facing'>,lift=0){
  ctx.save();ctx.translate(Math.round(s.mage.x),Math.round(s.mage.y)-lift);
  ctx.scale(s.facing,1);
  ctx.drawImage(sheet,column*MAGE_CELL,row*MAGE_CELL,MAGE_CELL,MAGE_CELL,-72,-72,MAGE_CELL,MAGE_CELL);
  ctx.restore();
}

function drawMageDodge(ctx:CanvasRenderingContext2D,trail:NonNullable<HuntState['dodgeTrail']>,facing:HuntState['facing'],reduced:boolean,sheet:HTMLImageElement){
  const {start,end,remaining}=trail;
  const opacity=remaining/DODGE_TRAIL_TIME;
  ctx.save();
  if(!reduced){
    const dx=end.x-start.x,dy=end.y-start.y;
    for(const [index,position] of [0,.35,.7].entries()){
      const mage={x:start.x+dx*position,y:start.y+dy*position};
      ctx.globalAlpha=opacity*(.22+index*.09);
      if(sheet.naturalWidth)drawMageCell(ctx,sheet,1,1+index*2,{mage,facing});
    }
    const angle=Math.atan2(dy,dx);
    const drift=(1-opacity)*18;
    ctx.globalAlpha=opacity*.85;
    for(let i=0;i<12;i++){
      const position=(i+1)/13;
      const spread=(i%2===0?-1:1)*(7+i%4*5+drift);
      const x=start.x+dx*position-Math.cos(angle)*drift-Math.sin(angle)*spread;
      const y=start.y+dy*position-Math.sin(angle)*drift+Math.cos(angle)*spread-10;
      ctx.fillStyle=i%3===0?'#ffe5a8':i%3===1?'#ff9e4e':'#c374ce';
      const size=i%3===0?4:3;
      ctx.fillRect(Math.round(x),Math.round(y),size,size);
    }
  }
  const glow=ctx.createRadialGradient(end.x,end.y-8,5,end.x,end.y-8,42);
  glow.addColorStop(0,'#ffb65a');
  glow.addColorStop(1,'#ff9e4e00');
  ctx.globalAlpha=opacity*.42;
  ctx.fillStyle=glow;
  ctx.fillRect(end.x-42,end.y-50,84,84);
  ctx.restore();
}

function drawMage(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean,sheet:HTMLImageElement){
  if(!sheet.naturalWidth)drawFallbackMageBody(ctx,s,reduced);
  else if(s.hurtTime<.24){
    drawMageCell(ctx,sheet,3,reduced?1:Math.min(2,Math.floor(s.hurtTime/.08)),s);
  }else if(s.moving){
    const stride=Math.floor(s.walkPhase*8*.6/(Math.PI*2));
    drawMageCell(ctx,sheet,1,reduced?0:stride%8,s);
  }else if(s.castRemaining>0||s.castTime<MAGE_CAST_RECOVERY){
    const frame=s.castRemaining>0?Math.min(2,Math.floor(3*(1-s.castRemaining/MAGE_CAST_WINDUP))):
      3+Math.min(2,Math.floor(s.castTime*3/MAGE_CAST_RECOVERY));
    drawMageCell(ctx,sheet,2,reduced?3:Math.max(0,frame),s);
  }else{
    drawMageCell(ctx,sheet,0,reduced?0:Math.floor(s.time*5)%6,s);
  }
  drawMageStaff(ctx,s,reduced);
}

function drawMageDefeat(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean,sheet:HTMLImageElement){
  if(!sheet.naturalWidth){
    ctx.save();ctx.globalAlpha=Math.max(0,1-s.deathTime/.65);
    drawFallbackMageBody(ctx,s,reduced);drawMageStaff(ctx,s,reduced);ctx.restore();
    drawDefeatShadow(ctx,s,reduced);
    return;
  }
  ctx.fillStyle=`rgba(10,3,16,${Math.min(.48,s.deathTime*.65)})`;
  ctx.fillRect(0,0,s.width,s.height);
  const time=s.deathTime;
  const {staffFalls,dissolve,specter}=MAGE_DEFEAT_TIMING;
  if(time<1.1){
    const pose=staffPose(s);
    const progress=reduced?1:Math.min(1,time/staffFalls);
    const floor={x:s.mage.x+35*s.facing,y:s.mage.y+42};
    const hand={x:pose.hand.x+(floor.x-pose.hand.x)*progress,y:pose.hand.y+(floor.y-pose.hand.y)*progress*progress};
    const rest=s.facing===1?0:Math.PI;
    const turn=Math.atan2(Math.sin(rest-pose.angle),Math.cos(rest-pose.angle));
    ctx.save();ctx.globalAlpha=Math.min(1,(1.1-time)/.3);
    drawStaffShaft(ctx,hand,pose.angle+turn*progress,time<.38);ctx.restore();
  }
  if(time<dissolve){
    drawMageCell(ctx,sheet,3,reduced?5:Math.min(5,Math.floor(time*6/dissolve)),s);
  }else if(time<specter){
    drawMageCell(ctx,sheet,4,reduced?2:Math.min(5,Math.floor((time-dissolve)*6/(specter-dissolve))),s);
  }else{
    const age=time-specter;
    const lift=reduced?14:Math.round(14*Math.min(1,age*3)+Math.sin(age*4)*3);
    drawMageCell(ctx,sheet,5,reduced?0:Math.floor(age*7)%6,s,lift);
  }
}

const PUMPKIN_HEAD=[
  '.....ss......',
  '....ssooo....',
  '..ooohhhoo...',
  '.oohhhhhhoo..',
  'oohdhhhhdhho.',
  'ohddhhhddhho.',
  'ohhhhhhhhhhho',
  'ohdhhhhhdhhho',
  '.ohdddddhhho.',
  '..ooohhhooo..',
  '....ooooo....',
] as const;
const PUMPKIN_COLORS:Record<string,string>={o:'#ff9a36',h:'#ffd563',s:'#fff0a6',d:'#76232e'};

function drawPumpkinHead(ctx:CanvasRenderingContext2D,x:number,y:number,pixel:number){
  const left=Math.round(x/pixel)*pixel-6*pixel,top=Math.round(y/pixel)*pixel-5*pixel;
  PUMPKIN_HEAD.forEach((row,py)=>{
    for(let px=0;px<row.length;px++){
      const color=PUMPKIN_COLORS[row[px]];
      if(!color)continue;
      ctx.fillStyle=color;
      ctx.fillRect(left+px*pixel,top+py*pixel,pixel,pixel);
    }
  });
}

function drawPumpkinShot(ctx:CanvasRenderingContext2D,shot:Shot,reduced:boolean){
  const age=shot.age??0;
  const phase=reduced?0:Math.floor(age*13)%4;
  const speed=Math.hypot(shot.vx,shot.vy)||1;
  const ux=shot.vx/speed,uy=shot.vy/speed;
  const length=reduced?14:Math.min(19,10+Math.floor(age*43))+(phase%2);
  const stamp=(distance:number,side:number)=>{
    const x=Math.round((shot.x-ux*distance-uy*side)/2)*2;
    const y=Math.round((shot.y-uy*distance+ux*side)/2)*2;
    ctx.fillRect(x-1,y-1,2,2);
  };
  for(let i=length;i>=2;i--){
    const taper=1-i/(length+1);
    const width=Math.max(1,Math.round(taper*5));
    const wave=reduced?0:Math.round(Math.sin(i*.61-phase*Math.PI/2)*(1-taper)*2);
    for(let side=-width;side<=width;side++){
      const edge=Math.abs(side)/width;
      ctx.fillStyle=edge>.69?'#e65a29':edge>.35?'#ff9d3b':i<length*.64?'#fff0a6':'#ffc254';
      stamp(i*2,(side+wave)*2);
    }
  }
  if(!reduced){
    ctx.fillStyle='#ffb952';
    stamp((length+2+phase)*2,-7+phase*2);
    stamp((length-2+phase)*2,8-phase*2);
  }
  drawPumpkinHead(ctx,shot.x,shot.y,2);
}
function drawAtmosphere(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean){
  const time=reduced?0:s.time;
  const manual=s.mode==='manual';
  const lowHealth=manual&&s.health===1&&!s.dead;
  const x=s.mage.x,y=s.mage.y-32;
  const tremble=lowHealth&&!reduced?5*Math.sin(time*8)+3*Math.sin(time*13):0;
  const radius=Math.min(255,Math.max(115,s.width*.24))+tremble;
  const light=ctx.createRadialGradient(x,y,12,x,y,radius);
  const lantern=s.dead?Math.max(0,1-s.deathTime/.6):1;
  light.addColorStop(0,`rgba(255,181,89,${.24*lantern})`);
  light.addColorStop(.34,`rgba(255,155,66,${.09*lantern})`);
  light.addColorStop(.68,'rgba(15,9,27,.08)');
  light.addColorStop(1,manual?'rgba(8,4,17,.50)':'rgba(8,4,17,.12)');
  ctx.fillStyle=light;
  ctx.fillRect(0,0,s.width,s.height);

  // Draw fog beneath the actors so ghosts and projectiles stay readable.
  ctx.save();
  ctx.globalAlpha=manual?1:.65;
  for(let i=0;i<4;i++){
    const fogX=s.width*(.14+i*.24)+Math.sin(time*.17+i*2)*s.width*.13;
    const fogY=s.height*(.62+i*.095)+Math.cos(time*.21+i)*14;
    ctx.save();
    ctx.translate(fogX,fogY);
    ctx.scale(s.width*.46,Math.max(32,s.height*.12));
    const fog=ctx.createRadialGradient(0,0,0,0,0,1);
    fog.addColorStop(0,'rgba(179,173,207,.15)');
    fog.addColorStop(.48,'rgba(133,124,165,.08)');
    fog.addColorStop(1,'rgba(133,124,165,0)');
    ctx.fillStyle=fog;
    ctx.fillRect(-1,-1,2,2);
    ctx.restore();
  }
  ctx.restore();

  // Brief glimpses of eyes and a distant figure behind the combat sprites.
  for(let i=0;i<3;i++){
    const x=s.width*(.18+i*.31),y=s.height*(.77+i*.045);
    const cycle=(time+i*4)%13;
    if(!reduced&&(cycle>3||Math.hypot(x-s.mage.x,y-s.mage.y)<130))continue;
    ctx.fillStyle='#d3817599';
    ctx.fillRect(x-4,y,3,2);ctx.fillRect(x+3,y,3,2);
  }
  const distantX=s.width*.83,distantY=s.height*.76;
  if((reduced||time%21>16)&&Math.hypot(distantX-s.mage.x,distantY-s.mage.y)>155){
    ctx.fillStyle='#110b1b9c';
    ctx.fillRect(distantX-8,distantY-46,16,46);
    ctx.fillRect(distantX-5,distantY-53,10,13);
  }
  if(lowHealth){
    const edge=ctx.createRadialGradient(s.width/2,s.height/2,Math.min(s.width,s.height)*.22,s.width/2,s.height/2,Math.hypot(s.width,s.height)*.5);
    edge.addColorStop(0,'rgba(51,4,17,0)');
    edge.addColorStop(1,'rgba(51,4,17,.72)');
    ctx.fillStyle=edge;ctx.fillRect(0,0,s.width,s.height);
  }
}

function drawDefeatShadow(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean){
  const time=s.deathTime;
  const shade=Math.min(.68,time*.9);
  ctx.fillStyle=`rgba(10,3,16,${shade})`;
  ctx.fillRect(0,0,s.width,s.height);
  if(reduced||time>=1.6)return;
  const rise=Math.min(1,time/.48);
  ctx.save();
  ctx.translate(s.mage.x,s.mage.y-20-rise*50);
  ctx.globalAlpha=Math.min(1,time*5,(1.6-time)*2.2);
  pixelHalo(ctx,0,0,48,'#703c87');
  ctx.fillStyle='#261031';ctx.fillRect(-16,-16,32,35);ctx.fillRect(-20,-9,40,18);ctx.fillRect(-10,19,20,9);
  ctx.fillStyle='#ff977b';
  ctx.fillRect(-15,-9,8,3);ctx.fillRect(7,-9,8,3);
  ctx.fillStyle='#bd506e';
  ctx.fillRect(-12,6,4,5);ctx.fillRect(8,6,4,5);ctx.fillRect(-8,10,16,3);
  ctx.restore();
}

function drawBossSprite(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement,decoy=false){
  const moving=boss.phase==='pursuit';
  const bob=reduced?0:Math.round(Math.sin(time*(moving?12:5))*3);
  const charging=boss.phase==='strike'&&Boolean(boss.laneStart);
  const winding=boss.phase==='warning';
  const recovering=boss.phase==='recovery';
  ctx.translate(0,bob+(recovering?5:0));
  if(!reduced&&charging){ctx.transform(1,0,-.24,1,0,0);ctx.scale(1.08,.91)}
  if(!reduced&&boss.index===0&&boss.phase==='strike')ctx.rotate(.10);
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h)};
  const shape=(color:string,points:number[])=>{
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);
    ctx.closePath();ctx.fill();
  };
  const eyes=!decoy&&boss.health<=BOSSES[boss.index].health/2?'#ff675d':'#ffcf84';
  if(boss.index===1&&sheet.complete&&sheet.naturalWidth){
    const frame=boss.hitFlash>0?4:boss.phase==='warning'||boss.phase==='strike'?2+(reduced?0:Math.floor(time*8)%2):reduced?0:Math.floor(time*5)%2;
    if(winding||boss.phase==='strike'){
      ctx.fillStyle='#a761d9';
      for(const side of [-1,1]){
        const x=side*(winding?37:43);
        ctx.fillRect(x-4,-44,8,8);ctx.fillRect(x-2,-48,4,16);
        ctx.fillStyle='#f4bbff';ctx.fillRect(x-2,-42,4,4);ctx.fillStyle='#a761d9';
      }
    }
    ctx.drawImage(sheet,(frame%4)*128,Math.floor(frame/4)*128,128,128,-43,-78,86,86);
  }else if(boss.index===2){
    for(const side of [-1,1]){
      ctx.save();ctx.scale(side,1);ctx.translate(0,winding?-6:recovering?5:0);
      if(!reduced)ctx.rotate(winding?-.15:charging?.19:0);
      shape('#23152f',[13,-39,25,-57,45,-72,44,-48,54,-30,38,-35,32,-18,24,-25,17,-12]);
      shape('#543344',[20,-41,42,-65,34,-42,43,-34,29,-37,22,-22]);
      rect(13,-9,14,12,'#947346');rect(16,-5,12,4,'#eac87d');
      ctx.restore();
    }
    shape('#722738',[-25,-42,24,-42,30,-8,16,3,-17,3,-29,-9]);
    shape('#bea27e',[-18,-40,19,-40,15,-12,0,-5,-16,-12]);
    shape('#633779',[-20,-48,-14,-64,13,-64,21,-50,15,-34,-15,-34]);
    rect(-14,-49,8,4,eyes);rect(6,-49,8,4,eyes);
    shape('#c9a878',[-20,-54,-23,-64,-30,-70,-24,-72,-16,-65,-13,-57]);
    shape('#c9a878',[20,-54,23,-64,30,-70,24,-72,16,-65,13,-57]);
    rect(-23,-34,9,5,'#edc988');rect(14,-34,9,5,'#edc988');
    rect(-11,-26,22,3,recovering?'#ff7a64':'#6b4950');
    rect(-8,-18,16,2,'#e7c28d');
    rect(-10,-40,20,5,'#211127');rect(-9,-41,4,5,'#f2d1a0');rect(5,-41,4,5,'#f2d1a0');
  }else if(boss.index===3){
    shape('#366090',[-31,-41,-21,-59,19,-59,32,-45,47,-42,34,-31,34,-15,21,-2,0,4,-21,1,-33,-10]);
    shape('#92c3d9',[-27,-38,-18,-54,18,-54,29,-42,42,-40,28,-28,28,-16,16,-6,-13,-5,-25,-13]);
    rect(-22,-42,13,6,'#41205a');rect(6,-42,13,6,'#41205a');
    rect(-17,-40,5,4,'#ff69ea');rect(8,-40,5,4,'#ff69ea');
    shape('#203055',[-17,-28,17,-28,12,-13,4,-8,-10,-12]);
    rect(-8,-20,11,13,'#6552ce');
    const crown=(boss.phase==='strike'||boss.phase==='reveal')&&!decoy?'#fff8ad':'#db9f64';
    shape(crown,[-15,-58,-19,-73,-7,-68,0,-80,8,-68,19,-73,15,-58]);
    rect(-4,-72,8,10,'#f95fc8');
    rect(-2,-71,3,3,'#ffcefd');
    rect(-13,-60,26,2,'#ffe2a9');
    shape('#d8f0f5',[-16,-27,-10,-27,-12,-20]);
    shape('#d8f0f5',[9,-27,15,-27,12,-20]);
    if(!decoy&&(boss.phase==='reveal'||boss.phase==='strike')){
      rect(-2,-86,4,4,'#fff1fb');rect(-21,-78,3,3,'#f0a9ff');rect(19,-76,3,3,'#f0a9ff');
    }
  }else{
    shape('#160f23',[-25,2,-22,-40,-13,-53,-7,-67,10,-70,23,-55,26,-34,29,2]);
    shape('#61466d',[-20,-39,-12,-54,-7,-64,10,-66,20,-54,19,-39,11,-31,-15,-31]);
    rect(-12,-53,23,13,'#160d20');
    rect(-9,-48,5,3,eyes);rect(4,-48,5,3,eyes);
    shape('#392941',[-22,-28,-12,-31,-5,-8,-13,0,-22,-1]);
    shape('#493450',[11,-29,21,-26,25,-3,15,1,8,-10]);
    rect(-19,-30,36,6,'#422b50');
    rect(-9,-28,3,7,'#9a786e');rect(5,-26,3,6,'#9a786e');rect(-15,-18,31,4,'#342340');
    rect(-29,-22,9,10,'#76627e');rect(-32,-13,12,14,'#523645');
    pixelHalo(ctx,-26,-8,winding?31:22,'#ffbc5e');
    rect(-29,-10,6,8,winding?'#fff1a0':'#ffc071');rect(-32,1,12,3,'#9a654e');
    ctx.save();ctx.translate(21,-24);
    if(!reduced)ctx.rotate(boss.phase==='warning'?-.85:boss.phase==='strike'?1.1:boss.phase==='recovery'?.35:bob*.06);
    rect(-2,-40,4,60,'#967150');
    shape('#9d879f',[-9,16,9,16,9,24,3,31,-4,31,-9,24]);
    rect(-5,18,10,3,'#d1abb0');ctx.restore();
  }
}

const GRAVEKEEPER_CELL=96;
function drawGravekeeperCell(ctx:CanvasRenderingContext2D,sheet:HTMLImageElement,row:number,column:number,x:number,y:number,size=GRAVEKEEPER_CELL){
  ctx.drawImage(sheet,column*GRAVEKEEPER_CELL,row*GRAVEKEEPER_CELL,GRAVEKEEPER_CELL,GRAVEKEEPER_CELL,x,y,size,size);
}

function drawGravekeeperPose(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement){
  if(!sheet.naturalWidth)return false;
  ctx.scale(GRAVEKEEPER_SCALE,GRAVEKEEPER_SCALE);
  const move=boss.attack;
  if(move&&(boss.phase==='warning'||boss.phase==='strike'||boss.phase==='recovery')){
    const row=move.kind==='dirt'?0:move.kind==='skull'?1:2;
    const frame=boss.phase==='warning'?(reduced?4:Math.min(4,Math.floor(5*(1-boss.remaining/move.windup)))):
      boss.phase==='strike'?(reduced||boss.remaining>.15?5:6):7;
    drawGravekeeperCell(ctx,sheet,row,Math.max(0,frame),-48,-78);
  }else{
    const frame=boss.phase==='pursuit'?2+(reduced?0:Math.floor(time*9)%6):reduced?0:Math.floor(time*3)%2;
    drawGravekeeperCell(ctx,sheet,3,frame,-48,-78);
  }
  return true;
}

function drawGravekeeperWarning(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement){
  if(boss.phase!=='warning'||!boss.attack)return;
  ctx.save();
  if(boss.attack.kind==='summon'){
    for(const site of boss.summonSites??[]){
      ctx.fillStyle='#3c145b99';ctx.strokeStyle='#d890ff';ctx.lineWidth=3;
      ctx.beginPath();ctx.ellipse(site.x,site.y,29,13,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(sheet.naturalWidth)drawGravekeeperCell(ctx,sheet,7,reduced?3:Math.floor(time*10)%8,site.x-38,site.y-38,76);
    }
  }else{
    const origin=gravekeeperAttackOrigin(boss);
    const angle=Math.atan2(boss.target.y-origin.y,boss.target.x-origin.x);
    ctx.strokeStyle=boss.attack.kind==='dirt'?'#e8ae7e':'#d999ff';ctx.lineWidth=3;ctx.setLineDash([9,6]);
    ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(boss.target.x,boss.target.y);ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(boss.target.x,boss.target.y);ctx.rotate(angle);
    ctx.beginPath();ctx.moveTo(-11,-7);ctx.lineTo(0,0);ctx.lineTo(-11,7);ctx.stroke();
  }
  ctx.restore();
}

const HEX_CELL=128;
function drawHexCell(ctx:CanvasRenderingContext2D,sheet:HTMLImageElement,row:number,column:number,x:number,y:number,size=HEX_CELL){
  ctx.drawImage(sheet,column*HEX_CELL,row*HEX_CELL,HEX_CELL,HEX_CELL,x,y,size,size);
}

function drawHexKingPose(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement){
  if(!sheet.naturalWidth)return false;
  const move=boss.hexMove;
  if(!move||boss.phase==='arrival'||boss.phase==='pursuit'){
    drawHexCell(ctx,sheet,0,reduced?0:Math.floor(time*9)%8,-64,-88);
    return true;
  }
  const row=move.kind==='claw'?1:move.kind==='mist'?3:2;
  let frame=7;
  if(boss.phase==='warning'){
    const frames=move.kind==='mist'?3:5;
    frame=reduced?frames-1:Math.min(frames-1,Math.max(0,Math.floor(frames*(1-boss.remaining/move.windup))));
  }else if(boss.phase==='strike'){
    frame=move.kind==='mist'?(reduced?3:3+Math.min(3,Math.floor(4*(1-boss.remaining/.35)))):
      reduced||boss.remaining>.15?5:6;
  }
  drawHexCell(ctx,sheet,row,frame,-64,-88);
  return true;
}

function drawHexWarning(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,s:HuntState,reduced:boolean,sheet:HTMLImageElement){
  if(boss.phase!=='warning'&&boss.phase!=='strike')return;
  ctx.save();
  ctx.strokeStyle='#efb0ff';ctx.fillStyle=boss.phase==='strike'?'#b657db75':'#9b42c53b';ctx.lineWidth=3;
  if(boss.hexMove?.kind==='claw'){
    const heading=boss.hexHeading??0;
    ctx.beginPath();ctx.moveTo(boss.x,boss.y);
    ctx.arc(boss.x,boss.y,boss.radius,heading-HEX_CLAW_HALF_ANGLE,heading+HEX_CLAW_HALF_ANGLE);
    ctx.closePath();ctx.fill();ctx.stroke();
  }else if(boss.hexMove?.kind==='roar'&&boss.phase==='warning'){
    for(const {x,y} of boss.summonSites??[]){
      ctx.beginPath();ctx.ellipse(x,y,25,12,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(sheet.naturalWidth)drawHexCell(ctx,sheet,4,reduced?6:6+Math.floor(s.time*8)%2,x-38,y-38,76);
    }
  }else if(boss.hexMove?.kind==='swarm'&&boss.phase==='warning'){
    for(let i=0;i<HEX_SWARM_COUNT;i++){
      const {x,y}=hexSwarmOrbit(s,boss,i,reduced?0:boss.remaining);
      if(sheet.naturalWidth)drawHexCell(ctx,sheet,5,reduced?0:Math.floor(s.time*12+i)%2,x-26,y-20,40);
      else{ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.stroke()}
    }
  }
  ctx.restore();
}

function drawHexBurst(ctx:CanvasRenderingContext2D,origin:Point,remaining:number,reduced:boolean,sheet:HTMLImageElement){
  const progress=1-remaining/.45;
  const radius=reduced?155:44+111*Math.min(1,progress*1.7);
  ctx.save();ctx.translate(origin.x,origin.y);ctx.globalAlpha=reduced?.75:1-progress*.7;
  for(let i=0;i<3;i++){
    ctx.rotate(Math.PI*2/3);
    ctx.strokeStyle=i===1?'#ecc3ff':'#ac5ce9';ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(0,0,radius,-.76,.74);ctx.stroke();
    if(sheet.naturalWidth){
      drawHexCell(ctx,sheet,4,reduced?4:4+Math.min(1,Math.floor(progress*3)),radius-43,-45,86);
      if(!reduced)drawHexCell(ctx,sheet,4,6+Math.min(1,Math.floor(progress*3)),radius-65,-38,72);
    }
  }
  ctx.restore();
}

const TYRANT_CELL=144;
function drawTyrantCell(ctx:CanvasRenderingContext2D,sheet:HTMLImageElement,row:number,column:number,x:number,y:number,width=TYRANT_CELL,height=width){
  ctx.drawImage(sheet,column*TYRANT_CELL,row*TYRANT_CELL,TYRANT_CELL,TYRANT_CELL,x,y,width,height);
}

function drawTyrantPose(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement){
  if(!sheet.naturalWidth)return false;
  const move=boss.tyrantMove;
  const active=boss.phase==='warning'||boss.phase==='strike';
  const airborne=boss.phase==='arrival'||(active&&move?.kind==='dive'&&!boss.followup);
  let row=airborne?1:0;
  let frame=reduced?0:Math.floor(time*(airborne?11:8))%8;
  if(move&&move.kind!=='dive'&&(active||boss.phase==='recovery')){
    row=move.kind==='fire'?2:3;
    frame=boss.phase==='recovery'?7:boss.phase==='warning'?(reduced?4:Math.min(4,Math.max(0,Math.floor(5*(1-boss.remaining/move.windup))))):
      reduced||boss.remaining>move.duration*.45?5:6;
  }else if(boss.phase==='recovery'||active&&boss.followup){
    frame=boss.phase==='recovery'?7:4;
  }
  const lift=airborne?(reduced?12:14+Math.round(Math.sin(time*12)*4)):0;
  drawTyrantCell(ctx,sheet,row,frame,-72,-116-lift);
  return true;
}

function drawTyrantHazard(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement){
  const move=boss.tyrantMove;
  if(!move||move.kind==='dive'||(boss.phase!=='warning'&&boss.phase!=='strike'))return;
  const striking=boss.phase==='strike';
  const frame=reduced?1:Math.floor(time*13)%4;
  ctx.save();
  ctx.fillStyle=striking?'#bf2b5555':'#95214938';ctx.strokeStyle=striking?'#ff926f':'#e6a1d2';ctx.lineWidth=3;
  if(!striking)ctx.setLineDash([8,5]);
  if(move.kind==='fire'){
    const heading=boss.tyrantHeading??0;
    ctx.beginPath();ctx.moveTo(boss.x,boss.y);
    ctx.arc(boss.x,boss.y,boss.radius,heading-TYRANT_FIRE_HALF_ANGLE,heading+TYRANT_FIRE_HALF_ANGLE);
    ctx.closePath();ctx.fill();ctx.stroke();
    if(striking&&sheet.naturalWidth){
      const mouth={x:boss.x+(Math.cos(heading)<0?-19:19),y:boss.y-44};
      const end={x:boss.x+Math.cos(heading)*boss.radius,y:boss.y+Math.sin(heading)*boss.radius};
      const dx=end.x-mouth.x,dy=end.y-mouth.y;
      ctx.translate(mouth.x,mouth.y);ctx.rotate(Math.atan2(dy,dx));
      drawTyrantCell(ctx,sheet,4,frame,-10,-82,Math.hypot(dx,dy)+26,164);
    }
  }else{
    const {x,y}=boss.target;
    ctx.beginPath();ctx.arc(x,y,boss.radius,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(sheet.naturalWidth){
      if(striking)drawTyrantCell(ctx,sheet,4,4+frame,x-91,y-154,182);
      else{
        ctx.globalAlpha=.55;
        drawTyrantCell(ctx,sheet,4,4+frame,x-38,y-64,76);
      }
    }
  }
  ctx.restore();
}

function drawTyrantDash(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean,sheet:HTMLImageElement){
  if(!s.dashTrail)return;
  const {start,end}=s.dashTrail;
  const dx=end.x-start.x,dy=end.y-start.y;
  ctx.save();
  ctx.globalAlpha=Math.min(.8,s.abilityFlash/.45);
  ctx.strokeStyle='#d19af3';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(start.x,start.y-13);ctx.lineTo(end.x,end.y-13);ctx.stroke();
  if(sheet.naturalWidth&&!reduced){
    for(const position of [.22,.55,.85]){
      ctx.save();ctx.globalAlpha*=.36+position*.45;
      ctx.translate(start.x+dx*position,start.y+dy*position);
      ctx.scale(dx<0?-1:1,1);
      ctx.filter='brightness(.8) saturate(.7) hue-rotate(28deg)';
      drawTyrantCell(ctx,sheet,1,Math.floor(position*7),-39,-60,78);
      ctx.restore();
    }
  }
  ctx.restore();
}

const PHANTOM_CELL=144;
function drawPhantomCell(ctx:CanvasRenderingContext2D,sheet:HTMLImageElement,row:number,col:number,x:number,y:number,size=PHANTOM_CELL){
  ctx.drawImage(sheet,col*PHANTOM_CELL,row*PHANTOM_CELL,PHANTOM_CELL,PHANTOM_CELL,x,y,size,size);
}

function drawPhantomPose(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,time:number,reduced:boolean,sheet:HTMLImageElement,decoy:boolean){
  if(!sheet.naturalWidth)return false;
  const move=boss.phantomMove;
  let row=0,frame=reduced?0:Math.floor(time*8)%6;
  if(!decoy&&move&&(boss.phase==='warning'||boss.phase==='reveal'||boss.phase==='strike'||boss.phase==='recovery')){
    row=move.kind==='tongue'?1:move.kind==='barrage'?2:3;
    if(boss.phase==='warning')frame=reduced?2:Math.min(2,Math.max(0,Math.floor(3*(1-boss.remaining/move.windup))));
    else if(boss.phase==='reveal')frame=2;
    else if(boss.phase==='strike')frame=reduced||boss.remaining>.16?3:4;
    else frame=5;
  }
  const bob=!reduced&&row===0?Math.round(Math.sin(time*5)*3):0;
  if(decoy)ctx.globalAlpha*=.59;
  drawPhantomCell(ctx,sheet,row,frame,-72,-115+bob);
  return true;
}

function drawPhantomHazard(ctx:CanvasRenderingContext2D,boss:NonNullable<HuntState['boss']>,reduced:boolean){
  const move=boss.phantomMove;
  if(!move||move.kind==='barrage'||(boss.phase!=='warning'&&boss.phase!=='strike'))return;
  const strike=boss.phase==='strike';
  const heading=boss.phantomHeading??0;
  ctx.save();
  ctx.strokeStyle=move.kind==='tongue'?'#e2a4ff':'#ff8fe6';
  ctx.fillStyle=strike?'#e24aa866':'#a54bea32';
  ctx.lineWidth=3;
  if(!strike)ctx.setLineDash([7,5]);
  ctx.beginPath();
  if(move.kind==='tongue'){
    ctx.moveTo(boss.x,boss.y);
    ctx.arc(boss.x,boss.y,boss.radius,heading-PHANTOM_TONGUE_HALF_ANGLE,heading+PHANTOM_TONGUE_HALF_ANGLE);
    ctx.closePath();
  }else ctx.arc(boss.x,boss.y,boss.radius,0,Math.PI*2);
  ctx.fill();ctx.stroke();ctx.setLineDash([]);
  if(strike&&move.kind==='scream'){
    const radius=reduced?boss.radius:35+(boss.radius-35)*(1-boss.remaining/.35);
    ctx.strokeStyle='#a2efff';ctx.lineWidth=5;
    ctx.beginPath();ctx.arc(boss.x,boss.y,radius,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}

function drawPhantomShot(ctx:CanvasRenderingContext2D,shot:Shot,time:number,reduced:boolean,sheet:HTMLImageElement){
  const kind=shot.kind;
  if(!sheet.naturalWidth||(kind!=='royal-bolt'&&kind!=='royal-skull'&&kind!=='phantom-face'))return false;
  const first=kind==='royal-bolt'?0:kind==='royal-skull'?2:4;
  const frame=first+(reduced?0:Math.floor(time*16)%2);
  const size=kind==='phantom-face'?73:57;
  ctx.save();ctx.translate(shot.x,shot.y);ctx.rotate(Math.atan2(shot.vy,shot.vx));
  drawPhantomCell(ctx,sheet,4,frame,-size*.70,-size*.5,size);
  ctx.restore();
  return true;
}

function drawBossTelegraphs(ctx:CanvasRenderingContext2D,s:HuntState,boss:NonNullable<HuntState['boss']>,reduced:boolean,gravekeeperSheet:HTMLImageElement,hexKingSheet:HTMLImageElement,tyrantSheet:HTMLImageElement){
  ctx.save();
  if(s.boss&&boss.index===0)drawGravekeeperWarning(ctx,boss,s.time,reduced,gravekeeperSheet);
  if(s.boss&&boss.index===1)drawHexWarning(ctx,boss,s,reduced,hexKingSheet);
  if(s.boss&&boss.index===2)drawTyrantHazard(ctx,boss,s.time,reduced,tyrantSheet);
  if(s.boss&&boss.index===3)drawPhantomHazard(ctx,boss,reduced);
  const customZone=boss.hexMove?.kind==='claw'||boss.tyrantMove&&boss.tyrantMove.kind!=='dive'||boss.phantomMove;
  if(s.boss&&boss.radius>0&&(boss.phase==='warning'||boss.phase==='strike')&&!customZone){
    const striking=boss.phase==='strike';
    const {x,y}=boss.target,r=boss.radius;
    const palette=[['#ffc076','#f27a43'],['#e3a2ff','#ae57db'],['#ffac99','#f45159']][boss.index]??['#b9a4fb','#785de5'];
    ctx.beginPath();
    if(boss.laneStart){
      ctx.moveTo(boss.laneStart.x,boss.laneStart.y);
      ctx.lineTo(x,y);
      ctx.lineCap='round';ctx.lineWidth=r*2;
      ctx.strokeStyle=palette[1]+(striking?'82':'55');ctx.stroke();
      ctx.lineCap='butt';
      ctx.strokeStyle=palette[0];ctx.lineWidth=3;
      ctx.setLineDash(striking?[]:[12,8]);ctx.stroke();ctx.setLineDash([]);
      const angle=Math.atan2(y-boss.laneStart.y,x-boss.laneStart.x);
      const length=Math.hypot(x-boss.laneStart.x,y-boss.laneStart.y);
      for(let offset=24;offset<length;offset+=34){
        ctx.save();ctx.translate(boss.laneStart.x+Math.cos(angle)*offset,boss.laneStart.y+Math.sin(angle)*offset);
        ctx.rotate(angle);ctx.beginPath();ctx.moveTo(-7,-11);ctx.lineTo(5,0);ctx.lineTo(-7,11);ctx.stroke();ctx.restore();
      }
    }else{
      const points=boss.index===0?[[-1,-1],[1,-1],[1,1],[-1,1]]:
        [[-.55,-1],[.55,-1],[1,-.55],[1,.55],[.55,1],[-.55,1],[-1,.55],[-1,-.55]];
      const outline=(scale:number)=>{
        ctx.beginPath();
        points.forEach(([dx,dy],i)=>i===0?ctx.moveTo(x+dx*r*scale,y+dy*r*scale):ctx.lineTo(x+dx*r*scale,y+dy*r*scale));
        ctx.closePath();
      };
      outline(1);
      ctx.fillStyle=palette[1]+(striking?'67':'29');ctx.fill();
      ctx.lineWidth=3;ctx.strokeStyle=palette[0];ctx.stroke();
      ctx.lineWidth=2;
      if(boss.index===0){
        // Jagged earth splits run through the marked grave plot.
        for(const direction of [-1,1]){
          ctx.beginPath();ctx.moveTo(x-r*.82,y+direction*r*.43);
          ctx.lineTo(x-r*.27,y+direction*r*.16);ctx.lineTo(x-r*.1,y-direction*r*.1);
          ctx.lineTo(x+r*.21,y+direction*r*.23);ctx.lineTo(x+r*.78,y+direction*r*.52);ctx.stroke();
        }
      }else{
        outline(.74);ctx.stroke();
        ctx.fillStyle=palette[0];ctx.fillRect(x-10,y-2,20,4);ctx.fillRect(x-2,y-10,4,20);
      }
      if(striking&&!reduced){
        const progress=1-boss.remaining/.35;
        outline(Math.max(.05,progress));ctx.strokeStyle=palette[0];ctx.stroke();
      }
    }
  }
  if(boss.phase==='reveal'){
    const {x,y}=phantomBarrageOrigin(boss);
    const angle=Math.atan2(boss.target.y-y,boss.target.x-x);
    ctx.strokeStyle='#b9a4fb';ctx.lineWidth=2;ctx.setLineDash([4,7]);
    for(let i=-2;i<=2;i++){
      const heading=angle+i*phantomBoltSpread(boss);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(heading)*128,y+Math.sin(heading)*128);ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBossActors(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean,sheet:HTMLImageElement,gravekeeperSheet:HTMLImageElement,hexKingSheet:HTMLImageElement,tyrantSheet:HTMLImageElement,phantomSheet:HTMLImageElement){
  const boss=s.boss??(s.fallenTime>0?s.fallenBoss:null);
  if(!boss||s.dead)return;
  for(const point of [...boss.decoys,boss]){
    ctx.save();ctx.translate(point.x,point.y);
    if(s.boss&&boss.phase==='recovery'&&point===boss){
      ctx.fillStyle='#ffe0aa';
      ctx.fillRect(-7,-91,4,4);ctx.fillRect(4,-94,5,5);
    }
    if(s.boss&&s.counterTime>0&&point===boss){
      ctx.fillStyle='#ffd691';
      for(const x of [-40,26])for(const y of [-86,0]){
        ctx.fillRect(x,y,14,3);
        ctx.fillRect(x===26?x+11:x,y===0?y-11:y,3,14);
      }
    }
    if(!s.boss){ctx.globalAlpha=s.fallenTime/1.1;if(!reduced)ctx.translate(0,(1.1-s.fallenTime)*32)}
    else if(boss.phase==='arrival'&&!reduced){ctx.globalAlpha=Math.max(.22,1-boss.remaining/2);ctx.translate(0,boss.remaining*8)}
    else if(boss.hitFlash>0&&!reduced)ctx.translate(point.x<s.mage.x?-3:3,0);
    const facingTarget=boss.index===0&&boss.attack&&boss.phase!=='pursuit'?boss.target:s.mage;
    const heading=boss.index===1?boss.hexHeading:boss.index===2?boss.tyrantHeading:boss.phantomHeading;
    const facing=heading!==undefined&&boss.phase!=='pursuit'?
      (Math.cos(heading)<0?-1:1):(facingTarget.x<point.x?-1:1);
    ctx.scale(facing,1);
    const drawn=boss.index===0?drawGravekeeperPose(ctx,boss,s.time,reduced,gravekeeperSheet):
      boss.index===1?drawHexKingPose(ctx,boss,s.time,reduced,hexKingSheet):
      boss.index===2?drawTyrantPose(ctx,boss,s.time,reduced,tyrantSheet):
      drawPhantomPose(ctx,boss,s.time,reduced,phantomSheet,point!==boss);
    if(!drawn){
      drawBossSprite(ctx,boss,s.time,reduced,sheet,point!==boss||boss.decoys.length>0);
    }
    ctx.restore();
  }
  for(const bolt of s.bolts){
    if(drawPhantomShot(ctx,bolt,s.time,reduced,phantomSheet))continue;
    ctx.save();ctx.translate(bolt.x,bolt.y);
    if(bolt.kind==='hex-skull'&&hexKingSheet.naturalWidth){
      const age=bolt.age??0;
      const column=(age<.13?2:4)+(reduced?0:Math.floor(age*18)%2);
      // Mirror the right-facing sprite so the face stays upright during flight.
      ctx.scale(bolt.vx<0?-1:1,1);
      drawHexCell(ctx,hexKingSheet,5,column,-42,-30,60);
      ctx.restore();continue;
    }
    if((bolt.kind==='dirt'||bolt.kind==='skull')&&gravekeeperSheet.naturalWidth){
      const column=(bolt.kind==='skull'?4:0)+(reduced?0:Math.floor(s.time*16)%4);
      ctx.rotate(Math.atan2(bolt.vy,bolt.vx));
      drawGravekeeperCell(ctx,gravekeeperSheet,6,column,-42,-28,56);
      ctx.restore();continue;
    }
    ctx.restore();
    pixelTrail(ctx,bolt.x,bolt.y,bolt.vx*.065,bolt.vy*.065,'#764ce4','#ae9aff');
    const x=Math.round(bolt.x/2)*2,y=Math.round(bolt.y/2)*2;
    ctx.fillStyle='#9c91ff';ctx.fillRect(x-6,y-4,12,8);ctx.fillRect(x-4,y-6,8,12);
    ctx.fillStyle='#def6ff';ctx.fillRect(x-2,y-2,4,4);
  }
}

function drawEscapeGate(ctx:CanvasRenderingContext2D,s:HuntState){
  if(s.siegeUntil===null)return;
  const {x,y}=escapePoint(s),open=s.time>=s.siegeUntil;
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle=open?'#4dddac36':'#2b203a';ctx.fillRect(-18,-44,36,49);
  ctx.fillStyle=open?'#9af4bd':'#7d688a';
  ctx.fillRect(-20,-36,3,42);ctx.fillRect(17,-36,3,42);ctx.fillRect(-11,-46,22,3);
  for(let i=0;i<3;i++){
    ctx.fillRect(-20+i*3,-39-i*3,6,3);
    ctx.fillRect(14-i*3,-39-i*3,6,3);
  }
  if(!open)for(const post of [-11,0,11])ctx.fillRect(post,-38,3,42);
  ctx.font='600 11px system-ui';ctx.textAlign='center';
  ctx.fillStyle=open?'#b8ffd6':'#c6b1d1';ctx.fillText(open?'EXIT OPEN':'SEALED EXIT',0,-53);
  ctx.restore();
}

function drawAbilityDrop(ctx:CanvasRenderingContext2D,s:HuntState,reduced:boolean){
  const drop=s.drop;
  if(!drop)return;
  const {color}=ABILITY_ICONS[drop.index];
  const x=Math.round(drop.x),y=Math.round(drop.y-20);
  const pulse=reduced?1:.9+Math.sin(s.fallenTime*8)*.1;
  ctx.save();
  ctx.globalAlpha=pulse;pixelHalo(ctx,x,y,38,color);
  ctx.globalAlpha=1;
  ctx.fillStyle='#21162f';ctx.fillRect(x-15,y-15,30,30);
  ctx.fillStyle=color;
  ctx.fillRect(x-14,y-16,28,2);ctx.fillRect(x-14,y+14,28,2);
  ctx.fillRect(x-16,y-14,2,28);ctx.fillRect(x+14,y-14,2,28);
  ctx.fillStyle=color;
  abilityPixels(drop.index,(px,py)=>ctx.fillRect(x-8+px*2,y-8+py*2,2,2));
  ctx.font='600 12px system-ui';
  const name=BOSSES[drop.index].ability;
  const width=ctx.measureText(name).width+14;
  const labelX=Math.max(width/2+4,Math.min(s.width-width/2-4,x));
  ctx.fillStyle='#21162ff0';ctx.fillRect(labelX-width/2,y-39,width,18);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;
  ctx.fillText(name,labelX,y-30);
  ctx.restore();
}

export function createHalloweenRenderer(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const effectCanvas=document.createElement('canvas'),effectContext=effectCanvas.getContext('2d');
  const grid=3;
  // Rasterize telegraphs on a coarse world grid. Character atlases keep their native pixels.
  function drawPixelEffects(target:CanvasRenderingContext2D,width:number,height:number,draw:(context:CanvasRenderingContext2D)=>void){
    if(!effectContext){draw(target);return}
    const w=Math.ceil(width/grid),h=Math.ceil(height/grid);
    if(effectCanvas.width!==w||effectCanvas.height!==h){effectCanvas.width=w;effectCanvas.height=h}
    effectContext.setTransform(1,0,0,1,0,0);effectContext.clearRect(0,0,w,h);
    effectContext.setTransform(1/grid,0,0,1/grid,0,0);effectContext.imageSmoothingEnabled=false;
    draw(effectContext);
    target.drawImage(effectCanvas,0,0,w*grid,h*grid);
  }
  const atlas=getGhostAtlas();
  const frame=createFrame(160,144),pixels=new ImageData(160,144),buffer=document.createElement('canvas');
  buffer.width=160;buffer.height=144;const bufferContext=buffer.getContext('2d');
  const sheet=new Image();sheet.src=hexWraithUrl;
  const hexKingSheet=new Image();hexKingSheet.src=hexKingUrl;
  const tyrantSheet=new Image();tyrantSheet.src=tyrantUrl;
  const phantomSheet=new Image();phantomSheet.src=phantomUrl;
  const mageSheet=new Image();mageSheet.src=mageUrl;
  const mageLiveSheet=new Image();mageLiveSheet.src=mageLiveUrl;
  const gravekeeperSheet=new Image();gravekeeperSheet.src=gravekeeperUrl;
  const bossSheets=[gravekeeperSheet,hexKingSheet,tyrantSheet,phantomSheet];
  let effects:{point:Point;fx:Effect;scale?:number}[]=[];
  const bossPalette=['#1a0d29','#4a2251','#913554','#e45f61','#ffb275','#fff0c2'];
  function bossEffect(kind:BossCue,point:Point,radius:number,index:number){
    const count=kind==='boss-strike'?8:kind==='boss-defeat'?4:1;
    const spread=kind==='boss-strike'?radius*.88:kind==='boss-defeat'?34:0;
    for(let i=0;i<count;i++){
      const angle=i*Math.PI*2/count;
      const at={x:point.x+Math.cos(angle)*spread,y:point.y+Math.sin(angle)*spread};
      const spark=kind==='boss-hit'||kind==='boss-strike';
      effects.push({point:at,scale:index===0?1.35:1,fx:createFx(spark?hitSpark:poof,{
        x:80,y:83,seed:Math.floor(at.x+at.y)+i,light:.6,aim:angle,palette:index===0?['#261729','#644034','#b7693e','#f09b4e','#ffcc82','#fff0c2']:index===1?['#201029','#482757','#7845a1','#b16bda','#d697ef','#ffd6ff']:index===3?['#101733','#3f3890','#6951c0','#8ccbf2','#c4f2ff','#fff0ff']:bossPalette,
      })});
    }
    if(effects.length>16)effects.splice(0,effects.length-16);
  }
  return {
    bossEffect,
    hit(point:Point){if(effects.length<8)effects.push({point:{...point},fx:createFx(poof,{x:80,y:100,seed:Math.floor(point.x+point.y),light:.45,palette:['#30132e','#67335d','#a34e74','#f59853','#ffd390','#fff1c7']})})},
    hurt(point:Point){if(effects.length>=12)effects.shift();effects.push({point:{x:point.x,y:point.y-20},fx:createFx(hitSpark,{x:80,y:103,seed:Math.floor(point.x+point.y),light:.45,aim:-.65,palette:['#351531','#673867','#a75c89','#ed996a','#ffc38a','#ffe6be','#fff1dc']})})},
    draw(s:HuntState,dt:number,reduced:boolean){
      const scale=Math.min(window.devicePixelRatio||1,2);
      const w=Math.round(s.width*scale),h=Math.round(s.height*scale);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;
      drawAtmosphere(ctx,s,reduced);
      const boss=s.boss;
      if(boss&&!s.dead&&(boss.phase==='warning'||boss.phase==='strike'||boss.phase==='reveal')){
        drawPixelEffects(ctx,s.width,s.height,effects=>drawBossTelegraphs(effects,s,boss,reduced,gravekeeperSheet,hexKingSheet,tyrantSheet));
      }
      const actors=(context:CanvasRenderingContext2D)=>drawBossActors(context,s,reduced,sheet,gravekeeperSheet,hexKingSheet,tyrantSheet,phantomSheet);
      const visibleBoss=boss??s.fallenBoss;
      if(visibleBoss&&!bossSheets[visibleBoss.index]?.naturalWidth)drawPixelEffects(ctx,s.width,s.height,actors);
      else actors(ctx);
      if(!reduced){
        for(let i=0;i<24;i++){
          const x=(i*173.7)%s.width,y=(i*97.3+Math.sin(s.time*.3+i)*10)%s.height;
          ctx.fillStyle=i%3?'#bd8cdf55':'#ffb45a77';ctx.fillRect(x,y,2,2);
        }
      }
      for(const g of s.ghosts){
        const behavior=ghostBehavior(g);
        if(behavior==='hidden')continue;
        if(g.kind==='hex-minion'&&hexKingSheet.naturalWidth){
          const age=g.age??0;
          const frame=reduced?0:Math.floor(age*9)%4;
          ctx.save();ctx.globalAlpha=.3+.7*Math.min(1,age/.7);
          ctx.translate(Math.round(g.x),Math.round(g.y));ctx.scale(g.facing??1,1);
          drawHexCell(ctx,hexKingSheet,4,frame,-30,-37,60);
          ctx.restore();continue;
        }
        if((g.kind==='skeleton'||g.kind==='zombie')&&gravekeeperSheet.naturalWidth){
          const age=g.age??0;
          const frame=age<.7?Math.min(3,Math.floor(age/.7*4)):4+(reduced?0:Math.floor((age-.7)*(g.kind==='skeleton'?10:7))%4);
          const size=104;
          ctx.save();ctx.translate(Math.round(g.x),Math.round(g.y));ctx.scale(g.facing??1,1);
          drawGravekeeperCell(ctx,gravekeeperSheet,g.kind==='skeleton'?4:5,frame,-size/2,-size*78/96,size);
          ctx.restore();continue;
        }
        if(g.kind==='stalker'){
          ctx.save();ctx.translate(g.x,g.y);ctx.globalAlpha=Math.min(1,(g.age??1)/.7);
          ctx.fillStyle='#9f546e';ctx.fillRect(-8,-40,16,16);
          ctx.fillStyle='#100b19';ctx.fillRect(-7,-39,14,15);
          ctx.beginPath();ctx.moveTo(-7,-29);ctx.lineTo(-15,5);ctx.lineTo(15,5);ctx.lineTo(7,-29);ctx.fill();
          ctx.fillStyle=behavior==='watching'?'#ffc881':'#ff7282';
          ctx.fillRect(-5,-34,3,2);ctx.fillRect(2,-34,3,2);ctx.restore();
          continue;
        }
        if(behavior==='returning'){
          ctx.fillStyle='#ffd28f';
          const x=Math.round(g.x/2)*2,y=Math.round((g.y-7)/2)*2;
          ctx.fillRect(x-10,y-24,20,2);ctx.fillRect(x-10,y+22,20,2);
          ctx.fillRect(x-20,y-12,2,24);ctx.fillRect(x+18,y-12,2,24);
          for(const sx of [-1,1])for(const sy of [-1,1]){
            ctx.fillRect(x+sx*14-3,y+sy*18-1,6,2);
            ctx.fillRect(x+sx*17-1,y+sy*15-2,2,4);
          }
        }
        if(g.kind==='bat'||g.kind==='eyeball'||g.kind==='flying-skull'){
          const atlas=getCritterAtlas(g.kind);
          if(atlas){
            const index=Math.floor(((reduced?0:s.time*15)+g.phase/(Math.PI*2)*atlas.count)%atlas.count);
            const size=CRITTER_TILE,scale=g.kind==='bat'?1.1:g.kind==='eyeball'?1.2:1.25;
            const facing=g.facing??(s.mage.x<g.x?-1:1);
            const rise=Math.atan2(s.mage.y-g.y,Math.max(30,Math.abs(s.mage.x-g.x)));
            ctx.save();ctx.translate(Math.round(g.x),Math.round(g.y-9));
            ctx.globalAlpha=Math.min(1,(g.age??1)/.7);
            ctx.scale(facing*scale,scale);
            if(!reduced)ctx.rotate(Math.max(-.28,Math.min(.28,rise)));
            ctx.drawImage(atlas.canvas,index%CRITTER_COLUMNS*size,Math.floor(index/CRITTER_COLUMNS)*size,size,size,-size/2,-size/2,size,size);
            ctx.restore();continue;
          }
        }
        const phase=g.phase/(Math.PI*2)*GHOST_FRAME_COUNT;
        const index=Math.floor((reduced?phase:s.time*30+phase)%GHOST_FRAME_COUNT);
        ctx.save();ctx.globalAlpha=Math.min(1,(g.age??1)/.7);ctx.translate(g.x,g.y);
        if(behavior==='fading'||behavior==='returning')ctx.globalAlpha*=.38;
        if(g.kind==='circler')ctx.filter='hue-rotate(55deg)';
        if(g.kind==='phantom')ctx.filter='hue-rotate(125deg)';
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
        if(drawPhantomShot(ctx,shot,s.time,reduced,phantomSheet))continue;
        drawPumpkinShot(ctx,shot,reduced);
      }
      if(s.dead){
        drawMageDefeat(ctx,s,reduced,mageSheet);
      }else{
        if(s.dodgeTrail)drawMageDodge(ctx,s.dodgeTrail,s.facing,reduced,mageLiveSheet);
        ctx.save();
        drawMage(ctx,s,reduced,mageLiveSheet);ctx.restore();
        const hex=s.lastAbility===1&&s.abilityFlash>0;
        const dash=s.lastAbility===2&&s.abilityFlash>0;
        const ward=s.ward>0||s.abilityFlash>0&&!hex&&!dash&&s.lastAbility!==3;
        if(hex||dash||ward)drawPixelEffects(ctx,s.width,s.height,effects=>{
          if(hex)drawHexBurst(effects,s.mage,s.abilityFlash,reduced,hexKingSheet);
          if(dash)drawTyrantDash(effects,s,reduced,tyrantSheet);
          if(ward){
            effects.beginPath();effects.arc(s.mage.x,s.mage.y-12,37,0,Math.PI*2);
            effects.lineWidth=3;effects.strokeStyle='#ffd59a';effects.stroke();
          }
        });
      }
      drawEscapeGate(ctx,s);
      drawAbilityDrop(ctx,s,reduced);
      if(!reduced&&bufferContext){
        effects=effects.filter(({point,fx,scale=1})=>{
          fx.update(dt);clearFrame(frame);fx.draw(frame);composite(frame,pixels.data);bufferContext.putImageData(pixels,0,0);
          ctx.drawImage(buffer,point.x-80*scale,point.y-83*scale,buffer.width*scale,buffer.height*scale);return !fx.done();
        });
      }else effects=[];
    },
  };
}
