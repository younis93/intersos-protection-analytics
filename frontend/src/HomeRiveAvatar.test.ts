import {describe,expect,it} from 'vitest';
import {AVATAR_ACTIVITIES,AVATAR_GREETING_MS,AVATAR_LANDING_MS,AVATAR_TUMBLE_MS,AVATAR_DOWN_MS,AVATAR_GET_UP_MS,AVATAR_THINK_DELAY_MS,AVATAR_WALK_MIN_MS,AVATAR_WALK_RANGE_MS,avatarTravelBounds,avatarDropDuration,clampAvatarPosition,nextAvatarActivity,nextWalkDuration} from './HomeRiveAvatar';

describe('cartoon home avatar behavior',()=>{
  it('allows a full greeting and an unhurried fall recovery',()=>{expect(AVATAR_GREETING_MS).toBe(2400);expect(AVATAR_LANDING_MS).toBe(AVATAR_TUMBLE_MS+AVATAR_DOWN_MS+AVATAR_GET_UP_MS)});
  it('walks for three to six seconds',()=>{expect(nextWalkDuration(()=>0)).toBe(AVATAR_WALK_MIN_MS);expect(nextWalkDuration(()=>1)).toBe(AVATAR_WALK_MIN_MS+AVATAR_WALK_RANGE_MS-1)});
  it('starts thinking after eight seconds',()=>expect(AVATAR_THINK_DELAY_MS).toBe(8000));
  it('cycles through the additional home activities',()=>{
    expect(AVATAR_ACTIVITIES).toEqual(['idle','walking','sitting','reading','playing','stretching','looking','celebrating']);
    expect(nextAvatarActivity(()=>0)).toBe('idle');
    expect(nextAvatarActivity(()=>.999999)).toBe('celebrating');
  });
  it('keeps a dragged avatar inside the viewport',()=>{
    expect(clampAvatarPosition(-20,0,500)).toBe(0);
    expect(clampAvatarPosition(220,0,500)).toBe(220);
    expect(clampAvatarPosition(900,0,500)).toBe(500);
  });
  it('uses the actual responsive character dimensions for screen bounds',()=>{
    expect(avatarTravelBounds(390,844,120,158)).toEqual({maxX:238,maxLift:674});
    expect(avatarTravelBounds(1440,900,152,200)).toEqual({maxX:1256,maxLift:688});
    expect(avatarTravelBounds(100,100,152,200)).toEqual({maxX:0,maxLift:0});
  });
  it('gives higher drops more falling time while bounding the duration',()=>{
    expect(avatarDropDuration(400)).toBeGreaterThan(avatarDropDuration(100));
    expect(avatarDropDuration(0)).toBe(180);
    expect(avatarDropDuration(-10)).toBe(180);
    expect(avatarDropDuration(2000)).toBe(650);
  });
});
