import {describe,expect,it} from 'vitest';
import {boundPoint,controlHunt,createHunt,nearestGhost,resizeHunt,staffPose,stepHunt,type HuntInput} from './halloweenSimulation';

const idle=():HuntInput=>({keys:new Set(),aim:{x:500,y:200},firing:false});
describe('Halloween ghost hunt',()=>{
  it('starts in autoplay, wanders, shoots and catches endlessly respawning ghosts',()=>{
    const s=createHunt(1440,900),start={...s.mage};
    for(let i=0;i<1800;i++)stepHunt(s,idle(),1/60,()=>.3);
    expect(s.mode).toBe('auto');expect(s.mage).not.toEqual(start);expect(s.score).toBeGreaterThan(5);
    expect(s.nextId).toBeGreaterThan(10);expect(s.ghosts.length).toBeLessThanOrEqual(4);expect(s.health).toBe(3);
    expect(s.shots.length).toBeLessThan(35);
  });
  it('selects the nearest ghost',()=>{
    const s=createHunt(900,700);
    s.ghosts=[{id:0,x:800,y:150,phase:0},{id:1,x:s.mage.x+40,y:s.mage.y,phase:0}];
    expect(nearestGhost(s)?.id).toBe(1);
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
    for(let i=0;i<3;i++)stepHunt(straight,{...idle(),firing:true},1/30);
    expect(straight.shots).toHaveLength(1);expect(straight.shots[0].vx).toBeGreaterThan(0);
  });
  it('resumes automatic shooting after manual mode',()=>{
    const s=createHunt(1000,800);controlHunt(s,'manual');stepHunt(s,idle(),1/60);
    expect(s.shots).toHaveLength(0);controlHunt(s,'auto');for(let i=0;i<8;i++)stepHunt(s,idle(),1/60,()=>.9);
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
    for(let i=0;i<4;i++)stepHunt(s,input,1/30,()=>.9);
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
