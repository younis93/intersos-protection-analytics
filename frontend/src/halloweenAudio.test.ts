import {afterEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_HALLOWEEN_MIX,HALLOWEEN_WALTZ,readHalloweenMix,saveHalloweenMix} from './halloweenAudio';
import {controlHunt,createHunt,stepHunt,type HuntInput} from './halloweenSimulation';

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
    for(let i=0;i<3;i++)stepHunt(s,{...idle,firing:true},1/30,()=>.9,hear);
    expect(heard.indexOf('shot')).toBeGreaterThan(heard.indexOf('cast'));
    s.spawnIn=0;stepHunt(s,idle,1/30,()=>.9,hear);expect(heard.filter(kind=>kind==='ghost')).toHaveLength(1);
    s.ghosts[0]={id:100,x:500,y:250,phase:0};
    s.shots=[{x:450,y:241,vx:3000,vy:0,life:1}];
    stepHunt(s,idle,1/30,()=>.9,hear);
    expect(heard.slice(-2)).toEqual(['hit','death']);
    expect(s.score).toBe(1);
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
