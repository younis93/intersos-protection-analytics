export interface Point {x:number;y:number}
export type BossCue='boss-arrive'|'boss-warning'|'boss-strike'|'boss-hit'|'boss-defeat';
export type DefeatSound='defeat'|'defeat-impact'|'defeat-dissolve'|'defeat-shadow';
export type HuntSoundEvent=(kind:'cast'|'shot'|'ghost'|'stalker'|BossCue|CombatSound|DefeatSound|'hit'|'death'|'hurt'|'pickup'|'counter'|'escape',point:Point)=>void;
export const MAGE_CAST_WINDUP=.18;
export const MAGE_CAST_RECOVERY=.22;
const DODGE_DISTANCE=104;
const DODGE_COOLDOWN=1.65;
const ROYAL_VOLLEY_SPEED=610;
export const DODGE_TRAIL_TIME=.24;
export const MAGE_DEFEAT_TIMING={staffFalls:.55,dissolve:.65,specter:1.5} as const;
export const BOSSES=[
  {name:'The Gravekeeper',health:72,ability:'Grave Ward',cooldown:18},
  {name:'The Hex King',health:72,ability:'Hex Burst',cooldown:14},
  {name:'Winged Tyrant',health:96,ability:'Phantom Dash',cooldown:10},
  {name:'Crowned Phantom',health:128,ability:'Royal Volley',cooldown:16},
] as const;
// Boss IDs also identify their abilities, artwork, and audio.
export const BOSS_ORDER=[3,1,2,0] as const;
export const GRAVEKEEPER_HEALTH=BOSSES[0].health;
export const GRAVEKEEPER_SCALE=1.55;
export const PRACTICE_HINTS=[
  'Royal Volley · Press 4 to fire five piercing bolts at the Hex King and its summons.',
  'Hex Burst · Press 2 near the Tyrant after it lands to break its armor.',
  'Phantom Dash · Press 3 to dodge the Gravekeeper’s projectiles.',
];
export const SIEGE_SECONDS=30;
export type Upgrade='vitality'|'focus';
const GRAVEKEEPER_ATTACKS=[
  {kind:'dirt',windup:.9,speed:320,sound:'gravekeeper-shovel'},
  {kind:'skull',windup:1,speed:240,sound:'gravekeeper-skull'},
  {kind:'summon',windup:1.15,speed:0,sound:'gravekeeper-summon'},
] as const;
type GravekeeperAttack=typeof GRAVEKEEPER_ATTACKS[number];
const HEX_KING_MOVES=[
  {kind:'claw',windup:1,radius:110,sound:'hex-claw'},
  {kind:'roar',windup:1.15,radius:0,sound:'hex-roar'},
  {kind:'mist',windup:.85,radius:30,sound:'hex-mist'},
  {kind:'swarm',windup:1.2,radius:0,sound:'hex-swarm'},
] as const;
const TYRANT_MOVES=[
  {kind:'dive',windup:1.05,duration:.35,radius:33,sound:'tyrant-dive'},
  {kind:'fire',windup:.95,duration:.65,radius:245,sound:'tyrant-fire'},
  {kind:'hurricane',windup:1.15,duration:1.55,radius:66,sound:'tyrant-hurricane'},
] as const;
const PHANTOM_MOVES=[
  {kind:'barrage',windup:1.05,radius:0,sound:'phantom-barrage'},
  {kind:'tongue',windup:.8,radius:118,sound:'phantom-tongue'},
  {kind:'scream',windup:1.25,radius:136,sound:'phantom-scream'},
] as const;
const ATTACK_SOUNDS=[...GRAVEKEEPER_ATTACKS,...HEX_KING_MOVES,...TYRANT_MOVES,...PHANTOM_MOVES].map(move=>move.sound);
const BOSS_ATTACK_SOUNDS=new Set<string>([...ATTACK_SOUNDS,'tyrant-slam']);
const ABILITY_SOUNDS=['grave-ward','hex-burst','phantom-dash','royal-volley'] as const;
export type CombatSound=typeof ATTACK_SOUNDS[number]|'tyrant-slam'|typeof ABILITY_SOUNDS[number]|'ward-block'|'mage-dodge';
export const isBossAttackSound=(kind:string)=>BOSS_ATTACK_SOUNDS.has(kind);
export const TYRANT_FIRE_HALF_ANGLE=Math.PI/10;
export const PHANTOM_TONGUE_HALF_ANGLE=Math.PI/5;
export const HEX_CLAW_HALF_ANGLE=Math.PI/3;
export const HEX_SWARM_COUNT=5;
const HEX_SKULL_TARGET_HEIGHT=24;
const HEX_SKULL_HIT_RADIUS=27;
const HEX_SKULL_SPEED=220;
type UndeadKind='skeleton'|'zombie';
interface Gravekeeper extends Point {
  health:number;
  phase:'arrival'|'pursuit'|'warning'|'reveal'|'strike'|'recovery';
  index:number;
  hitFlash:number;
  followup:boolean;
  laneStart?:Point;
  autoEscape?:Point;
  decoys:Point[];
  remaining:number;
  strikes:number;
  target:Point;
  radius:number;
  attack?:GravekeeperAttack;
  summonSites?:Point[];
  hexMove?:typeof HEX_KING_MOVES[number];
  hexHeading?:number;
  dashContact?:boolean;
  tyrantMove?:typeof TYRANT_MOVES[number];
  tyrantHeading?:number;
  tyrantContact?:boolean;
  phantomMove?:typeof PHANTOM_MOVES[number];
  phantomHeading?:number;
}
export type CritterKind='bat'|'eyeball'|'flying-skull';
export type GhostKind=CritterKind|UndeadKind|'drifter'|'circler'|'phantom'|'stalker'|'hex-minion';
export interface Ghost extends Point {id:number;phase:number;kind?:GhostKind;age?:number;vx?:number;vy?:number;facing?:1|-1}

export function ghostBehavior(ghost:Ghost){
  const age=ghost.age??1;
  if(ghost.kind==='stalker'&&age<3)return 'watching';
  if(ghost.kind==='phantom'&&age>=2.7){
    const cycle=(age-2.7)%5;
    if(cycle<.45)return 'fading';
    if(cycle<1.05)return 'hidden';
    if(cycle<1.65)return 'returning';
  }
  return 'active';
}

function ghostIsTangible(ghost:Ghost){
  return (ghost.age??1)>=.7&&ghostBehavior(ghost)==='active';
}

function spawnKind(s:HuntState):GhostKind|undefined{
  const slot=s.nextId%6;
  // Test lineup: cycle all three critters in from the first wave.
  if(slot===4)return 'flying-skull';
  if(slot===2)return 'eyeball';
  if(slot===0)return 'bat';
  if(s.mode!=='manual'||s.manualTime<12)return;
  if(s.manualTime>=30&&s.nextId%4===0&&!s.ghosts.some(g=>g.kind==='stalker'))return 'stalker';
  const variants=['drifter','circler','phantom'] as const;
  return variants[s.nextId%variants.length];
}
export interface Shot extends Point {vx:number;vy:number;life:number;age?:number;piercing?:boolean;bossHit?:boolean;kind?:'dirt'|'skull'|'hex-skull'|'royal-bolt'|'royal-skull'|'phantom-face'}
export interface HuntInput {keys:ReadonlySet<string>;aim:Point;firing:boolean}
export interface HuntState {
  width:number;height:number;mage:Point;aim:Point;mode:'auto'|'manual';
  ghosts:Ghost[];shots:Shot[];score:number;time:number;manualTime:number;cooldown:number;nextId:number;
  facing:1|-1;staffAngle:number;castTime:number;castRemaining:number;walkPhase:number;moving:boolean;
  health:number;dead:boolean;deathTime:number;invulnerable:number;hurtTime:number;spawnIn:number;
  boss:Gravekeeper|null;bossDefeated:boolean;
  defeated:number;drop:(Point&{index:number})|null;nextBossAt:number;rewardPending:boolean;maxHealth:number;focus:number;
  abilities:number[];ward:number;abilityFlash:number;lastAbility:number;dashTrail?:{start:Point;end:Point};
  dodgeCooldown:number;dodgeTrail?:{start:Point;end:Point;remaining:number};
  practice:boolean;siegeUntil:number|null;won:boolean;counterTime:number;counters:number;counterText:string;
  bolts:Shot[];fallenBoss:Gravekeeper|null;fallenTime:number;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function boundPoint(p:Point,width:number,height:number):Point {
  return {x:clamp(p.x,30,Math.max(30,width-30)),y:clamp(p.y,110,Math.max(110,height-65))};
}
export function createHunt(width:number,height:number):HuntState {
  return {width,height,mage:boundPoint({x:width<=900?width-55:110,y:height-(width<=900?68:165)},width,height),aim:{x:width/2,y:height/2},
    mode:'auto',ghosts:[],shots:[],score:0,time:0,manualTime:0,cooldown:0,nextId:0,
    facing:1,staffAngle:-.5,castTime:100,castRemaining:0,walkPhase:0,moving:false,dodgeCooldown:0,
    health:3,dead:false,deathTime:0,invulnerable:1.5,hurtTime:100,spawnIn:1,boss:null,bossDefeated:false,defeated:0,drop:null,nextBossAt:60,rewardPending:false,maxHealth:3,focus:0,abilities:[],ward:0,abilityFlash:0,lastAbility:-1,practice:false,siegeUntil:null,won:false,counterTime:0,counters:0,counterText:'',bolts:[],fallenBoss:null,fallenTime:0};
}
export function resizeHunt(s:HuntState,width:number,height:number){
  s.width=width;s.height=height;s.mage=boundPoint(s.mage,width,height);
  s.ghosts.forEach(g=>Object.assign(g,boundPoint(g,width,height)));
  if(s.drop)Object.assign(s.drop,boundPoint(s.drop,width,height));
  if(s.boss){
    Object.assign(s.boss,boundPoint(s.boss,width,height));
    s.boss.target=boundPoint(s.boss.target,width,height);
    s.boss.autoEscape=undefined;
    if(s.boss.laneStart)s.boss.laneStart=boundPoint(s.boss.laneStart,width,height);
    s.boss.decoys=s.boss.decoys.map(point=>boundPoint(point,width,height));
    if(s.boss.summonSites)s.boss.summonSites=s.boss.summonSites.map(point=>boundPoint(point,width,height));
  }
}
export function controlHunt(s:HuntState,mode:HuntState['mode']){Object.assign(s,createHunt(s.width,s.height),{mode,dodgeTrail:undefined})}
/** Hand off the live scene. Only explicit Retry/post-defeat uses controlHunt's reset. */
export function handoffHunt(s:HuntState,mode:HuntState['mode']){
  if(s.dead||s.mode===mode)return;
  s.mode=mode;
  if(mode==='manual')s.invulnerable=Math.max(s.invulnerable,1);
}
/** Facing follows the target, never separation velocity. Retain direction inside the dead zone. */
export function ghostFacing(dx:number,previous:1|-1=dx<0?-1:1):1|-1{return dx>12?1:dx< -12?-1:previous}
/** Manual pressure rises in 20-second steps. Autoplay uses a fixed pace.
 */
export function huntDifficulty(time:number,mode:HuntState['mode']='manual'){
  if(mode==='auto')return {level:0,maxGhosts:6,speed:86,spawnInterval:.85};
  const level=Math.min(4,Math.floor(Math.max(0,time)/20));
  return {level,maxGhosts:4+level*2,speed:100+level*16,spawnInterval:1.15-level*.16};
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
  const charge=s.castRemaining>0?1-s.castRemaining/MAGE_CAST_WINDUP:0;
  const recoil=Math.max(0,1-s.castTime/MAGE_CAST_RECOVERY);
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

export function chooseUpgrade(s:HuntState,choice:Upgrade){
  if(!s.rewardPending)return false;
  if(choice==='vitality'&&s.maxHealth<6){s.maxHealth++;s.health++}
  else if(choice==='focus'&&s.focus<3)s.focus++;
  else if(s.maxHealth===6&&s.focus===3)s.health=Math.min(s.maxHealth,s.health+1);
  else return false;
  s.rewardPending=false;
  s.nextBossAt=s.time+25;
  s.practice=s.defeated>0&&s.defeated<BOSSES.length;
  if(s.defeated===BOSSES.length){
    s.siegeUntil=s.time+SIEGE_SECONDS;
    s.abilities=s.abilities.map(()=>0);
    s.invulnerable=Math.max(s.invulnerable,2);
    s.spawnIn=.35;
  }
  return true;
}

export function escapePoint(s:Pick<HuntState,'width'|'height'>):Point{
  return boundPoint({x:s.width/2,y:125},s.width,s.height);
}

function openBoss(s:HuntState,text:string,onSound?:HuntSoundEvent){
  const boss=s.boss;
  if(!boss)return;
  boss.phase='recovery';boss.remaining=2.5;boss.decoys=[];
  s.counterTime=2.5;s.counters++;s.counterText=text;
  onSound?.('counter',boss);
}

function damageBoss(s:HuntState,damage:number,onSound?:HuntSoundEvent){
  const boss=s.boss;
  if(!boss||boss.phase==='arrival'||boss.decoys.length)return;
  const point={x:boss.x,y:boss.y-22*(boss.index===0?GRAVEKEEPER_SCALE:1)};
  boss.hitFlash=.18;
  boss.health=Math.max(0,boss.health-damage*(boss.phase==='recovery'?2:1));
  if(boss.health){onSound?.('boss-hit',point);return}
  s.fallenBoss=boss;s.fallenTime=1.1;s.boss=null;s.bolts=[];
  if(boss.index===0)s.ghosts=s.ghosts.filter(ghost=>ghost.kind!=='skeleton'&&ghost.kind!=='zombie');
  if(boss.index===1)s.ghosts=s.ghosts.filter(ghost=>ghost.kind!=='hex-minion');
  s.counterTime=0;
  s.defeated++;s.bossDefeated=true;s.score+=10;
  s.drop={...boundPoint(boss,s.width,s.height),index:boss.index};s.castRemaining=0;s.shots=[];s.invulnerable=Math.max(1.5,s.invulnerable);
  onSound?.('boss-defeat',point);
}

export function useAbility(s:HuntState,index:number,direction?:Point,onSound?:HuntSoundEvent){
  if(s.dead||s.won||s.drop||s.rewardPending||s.abilities[index]!==0)return false;
  const dx=direction?.x??s.aim.x-s.mage.x,dy=direction?.y??s.aim.y-s.mage.y;
  const angle=dx||dy?Math.atan2(dy,dx):s.facing===1?0:Math.PI;
  if(index===0)s.ward=4;
  if(index===1){
    s.bolts=s.bolts.filter(bolt=>bolt.kind==='phantom-face'||Math.hypot(bolt.x-s.mage.x,bolt.y-s.mage.y)>100);
    s.ghosts=s.ghosts.filter(g=>{
      if(!ghostIsTangible(g)||Math.hypot(g.x-s.mage.x,g.y-s.mage.y)>155)return true;
      s.score++;onSound?.('death',g);return false;
    });
    if(s.boss&&Math.hypot(s.boss.x-s.mage.x,s.boss.y-s.mage.y)<=155){
      if(s.boss.index===2&&s.boss.phase==='recovery')openBoss(s,'Armor broken',onSound);
      damageBoss(s,8,onSound);
    }
  }
  if(index===2){
    const start=s.mage;
    const end=boundPoint({x:start.x+140*Math.cos(angle),y:start.y+140*Math.sin(angle)},s.width,s.height);
    if(Math.hypot(end.x-start.x,end.y-start.y)<8)return false;
    s.mage=end;
    s.dashTrail={start,end:s.mage};
    s.invulnerable=Math.max(s.invulnerable,.45);
    const count=s.bolts.length;
    s.bolts=s.bolts.filter(bolt=>bolt.kind==='phantom-face'||segmentDistance(bolt,start,end.x-start.x,end.y-start.y)>26);
    if(s.boss?.index===3&&count>s.bolts.length)openBoss(s,'Phantom exposed',onSound);
  }
  if(index===3){
    const tip=staffPose(s).tip;
    for(let i=-2;i<=2;i++){
      const heading=angle+i*.16;
      s.shots.push({...tip,vx:ROYAL_VOLLEY_SPEED*Math.cos(heading),vy:ROYAL_VOLLEY_SPEED*Math.sin(heading),life:2,piercing:true,kind:i%2?'royal-skull':'royal-bolt'});
    }
  }
  s.abilities[index]=BOSSES[index].cooldown*(1-.1*s.focus);
  s.lastAbility=index;s.abilityFlash=.45;
  onSound?.(ABILITY_SOUNDS[index],s.mage);
  return true;
}

function segmentDistance(point:Point,start:Point,dx:number,dy:number){
  const x=point.x-start.x,y=point.y-start.y;
  const t=clamp((x*dx+y*dy)/(dx*dx+dy*dy||1),0,1);
  return Math.hypot(x-dx*t,y-dy*t);
}

export function dodgeMage(s:HuntState,direction:Point,onSound?:HuntSoundEvent){
  if(s.dead||s.won||s.drop||s.rewardPending||s.dodgeCooldown>0)return false;
  const start=s.mage;
  const length=Math.hypot(direction.x,direction.y)||1;
  const end=boundPoint({x:start.x+DODGE_DISTANCE*direction.x/length,y:start.y+DODGE_DISTANCE*direction.y/length},s.width,s.height);
  if(Math.hypot(end.x-start.x,end.y-start.y)<8)return false;
  s.mage=end;
  if(Math.abs(end.x-start.x)>1)s.facing=end.x>start.x?1:-1;
  s.dodgeCooldown=DODGE_COOLDOWN;
  s.dodgeTrail={start,end,remaining:DODGE_TRAIL_TIME};
  s.invulnerable=Math.max(s.invulnerable,.32);
  onSound?.('mage-dodge',end);
  return true;
}

export function bossZoneDistance(point:Point,boss:Gravekeeper){
  const hexClaw=boss.hexMove?.kind==='claw';
  const tongue=boss.phantomMove?.kind==='tongue';
  if(hexClaw||tongue||boss.tyrantMove?.kind==='fire'){
    const heading=(hexClaw?boss.hexHeading:tongue?boss.phantomHeading:boss.tyrantHeading)??0;
    const half=hexClaw?HEX_CLAW_HALF_ANGLE:tongue?PHANTOM_TONGUE_HALF_ANGLE:TYRANT_FIRE_HALF_ANGLE;
    const dx=point.x-boss.x,dy=point.y-boss.y;
    const along=dx*Math.cos(heading)+dy*Math.sin(heading);
    const across=Math.abs(dy*Math.cos(heading)-dx*Math.sin(heading));
    const edge=across*Math.cos(half)-along*Math.sin(half);
    return Math.max(Math.hypot(dx,dy),boss.radius+edge);
  }
  if(boss.tyrantMove?.kind==='hurricane')return Math.hypot(point.x-boss.target.x,point.y-boss.target.y);
  if(boss.phantomMove?.kind==='scream')return Math.hypot(point.x-boss.x,point.y-boss.y);
  if(!boss.laneStart){
    const x=Math.abs(point.x-boss.target.x),y=Math.abs(point.y-boss.target.y);
    if(boss.index===0)return Math.max(x,y);
    return Math.max(x,y,(x+y)/1.55);
  }
  const start=boss.laneStart;
  const dx=boss.target.x-start.x,dy=boss.target.y-start.y;
  const t=clamp(((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy||1),0,1);
  return Math.hypot(point.x-start.x-dx*t,point.y-start.y-dy*t);
}

export function phantomBoltSpread(boss:Pick<Gravekeeper,'strikes'>){
  return boss.strikes%2===0?.23:.14;
}

export function phantomBarrageOrigin(boss:Gravekeeper):Point{
  return {x:boss.x+(boss.target.x<boss.x?-15:15),y:boss.y-44};
}

export function gravekeeperAttackOrigin(boss:Gravekeeper):Point{
  const facing=boss.target.x<boss.x?-1:1;
  const [x,y]=boss.attack?.kind==='skull'?[27,24]:[34,19];
  return {x:boss.x+facing*x*GRAVEKEEPER_SCALE,y:boss.y-y*GRAVEKEEPER_SCALE};
}

function releaseGravekeeperAttack(s:HuntState,boss:Gravekeeper){
  const attack=boss.attack;
  if(!attack)return;
  if(attack.kind==='summon'){
    const kinds=['skeleton','zombie'] as const;
    boss.summonSites?.forEach((site,index)=>{
      const kind=kinds[index];
      if(s.ghosts.some(ghost=>ghost.kind===kind))return;
      s.ghosts.push({...site,kind,id:s.nextId++,age:0,phase:0,facing:ghostFacing(s.mage.x-site.x),vx:0,vy:0});
    });
    return;
  }
  const origin=gravekeeperAttackOrigin(boss);
  const dx=boss.target.x-origin.x,dy=boss.target.y-origin.y;
  const angle=dx||dy?Math.atan2(dy,dx):0;
  s.bolts.push({...origin,kind:attack.kind,vx:attack.speed*Math.cos(angle),vy:attack.speed*Math.sin(angle),life:3});
}

function leadMage(s:HuntState,previous:Point,dt:number){
  const lead=dt>0?.24/dt:0;
  return boundPoint({
    x:s.mage.x+(s.mage.x-previous.x)*lead,
    y:s.mage.y+(s.mage.y-previous.y)*lead,
  },s.width,s.height);
}

function flankMage(s:HuntState,boss:Gravekeeper,offsets:number[]){
  const heading=Math.atan2(boss.target.y-boss.y,boss.target.x-boss.x);
  const forwardX=Math.cos(heading),forwardY=Math.sin(heading);
  return offsets.map(offset=>boundPoint({
    x:boss.target.x+forwardX*32-forwardY*offset,
    y:boss.target.y+forwardY*32+forwardX*offset,
  },s.width,s.height));
}

function prepareGravekeeperMove(s:HuntState,boss:Gravekeeper,previous:Point,dt:number){
  const [dirt,skull,summon]=GRAVEKEEPER_ATTACKS;
  const distance=Math.hypot(s.mage.x-boss.x,s.mage.y-boss.y);
  const hasSummonRoom=!s.ghosts.some(g=>g.kind==='skeleton')||!s.ghosts.some(g=>g.kind==='zombie');
  const move=distance<=180?dirt:distance<=330&&hasSummonRoom?summon:skull;
  boss.attack=move;
  boss.remaining=move.windup;
  if(move===summon)boss.summonSites=flankMage(s,boss,[-82,82]);
  else{
    boss.summonSites=undefined;
    boss.target=leadMage(s,previous,dt);
  }
}

function prepareHexMove(s:HuntState,boss:Gravekeeper,previous:Point,dt:number){
  const [claw,roar,mist,swarm]=HEX_KING_MOVES;
  const dashReach=180;
  const dx=s.mage.x-boss.x,dy=s.mage.y-boss.y;
  const distance=Math.hypot(dx,dy);
  const minions=s.ghosts.filter(ghost=>ghost.kind==='hex-minion').length;
  const move=distance<=claw.radius?claw:distance<=dashReach+mist.radius?mist:
    distance<=330&&minions<2?roar:swarm;
  if(move===mist||move===swarm)boss.target=leadMage(s,previous,dt);
  const heading=Math.atan2(boss.target.y-boss.y,boss.target.x-boss.x);
  boss.hexMove=move;
  boss.hexHeading=heading;
  boss.remaining=move.windup;
  boss.radius=move.radius;
  boss.dashContact=false;
  boss.summonSites=undefined;
  if(move.kind==='mist'){
    const reach=Math.min(Math.hypot(boss.target.x-boss.x,boss.target.y-boss.y),dashReach);
    boss.laneStart={x:boss.x,y:boss.y};
    boss.target={x:boss.x+Math.cos(heading)*reach,y:boss.y+Math.sin(heading)*reach};
  }
  if(move.kind==='roar')boss.summonSites=flankMage(s,boss,[-82,82].slice(0,2-minions));
}

function summonHexGhosts(s:HuntState,boss:Gravekeeper){
  const living=s.ghosts.filter(ghost=>ghost.kind==='hex-minion').length;
  for(const site of boss.summonSites?.slice(0,Math.max(0,2-living))??[]){
    s.ghosts.push({...site,kind:'hex-minion',id:s.nextId++,phase:0,age:0,facing:ghostFacing(s.mage.x-site.x),vx:0,vy:0});
  }
}

export function hexSwarmOrbit(s:Pick<HuntState,'width'|'height'>,boss:Gravekeeper,index:number,remaining:number):Point{
  const progress=1-clamp(remaining/1.2,0,1);
  const angle=index*Math.PI*2/HEX_SWARM_COUNT+progress*Math.PI*2;
  const radius=48+42*progress;
  return {x:clamp(boss.x+Math.cos(angle)*radius,12,s.width-12),
    y:clamp(boss.y-32+Math.sin(angle)*radius*.68,12,s.height-12)};
}

function releaseHexSwarm(s:HuntState,boss:Gravekeeper){
  for(let i=0;i<HEX_SWARM_COUNT;i++){
    const origin=hexSwarmOrbit(s,boss,i,0);
    const angle=Math.atan2(boss.target.y-HEX_SKULL_TARGET_HEIGHT-origin.y,boss.target.x-origin.x)+(i-2)*.15;
    s.bolts.push({...origin,kind:'hex-skull',vx:HEX_SKULL_SPEED*Math.cos(angle),vy:HEX_SKULL_SPEED*Math.sin(angle),life:5,age:0});
  }
}

function steerHexSkull(bolt:Shot,target:Point,dt:number){
  bolt.age=(bolt.age??0)+dt;
  if(bolt.age<.13||bolt.age>2.13)return;
  const heading=Math.atan2(bolt.vy,bolt.vx);
  const turn=Math.atan2(target.y-bolt.y,target.x-bolt.x)-heading;
  const delta=Math.atan2(Math.sin(turn),Math.cos(turn));
  const angle=heading+clamp(delta,-1.65*dt,1.65*dt);
  bolt.vx=HEX_SKULL_SPEED*Math.cos(angle);bolt.vy=HEX_SKULL_SPEED*Math.sin(angle);
}

function prepareTyrantMove(s:HuntState,boss:Gravekeeper,previous:Point,dt:number){
  const [dive,fire,hurricane]=TYRANT_MOVES;
  const distance=Math.hypot(s.mage.x-boss.x,s.mage.y-boss.y);
  const move=distance<=125?dive:distance<=fire.radius?fire:hurricane;
  boss.target=leadMage(s,previous,dt);
  boss.tyrantMove=move;
  boss.tyrantHeading=Math.atan2(boss.target.y-boss.y,boss.target.x-boss.x);
  boss.tyrantContact=false;
  boss.remaining=move.windup;
  boss.radius=move.radius;
  if(move.kind!=='dive')boss.laneStart=undefined;
}

function preparePhantomMove(s:HuntState,boss:Gravekeeper){
  const [barrage,tongue,scream]=PHANTOM_MOVES;
  const distance=Math.hypot(s.mage.x-boss.x,s.mage.y-boss.y);
  const move=distance<=90?tongue:distance<=scream.radius?scream:barrage;
  boss.phantomMove=move;boss.remaining=move.windup;boss.radius=move.radius;
  boss.phantomHeading=Math.atan2(s.mage.y-boss.y,s.mage.x-boss.x);
  if(move!==barrage)return;
  const candidates=[{x:s.width*.25,y:s.height*.35},{x:s.width*.75,y:s.height*.35},{x:s.width*.5,y:s.height*.68}]
    .map(point=>boundPoint(point,s.width,s.height));
  const distanceToMage=(point:Point)=>Math.hypot(point.x-s.mage.x,point.y-s.mage.y);
  const real=candidates.reduce((closest,point)=>distanceToMage(point)<distanceToMage(closest)?point:closest);
  boss.x=real.x;boss.y=real.y;
  boss.decoys=candidates.filter(point=>point!==real);
}

function tyrantHazardHit(s:HuntState,boss:Gravekeeper){
  if(boss.tyrantContact||!boss.tyrantMove||boss.tyrantMove.kind==='dive'||bossZoneDistance(s.mage,boss)>boss.radius)return false;
  boss.tyrantContact=true;
  return true;
}

function stepGravekeeper(s:HuntState,dt:number,previous:Point,onSound?:HuntSoundEvent):boolean{
  if(!s.boss&&s.defeated<BOSSES.length&&s.time>=s.nextBossAt){
    const {width,height,mage}=s;
    const point=boundPoint({x:mage.x<width/2?width-30:30,y:mage.y<height/2?height-65:110},width,height);
    const index=BOSS_ORDER[s.defeated];
    s.boss={...point,index,health:BOSSES[index].health,phase:'arrival',remaining:2,strikes:0,target:point,radius:0,followup:false,decoys:[],hitFlash:0};
    if(s.practice)s.abilities=s.abilities.map(()=>0);
    s.practice=false;
    s.bossDefeated=false;
    onSound?.('boss-arrive',point);
  }
  const boss=s.boss;
  if(!boss)return false;
  const enraged=boss.health<=BOSSES[boss.index].health/2;
  boss.hitFlash=Math.max(0,boss.hitFlash-dt);
  boss.remaining-=dt;
  if(boss.phase==='pursuit'){
    const dx=s.mage.x-boss.x,dy=s.mage.y-boss.y,distance=Math.hypot(dx,dy);
    const speed=[91,77,126,90][boss.index];
    if(distance>50){
      const fraction=Math.min(speed*dt,distance-50)/distance;
      boss.x+=dx*fraction;boss.y+=dy*fraction;
    }
  }
  let chargeHit=false;
  const tyrantHazard=boss.index===2&&boss.tyrantMove?.kind!=='dive'?boss.tyrantMove:undefined;
  if(boss.phase==='strike'&&boss.laneStart){
    const start=boss.laneStart;
    const from={x:boss.x,y:boss.y};
    const progress=1-clamp(boss.remaining/.35,0,1);
    boss.x=start.x+(boss.target.x-start.x)*progress;
    boss.y=start.y+(boss.target.y-start.y)*progress;
    chargeHit=bossZoneDistance(s.mage,{...boss,laneStart:from,target:boss})<=boss.radius;
    if(boss.hexMove?.kind==='mist'){
      if(boss.dashContact)chargeHit=false;
      if(chargeHit)boss.dashContact=true;
    }
  }
  if(tyrantHazard&&boss.phase==='strike')chargeHit=tyrantHazardHit(s,boss);
  if(boss.remaining>0)return chargeHit;
  switch(boss.phase){
    case 'arrival':
    case 'recovery':
      boss.phase='pursuit';boss.remaining=enraged?.85:1.65;
      return false;
    case 'strike':
      if(boss.index!==2||boss.followup||tyrantHazard){
        boss.phase='recovery';boss.remaining=1.3;
        return (boss.index===1||Boolean(tyrantHazard))&&chargeHit;
      }
      boss.followup=true;
      boss.autoEscape=undefined;boss.phase='warning';boss.remaining=1;
      boss.laneStart=undefined;
      boss.target={x:boss.x,y:boss.y};
      boss.radius=116;
      onSound?.('boss-warning',boss.target);
      return chargeHit;
    case 'pursuit':
      boss.followup=false;
      boss.autoEscape=undefined;boss.phase='warning';boss.remaining=1.05;
      boss.radius=boss.index===2?33:0;
      boss.target={...s.mage};
      boss.laneStart=boss.index===2?{x:boss.x,y:boss.y}:undefined;
      if(boss.index===0)prepareGravekeeperMove(s,boss,previous,dt);
      if(boss.index===1)prepareHexMove(s,boss,previous,dt);
      if(boss.index===2)prepareTyrantMove(s,boss,previous,dt);
      if(boss.index===3)preparePhantomMove(s,boss);
      onSound?.('boss-warning',boss.target);
      return false;
    case 'warning':
      if(boss.index===3&&(!boss.phantomMove||boss.phantomMove.kind==='barrage')){
        boss.decoys=[];boss.phase='reveal';boss.remaining=.52;
        boss.target=leadMage(s,previous,dt);
        boss.phantomHeading=Math.atan2(boss.target.y-boss.y,boss.target.x-boss.x);
        onSound?.('boss-warning',boss);
        return false;
      }
      // The ground attack resolves only after the warning expires.
    case 'reveal': {
      const spread=phantomBoltSpread(boss);
      boss.phase='strike';boss.remaining=.35;boss.strikes++;
      if(boss.index===0){
        releaseGravekeeperAttack(s,boss);
        const origin=boss.attack?.speed?gravekeeperAttackOrigin(boss):boss;
        onSound?.(boss.attack?.sound??'boss-strike',origin);
        return false;
      }
      if(boss.index===1){
        if(boss.hexMove?.kind==='roar')summonHexGhosts(s,boss);
        if(boss.hexMove?.kind==='swarm')releaseHexSwarm(s,boss);
        onSound?.(boss.hexMove?.sound??'boss-strike',boss);
        return boss.hexMove?.kind==='claw'&&bossZoneDistance(s.mage,boss)<=boss.radius;
      }
      if(tyrantHazard){
        boss.remaining=tyrantHazard.duration;
        onSound?.(tyrantHazard.sound,tyrantHazard.kind==='fire'?boss:boss.target);
        return tyrantHazardHit(s,boss);
      }
      const lane=Boolean(boss.laneStart);
      const hit=!lane&&boss.radius>0&&bossZoneDistance(s.mage,boss)<=boss.radius;
      if(boss.index===3){
        boss.decoys=[];
        if(boss.phantomMove?.kind==='tongue'){
          onSound?.(boss.phantomMove.sound,boss);
          return hit;
        }
        if(boss.phantomMove?.kind==='scream'){
          for(let i=0;i<8;i++){
            const heading=(boss.phantomHeading??0)+i*Math.PI/4;
            const dx=Math.cos(heading),dy=Math.sin(heading);
            s.bolts.push({x:boss.x+dx*42,y:boss.y+dy*42,vx:220*dx,vy:220*dy,life:1.35,kind:'phantom-face'});
          }
          onSound?.(boss.phantomMove.sound,boss);
          return hit;
        }
        const origin=phantomBarrageOrigin(boss);
        const angle=Math.atan2(boss.target.y-origin.y,boss.target.x-origin.x);
        for(let i=-2;i<=2;i++){
          const heading=angle+i*spread;
          s.bolts.push({...origin,vx:300*Math.cos(heading),vy:300*Math.sin(heading),life:3,kind:i%2?'royal-skull':'royal-bolt'});
        }
        onSound?.(boss.phantomMove?.sound??'phantom-barrage',origin);
        return false;
      }
      onSound?.(boss.index===2?(boss.followup?'tyrant-slam':'tyrant-dive'):'boss-strike',lane?boss:boss.target);
      return hit;
    }
  }
}

function boltClearance(point:Point,bolt:Shot,horizon:number){
  const hex=bolt.kind==='hex-skull';
  const target=hex?{x:point.x,y:point.y-HEX_SKULL_TARGET_HEIGHT}:point;
  const time=Math.min(horizon,Math.max(0,bolt.life));
  return segmentDistance(target,bolt,bolt.vx*time,bolt.vy*time)-(hex?HEX_SKULL_HIT_RADIUS:18);
}

function threatClearance(s:HuntState,point:Point,horizon:number){
  let clearance=75;
  const boss=s.boss;
  if(boss&&(boss.phase==='warning'||boss.phase==='strike')&&boss.radius>0){
    clearance=Math.min(clearance,bossZoneDistance(point,boss)-boss.radius);
  }
  for(const ghost of s.ghosts){
    if(ghostIsTangible(ghost)){
      clearance=Math.min(clearance,Math.hypot(point.x-ghost.x-(ghost.vx??0)*horizon,point.y-ghost.y-(ghost.vy??0)*horizon)-26);
    }
  }
  for(const bolt of s.bolts)clearance=Math.min(clearance,boltClearance(point,bolt,horizon));
  return clearance;
}

function saferPosition(s:HuntState,distance:number){
  let best={point:s.mage,direction:{x:0,y:0}};
  let bestScore=threatClearance(s,s.mage,.3);
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    const direction={x:Math.cos(angle),y:Math.sin(angle)};
    const point=boundPoint({x:s.mage.x+direction.x*distance,y:s.mage.y+direction.y*distance},s.width,s.height);
    const score=threatClearance(s,point,.3);
    if(score>bestScore+1){best={point,direction};bestScore=score}
  }
  return best;
}

function steerAutoplay(s:HuntState,dt:number){
  const compact=s.width<=900;
  const patrol=boundPoint({
    x:s.width*(.5+.27*Math.sin(s.time*.42)),
    y:s.height*(compact?.77:.71)+Math.sin(s.time*.71)*s.height*.12,
  },s.width,s.height);
  let vx=patrol.x-s.mage.x,vy=patrol.y-s.mage.y;
  const distance=Math.hypot(vx,vy);
  if(distance>70){vx*=70/distance;vy*=70/distance}
  let target:Ghost|undefined,targetDistance=Infinity;
  for(const ghost of s.ghosts){
    const dx=ghost.x-s.mage.x,dy=ghost.y-s.mage.y;
    const range=Math.hypot(dx,dy);
    if(!ghostIsTangible(ghost))continue;
    if(range<targetDistance){target=ghost;targetDistance=range}
    if(range<145&&range>0){
      const force=(145-range)*1.55/range;
      vx-=dx*force;vy-=dy*force;
    }
  }
  const boss=s.boss;
  if(boss?.phase==='warning'&&boss.radius>0&&!boss.autoEscape&&bossZoneDistance(s.mage,boss)<boss.radius+18){
    // Commit to one route for this spell so adjacent escape directions cannot trade places each frame.
    boss.autoEscape=saferPosition(s,180).point;
  }
  for(const bolt of s.bolts){
    const speed=Math.hypot(bolt.vx,bolt.vy);
    if(!speed)continue;
    const dx=s.mage.x-bolt.x,dy=s.mage.y-bolt.y;
    const ahead=(dx*bolt.vx+dy*bolt.vy)/speed;
    const side=(dy*bolt.vx-dx*bolt.vy)/speed;
    if(ahead>0&&ahead<speed*.42&&Math.abs(side)<35){
      const direction=side<0?-1:1;
      vx-=direction*bolt.vy/speed*150;vy+=direction*bolt.vx/speed*150;
    }
  }
  const escape=boss?.phase==='warning'||boss?.phase==='strike'?boss.autoEscape:undefined;
  if(escape){
    const dx=escape.x-s.mage.x,dy=escape.y-s.mage.y;
    const scale=Math.min(1,195*dt/(Math.hypot(dx,dy)||1));
    s.mage=boundPoint({x:s.mage.x+dx*scale,y:s.mage.y+dy*scale},s.width,s.height);
  }else{
    const speed=Math.hypot(vx,vy)||1;
    const scale=Math.min(1,(boss?158:125)/speed)*dt;
    s.mage=boundPoint({x:s.mage.x+vx*scale,y:s.mage.y+vy*scale},s.width,s.height);
  }
  if(boss&&boss.phase!=='arrival'&&!boss.decoys.length&&(targetDistance>95||boss.phase==='recovery')){
    s.aim={x:boss.x,y:boss.y-22*(boss.index===0?GRAVEKEEPER_SCALE:1)};
    return true;
  }
  if(target){
    const lead=Math.min(.65,targetDistance/470);
    s.aim={x:target.x+(target.vx??0)*lead,y:target.y-9+(target.vy??0)*lead};
  }
  return target!==undefined;
}

function walkMage(s:HuntState,dx:number,dy:number,speed:number,dt:number){
  const distance=Math.hypot(dx,dy);
  const scale=distance?Math.min(1,speed*dt/distance):0;
  const previous=s.mage;
  s.mage=boundPoint({x:previous.x+dx*scale,y:previous.y+dy*scale},s.width,s.height);
  const travel=Math.hypot(s.mage.x-previous.x,s.mage.y-previous.y);
  s.moving=travel>.01;
  s.walkPhase+=travel*.09;
  if(Math.abs(s.mage.x-previous.x)>.01)s.facing=s.mage.x>previous.x?1:-1;
}

export function movementVector(keys:ReadonlySet<string>){
  return {
    x:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),
    y:Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup')),
  };
}

function useAutoplayAbilities(s:HuntState,exitOpen:boolean,onSound?:HuntSoundEvent){
  const boss=s.boss;
  const danger=boss?.phase==='warning'&&boss.radius>0&&boss.remaining<.28&&bossZoneDistance(s.mage,boss)<boss.radius+8;
  const nearby=s.ghosts.filter(g=>ghostIsTangible(g)&&Math.hypot(g.x-s.mage.x,g.y-s.mage.y)<=155);
  const contact=nearby.some(g=>Math.hypot(g.x-s.mage.x,g.y-s.mage.y)<32);
  const incoming=s.bolts.find(bolt=>boltClearance(s.mage,bolt,.24)<8);
  if(boss?.index===3&&s.abilities[2]===0){
    // Cross a barrage bolt only if the landing area is clear of the rest of the attack.
    const bolt=s.bolts.find(bolt=>bolt.kind!=='phantom-face'&&Math.hypot(bolt.x-s.mage.x,bolt.y-s.mage.y)<120);
    if(bolt){
      const dx=bolt.x-s.mage.x,dy=bolt.y-s.mage.y,length=Math.hypot(dx,dy)||1;
      const landing=boundPoint({x:s.mage.x+140*dx/length,y:s.mage.y+140*dy/length},s.width,s.height);
      if(threatClearance(s,landing,.28)>12&&useAbility(s,2,{x:dx,y:dy},onSound))return;
    }
  }
  if(!s.practice&&!exitOpen&&s.invulnerable===0&&(danger||contact||incoming)){
    if(s.dodgeCooldown===0||s.abilities[2]===0){
      const {point,direction}=saferPosition(s,s.dodgeCooldown===0?DODGE_DISTANCE:140);
      if(point!==s.mage&&(dodgeMage(s,direction,onSound)||useAbility(s,2,direction,onSound))){
        if(boss?.autoEscape)boss.autoEscape=s.mage;
        return;
      }
    }
    if(!s.ward&&useAbility(s,0,undefined,onSound))return;
  }
  const vulnerable=boss&&boss.phase!=='arrival'&&!boss.decoys.length;
  const canClearBolt=incoming&&incoming.kind!=='phantom-face'&&Math.hypot(incoming.x-s.mage.x,incoming.y-s.mage.y)<=100;
  if((nearby.length>=2||contact||canClearBolt||vulnerable&&Math.hypot(boss.x-s.mage.x,boss.y-s.mage.y)<=155)
    &&useAbility(s,1,undefined,onSound))return;
  if(s.abilities[3]!==0)return;
  if(vulnerable&&Math.hypot(boss.x-s.mage.x,boss.y-s.mage.y)<900){
    useAbility(s,3,{x:boss.x-s.mage.x,y:boss.y-s.mage.y-22*(boss.index===0?GRAVEKEEPER_SCALE:1)},onSound);
    return;
  }
  const ghost=nearby.reduce<Ghost|undefined>((best,g)=>!best||Math.hypot(g.x-s.mage.x,g.y-s.mage.y)<Math.hypot(best.x-s.mage.x,best.y-s.mage.y)?g:best,undefined);
  if(ghost){
    const lead=Math.hypot(ghost.x-s.mage.x,ghost.y-s.mage.y)/ROYAL_VOLLEY_SPEED;
    useAbility(s,3,{x:ghost.x-s.mage.x+(ghost.vx??0)*lead,y:ghost.y-s.mage.y-9+(ghost.vy??0)*lead},onSound);
  }
}

export function stepHunt(s:HuntState,input:HuntInput,elapsed:number,random= Math.random,onSound?:HuntSoundEvent):Point[] {
  const dt=clamp(elapsed,0,1/30),hits:Point[]=[];
  if(s.won)return hits;
  if(s.dead){
    const previous=s.deathTime;
    s.deathTime+=dt;
    const {staffFalls,dissolve,specter}=MAGE_DEFEAT_TIMING;
    if(previous<staffFalls&&s.deathTime>=staffFalls)onSound?.('defeat-impact',s.mage);
    if(previous<dissolve&&s.deathTime>=dissolve)onSound?.('defeat-dissolve',s.mage);
    if(previous<specter&&s.deathTime>=specter)onSound?.('defeat-shadow',s.mage);
    if(s.mode==='auto'&&s.deathTime>=4)controlHunt(s,'auto');
    return hits;
  }
  if(s.drop){
    const drop=s.drop;
    s.fallenTime=Math.max(0,s.fallenTime-dt);
    const move=s.mode==='auto'?{x:drop.x-s.mage.x,y:drop.y-s.mage.y}:movementVector(input.keys);
    const length=Math.hypot(move.x,move.y);
    const scale=s.mode==='manual'&&length?215*dt/length:1;
    walkMage(s,move.x*scale,move.y*scale,s.mode==='auto'?158:215,dt);
    if(Math.hypot(drop.x-s.mage.x,drop.y-s.mage.y)<=28){
      s.drop=null;
      // Unclaimed ability slots stay empty, keeping their original key bindings.
      s.abilities[drop.index]=0;
      s.rewardPending=true;
      s.moving=false;
      onSound?.('pickup',drop);
    }
    return hits;
  }
  if(s.rewardPending){
    if(s.mode==='manual'){s.fallenTime=Math.max(0,s.fallenTime-dt);return hits}
    chooseUpgrade(s,s.maxHealth<6&&(s.health<s.maxHealth||s.focus===3)?'vitality':'focus');
  }
  s.abilities=s.abilities.map(value=>Math.max(0,value-dt));
  s.ward=Math.max(0,s.ward-dt);
  s.dodgeCooldown=Math.max(0,s.dodgeCooldown-dt);
  if(s.dodgeTrail){
    s.dodgeTrail.remaining-=dt;
    if(s.dodgeTrail.remaining<=0)s.dodgeTrail=undefined;
  }
  s.abilityFlash=Math.max(0,s.abilityFlash-dt);
  s.counterTime=Math.max(0,s.counterTime-dt);
  s.fallenTime=Math.max(0,s.fallenTime-dt);
  s.time+=dt;s.cooldown-=dt;s.castTime+=dt;s.hurtTime+=dt;s.invulnerable=Math.max(0,s.invulnerable-dt);
  if(s.mode==='manual')s.manualTime+=dt;
  const previous={...s.mage};
  const bossEncounter=s.defeated<BOSSES.length&&s.time>=s.nextBossAt;
  const difficulty=s.mode==='auto'&&bossEncounter
    ?{speed:112,maxGhosts:6,spawnInterval:.65}
    :huntDifficulty(s.manualTime,s.mode);
  const siege=s.siegeUntil!==null;
  const exitOpen=s.siegeUntil!==null&&s.time>=s.siegeUntil;
  const maxGhosts=exitOpen?0:siege?12:bossEncounter?6:Math.min(12,difficulty.maxGhosts+2);
  const spawnInterval=siege?.45:bossEncounter?difficulty.spawnInterval:difficulty.spawnInterval*.75;
  if(s.ghosts.length>=maxGhosts)s.spawnIn=Math.max(s.spawnIn,spawnInterval);
  s.spawnIn-=dt;
  if(s.spawnIn<=0&&s.ghosts.length<maxGhosts){
    const point=findGhostSpawn(s,random);
    if(point){
      const kind=spawnKind(s);
      s.ghosts.push({...point,id:s.nextId++,kind,phase:random()*Math.PI*2,facing:ghostFacing(s.mage.x-point.x),age:0,vx:0,vy:0});
      onSound?.(kind==='stalker'?'stalker':'ghost',point);s.spawnIn=spawnInterval;
    }else s.spawnIn=.35;
  }
  let autoTarget=false;
  if(s.mode==='manual'){
    const {x:dx,y:dy}=movementVector(input.keys);
    const length=Math.hypot(dx,dy)||1;
    s.mage=boundPoint({x:s.mage.x+dx/length*215*dt,y:s.mage.y+dy/length*215*dt},s.width,s.height);
    s.aim={...input.aim};
  }else{
    if(exitOpen){
      const exit=escapePoint(s);
      walkMage(s,exit.x-s.mage.x,exit.y-s.mage.y,185,dt);
    }else autoTarget=steerAutoplay(s,dt);
    useAutoplayAbilities(s,exitOpen,onSound);
  }
  if(s.drop)return hits;
  const exit=exitOpen?escapePoint(s):null;
  if(exit&&Math.hypot(exit.x-s.mage.x,exit.y-s.mage.y)<=28){
    s.won=true;s.moving=false;s.shots=[];onSound?.('escape',exit);
    return hits;
  }
  const positions=s.ghosts.map(g=>({x:g.x,y:g.y,id:g.id}));
  for(const ghost of s.ghosts){
    ghost.facing=ghostFacing(s.mage.x-ghost.x,ghost.facing);
    ghost.age=(ghost.age??1)+dt;
    const behavior=ghostBehavior(ghost);
    if(ghost.age<.7||behavior==='watching'||behavior==='returning'){
      ghost.vx=0;ghost.vy=0;
      continue;
    }
    let dx=s.mage.x-ghost.x,dy=s.mage.y-ghost.y;
    const length=Math.hypot(dx,dy)||1;
    const circling=ghost.kind==='circler'&&length<185&&(ghost.age-2)%5<2.4&&ghost.age>=2;
    const weave=circling?(ghost.id%2?1:-1):Math.sin(s.time*1.3+ghost.phase)*.15;
    const pursuit=circling?clamp((length-108)/60,-.65,.65):1;
    const speedFactor=ghost.kind==='skeleton'?.94:ghost.kind==='zombie'?.59:ghost.kind==='bat'?1.14:ghost.kind==='eyeball'?.82:
      ghost.kind==='flying-skull'?1.03:ghost.kind==='drifter'?.62:ghost.kind==='stalker'?.85:1;
    const speedLimit=difficulty.speed*speedFactor;
    let vx=(dx/length*pursuit-dy/length*weave)*speedLimit,vy=(dy/length*pursuit+dx/length*weave)*speedLimit;
    for(const other of positions){
      if(other.id===ghost.id)continue;
      dx=ghost.x-other.x;dy=ghost.y-other.y;const distance=Math.hypot(dx,dy);
      if(distance<56){const angle=ghost.phase+ghost.id;vx+=(distance?dx/distance:Math.cos(angle))*(56-distance)*1.8;vy+=(distance?dy/distance:Math.sin(angle))*(56-distance)*1.8}
    }
    const speed=Math.hypot(vx,vy)||1,cap=Math.min(1,speedLimit/speed);
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
  const firing=s.mode==='auto'?autoTarget:input.firing;
  if(!firing)s.castRemaining=0;
  if(firing&&s.cooldown<=0&&s.castRemaining===0&&s.shots.length<35){s.castRemaining=MAGE_CAST_WINDUP;onSound?.('cast',staffPose(s).tip)}
  if(s.castRemaining>0){
    s.castRemaining=Math.max(0,s.castRemaining-dt);
    if(s.castRemaining===0){
      s.castTime=0;
      const {tip}=staffPose(s);
      const dx=s.aim.x-tip.x,dy=s.aim.y-tip.y,length=Math.hypot(dx,dy)||1;
      s.shots.push({x:tip.x,y:tip.y,vx:dx/length*470,vy:dy/length*470,life:3,age:0});
      onSound?.('shot',tip);
      s.cooldown=s.mode==='auto'?.27:.16;
    }
  }
  const bossAttack=stepGravekeeper(s,dt,previous,onSound);
  s.shots=s.shots.filter(shot=>{
    const oldX=shot.x,oldY=shot.y;
    shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;shot.age=(shot.age??0)+dt;
    // Distance to the swept segment prevents fast shots passing through ghosts.
    const dx=shot.x-oldX,dy=shot.y-oldY,length2=dx*dx+dy*dy||1;
    const intersects=(point:Point,yOffset:number,radius:number)=>{
      const x=point.x-oldX,y=point.y-yOffset-oldY;
      const t=clamp((x*dx+y*dy)/length2,0,1);
      return Math.hypot(x-t*dx,y-t*dy)<radius;
    };
    const target=s.ghosts.findIndex(g=>ghostIsTangible(g)&&intersects(g,9,22));
    if(target>=0){
      const [g]=s.ghosts.splice(target,1);
      hits.push({x:g.x,y:g.y});s.score++;onSound?.('hit',g);onSound?.('death',g);
      if(!shot.piercing)return false;
    }
    const boss=s.boss;
    const bossScale=boss?.index===0?GRAVEKEEPER_SCALE:1;
    if(boss&&boss.phase!=='arrival'&&!boss.decoys.length&&!shot.bossHit&&intersects(boss,22*bossScale,35*bossScale)){
      damageBoss(s,1,onSound);
      if(!shot.piercing)return false;
      shot.bossHit=true;
    }
    return shot.life>0&&shot.x>-30&&shot.x<s.width+30&&shot.y>0&&shot.y<s.height+30;
  });
  if(s.drop){s.shots=[];return hits}
  let boltHit=false;
  s.bolts=s.bolts.filter(bolt=>{
    const hexSkull=bolt.kind==='hex-skull';
    const target=hexSkull?{x:s.mage.x,y:s.mage.y-HEX_SKULL_TARGET_HEIGHT}:s.mage;
    if(hexSkull)steerHexSkull(bolt,target,dt);
    const dx=bolt.vx*dt,dy=bolt.vy*dt;
    const hit=segmentDistance(target,bolt,dx,dy)<(hexSkull?HEX_SKULL_HIT_RADIUS:18);
    bolt.x+=dx;bolt.y+=dy;bolt.life-=dt;
    if(hit)boltHit=true;
    return !hit&&bolt.life>0;
  });
  if(!s.practice&&!s.rewardPending&&s.invulnerable===0&&(s.mode==='manual'||bossEncounter||siege)){
    const touching=s.ghosts.find(g=>ghostIsTangible(g)&&Math.hypot(g.x-s.mage.x,g.y-s.mage.y)<26);
    if(touching||bossAttack||boltHit){
      if(s.ward>0){
        s.ward=0;
        if(bossAttack&&s.boss?.index===1)openBoss(s,'Hex King staggered',onSound);
        else onSound?.('ward-block',s.mage);
      }
      else{s.health--;s.hurtTime=0;onSound?.('hurt',s.mage)}
      s.invulnerable=1.25;
      if(touching){
        const dx=touching.x-s.mage.x,dy=touching.y-s.mage.y,length=Math.hypot(dx,dy);
        const nx=length?dx/length:Math.cos(touching.phase),ny=length?dy/length:Math.sin(touching.phase);
        Object.assign(touching,boundPoint({x:touching.x+nx*70,y:touching.y+ny*70},s.width,s.height),{vx:0,vy:0});
      }
      if(s.health===0){s.dead=true;s.deathTime=0;s.moving=false;s.shots=[];s.castRemaining=0;onSound?.('defeat',s.mage)}
    }
  }
  return hits;
}
