import {describe,expect,it} from 'vitest';
import {bossZoneDistance,boundPoint,controlHunt,createHunt,dodgeMage,handoffHunt,MAGE_CAST_WINDUP,nearestGhost,resizeHunt,staffPose,stepHunt,useAbility,type HuntInput} from './halloweenSimulation';

const idle=():HuntInput=>({keys:new Set(),aim:{x:500,y:200},firing:false});
describe('Halloween ghost hunt',()=>{
  it('starts in autoplay, wanders, shoots and catches endlessly respawning ghosts',()=>{
    const s=createHunt(1440,900),start={...s.mage};
    for(let i=0;i<1800;i++)stepHunt(s,idle(),1/60,()=>.3);
    expect(s.mode).toBe('auto');expect(s.mage).not.toEqual(start);expect(s.score).toBeGreaterThan(5);
    expect(s.nextId).toBeGreaterThan(10);expect(s.ghosts.length).toBeLessThanOrEqual(8);expect(s.health).toBe(3);
    expect(s.shots.length).toBeLessThan(35);
  });
  it('spawns regular enemies more often between bosses than during an autoplay encounter',()=>{
    const s=createHunt(1440,900);
    s.spawnIn=0;
    stepHunt(s,idle(),1/60,()=>.5);
    expect(s.ghosts).toHaveLength(1);
    expect(s.spawnIn).toBeCloseTo(.85*.75);
    s.ghosts=[];
    s.time=s.nextBossAt;
    s.spawnIn=0;
    stepHunt(s,idle(),1/60,()=>.5);
    expect(s.boss).not.toBeNull();
    expect(s.ghosts).toHaveLength(1);
    expect(s.spawnIn).toBeCloseTo(.65);
  });
  it('selects the nearest ghost',()=>{
    const s=createHunt(900,700);
    s.ghosts=[{id:0,x:800,y:150,phase:0},{id:1,x:s.mage.x+40,y:s.mage.y,phase:0}];
    expect(nearestGhost(s)?.id).toBe(1);
  });
  it('autoplay backs away from a nearby threat and leads a moving target',()=>{
    const s=createHunt(1440,900);
    s.mage={x:720,y:630};
    s.ghosts=[{id:0,x:755,y:630,phase:0,age:1,vx:-60,vy:25}];
    stepHunt(s,idle(),1/60);
    expect(s.mage.x).toBeLessThan(720);
    expect(s.aim.x).toBeLessThan(755);
    expect(s.aim.y).toBeGreaterThan(621);
    expect(s.castRemaining).toBeGreaterThan(0);
  });
  it('lets a manual dodge cross enemies safely and carries the cooldown through a handoff',()=>{
    const s=createHunt(1440,900);
    controlHunt(s,'manual');
    s.invulnerable=0;
    expect(dodgeMage(s,{x:-1,y:0})).toBe(true);
    expect(s.mage.x).toBe(30);
    expect(dodgeMage(s,{x:1,y:0})).toBe(false);
    s.ghosts=[{...s.mage,id:0,phase:0,age:1}];
    stepHunt(s,idle(),1/60);
    expect(s.health).toBe(3);
    const cooldown=s.dodgeCooldown;
    handoffHunt(s,'auto');
    expect(s.dodgeCooldown).toBe(cooldown);
    controlHunt(s,'manual');
    expect(s.dodgeCooldown).toBe(0);
    expect(s.dodgeTrail).toBeUndefined();
    s.mage.x=30;
    expect(dodgeMage(s,{x:-1,y:0})).toBe(false);
    expect(s.dodgeCooldown).toBe(0);
  });
  it('dodges a late boss warning toward clear space in autoplay',()=>{
    const s=createHunt(1440,900);
    s.defeated=3;s.time=s.nextBossAt;s.spawnIn=100;
    stepHunt(s,idle(),1/60);
    const boss=s.boss!;
    s.mage={x:430,y:400};s.invulnerable=0;
    Object.assign(boss,{phase:'warning',remaining:.02,target:{...s.mage},radius:70});
    s.ghosts=[{id:1,x:534,y:400,phase:0,age:1}];
    stepHunt(s,idle(),1/60);
    expect(s.dodgeTrail).toBeDefined();
    expect(bossZoneDistance(s.mage,boss)).toBeGreaterThan(boss.radius);
    expect(Math.hypot(s.mage.x-534,s.mage.y-400)).toBeGreaterThan(40);
    expect(s.health).toBe(3);
  });
  it('leaves the projected path of an incoming bolt when autoplay is backed against a wall',()=>{
    const s=createHunt(390,700);
    s.mage={x:30,y:450};s.invulnerable=0;
    s.bolts=[{x:90,y:450,vx:-320,vy:0,life:1,kind:'skull'}];
    stepHunt(s,idle(),1/60);
    expect(s.dodgeTrail).toBeDefined();
    expect(Math.abs(s.mage.y-450)).toBeGreaterThan(55);
    expect(s.mage.x).toBeGreaterThanOrEqual(30);
    expect(s.bolts).toHaveLength(1);
  });
  it('uses Hex Burst on a crowd and clears nearby projectiles in both modes',()=>{
    for(const mode of ['manual','auto'] as const){
      const s=createHunt(1440,900);
      controlHunt(s,mode);
      s.mage={x:540,y:400};
      s.abilities[1]=0;
      s.ghosts=[{id:1,x:600,y:400,phase:0,age:1},{id:2,x:610,y:400,phase:0,age:1}];
      s.bolts=[
        {x:590,y:400,vx:1,vy:0,life:1,kind:'hex-skull'},
        {x:580,y:400,vx:1,vy:0,life:1,kind:'phantom-face'},
      ];
      if(mode==='manual')expect(useAbility(s,1)).toBe(true);
      else stepHunt(s,idle(),1/60);
      expect(s.score).toBe(2);
      expect(s.ghosts).toHaveLength(0);
      expect(s.bolts.map(bolt=>bolt.kind)).toEqual(['phantom-face']);
      expect(s.abilities[1]).toBeGreaterThan(0);
    }
  });
  it('manual mode waits for fire, follows aim and normalizes diagonal movement',()=>{
    const straight=createHunt(1440,900),diagonal=createHunt(1440,900);
    controlHunt(straight,'manual');controlHunt(diagonal,'manual');
    const start={...straight.mage};
    stepHunt(straight,{...idle(),keys:new Set(['d'])},1/30,()=>.9);
    stepHunt(diagonal,{...idle(),keys:new Set(['d','w'])},1/30,()=>.9);
    expect(straight.shots).toHaveLength(0);expect(straight.aim).toEqual(idle().aim);
    expect(Math.hypot(diagonal.mage.x-start.x,diagonal.mage.y-start.y)).toBeCloseTo(straight.mage.x-start.x);
    stepHunt(straight,{...idle(),firing:true},1/30);
    expect(straight.shots).toHaveLength(0);expect(straight.castRemaining).toBeGreaterThan(0);
    for(let i=1;i<Math.ceil(MAGE_CAST_WINDUP*30);i++)stepHunt(straight,{...idle(),firing:true},1/30);
    expect(straight.shots).toHaveLength(1);expect(straight.shots[0].vx).toBeGreaterThan(0);
  });
  it('resumes automatic shooting after manual mode',()=>{
    const s=createHunt(1000,800);controlHunt(s,'manual');stepHunt(s,idle(),1/60);
    expect(s.shots).toHaveLength(0);controlHunt(s,'auto');
    s.ghosts=[{id:0,x:550,y:300,phase:0,age:1}];
    for(let i=0;i<Math.ceil(MAGE_CAST_WINDUP*60);i++)stepHunt(s,idle(),1/60,()=>.9);
    expect(s.shots.length+s.score).toBeGreaterThan(0);
  });
  it('registers one swept collision and score per ghost',()=>{
    const s=createHunt(1000,800);controlHunt(s,'manual');
    s.ghosts=Array.from({length:5},(_,id)=>({id,x:500+id*80,y:250,phase:0}));
    s.shots=[{x:450,y:241,vx:3000,vy:0,life:1},{x:450,y:241,vx:3000,vy:0,life:1}];
    const hits=stepHunt(s,idle(),1/30,()=>.5);
    expect(hits).toHaveLength(1);expect(s.score).toBe(1);expect(s.ghosts).toHaveLength(4);
    s.shots=[];stepHunt(s,idle(),1/60,()=>.5);expect(s.ghosts).toHaveLength(4);
  });
  it('bounds movement after a resize and expires missed shots',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');s.mage={x:1400,y:850};
    resizeHunt(s,390,700);expect(s.mage).toEqual({x:360,y:635});
    for(let i=0;i<120;i++)stepHunt(s,{...idle(),keys:new Set(['d','s'])},1/30);
    expect(s.mage).toEqual({x:360,y:635});
    s.shots=[{x:200,y:300,vx:0,vy:0,life:.01}];stepHunt(s,idle(),1/30);
    expect(s.shots).toHaveLength(0);expect(boundPoint({x:-200,y:-200},390,700)).toEqual({x:30,y:110});
  });
  it('launches from the animated staff tip after the casting windup',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');
    const input={...idle(),aim:{x:900,y:400},firing:true};
    for(let i=0;i<Math.ceil(MAGE_CAST_WINDUP*30);i++)stepHunt(s,input,1/30,()=>.9);
    expect(s.shots).toHaveLength(1);
    const shot=s.shots[0],pose=staffPose(s);
    expect(shot.x-shot.vx/30).toBeCloseTo(pose.tip.x);
    expect(shot.y-shot.vy/30).toBeCloseTo(pose.tip.y);
    expect(Math.hypot(pose.tip.x-s.mage.x,pose.tip.y-s.mage.y)).toBeGreaterThan(30);
    expect(pose.recoil).toBe(1);
    for(let i=0;i<14;i++)stepHunt(s,idle(),1/30,()=>.9);
    expect(staffPose(s).recoil).toBe(0);
  });
  it('holds facing steady when aiming near vertical and cancels an interrupted cast',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');
    for(const offset of [-8,8,-4,4]){
      stepHunt(s,{...idle(),aim:{x:s.mage.x+offset,y:100},firing:true},1/60,()=>.9);
      expect(s.facing).toBe(1);
    }
    stepHunt(s,idle(),1/60,()=>.9);expect(s.castRemaining).toBe(0);expect(s.shots).toHaveLength(0);
    stepHunt(s,{...idle(),aim:{x:s.mage.x-100,y:100}},1/60,()=>.9);expect(s.facing).toBe(-1);
  });
});
