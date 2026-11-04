import {describe,it,expect} from 'vitest';
import {createHunt,controlHunt,handoffHunt,ghostFacing,staffPose,stepHunt,type HuntInput} from './halloweenSimulation';
import {createFrame,createFx} from './vendor/pixelfx/core/index.js';
import * as ghost from './vendor/pixelfx/fx/critters/ghost.js';
const idle:HuntInput={keys:new Set(),aim:{x:600,y:400},firing:false};
describe('live Halloween handoffs and target-facing ghosts',()=>{
  it('hands off the current scene after long autoplay and repeated manual runs',()=>{
    const s=createHunt(1440,900);
    for(let i=0;i<120*30;i++)stepHunt(s,idle,1/30,()=>.3);
    expect(s.manualTime).toBe(0);expect(s.score).toBeGreaterThan(0);
    s.health=2;
    for(let run=0;run<3;run++){
      const before=structuredClone(s),mage=s.mage,ghosts=s.ghosts,shots=s.shots;
      handoffHunt(s,'manual');
      expect(s).toEqual({...before,mode:'manual',invulnerable:Math.max(before.invulnerable,1)});
      expect(s.mage).toBe(mage);expect(s.ghosts).toBe(ghosts);expect(s.shots).toBe(shots);
      stepHunt(s,idle,1/30,()=>.3);
      const manual=structuredClone(s);handoffHunt(s,'auto');expect(s).toEqual({...manual,mode:'auto'});
      for(let i=0;i<60;i++)stepHunt(s,idle,1/30,()=>.3);
      expect(s.manualTime).toBe(manual.manualTime);expect(s.health).toBe(2);
    }
    controlHunt(s,'manual');expect(s.manualTime).toBe(0);expect(s.score).toBe(0);expect(s.health).toBe(3);
  });
  it('counts difficulty only during manual steps, never during pauses or autoplay',()=>{
    const s=createHunt(1440,900);s.spawnIn=9999;handoffHunt(s,'manual');s.manualTime=29.9;
    for(let i=0;i<6;i++)stepHunt(s,idle,1/30);
    expect(s.manualTime).toBeCloseTo(30.1);
    handoffHunt(s,'auto');for(let i=0;i<3600;i++)stepHunt(s,idle,1/30);
    expect(s.manualTime).toBeCloseTo(30.1);
    const paused=structuredClone(s);handoffHunt(s,'auto');expect(s).toEqual(paused);
    handoffHunt(s,'manual');expect(s.manualTime).toBeCloseTo(30.1);
  });
  it('protects the mage on takeover without healing or resetting a nearby ghost',()=>{
    const s=createHunt(1440,900);s.health=1;s.invulnerable=0;
    s.ghosts=[{...s.mage,id:1,phase:0,age:1}];handoffHunt(s,'manual');
    stepHunt(s,idle,1/30);expect(s.health).toBe(1);expect(s.ghosts).toHaveLength(1);
    s.dead=true;const before=structuredClone(s);handoffHunt(s,'auto');expect(s).toEqual(before);
  });
  it('initializes facing on every spawn edge, even before appearance completes',()=>{
    for(const random of [()=>0,()=>.25,()=>.5,()=>.75]){
      const s=createHunt(1440,900);controlHunt(s,'manual');s.mage={x:720,y:450};s.spawnIn=0;
      stepHunt(s,idle,1/60,random);expect(s.ghosts).toHaveLength(1);
      const g=s.ghosts[0];expect(g.facing).toBe(s.mage.x<g.x?-1:1);expect(g.age).toBeLessThan(.7);
    }
  });
  it('keeps facing through vertical crossings and separation, reversing only beyond 12px',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');s.spawnIn=100;
    const g={id:1,x:500,y:300,phase:0,age:0,facing:-1 as 1|-1,vx:76,vy:0};s.ghosts=[g];
    for(const dx of [-11,0,11,-3]){s.mage={x:g.x+dx,y:500};stepHunt(s,idle,1/60);expect(g.facing).toBe(-1)}
    s.mage={x:g.x+13,y:500};stepHunt(s,idle,1/60);expect(g.facing).toBe(1);
    expect(ghostFacing(-12,1)).toBe(1);expect(ghostFacing(-13,1)).toBe(-1);
    g.age=1;g.vx=-76;s.mage={x:g.x+200,y:500};stepHunt(s,idle,1/60);expect(g.vx).toBeLessThan(0);expect(g.facing).toBe(1);
  });
  it('keeps both staff-arm bones constant and the muzzle on the shaft at all aim angles',()=>{
    const s=createHunt(1440,900);
    for(const facing of [-1,1] as const)for(const angle of [-Math.PI,-Math.PI/2,0,Math.PI/2,Math.PI])for(const castTime of [0,.1,1]){
      Object.assign(s,{facing,staffAngle:angle,castTime});const p=staffPose(s);
      expect(Math.hypot(p.elbow.x-p.shoulder.x,p.elbow.y-p.shoulder.y)).toBeCloseTo(12);
      expect(Math.hypot(p.hand.x-p.elbow.x,p.hand.y-p.elbow.y)).toBeCloseTo(12);
      expect(Math.hypot(p.tip.x-p.hand.x,p.tip.y-p.hand.y)).toBeCloseTo(30);
    }
  });
  it('preserves upstream ghost defaults and supports the documented face-free anchored adapter',()=>{
    const original=createFx(ghost,{x:64,y:100}),explicit=createFx(ghost,{x:64,y:100,face:true,drift:true});
    const body=createFx(ghost,{x:64,y:100,face:false,drift:false});
    for(const dt of [0,.3,.7,1]){
      const a=createFrame(128,128),b=createFrame(128,128),c=createFrame(128,128);
      for(const fx of [original,explicit,body])fx.update(dt);
      original.draw(a);explicit.draw(b);body.draw(c);
      expect(a.color).toEqual(b.color);expect(a.light).toEqual(b.light);expect(c.color).not.toEqual(a.color);
    }
  });
});
