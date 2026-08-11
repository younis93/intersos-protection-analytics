import {describe,expect,it} from 'vitest';
import {GUARDIAN_FOX_PRESS_WINDOW_MS,HOME_FOX_ACTIONS,chooseNextFoxAction,registerGuardianFoxPress,type GuardianFoxPressState} from './GuardianFox';

const press=(times:number,spacing=400)=>{
  let state:GuardianFoxPressState={count:0,startedAt:0};
  let unlocked=false;
  for(let index=0;index<times;index++)({state,unlocked}=registerGuardianFoxPress(state,1000+index*spacing));
  return {state,unlocked};
};

describe('guardian fox unlock gesture',()=>{
  it('does not unlock after four timely presses',()=>expect(press(4).unlocked).toBe(false));
  it('unlocks after five presses within the window',()=>expect(press(5).unlocked).toBe(true));
  it('resets an expired sequence',()=>{
    const first=press(4);
    const result=registerGuardianFoxPress(first.state,1000+GUARDIAN_FOX_PRESS_WINDOW_MS+1);
    expect(result).toEqual({state:{count:1,startedAt:1000+GUARDIAN_FOX_PRESS_WINDOW_MS+1},unlocked:false});
  });
});

describe('guardian fox animation choices',()=>{
  it('never immediately repeats the current action',()=>{
    expect(chooseNextFoxAction(HOME_FOX_ACTIONS,'idle',()=>0)).not.toBe('idle');
    expect(chooseNextFoxAction(HOME_FOX_ACTIONS,'idle',()=>.999)).not.toBe('idle');
  });

  it('can select every alternative action',()=>{
    const selected=new Set([0,.24,.49,.74,.999].map(value=>chooseNextFoxAction(HOME_FOX_ACTIONS,'idle',()=>value)));
    expect(selected).toEqual(new Set(HOME_FOX_ACTIONS.filter(action=>action!=='idle')));
  });
});
