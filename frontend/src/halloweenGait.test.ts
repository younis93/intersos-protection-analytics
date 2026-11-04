import {describe,it,expect} from 'vitest';
import {createHunt,controlHunt,mageLegPose,stepHunt} from './halloweenSimulation';
describe('mage walking feet',()=>{
  it('keeps both boots clear of the robe throughout the walking cycle',()=>{
    for(let i=0;i<120;i++){
      const legs=mageLegPose({walkPhase:i/120*Math.PI*2,moving:true},false);
      for(const {ankle,root,knee} of legs){
        expect(Math.round(ankle.y)-2).toBeGreaterThan(9);
        // A bent-knee crouch must not return during either half of the step.
        expect(Math.abs(knee.x-(root.x+ankle.x)/2)).toBeLessThanOrEqual(.350001);
        expect(Math.abs(ankle.x-root.x)).toBeLessThanOrEqual(1.25);
        expect(ankle.y).toBeGreaterThanOrEqual(18);
        expect(ankle.y).toBeLessThanOrEqual(19);
      }
    }
  });
  it('swings forward while lifted and moves backward during floor contact',()=>{
    const first=(phase:number)=>mageLegPose({walkPhase:phase,moving:true},false)[0].ankle;
    expect(first(.2).x).toBeLessThan(first(Math.PI-.2).x);
    expect(first(Math.PI+.2).x).toBeGreaterThan(first(2*Math.PI-.2).x);
    expect(first(Math.PI+.2).y).toBe(19);expect(first(2*Math.PI-.2).y).toBe(19);
    expect(first(Math.PI/2).y).toBeLessThan(19);
  });
  it('turns the whole character toward travel while the staff aims independently',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');s.mage={x:720,y:450};s.spawnIn=100;
    stepHunt(s,{keys:new Set(['d']),aim:{x:0,y:450},firing:false},1/30);
    expect(s.facing).toBe(1);expect(Math.cos(s.staffAngle)).toBeLessThan(0);
    stepHunt(s,{keys:new Set(['a']),aim:{x:1400,y:450},firing:false},1/30);
    expect(s.facing).toBe(-1);expect(Math.cos(s.staffAngle)).toBeGreaterThan(0);
    stepHunt(s,{keys:new Set(['w']),aim:{x:1400,y:450},firing:false},1/30);
    expect(s.facing).toBe(-1);
    stepHunt(s,{keys:new Set(),aim:{x:1400,y:450},firing:false},1/30);
    expect(s.facing).toBe(1);
  });
  it('uses a stable standing pose when idle or reduced motion is enabled',()=>{
    const standing=mageLegPose({walkPhase:0,moving:false},false);
    expect(mageLegPose({walkPhase:2,moving:false},false)).toEqual(standing);
    expect(mageLegPose({walkPhase:2,moving:true},true)).toEqual(standing);
  });
});

