import {describe,expect,it} from 'vitest';
import {AVATAR_ACTIVITIES,AVATAR_THINK_DELAY_MS,AVATAR_WALK_MIN_MS,AVATAR_WALK_RANGE_MS,RIVE_AVATAR,clampAvatarPosition,nextAvatarActivity,nextWalkDuration} from './HomeRiveAvatar';

describe('Rive home avatar contract',()=>{
  it('uses the packaged starter avatar state machine contract',()=>expect(RIVE_AVATAR).toEqual({src:'/avatar/intersos-guardian.riv',artboard:'Artboard',stateMachine:'State Machine 1',inputs:{walking:'Number 1'}}));
  it('walks for three to six seconds',()=>{expect(nextWalkDuration(()=>0)).toBe(AVATAR_WALK_MIN_MS);expect(nextWalkDuration(()=>1)).toBe(AVATAR_WALK_MIN_MS+AVATAR_WALK_RANGE_MS-1)});
  it('starts thinking after eight seconds',()=>expect(AVATAR_THINK_DELAY_MS).toBe(8000));
  it('cycles through the additional home activities',()=>{
    expect(AVATAR_ACTIVITIES).toEqual(['idle','walking','sitting','reading','playing']);
    expect(nextAvatarActivity(()=>0)).toBe('idle');
    expect(nextAvatarActivity(()=>.999999)).toBe('playing');
  });
  it('keeps a dragged avatar inside the viewport',()=>{
    expect(clampAvatarPosition(-20,0,500)).toBe(0);
    expect(clampAvatarPosition(220,0,500)).toBe(220);
    expect(clampAvatarPosition(900,0,500)).toBe(500);
  });
});
