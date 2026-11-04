export interface Point {x:number;y:number}
export type HuntSoundEvent=(kind:'cast'|'shot'|'ghost'|'hit'|'death'|'hurt'|'defeat',point:Point)=>void;
export interface Ghost extends Point {id:number;phase:number;age?:number;vx?:number;vy?:number;facing?:1|-1}
export interface Shot extends Point {vx:number;vy:number;life:number;age?:number}
export interface HuntInput {keys:ReadonlySet<string>;aim:Point;firing:boolean}
export interface HuntState {
  width:number;height:number;mage:Point;aim:Point;mode:'auto'|'manual';
  ghosts:Ghost[];shots:Shot[];score:number;time:number;manualTime:number;cooldown:number;nextId:number;
  facing:1|-1;staffAngle:number;castTime:number;castRemaining:number;walkPhase:number;moving:boolean;
  health:number;dead:boolean;deathTime:number;invulnerable:number;hurtTime:number;spawnIn:number;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function boundPoint(p:Point,width:number,height:number):Point {
  return {x:clamp(p.x,30,Math.max(30,width-30)),y:clamp(p.y,110,Math.max(110,height-65))};
}
export function createHunt(width:number,height:number):HuntState {
  return {width,height,mage:boundPoint({x:width<=900?width-55:110,y:height-(width<=900?68:165)},width,height),aim:{x:width/2,y:height/2},
    mode:'auto',ghosts:[],shots:[],score:0,time:0,manualTime:0,cooldown:0,nextId:0,
    facing:1,staffAngle:-.5,castTime:100,castRemaining:0,walkPhase:0,moving:false,
    health:3,dead:false,deathTime:0,invulnerable:1.5,hurtTime:100,spawnIn:1};
}
export function resizeHunt(s:HuntState,width:number,height:number){
  s.width=width;s.height=height;s.mage=boundPoint(s.mage,width,height);
  s.ghosts.forEach(g=>Object.assign(g,boundPoint(g,width,height)));
}
export function controlHunt(s:HuntState,mode:HuntState['mode']){Object.assign(s,createHunt(s.width,s.height),{mode})}
/** Hand off the live scene. Only explicit Retry/post-defeat uses controlHunt's reset. */
export function handoffHunt(s:HuntState,mode:HuntState['mode']){
  if(s.dead||s.mode===mode)return;
  s.mode=mode;
  if(mode==='manual')s.invulnerable=Math.max(s.invulnerable,1);
}
/** Facing follows the target, never separation velocity. Retain direction inside the dead zone. */
export function ghostFacing(dx:number,previous:1|-1=dx<0?-1:1):1|-1{return dx>12?1:dx< -12?-1:previous}
/** Normal survival: faster pursuit and steady pressure, capped after 90 manual seconds.
 * Autoplay has a fixed, moderately active pace, independent of the saved run clock.
 */
export function huntDifficulty(time:number,mode:HuntState['mode']='manual'){
  if(mode==='auto')return {level:0,maxGhosts:4,speed:68,spawnInterval:1.5};
  const level=Math.min(3,Math.floor(Math.max(0,time)/30));
  return {level,maxGhosts:4+level,speed:100+level*14,spawnInterval:1.25-level*.15};
}
export function safeSpawnDistance(s:HuntState){return Math.min(320,.45*Math.hypot(Math.max(0,s.width-60),Math.max(0,s.height-175)))}
export function findGhostSpawn(s:HuntState,random= Math.random):Point|undefined{
  const min=safeSpawnDistance(s),right=Math.max(30,s.width-30),bottom=Math.max(110,s.height-65);
  for(let i=0;i<16;i++){
    const edge=(Math.floor(random()*4)+i)%4,t=random();
    const p=edge===0?{x:30+t*(right-30),y:110}:edge===1?{x:right,y:110+t*(bottom-110)}:
      edge===2?{x:30+t*(right-30),y:bottom}:{x:30,y:110+t*(bottom-110)};
    if(Math.hypot(p.x-s.mage.x,p.y-s.mage.y)>=min&&s.ghosts.every(g=>Math.hypot(g.x-p.x,g.y-p.y)>=56))return p;
  }
}
/** Shared by drawing and firing, so the muzzle always follows the animated staff. */
export function staffPose(s:HuntState){
  const charge=s.castRemaining>0?1-s.castRemaining/.12:0;
  const recoil=Math.max(0,1-s.castTime/.2);
  const angle=s.staffAngle+s.facing*(charge*.22-recoil*.16);
  const shoulder={x:s.mage.x+s.facing*13,y:s.mage.y-12};
  const reach=17-recoil*5;
  const hand={x:shoulder.x+Math.cos(angle)*reach,y:shoulder.y+Math.sin(angle)*reach};
  const tip={x:hand.x+Math.cos(angle)*30,y:hand.y+Math.sin(angle)*30};
  // Two equal 12px bones, with an outward bend, keep the elbow attached at every aim angle.
  const dx=hand.x-shoulder.x,dy=hand.y-shoulder.y,d=Math.hypot(dx,dy);
  const bend=Math.sqrt(Math.max(0,12*12-d*d/4));
  const side=Math.cos(angle)>=0?1:-1;
  const elbow={x:(shoulder.x+hand.x)/2-dy/d*bend*side,y:(shoulder.y+hand.y)/2+dx/d*bend*side};
  return {shoulder,elbow,hand,tip,angle,charge,recoil};
}
/** Local pixel pose. The robe ends at y=9; even the lifted boot begins below it. */
export function mageLegPose(s:Pick<HuntState,'walkPhase'|'moving'>,reduced:boolean){
  const walking=!reduced&&s.moving;
  return [-4,4].map((hip,index)=>{
    const cycle=s.walkPhase+index*Math.PI;
    // A restrained shuffle: tiny forward return, planted backward stroke and
    // only one pixel of lift. Keep the knee near the hip/ankle line, not crouched.
    const lift=walking?Math.max(0,Math.sin(cycle)):0;
    const ankle={x:hip-(walking?Math.cos(cycle)*1.25:0),y:19-lift};
    const root={x:hip,y:8};
    const knee={x:(root.x+ankle.x)/2+lift*.35,y:(root.y+ankle.y)/2};
    return {root,knee,ankle};
  });
}
export function nearestGhost(s:HuntState){
  return s.ghosts.reduce<Ghost|undefined>((best,g)=>!best||Math.hypot(g.x-s.mage.x,g.y-s.mage.y)<Math.hypot(best.x-s.mage.x,best.y-s.mage.y)?g:best,undefined);
}
export function stepHunt(s:HuntState,input:HuntInput,elapsed:number,random= Math.random,onSound?:HuntSoundEvent):Point[] {
  const dt=clamp(elapsed,0,1/30),hits:Point[]=[];
  if(s.dead){s.deathTime+=dt;return hits}
  s.time+=dt;s.cooldown-=dt;s.castTime+=dt;s.hurtTime+=dt;s.invulnerable=Math.max(0,s.invulnerable-dt);
  if(s.mode==='manual')s.manualTime+=dt;
  const difficulty=huntDifficulty(s.manualTime,s.mode);
  const previous={...s.mage};
  if(s.ghosts.length>=difficulty.maxGhosts)s.spawnIn=Math.max(s.spawnIn,difficulty.spawnInterval);
  s.spawnIn-=dt;
  if(s.spawnIn<=0&&s.ghosts.length<difficulty.maxGhosts){
    const point=findGhostSpawn(s,random);
    if(point){
      s.ghosts.push({...point,id:s.nextId++,phase:random()*Math.PI*2,facing:ghostFacing(s.mage.x-point.x),age:0,vx:0,vy:0});
      onSound?.('ghost',point);s.spawnIn=difficulty.spawnInterval;
    }else s.spawnIn=.35;
  }
  if(s.mode==='manual'){
    const k=input.keys;
    const dx=Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft'));
    const dy=Number(k.has('s')||k.has('arrowdown'))-Number(k.has('w')||k.has('arrowup'));
    const length=Math.hypot(dx,dy)||1;
    s.mage=boundPoint({x:s.mage.x+dx/length*215*dt,y:s.mage.y+dy/length*215*dt},s.width,s.height);
    s.aim={...input.aim};
  }else{
    const destination=boundPoint(s.width<=900
      ?{x:s.width-55+Math.sin(s.time*.3)*22,y:s.height-68+Math.sin(s.time*.35)*2}
      :{x:s.width*(.3+.22*Math.sin(s.time*.18)),y:s.height-165+Math.sin(s.time*.35)*6},s.width,s.height);
    const dx=destination.x-s.mage.x,dy=destination.y-s.mage.y,length=Math.hypot(dx,dy)||1;
    const distance=Math.min(length,72*dt);
    s.mage.x+=dx/length*distance;s.mage.y+=dy/length*distance;
    const target=nearestGhost(s);if(target)s.aim={x:target.x,y:target.y-9};
  }
  const positions=s.ghosts.map(g=>({x:g.x,y:g.y,id:g.id}));
  for(const ghost of s.ghosts){
    ghost.facing=ghostFacing(s.mage.x-ghost.x,ghost.facing);
    ghost.age=(ghost.age??1)+dt;
    if(ghost.age<.7)continue;
    let dx=s.mage.x-ghost.x,dy=s.mage.y-ghost.y;
    const length=Math.hypot(dx,dy)||1;
    const weave=Math.sin(s.time*1.3+ghost.phase)*.15;
    let vx=(dx/length-dy/length*weave)*difficulty.speed,vy=(dy/length+dx/length*weave)*difficulty.speed;
    for(const other of positions){
      if(other.id===ghost.id)continue;
      dx=ghost.x-other.x;dy=ghost.y-other.y;const distance=Math.hypot(dx,dy);
      if(distance<56){const angle=ghost.phase+ghost.id;vx+=(distance?dx/distance:Math.cos(angle))*(56-distance)*1.8;vy+=(distance?dy/distance:Math.sin(angle))*(56-distance)*1.8}
    }
    const speed=Math.hypot(vx,vy)||1,cap=Math.min(1,difficulty.speed/speed);
    const smooth=1-Math.exp(-dt*5);
    ghost.vx=(ghost.vx??0)+(vx*cap-(ghost.vx??0))*smooth;
    ghost.vy=(ghost.vy??0)+(vy*cap-(ghost.vy??0))*smooth;
    ghost.x+=ghost.vx*dt;ghost.y+=ghost.vy*dt;
    Object.assign(ghost,boundPoint(ghost,s.width,s.height));
  }
  const distance=Math.hypot(s.mage.x-previous.x,s.mage.y-previous.y);
  s.moving=distance>.01;s.walkPhase+=distance*.09;
  // One facing for the entire character. Walking wins over aiming; vertical
  // travel holds the last direction. At rest the whole character can turn to aim.
  const travelX=s.mage.x-previous.x;
  if(s.moving){
    if(Math.abs(travelX)>.01)s.facing=travelX>0?1:-1;
  }else{
    if(s.aim.x>s.mage.x+24)s.facing=1;
    else if(s.aim.x<s.mage.x-24)s.facing=-1;
  }
  const desired=Math.atan2(s.aim.y-(s.mage.y-12),s.aim.x-(s.mage.x+s.facing*13));
  const delta=Math.atan2(Math.sin(desired-s.staffAngle),Math.cos(desired-s.staffAngle));
  s.staffAngle+=delta*(1-Math.exp(-dt*22));
  const firing=s.mode==='auto'||input.firing;
  if(!firing)s.castRemaining=0;
  if(firing&&s.cooldown<=0&&s.castRemaining===0&&s.shots.length<35){s.castRemaining=.12;onSound?.('cast',staffPose(s).tip)}
  if(s.castRemaining>0){
    s.castRemaining=Math.max(0,s.castRemaining-dt);
    if(s.castRemaining===0){
      s.castTime=0;
      const {tip}=staffPose(s);
      const dx=s.aim.x-tip.x,dy=s.aim.y-tip.y,length=Math.hypot(dx,dy)||1;
      s.shots.push({x:tip.x,y:tip.y,vx:dx/length*470,vy:dy/length*470,life:3,age:0});
      onSound?.('shot',tip);
      s.cooldown=s.mode==='auto'?.42:.16;
    }
  }
  s.shots=s.shots.filter(shot=>{
    const oldX=shot.x,oldY=shot.y;
    shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;shot.age=(shot.age??0)+dt;
    // Distance to the swept segment prevents fast shots passing through ghosts.
    const dx=shot.x-oldX,dy=shot.y-oldY,length2=dx*dx+dy*dy||1;
    const target=s.ghosts.findIndex(g=>{
      if((g.age??1)<.7)return false;
      const t=clamp(((g.x-oldX)*dx+(g.y-9-oldY)*dy)/length2,0,1);
      return Math.hypot(g.x-oldX-t*dx,g.y-9-oldY-t*dy)<22;
    });
    if(target>=0){const [g]=s.ghosts.splice(target,1);hits.push({x:g.x,y:g.y});s.score++;onSound?.('hit',g);onSound?.('death',g);return false}
    return shot.life>0&&shot.x>-30&&shot.x<s.width+30&&shot.y>0&&shot.y<s.height+30;
  });
  if(s.mode==='manual'&&s.invulnerable===0){
    const touching=s.ghosts.find(g=>(g.age??1)>=.7&&Math.hypot(g.x-s.mage.x,g.y-s.mage.y)<26);
    if(touching){
      s.health--;s.invulnerable=1.25;s.hurtTime=0;onSound?.('hurt',s.mage);
      const dx=touching.x-s.mage.x,dy=touching.y-s.mage.y,length=Math.hypot(dx,dy);
      const nx=length?dx/length:Math.cos(touching.phase),ny=length?dy/length:Math.sin(touching.phase);
      Object.assign(touching,boundPoint({x:touching.x+nx*70,y:touching.y+ny*70},s.width,s.height),{vx:0,vy:0});
      if(s.health===0){s.dead=true;s.deathTime=0;s.moving=false;s.shots=[];s.castRemaining=0;onSound?.('defeat',s.mage)}
    }
  }
  return hits;
}
