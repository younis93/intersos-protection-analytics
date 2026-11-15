import {afterEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_HALLOWEEN_MIX,HALLOWEEN_WALTZ,readHalloweenMix,saveHalloweenMix} from './halloweenAudio';
import {BOSS_ORDER,controlHunt,createHunt,isBossAttackSound,MAGE_CAST_WINDUP,MAGE_DEFEAT_TIMING,stepHunt,useAbility,type HuntInput} from './halloweenSimulation';

afterEach(()=>vi.unstubAllGlobals());
describe('Halloween audio preferences',()=>{
  it('uses a balanced default mix when storage is unavailable or corrupt',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked')}});
    expect(readHalloweenMix()).toEqual(DEFAULT_HALLOWEEN_MIX);
    vi.stubGlobal('localStorage',{getItem:()=>'{broken'});
    expect(readHalloweenMix()).toEqual(DEFAULT_HALLOWEEN_MIX);
  });
  it('restores mute, bounds volumes and tolerates invalid preference fields',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({muted:true,music:4,effects:-1})});
    expect(readHalloweenMix()).toEqual({muted:true,music:1,effects:0});
    vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({muted:'yes',music:'loud',effects:null})});
    expect(readHalloweenMix()).toEqual(DEFAULT_HALLOWEEN_MIX);
  });
  it('saves the mix without making storage failures affect gameplay',()=>{
    const setItem=vi.fn();vi.stubGlobal('localStorage',{setItem});
    saveHalloweenMix({muted:true,music:.2,effects:.4});
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({muted:true,music:.2,effects:.4});
    vi.stubGlobal('localStorage',{setItem:()=>{throw new Error('blocked')}});
    expect(()=>saveHalloweenMix(DEFAULT_HALLOWEEN_MIX)).not.toThrow();
  });
});
describe('Halloween sound timing',()=>{
  const idle:HuntInput={keys:new Set(),aim:{x:900,y:400},firing:false};
  it('sounds the charge before the shot, and the impact before the death cue',()=>{
    const s=createHunt(1440,900);controlHunt(s,'manual');const heard:string[]=[];
    const hear=(kind:string)=>heard.push(kind);
    stepHunt(s,{...idle,firing:true},1/30,()=>.9,hear);
    expect(heard.filter(kind=>kind==='ghost')).toHaveLength(0);
    expect(heard).toContain('cast');expect(heard).not.toContain('shot');
    const releaseTick=Math.ceil(MAGE_CAST_WINDUP*30);
    for(let i=1;i<releaseTick-1;i++)stepHunt(s,{...idle,firing:true},1/30,()=>.9,hear);
    expect(heard).not.toContain('shot');
    stepHunt(s,{...idle,firing:true},1/30,()=>.9,hear);
    expect(heard.indexOf('shot')).toBeGreaterThan(heard.indexOf('cast'));
    s.spawnIn=0;stepHunt(s,idle,1/30,()=>.9,hear);expect(heard.filter(kind=>kind==='ghost')).toHaveLength(1);
    s.ghosts[0]={id:100,x:500,y:250,phase:0};
    s.shots=[{x:450,y:241,vx:3000,vy:0,life:1}];
    stepHunt(s,idle,1/30,()=>.9,hear);
    expect(heard.slice(-2)).toEqual(['hit','death']);
    expect(s.score).toBe(1);
  });
  it.each([
    {boss:0,ranges:[110,480,255,110],expected:['gravekeeper-shovel','gravekeeper-skull','gravekeeper-summon']},
    {boss:1,ranges:[80,255,160,480,80],expected:['hex-claw','hex-roar','hex-mist','hex-swarm']},
    {boss:2,ranges:[100,100,160,330,100],expected:['tyrant-dive','tyrant-slam','tyrant-fire','tyrant-hurricane']},
    {boss:3,ranges:[480,78,115,480],expected:['phantom-barrage','phantom-tongue','phantom-scream']},
  ] as const)('plays each attack cue once per release for boss $boss',({boss,ranges,expected})=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.defeated=BOSS_ORDER.indexOf(boss);hunt.time=60;hunt.spawnIn=100;hunt.invulnerable=100;
    const heard:string[]=[];
    const hear=(kind:string)=>{if(isBossAttackSound(kind)||kind==='boss-strike')heard.push(kind)};
    for(let i=0;i<1500&&heard.length<=expected.length;i++){
      if(hunt.boss?.phase==='pursuit'&&hunt.boss.remaining<=1/60){
        const range=ranges[heard.length];
        const direction=hunt.boss.x>hunt.width/2?-1:1;
        hunt.mage={x:hunt.boss.x+direction*range,y:hunt.boss.y};
      }
      stepHunt(hunt,idle,1/60,()=>.5,hear);
    }
    expect(heard).toEqual([...expected,expected[0]]);
  });
  it('gives each unlocked player ability a distinct cue and respects cooldowns',()=>{
    const hunt=createHunt(1440,900);
    hunt.abilities=[0,0,0,0];
    const heard:string[]=[];
    for(let i=0;i<4;i++){
      expect(useAbility(hunt,i,undefined,kind=>heard.push(kind))).toBe(true);
      expect(useAbility(hunt,i,undefined,kind=>heard.push(kind))).toBe(false);
    }
    expect(heard).toEqual(['grave-ward','hex-burst','phantom-dash','royal-volley']);
  });
  it('schedules defeat cues once at the matching animation stages',()=>{
    const hunt=createHunt(1440,900);
    controlHunt(hunt,'manual');
    hunt.dead=true;
    const heard:Array<{kind:string;time:number}>=[];
    for(let i=0;i<140;i++)stepHunt(hunt,idle,1/60,()=>.5,kind=>heard.push({kind,time:hunt.deathTime}));
    expect(heard.map(cue=>cue.kind)).toEqual(['defeat-impact','defeat-dissolve','defeat-shadow']);
    const stages=[MAGE_DEFEAT_TIMING.staffFalls,MAGE_DEFEAT_TIMING.dissolve,MAGE_DEFEAT_TIMING.specter];
    heard.forEach(({time},index)=>{
      expect(time).toBeGreaterThanOrEqual(stages[index]);
      expect(time-stages[index]).toBeLessThanOrEqual(1/60);
    });
    controlHunt(hunt,'manual');
    stepHunt(hunt,idle,1/60,()=>.5,kind=>heard.push({kind,time:hunt.deathTime}));
    expect(heard).toHaveLength(3);
  });
  it('provides a complete sixteen-bar waltz with playable notes',()=>{
    expect(HALLOWEEN_WALTZ).toHaveLength(16);
    for(const phrase of HALLOWEEN_WALTZ){
      expect(phrase.melody).toHaveLength(6);
      expect(phrase.chord.every(note=>note>=36&&note<=84)).toBe(true);
      expect(phrase.melody.every(note=>note===0||note>=60&&note<=96)).toBe(true);
    }
  });
});
