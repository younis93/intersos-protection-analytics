import {describe,expect,it} from 'vitest';
import {controlHunt,createHunt,findGhostSpawn,huntDifficulty,nearestGhost,safeSpawnDistance,stepHunt,type HuntInput,type HuntState} from './halloweenSimulation';

const idle:HuntInput={keys:new Set(),aim:{x:900,y:400},firing:false};
function random(seed=123){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296}}
function advance(s:HuntState,seconds:number,input=idle){const rng=random();for(let i=0;i<Math.ceil(seconds*60);i++)stepHunt(s,input,1/60,rng)}
describe('balanced Halloween survival',()=>{
  it('starts with a safe grace period and spawns one distant ghost at a time',()=>{
    for(const [w,h]of [[1440,900],[390,844],[320,600]]){
      const s=createHunt(w,h);controlHunt(s,'manual');advance(s,.9);expect(s.ghosts).toHaveLength(0);
      advance(s,.15);expect(s.ghosts).toHaveLength(1);const g=s.ghosts[0];
      expect(Math.hypot(g.x-s.mage.x,g.y-s.mage.y)).toBeGreaterThanOrEqual(safeSpawnDistance(s)-.01);
      expect(g.age).toBeLessThan(.7);expect(s.health).toBe(3);
      const position={x:g.x,y:g.y};advance(s,.4);expect({x:g.x,y:g.y}).toEqual(position);
      expect(s.ghosts).toHaveLength(1);
    }
  });
  it('postpones spawning when no distant and separated edge position is available',()=>{
    const s=createHunt(320,350);controlHunt(s,'manual');s.mage={x:30,y:285};
    s.ghosts=[{id:0,x:30,y:110,phase:0},{id:1,x:290,y:110,phase:0}];
    expect(findGhostSpawn(s,()=>0)).toBeUndefined();
    s.spawnIn=0;stepHunt(s,idle,1/60,()=>0);expect(s.ghosts).toHaveLength(2);expect(s.spawnIn).toBe(.35);
  });
  it('respects ghost separation at spawn and never immediately replaces a defeated ghost',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');advance(s,6);
    expect(s.ghosts).toHaveLength(4);
    const p=findGhostSpawn(s,random());expect(p).toBeDefined();
    expect(s.ghosts.every(g=>Math.hypot(g.x-p!.x,g.y-p!.y)>=56)).toBe(true);
    stepHunt(s,idle,1/60);s.ghosts.pop();const count=s.nextId;advance(s,.5);
    expect(s.nextId).toBe(count);expect(s.ghosts).toHaveLength(3);
  });
  it('pursues smoothly below the capped speed and separates overlapping ghosts',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');s.mage={x:800,y:450};s.spawnIn=100;
    s.ghosts=[{id:0,x:400,y:450,phase:0,age:1},{id:1,x:400,y:450,phase:1,age:1}];
    const before=Math.hypot(s.ghosts[0].x-s.mage.x,s.ghosts[0].y-s.mage.y);advance(s,1);
    expect(Math.hypot(s.ghosts[0].x-s.mage.x,s.ghosts[0].y-s.mage.y)).toBeLessThan(before);
    expect(Math.hypot(s.ghosts[0].x-s.ghosts[1].x,s.ghosts[0].y-s.ghosts[1].y)).toBeGreaterThan(5);
    for(const g of s.ghosts)expect(Math.hypot(g.vx!,g.vy!)).toBeLessThanOrEqual(100.001);
    expect(huntDifficulty(0)).toEqual({level:0,maxGhosts:4,speed:100,spawnInterval:1.25});
    expect(huntDifficulty(30).maxGhosts).toBe(5);expect(huntDifficulty(60).speed).toBe(128);
    expect(huntDifficulty(10000)).toEqual({level:3,maxGhosts:7,speed:142,spawnInterval:.8});
  });
  it('keeps normal survival capped and autoplay at its fixed demonstration pace',()=>{
    for(const time of [0,30,60,90,300]){
      const normal=huntDifficulty(time),demo=huntDifficulty(time,'auto');
      expect(normal.speed).toBeLessThan(215);expect(normal.maxGhosts).toBeLessThanOrEqual(7);
      expect(demo).toEqual({level:0,maxGhosts:4,speed:68,spawnInterval:1.5});
    }
    expect(huntDifficulty(90)).toEqual(huntDifficulty(300));
  });
  it('puts a stationary player under pressure within thirty seconds across seeded encounters',()=>{
    const durations=[];
    for(const seed of [7,123,2026,8451]){
      const s=createHunt(1440,900);controlHunt(s,'manual');const rng=random(seed);
      for(let i=0;i<30*60&&!s.dead;i++)stepHunt(s,idle,1/60,rng);
      expect(s.dead).toBe(true);expect(s.manualTime).toBeGreaterThan(5);expect(s.manualTime).toBeLessThan(30);
      durations.push(Number(s.manualTime.toFixed(1)));
    }
    console.log('Normal difficulty, stationary survival seconds:',durations);
  });
  it('damages once per cooldown, pushes the ghost away and ends the run at three hits',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');s.invulnerable=0;s.spawnIn=100;
    const heard:string[]=[];
    for(let hit=0;hit<3;hit++){
      s.ghosts=[{id:0,x:s.mage.x,y:s.mage.y,phase:0,age:1}];
      stepHunt(s,idle,1/60,()=>.5,kind=>heard.push(kind));
      expect(s.health).toBe(2-hit);expect(Math.hypot(s.ghosts[0].x-s.mage.x,s.ghosts[0].y-s.mage.y)).toBeCloseTo(70);
      if(hit<2){
        s.ghosts[0].x=s.mage.x;s.ghosts[0].y=s.mage.y;stepHunt(s,idle,1/60);expect(s.health).toBe(2-hit);
        s.invulnerable=0;
      }
    }
    expect(s.dead).toBe(true);expect(heard.filter(k=>k==='hurt')).toHaveLength(3);expect(heard.filter(k=>k==='defeat')).toHaveLength(1);
    const frozen={time:s.time,x:s.mage.x,y:s.mage.y,ghosts:JSON.stringify(s.ghosts)};
    advance(s,1,{...idle,keys:new Set(['d']),firing:true});
    expect({time:s.time,x:s.mage.x,y:s.mage.y,ghosts:JSON.stringify(s.ghosts)}).toEqual(frozen);expect(s.shots).toHaveLength(0);
    controlHunt(s,'manual');expect(s.health).toBe(3);expect(s.dead).toBe(false);expect(s.score).toBe(0);expect(s.time).toBe(0);expect(s.ghosts).toHaveLength(0);
    controlHunt(s,'auto');s.invulnerable=0;s.ghosts=[{id:1,...s.mage,phase:0,age:1}];stepHunt(s,idle,1/60);expect(s.health).toBe(3);
  });
  it('standing still is dangerous, while moving around the arena allows a long survival run',()=>{
    const still=createHunt(1440,900);controlHunt(still,'manual');advance(still,90);expect(still.dead).toBe(true);expect(still.time).toBeGreaterThan(5);
    const moving=createHunt(1440,900);controlHunt(moving,'manual');moving.mage={x:1060,y:450};const rng=random();
    let maxGhosts=0;
    for(let i=0;i<120*60&&!moving.dead;i++){
      const target={x:720+340*Math.cos(i/60*.65),y:450+220*Math.sin(i/60*.65)};
      const keys=new Set<string>();if(target.x>moving.mage.x+3)keys.add('d');if(target.x<moving.mage.x-3)keys.add('a');if(target.y>moving.mage.y+3)keys.add('s');if(target.y<moving.mage.y-3)keys.add('w');
      stepHunt(moving,{...idle,keys,aim:nearestGhost(moving)??idle.aim,firing:true},1/60,rng);maxGhosts=Math.max(maxGhosts,moving.ghosts.length);
    }
    expect(moving.dead).toBe(false);expect(moving.time).toBeGreaterThan(119);expect(maxGhosts).toBeLessThanOrEqual(7);
  });
});
