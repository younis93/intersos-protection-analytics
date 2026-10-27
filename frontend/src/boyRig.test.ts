import {describe,expect,it} from 'vitest';
import {RIG,armGeometry,legGeometry,handPath,rotatePoint} from './boyRig';
import {ACTIVITIES,DURATIONS,poseAt,type Activity} from './boyMotion';

describe('redesigned character rig',()=>{
  it('keeps tapered joint contours finite across the full supported bend range',()=>{
    for(const side of ['L','R'] as const){
      for(let bend=-RIG.limits.elbow;bend<=RIG.limits.elbow;bend+=5){
        const shape=armGeometry(side,bend);
        expect(shape.fill).not.toMatch(/NaN|Infinity/);expect(shape.outline).not.toMatch(/NaN|Infinity/);
        expect((shape.outline.match(/M /g)||[]).length).toBe(2);
        expect(shape.outline).not.toContain('Z'); // No transverse edge across elbow or wrist.
      }
      for(let bend=-RIG.limits.knee;bend<=RIG.limits.knee;bend+=5)for(const scale of [1,.55]){
        expect(legGeometry(side,bend,scale).fill).not.toMatch(/NaN|Infinity/);
      }
    }
  });
  it('morphs hand contours with matching path topology rather than switching drawings',()=>{
    const topology=(s:string)=>s.match(/[A-Za-z]/g)?.join('');
    const first=topology(handPath(0,0));
    for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){
      const hand=handPath(i/10,j/10);expect(topology(hand)).toBe(first);expect(hand).not.toMatch(/NaN|Infinity/);
    }
    expect(handPath(1,0)).not.toBe(handPath(0,1));
  });
  it('keeps wrist, knee, and ankle controls inside their designed movement range',()=>{
    const activities:Activity[]=[...ACTIVITIES,'thinking','greeting'];
    for(const activity of activities)for(let t=0;t<=DURATIONS[activity];t+=40){
      const p=poseAt(activity,t,t);
      for(const value of [p.wristL,p.wristR])expect(Math.abs(value)).toBeLessThanOrEqual(RIG.limits.wrist);
      for(const value of [p.elbowL,p.elbowR])expect(Math.abs(value)).toBeLessThanOrEqual(RIG.limits.elbow);
      for(const value of [p.kneeL,p.kneeR])expect(Math.abs(value)).toBeLessThanOrEqual(RIG.limits.knee);
      for(const value of [p.footL,p.footR])expect(Math.abs(value)).toBeLessThanOrEqual(RIG.limits.ankle);
    }
  });
  it('keeps reading elbows outside the torso and fingers at the book corners',()=>{
    const p=poseAt('reading',1800,1800),pivot=RIG.pivots;
    const left=rotatePoint(pivot.elbowL,pivot.armL,p.armL),right=rotatePoint(pivot.elbowR,pivot.armR,p.armR);
    expect(left[0]).toBeLessThan(pivot.armL[0]);expect(right[0]).toBeGreaterThan(pivot.armR[0]);
    expect(p.gripL).toBe(1);expect(p.gripR).toBe(1);
  });
  it('waves at the wrist while keeping the elbow gesture steady and palm open',()=>{
    const a=poseAt('greeting',875,875),b=poseAt('greeting',1185,1185);
    expect(a.openR).toBe(1);expect(Math.abs(a.wristR-b.wristR)).toBeGreaterThan(10);
    expect(Math.abs(a.elbowR-b.elbowR)).toBeLessThan(3);
  });
  it('foreshortens seated thighs rather than folding the feet sideways',()=>{
    const p=poseAt('sitting',1800,1800);
    expect(p.thighScale).toBeCloseTo(.55);expect(p.upperY).toBe(11);
    expect(p.legL+p.kneeL+p.footL).toBeCloseTo(0);
    expect(p.legR+p.kneeR+p.footR).toBeCloseTo(0);
  });
});
