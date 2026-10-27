import {describe,expect,it} from 'vitest';
import {ACTIVITIES,ActiveClock,BOY,DURATIONS,armTo,flow,mixPose,poseAt,standingPose,walkStep,type Activity} from './boyMotion';

describe('shared character choreography',()=>{
  it('never overshoots an acting track and keeps velocity through intermediate poses',()=>{
    const keys=[[0,0],[500,10],[1000,20],[1600,20]] as const;
    for(let t=0;t<=1600;t+=4)expect(flow(t,keys)).toBeGreaterThanOrEqual(0);
    expect(flow(501,keys)-flow(499,keys)).toBeGreaterThan(.02);
    for(let t=1000;t<=1600;t+=4)expect(flow(t,keys)).toBeCloseTo(20,10);
  });
  it('produces finite connected poses with positive volume for every activity and recovery',()=>{
    const activities:Activity[]=[...ACTIVITIES,'thinking','greeting'];
    for(const activity of activities)for(let t=0;t<=DURATIONS[activity];t+=16){
      const p=poseAt(activity,t,t);
      expect(Object.values(p).every(Number.isFinite)).toBe(true);expect(p.sy).toBeGreaterThan(.7);
      expect(p.lid).toBeGreaterThanOrEqual(0);expect(p.lid).toBeLessThanOrEqual(1);
    }
    for(const recovery of ['falling','down','getting-up'] as const)for(let t=0;t<1400;t+=16){
      expect(Object.values(poseAt('idle',t,t,false,recovery)).every(Number.isFinite)).toBe(true);
    }
  });
  it('starts interrupted transitions at the exact displayed pose',()=>{
    const current=poseAt('reading',1800,1800),target=poseAt('greeting',0,1800);
    expect(mixPose(current,target,0)).toEqual(current);expect(mixPose(current,target,1)).toEqual(target);
    const next=mixPose(current,target,.001);
    for(const key of Object.keys(current) as (keyof typeof current)[])expect(Math.abs(next[key]-current[key])).toBeLessThan(.2);
  });
  it('pauses active time rather than consuming the routine while hidden',()=>{
    const c=new ActiveClock();c.tick(1000);c.tick(1400);expect(c.time).toBe(400);
    c.pause();c.tick(50000);expect(c.time).toBe(400);c.tick(50016);expect(c.time).toBe(416);
    c.pause();c.pause();c.tick(90000);expect(c.time).toBe(416);
  });
  it('closes idle loops without a seam and gives blinks readable closing and reopening times',()=>{
    const first=poseAt('idle',0,0),last=poseAt('idle',0,319200);
    for(const key of Object.keys(first) as (keyof typeof first)[])expect(last[key]).toBeCloseTo(first[key],7);
    expect(poseAt('idle',0,110).lid).toBe(1);expect(poseAt('idle',0,150).lid).toBe(1);
    expect(poseAt('idle',0,340).lid).toBe(0);expect(poseAt('idle',0,230).lid).toBeGreaterThan(0);
  });
  it('solves hand positions onto the book and face using the shared redesigned limb lengths',()=>{
    for(const [side,x,y] of [['L',57,141],['R',103,141],['R',107,76]] as const){
      const [a,e]=armTo(side,x,y),root=BOY.pivots[side==='L'?'armL':'armR'],joint=BOY.pivots[side==='L'?'elbowL':'elbowR'];
      const hand=BOY.pivots[side==='L'?'gripL':'gripR'];
      const rotate=(x:number,y:number,degrees:number)=>{const r=degrees*Math.PI/180;return [x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)]};
      const upper=rotate(joint[0]-root[0],joint[1]-root[1],a),lower=rotate(hand[0]-joint[0],hand[1]-joint[1],a+e);
      expect(root[0]+upper[0]+lower[0]).toBeCloseTo(x,5);expect(root[1]+upper[1]+lower[1]).toBeCloseTo(y,5);
    }
  });
  it('times airborne feet and compression to contact, and the ball launch to the strike',()=>{
    expect(poseAt('idle',300,300,true).footL).toBeGreaterThan(30);
    expect(poseAt('idle',200,200,false,'falling',440).sy).toBe(1);
    expect(poseAt('idle',550,550,false,'falling',440).sy).toBeLessThan(1);
    const contact=poseAt('playing',1450,1450),air=poseAt('playing',2200,2200);
    expect(contact.ballX).toBe(-22);expect(contact.ballY).toBeCloseTo(0);expect(air.ballY).toBeLessThan(-60);
    expect(Object.values(standingPose()).every(Number.isFinite)).toBe(true);
  });
  it('turns the body and both shoes toward travel, then returns to the front before resting',()=>{
    for(const direction of [1,-1] as const){
      const p=poseAt('walking',1300,1300,false,null,440,780,{direction,walkMs:6000});
      expect(p.facing).toBe(direction);expect(p.shoeL).toBe(direction);expect(p.shoeR).toBe(direction);
      const rest=poseAt('walking',6660,6660,false,null,440,780,{direction,walkMs:6000});
      expect(rest.facing).toBeCloseTo(0);expect(rest.shoeL).toBeCloseTo(-.35);expect(rest.shoeR).toBeCloseTo(.35);
    }
  });
  it('plants the stance foot in world space and lifts the swinging foot',()=>{
    const positions=[.05,.15,.25,.35,.45].map(phase=>phase*60+walkStep(phase,60).x);
    for(const x of positions)expect(x).toBeCloseTo(15,8);
    expect(walkStep(.75,60).lift).toBeGreaterThan(4);
    expect(walkStep(0,60)).toEqual(walkStep(1,60));
  });
  it('keeps the waving fingers upright and walking hands hanging down',()=>{
    for(const t of [875,1100,1185,1400]){
      const p=poseAt('greeting',t,t);expect(Math.abs(p.armR+p.elbowR+p.wristR+175)).toBeLessThanOrEqual(13);
    }
    for(const direction of [1,-1] as const)for(let t=1000;t<1800;t+=80){
      const p=poseAt('walking',t,t,false,null,440,780,{direction});
      expect(Math.abs(p.armL+p.elbowL+p.wristL)).toBeLessThanOrEqual(2.1);
      expect(Math.abs(p.armR+p.elbowR+p.wristR)).toBeLessThanOrEqual(2.1);
    }
  });
  it('joins impact, rest, and get-up without replacing the fallen pose',()=>{
    const landed=poseAt('idle',440+BOY.tumble,2000,false,'falling',440);
    const down=poseAt('idle',0,2000,false,'down',440),rise=poseAt('idle',0,2000,false,'getting-up',440);
    for(const key of ['lean','shift','sy','armL','armR','elbowL','elbowR','kneeL','kneeR','head','shoeL','shoeR'] as const){
      expect(landed[key]).toBeCloseTo(down[key],8);expect(rise[key]).toBeCloseTo(down[key],8);
    }
  });
  it('gets up through a brace, knee tuck, and straightening rather than only rotating',()=>{
    const brace=poseAt('idle',400,2000,false,'getting-up'),push=poseAt('idle',800,2000,false,'getting-up'),end=poseAt('idle',BOY.getUp,2000,false,'getting-up');
    expect(brace.kneeL).toBeGreaterThan(70);expect(Math.abs(brace.elbowL)).toBeGreaterThan(70);
    expect(push.upperY).toBe(18);expect(push.thighScale).toBeLessThan(.7);
    expect(end.lean).toBe(0);expect(end.upperY).toBe(0);expect(end.sy).toBe(1);
  });
});
