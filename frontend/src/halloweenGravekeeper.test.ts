import {describe,expect,it} from 'vitest';
import {BOSSES,chooseUpgrade,controlHunt,createHunt,escapePoint,gravekeeperAttackOrigin,handoffHunt,resizeHunt,stepHunt,useAbility} from './halloweenSimulation';

const idle={keys:new Set<string>(),aim:{x:0,y:0},firing:false};

describe('Gravekeeper encounter',()=>{
  it('chooses attacks by range and locks each warning before release',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=3;hunt.time=60;hunt.spawnIn=100;hunt.mage={x:720,y:450};
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    for(const [range,kind,windup,speed] of [[110,'dirt',.9,320],[480,'skull',1,240],[255,'summon',1.15,0],[110,'dirt',.9,320]] as const){
      hunt.bolts=[];
      Object.assign(boss,{x:300,y:400,phase:'pursuit',remaining:0});
      hunt.mage={x:boss.x+range,y:boss.y};
      stepHunt(hunt,idle,1/60);
      expect(boss.attack?.kind).toBe(kind);
      expect(boss.remaining).toBe(windup);
      const locked={...boss.target};
      const origin=gravekeeperAttackOrigin(boss);
      hunt.mage.y+=25;
      stepHunt(hunt,idle,1/60);
      expect(boss.target).toEqual(locked);
      expect(hunt.bolts).toHaveLength(0);
      boss.remaining=0;
      stepHunt(hunt,idle,1/60);
      expect(boss.phase).toBe('strike');
      expect(boss.remaining).toBe(.35);
      if(kind==='summon'){
        expect(boss.summonSites).toEqual([{x:locked.x+32,y:locked.y-82},{x:locked.x+32,y:locked.y+82}]);
        expect(hunt.ghosts.map(({kind,x,y,age})=>({kind,x,y,age}))).toEqual(
          boss.summonSites?.map(({x,y},index)=>({x,y,kind:index===0?'skeleton':'zombie',age:0})),
        );
      }else{
        const [bolt]=hunt.bolts;
        expect(bolt.kind).toBe(kind);
        expect(Math.hypot(bolt.vx,bolt.vy)).toBeCloseTo(speed);
        expect(bolt.vx*(locked.y-origin.y)-bolt.vy*(locked.x-origin.x)).toBeCloseTo(0);
      }
      stepHunt(hunt,idle,1/60);
      expect(hunt.bolts).toHaveLength(kind==='summon'?0:1);
    }
  });
  it('starts the Crowned Phantom after a minute in autoplay and continues across handoffs',()=>{
    const hunt=createHunt(1440,900);
    hunt.time=59.99;
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss?.phase).toBe('arrival');
    expect(hunt.boss?.health).toBe(BOSSES[3].health);
    expect(hunt.boss?.index).toBe(3);
    const remaining=hunt.boss?.remaining;
    handoffHunt(hunt,'manual');
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss!.remaining).toBeLessThan(remaining!);
    const boss=hunt.boss!;
    Object.assign(boss,{phase:'pursuit',remaining:0});
    stepHunt(hunt,idle,1/60);
    const target=boss.target;
    const attack=boss.phantomMove;
    const remainingWarning=boss.remaining;
    handoffHunt(hunt,'auto');
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss).toBe(boss);
    expect(boss.phantomMove).toBe(attack);
    expect(boss.target).toBe(target);
    expect(boss.remaining).toBeLessThan(remainingWarning);
    controlHunt(hunt,'manual');
    expect(hunt.boss).toBeNull();
  });

  it('clears Gravekeeper hazards and rewards a finishing shot once',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=3;hunt.time=60;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    Object.assign(boss,{phase:'recovery',remaining:1});
    hunt.bolts=[{x:500,y:400,vx:240,vy:0,life:3,kind:'skull'}];
    hunt.ghosts=[{x:650,y:400,id:42,phase:0,kind:'zombie',age:1}];
    boss.health=1;
    hunt.shots=[{x:boss.x-8,y:boss.y-22,vx:470,vy:0,life:1}];
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss).toBeNull();
    expect(hunt.bossDefeated).toBe(true);
    expect(hunt.score).toBe(10);
    expect(hunt.bolts).toHaveLength(0);
    expect(hunt.ghosts.some(ghost=>ghost.kind==='zombie')).toBe(false);
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss).toBeNull();
  });

  it('keeps minions intangible while rising and caps each living type',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=3;hunt.time=60;hunt.spawnIn=100;hunt.invulnerable=0;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    const summon=()=>{
      Object.assign(boss,{x:300,y:400,phase:'pursuit',remaining:0});
      hunt.mage={x:555,y:400};
      stepHunt(hunt,idle,1/60);
      boss.remaining=0;
      stepHunt(hunt,idle,1/60);
    };
    summon();
    const [skeleton,zombie]=hunt.ghosts;
    hunt.mage={x:skeleton.x,y:skeleton.y};
    hunt.shots=[{x:skeleton.x,y:skeleton.y-9,vx:0,vy:0,life:1}];
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(3);
    expect(hunt.ghosts).toContain(skeleton);
    expect(skeleton.vx).toBe(0);
    summon();
    expect(boss.attack?.kind).toBe('skull');
    expect(hunt.ghosts).toEqual([skeleton,zombie]);
    hunt.mage={x:skeleton.x,y:skeleton.y};
    skeleton.age=.7;
    stepHunt(hunt,idle,1/60);
    expect(hunt.ghosts).toEqual([zombie]);
    summon();
    expect(hunt.ghosts.map(ghost=>ghost.kind)).toEqual(['zombie','skeleton']);
    controlHunt(hunt,'manual');
    expect(hunt.ghosts).toHaveLength(0);
  });

  it('consumes a ward on projectile impact and ignores hits during invulnerability',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.time=60;hunt.spawnIn=100;hunt.invulnerable=0;hunt.ward=3;
    const launch=()=>{
      hunt.bolts=[{x:hunt.mage.x-20,y:hunt.mage.y,vx:320,vy:0,life:3,kind:'dirt'}];
      stepHunt(hunt,idle,1/30);
    };
    launch();
    expect(hunt.ward).toBe(0);
    expect(hunt.health).toBe(3);
    expect(hunt.bolts).toHaveLength(0);
    launch();
    expect(hunt.health).toBe(3);
    hunt.invulnerable=0;
    launch();
    expect(hunt.health).toBe(2);
    hunt.bolts=[{x:500,y:400,vx:240,vy:0,life:.01,kind:'skull'}];
    stepHunt(hunt,idle,1/30);
    expect(hunt.bolts).toHaveLength(0);
  });

  it('lets the Gravekeeper defeat the autoplay mage and starts a fresh demo',()=>{
    const hunt=createHunt(1440,900);
    hunt.time=60;hunt.defeated=3;
    stepHunt(hunt,idle,1/60);
    hunt.bolts=[{...hunt.mage,vx:320,vy:0,life:3,kind:'dirt'}];
    hunt.health=1;hunt.invulnerable=0;hunt.dodgeCooldown=1;
    stepHunt(hunt,idle,1/60);
    expect(hunt.dead).toBe(true);
    hunt.deathTime=3.99;
    stepHunt(hunt,idle,1/60);
    expect(hunt.mode).toBe('auto');
    expect(hunt.dead).toBe(false);
    expect(hunt.health).toBe(3);
    expect(hunt.boss).toBeNull();
  });
});

describe('Hex King encounter',()=>{
  function setup(width=1440,height=900){
    const hunt=createHunt(width,height);
    controlHunt(hunt,'manual');
    hunt.defeated=1;hunt.time=60;hunt.abilities=[0];hunt.spawnIn=100;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    Object.assign(boss,{x:120,y:200,phase:'pursuit',remaining:0});
    hunt.mage={x:200,y:200};
    hunt.invulnerable=0;
    return {hunt,boss};
  }
  it('chooses attacks by distance, locks the warning, and lands the claw once',()=>{
    const {hunt,boss}=setup();
    const moves=[];
    for(const range of [80,255,160,480,80]){
      Object.assign(boss,{x:120,y:200,phase:'pursuit',remaining:0});
      hunt.mage={x:boss.x+range,y:boss.y};
      stepHunt(hunt,idle,1/60);
      moves.push([boss.hexMove?.kind,boss.remaining]);
      const {target,hexHeading}=boss;
      hunt.mage.y+=4;
      stepHunt(hunt,idle,1/60);
      expect(boss.target).toBe(target);
      expect(boss.hexHeading).toBe(hexHeading);
      boss.remaining=0;
      stepHunt(hunt,idle,1/60);
      expect(boss.remaining).toBe(.35);
      if(moves.length===1){
        expect(hunt.health).toBe(2);
        hunt.invulnerable=0;
        stepHunt(hunt,idle,1/60);
        expect(hunt.health).toBe(2);
        hunt.invulnerable=100;
      }
      boss.remaining=0;
      stepHunt(hunt,idle,1/60);
      expect(boss.remaining).toBe(1.3);
    }
    expect(moves).toEqual([['claw',1],['roar',1.15],['mist',.85],['swarm',1.2],['claw',1]]);
  });
  it.each([80,160])('opens a recovery window when Grave Ward blocks an attack at range %s',(range)=>{
    const {hunt,boss}=setup();
    hunt.mage={x:boss.x+range,y:boss.y};
    stepHunt(hunt,idle,1/60);
    expect(useAbility(hunt,0)).toBe(true);
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    for(let i=0;i<24&&boss.phase==='strike';i++)stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(3);
    expect(hunt.counterText).toBe('Hex King staggered');
    expect(hunt.counters).toBe(1);
    expect(hunt.counterTime).toBe(2.5);
    expect(boss.phase).toBe('recovery');
  });
  it('caps summons, keeps them intangible while forming, and clears them on defeat',()=>{
    const {hunt,boss}=setup();
    const summon=()=>{
      hunt.mage={x:boss.x+255,y:boss.y};
      Object.assign(boss,{phase:'pursuit',remaining:0});
      stepHunt(hunt,idle,1/60);
      boss.remaining=0;
      stepHunt(hunt,idle,1/60);
    };
    summon();
    const [ghost]=hunt.ghosts;
    expect(hunt.ghosts.map(({x,y})=>({x,y}))).toEqual(boss.summonSites);
    expect(hunt.ghosts.map(({x,y})=>({x:x-hunt.mage.x,y:y-hunt.mage.y}))).toEqual([
      {x:32,y:-82},{x:32,y:82},
    ]);
    hunt.mage={x:ghost.x,y:ghost.y};
    hunt.shots=[{x:ghost.x,y:ghost.y-9,vx:0,vy:0,life:1}];
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(3);
    expect(hunt.ghosts).toHaveLength(2);
    summon();
    expect(boss.hexMove?.kind).toBe('swarm');
    expect(hunt.ghosts).toHaveLength(2);
    hunt.mage={x:ghost.x,y:ghost.y};
    ghost.age=.7;
    stepHunt(hunt,idle,1/60);
    expect(hunt.ghosts).toHaveLength(1);
    summon();
    expect(hunt.ghosts).toHaveLength(2);
    boss.health=1;
    hunt.shots=[{x:boss.x,y:boss.y-22,vx:0,vy:0,life:1}];
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss).toBeNull();
    expect(hunt.ghosts).toHaveLength(0);
  });
  it('clamps mist dash to the arena and registers only one contact',()=>{
    const {hunt,boss}=setup(320,360);
    hunt.mage={x:290,y:200};boss.x=90;
    stepHunt(hunt,idle,1/60);
    expect(boss.target.x).toBeCloseTo(boss.laneStart!.x+180);
    expect(boss.target.x).toBeLessThanOrEqual(290);
    hunt.mage={...boss.target};
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    for(let i=0;i<24&&boss.phase==='strike';i++){
      hunt.invulnerable=0;
      stepHunt(hunt,idle,1/60);
    }
    expect(hunt.health).toBe(2);
    expect(boss.x).toBeCloseTo(boss.target.x);
    expect(boss.dashContact).toBe(true);
  });
  it('leads a moving player with the mist dash and keeps the warned lane fixed',()=>{
    const {hunt,boss}=setup();
    hunt.mage={x:265,y:200};
    stepHunt(hunt,{...idle,keys:new Set(['arrowdown'])},1/60);
    expect(boss.hexMove?.kind).toBe('mist');
    expect(boss.target.y).toBeGreaterThan(hunt.mage.y);
    const target=boss.target;
    stepHunt(hunt,{...idle,keys:new Set(['arrowup'])},1/60);
    expect(boss.target).toBe(target);
  });
  it('launches five skulls once and limits their homing time and turn rate',()=>{
    const {hunt,boss}=setup();
    hunt.mage={x:600,y:200};
    stepHunt(hunt,idle,1/60);
    expect(boss.hexMove?.kind).toBe('swarm');
    expect(hunt.bolts).toHaveLength(0);
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    expect(hunt.bolts).toHaveLength(5);
    const [bolt]=hunt.bolts;
    const heading=()=>Math.atan2(bolt.vy,bolt.vx);
    const initial=heading();
    hunt.mage={x:600,y:430};
    for(let i=0;i<5;i++)stepHunt(hunt,idle,1/60);
    expect(heading()).toBe(initial);
    for(let i=0;i<12;i++)stepHunt(hunt,idle,1/60);
    expect(heading()).toBeGreaterThan(initial);
    expect(heading()-initial).toBeLessThanOrEqual(1.65*12/60);
    expect(hunt.bolts).toHaveLength(5);
    bolt.age=2.13;
    const final=heading();
    stepHunt(hunt,idle,1/60);
    expect(heading()).toBe(final);
    bolt.life=.01;
    stepHunt(hunt,idle,1/60);
    expect(hunt.bolts).not.toContain(bolt);
  });
  it('keeps swarm skulls alive across the arena and hits the mage above foot level',()=>{
    const {hunt,boss}=setup();
    hunt.mage={x:1080,y:200};
    stepHunt(hunt,idle,1/60);
    expect(boss.hexMove?.kind).toBe('swarm');
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    const centerSkull=hunt.bolts[2];
    expect(Math.hypot(centerSkull.x-boss.x,centerSkull.y-(boss.y-32))).toBeGreaterThan(66);
    hunt.bolts=[centerSkull];
    Object.assign(boss,{phase:'recovery',remaining:10});
    for(let i=0;i<150;i++)stepHunt(hunt,idle,1/60);
    expect(hunt.bolts).toContain(centerSkull);
    expect(hunt.health).toBe(3);
    for(let i=0;i<150&&hunt.bolts.length;i++)stepHunt(hunt,idle,1/60);
    expect(hunt.bolts).toHaveLength(0);
    expect(hunt.health).toBe(2);
  });
});

describe('boss ladder and rewards',()=>{
  it('locks the Tyrant fire and tornado telegraphs, with one hit per hazard',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=2;hunt.time=60;hunt.spawnIn=100;hunt.invulnerable=0;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    const warn=(range:number)=>{
      Object.assign(boss,{x:300,y:400,phase:'pursuit',remaining:0});
      hunt.mage={x:boss.x+range,y:boss.y};
      stepHunt(hunt,idle,1/60);
    };
    warn(100);
    expect(boss.tyrantMove?.kind).toBe('dive');
    warn(160);
    expect(boss.tyrantMove?.kind).toBe('fire');
    const heading=boss.tyrantHeading;
    hunt.mage={x:460,y:520};
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    expect(boss.tyrantHeading).toBe(heading);
    expect(boss.remaining).toBe(.65);
    expect(hunt.health).toBe(3);
    hunt.mage={x:460,y:400};
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(2);
    hunt.invulnerable=0;
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(2);

    warn(330);
    expect(boss.tyrantMove?.kind).toBe('hurricane');
    const marked=boss.target;
    hunt.mage={x:460,y:520};
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    expect(boss.target).toBe(marked);
    expect(boss.remaining).toBe(1.55);
    expect(hunt.health).toBe(2);
    hunt.mage={...marked};
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(1);
    hunt.invulnerable=0;
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(1);
    expect(boss.x).toBeLessThan(310);
  });
  it('keeps Hex Burst damage, cooldown, and the Tyrant armor counter',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=2;hunt.time=60;hunt.abilities=[0,0];hunt.spawnIn=100;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    Object.assign(boss,{phase:'recovery',x:hunt.mage.x+80,y:hunt.mage.y});
    expect(useAbility(hunt,1)).toBe(true);
    expect(boss.health).toBe(BOSSES[2].health-16);
    expect(hunt.counterText).toBe('Armor broken');
    expect(hunt.abilities[1]).toBe(14);
  });

  it('opens the exit after the siege and records victory on arrival',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=4;hunt.rewardPending=true;hunt.abilities=[3,4,5,0];
    expect(chooseUpgrade(hunt,'focus')).toBe(true);
    expect(hunt.abilities).toEqual([0,0,0,0]);
    hunt.mage=escapePoint(hunt);
    stepHunt(hunt,idle,1/60);
    expect(hunt.won).toBe(false);
    hunt.time=hunt.siegeUntil!;
    stepHunt(hunt,idle,1/60);
    expect(hunt.won).toBe(true);
    controlHunt(hunt,'manual');
    expect(hunt.won).toBe(false);
    expect(hunt.siegeUntil).toBeNull();
  });

  it.each(['manual','auto'] as const)('advances through all four bosses in %s',mode=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,mode);
    hunt.spawnIn=10000;
    const order=[3,1,2,0];
    for(const [round,index] of order.entries()){
      hunt.time=hunt.nextBossAt-.005;
      stepHunt(hunt,idle,1/60);
      const boss=hunt.boss!;
      expect(boss.index).toBe(index);
      expect(boss.health).toBe(BOSSES[index].health);
      boss.phase='recovery';boss.remaining=1;boss.health=2;
      hunt.shots=[{x:boss.x-8,y:boss.y-22,vx:470,vy:0,life:1}];
      stepHunt(hunt,idle,1/60);
      expect(hunt.defeated).toBe(round+1);
      expect(Object.keys(hunt.abilities)).toHaveLength(round);
      expect(hunt.drop?.index).toBe(index);
      expect(hunt.rewardPending).toBe(false);
      const victoryTime=hunt.time;
      if(mode==='manual'){
        const drop=hunt.drop!;
        const side=drop.x<720?1:-1;
        hunt.mage={x:drop.x+55*side,y:drop.y};
        const walk={...idle,keys:new Set([side===1?'a':'d'])};
        for(let i=0;i<60&&hunt.drop;i++)stepHunt(hunt,walk,1/60);
      }else{
        for(let i=0;i<900&&hunt.drop;i++)stepHunt(hunt,idle,1/60);
      }
      expect(hunt.drop).toBeNull();
      expect(Object.keys(hunt.abilities)).toHaveLength(round+1);
      expect(hunt.abilities[index]).toBe(0);
      expect(hunt.rewardPending).toBe(true);
      expect(hunt.time).toBe(victoryTime);
      stepHunt(hunt,idle,1/60);
      if(mode==='manual'){
        expect(hunt.time).toBe(victoryTime);
        expect(chooseUpgrade(hunt,round===3?'vitality':'focus')).toBe(true);
      }
      expect(hunt.nextBossAt).toBeCloseTo(victoryTime+25);
      expect(chooseUpgrade(hunt,'vitality')).toBe(false);
      expect(hunt.boss).toBeNull();
    }
    hunt.time+=30;
    stepHunt(hunt,idle,1/60);
    expect(hunt.boss).toBeNull();
    expect(hunt.focus).toBe(3);
    expect(hunt.maxHealth).toBe(4);
    controlHunt(hunt,mode);
    expect(hunt.abilities).toEqual([]);
    expect(hunt.nextBossAt).toBe(60);
    expect(hunt.maxHealth).toBe(3);
  });

  it('keeps pickup safe and reachable across handoffs and resize, and clears it on retry',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.drop={x:1410,y:835,index:0};
    hunt.mage={x:50,y:130};
    hunt.invulnerable=0;
    hunt.ghosts=[{...hunt.mage,id:0,phase:0,age:2}];
    stepHunt(hunt,{...idle,firing:true},1/30);
    expect(hunt.health).toBe(3);
    expect(hunt.time).toBe(0);
    expect(hunt.shots).toHaveLength(0);
    expect(hunt.ghosts[0].age).toBe(2);
    handoffHunt(hunt,'auto');
    resizeHunt(hunt,390,600);
    expect(hunt.drop).toEqual({x:360,y:535,index:0});
    handoffHunt(hunt,'manual');
    expect(hunt.drop?.index).toBe(0);
    controlHunt(hunt,'manual');
    expect(hunt.drop).toBeNull();
  });

  it('consumes a ward on one hit and preserves the cooldown through handoffs',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.abilities=[0];hunt.focus=2;hunt.invulnerable=0;
    expect(useAbility(hunt,0)).toBe(true);
    expect(hunt.abilities[0]).toBeCloseTo(14.4);
    hunt.ghosts=[{...hunt.mage,id:0,age:1,phase:0}];
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(3);
    expect(hunt.ward).toBe(0);
    handoffHunt(hunt,'auto');
    expect(useAbility(hunt,0)).toBe(false);
    expect(hunt.abilities[0]).toBeGreaterThan(14);
  });

  it('reveals the Crowned Phantom before launching bolts and ignores shots at decoys',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.time=60;hunt.spawnIn=100;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    boss.phase='pursuit';boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    expect(boss.decoys).toHaveLength(2);
    const distanceToMage=({x,y}:{x:number;y:number})=>Math.hypot(x-hunt.mage.x,y-hunt.mage.y);
    expect(distanceToMage(boss)).toBeLessThan(Math.min(...boss.decoys.map(distanceToMage)));
    const decoy=boss.decoys[0];
    hunt.shots=[{x:decoy.x-8,y:decoy.y-22,vx:470,vy:0,life:1}];
    stepHunt(hunt,idle,1/60);
    expect(hunt.shots).toHaveLength(1);
    expect(boss.health).toBe(128);
    expect(hunt.bolts).toHaveLength(0);
    boss.remaining=0;
    stepHunt(hunt,{...idle,keys:new Set(['d'])},1/60);
    expect(boss.phase).toBe('reveal');
    expect(boss.target.x).toBeGreaterThan(hunt.mage.x);
    const lockedTarget=boss.target;
    expect(hunt.bolts).toHaveLength(0);
    boss.remaining=0;
    const cues:string[]=[];
    stepHunt(hunt,idle,1/60,Math.random,kind=>cues.push(kind));
    expect(boss.target).toBe(lockedTarget);
    expect(hunt.bolts).toHaveLength(5);
    expect(hunt.bolts.filter(bolt=>bolt.kind==='royal-skull')).toHaveLength(2);
    expect(cues).toContain('phantom-barrage');
  });

  it('locks the Phantom tongue sweep and releases eight spectral faces on its scream',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.time=60;hunt.spawnIn=100;hunt.invulnerable=0;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    const cues:string[]=[];
    const tick=()=>stepHunt(hunt,idle,1/60,Math.random,kind=>cues.push(kind));
    const warn=(range:number)=>{
      Object.assign(boss,{x:300,y:400,phase:'pursuit',remaining:0});
      hunt.mage={x:boss.x+range,y:boss.y};
      tick();
    };
    warn(78);
    const heading=boss.phantomHeading;
    hunt.mage={x:300,y:484};
    boss.remaining=0;
    tick();
    expect(boss.phantomHeading).toBe(heading);
    expect(hunt.health).toBe(3);
    expect(cues.filter(cue=>cue==='phantom-tongue')).toHaveLength(1);
    warn(115);
    hunt.mage={x:540,y:400};
    boss.remaining=0;
    tick();
    expect(hunt.bolts).toHaveLength(8);
    expect(hunt.bolts.every(bolt=>bolt.kind==='phantom-face')).toBe(true);
    tick();
    expect(hunt.bolts).toHaveLength(8);
    expect(cues.filter(cue=>cue==='phantom-scream')).toHaveLength(1);
  });

  it('preserves the dash counter for barrage bolts and sounds the player’s five-shot volley',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.time=60;hunt.abilities=[0,0,0,0];hunt.spawnIn=100;
    stepHunt(hunt,idle,1/60);
    hunt.mage={x:300,y:400};
    hunt.bolts=[
      {x:370,y:400,vx:1,vy:0,life:1,kind:'royal-bolt'},
      {x:390,y:400,vx:1,vy:0,life:1,kind:'phantom-face'},
    ];
    expect(useAbility(hunt,2,{x:1,y:0})).toBe(true);
    expect(hunt.counterText).toBe('Phantom exposed');
    expect(hunt.bolts.map(bolt=>bolt.kind)).toEqual(['phantom-face']);
    const cues:string[]=[];
    expect(useAbility(hunt,3,{x:1,y:0},kind=>cues.push(kind))).toBe(true);
    expect(hunt.shots).toHaveLength(5);
    expect(hunt.shots.every(shot=>shot.piercing)).toBe(true);
    expect(cues).toEqual(['royal-volley']);
  });

  it('telegraphs both Tyrant attacks and lets Phantom Dash escape its charge',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=2;hunt.time=60;hunt.spawnIn=100;
    hunt.abilities=[0,0,0];
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    boss.x=hunt.mage.x;boss.y=hunt.mage.y-110;
    boss.phase='pursuit';boss.remaining=0;
    hunt.invulnerable=0;
    stepHunt(hunt,idle,1/60);
    expect(boss.laneStart).toBeDefined();
    expect(hunt.health).toBe(3);
    const start=hunt.mage.x;
    expect(useAbility(hunt,2,{x:1,y:0})).toBe(true);
    expect(hunt.mage.x-start).toBe(140);
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(3);
    boss.remaining=0;
    stepHunt(hunt,idle,1/60);
    expect(boss.phase).toBe('warning');
    expect(boss.laneStart).toBeUndefined();
    expect(boss.radius).toBe(116);
  });

  it('moves the Tyrant through its lane before the charge can hit the far end',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=2;hunt.time=60;hunt.spawnIn=100;
    stepHunt(hunt,idle,1/60);
    const boss=hunt.boss!;
    hunt.mage={x:600,y:350};hunt.invulnerable=0;
    Object.assign(boss,{x:200,y:350,phase:'warning',remaining:0,laneStart:{x:200,y:350},target:{...hunt.mage},radius:33});
    stepHunt(hunt,idle,1/60);
    expect(boss.x).toBe(200);
    expect(hunt.health).toBe(3);
    for(let i=0;i<10;i++)stepHunt(hunt,idle,1/60);
    expect(boss.x).toBeGreaterThan(200);
    expect(boss.x).toBeLessThan(600);
    expect(hunt.health).toBe(3);
    for(let i=0;i<12;i++)stepHunt(hunt,idle,1/60);
    expect(hunt.health).toBe(2);
  });

  it('rejects a capped upgrade and offers healing when both are capped',()=>{
    const hunt=createHunt(1440,900);
    hunt.rewardPending=true;hunt.maxHealth=6;hunt.health=4;
    expect(chooseUpgrade(hunt,'vitality')).toBe(false);
    expect(hunt.rewardPending).toBe(true);
    hunt.focus=3;
    expect(chooseUpgrade(hunt,'vitality')).toBe(true);
    expect(hunt.health).toBe(5);
    expect(hunt.maxHealth).toBe(6);
  });
});
