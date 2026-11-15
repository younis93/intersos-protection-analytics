import {MAGE_CAST_WINDUP,type BossCue,type CombatSound,type DefeatSound} from './halloweenSimulation';

export type HuntSound='cast'|'shot'|'ghost'|'stalker'|'heartbeat'|BossCue|CombatSound|'hit'|'death'|'hurt'|DefeatSound|'pickup'|'counter'|'escape'|'burn'|'burn-open';
export interface HalloweenMix {muted:boolean;music:number;effects:number}
export type AudioStatus='locked'|'running'|'paused'|'unavailable';
export const DEFAULT_HALLOWEEN_MIX:HalloweenMix={muted:false,music:.38,effects:.65};
const storageKey='halloween-audio-mix';
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
export function readHalloweenMix():HalloweenMix{
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    return {muted:typeof saved?.muted==='boolean'?saved.muted:false,
      music:typeof saved?.music==='number'&&Number.isFinite(saved.music)?clamp(saved.music):DEFAULT_HALLOWEEN_MIX.music,
      effects:typeof saved?.effects==='number'&&Number.isFinite(saved.effects)?clamp(saved.effects):DEFAULT_HALLOWEEN_MIX.effects};
  }catch{return {...DEFAULT_HALLOWEEN_MIX}}
}
export function saveHalloweenMix(mix:HalloweenMix){try{localStorage.setItem(storageKey,JSON.stringify(mix))}catch{/* Audio still works when preferences cannot be saved. */}}

const frequency=(midi:number)=>440*2**((midi-69)/12);
const beat=60/112,bar=beat*3;
type CueTone=[note:number,end:number,duration:number,gain:number,wave:OscillatorType,delay?:number];
type CueNoise=[frequency:number,duration:number,gain:number,attack?:number,delay?:number];
type LayeredCue={tones:CueTone[];noise?:CueNoise[]};
type ExistingPhantomSound='phantom-tongue'|'phantom-barrage'|'phantom-scream'|'royal-volley';
const combatCues:Record<Exclude<CombatSound,ExistingPhantomSound>,LayeredCue>={
  'gravekeeper-shovel':{
    tones:[[43,29,.27,.22,'triangle'],[76,51,.11,.07,'triangle',.035]],
    noise:[[410,.23,.24,.013],[1600,.14,.10,.008,.04]],
  },
  'gravekeeper-skull':{
    tones:[[61,45,.52,.13,'sawtooth'],[79,58,.38,.10,'sine',.055]],
    noise:[[1250,.43,.18,.045]],
  },
  'gravekeeper-summon':{
    tones:[[32,37,.58,.20,'sine'],[44,56,.49,.08,'triangle',.13],[52,60,.4,.055,'sine',.26]],
    noise:[[240,.51,.21,.095],[710,.36,.10,.055,.19]],
  },
  'hex-claw':{
    tones:[[81,43,.16,.14,'triangle'],[51,32,.30,.12,'sine',.06]],
    noise:[[2520,.24,.22,.017],[920,.16,.11,.014,.10]],
  },
  'hex-roar':{
    tones:[[43,36,.72,.18,'sawtooth'],[62,49,.64,.095,'triangle',.04],[70,56,.46,.06,'sine',.13]],
    noise:[[590,.67,.14,.06]],
  },
  'hex-mist':{
    tones:[[71,91,.24,.09,'sine'],[81,57,.27,.12,'triangle',.12]],
    noise:[[2100,.31,.20,.045],[730,.24,.11,.035,.13]],
  },
  'hex-swarm':{
    tones:[[84,66,.23,.09,'triangle'],[91,69,.26,.08,'sine',.045],[77,57,.28,.11,'triangle',.09]],
    noise:[[1480,.34,.15,.025]],
  },
  'tyrant-dive':{
    tones:[[49,26,.34,.22,'triangle'],[60,35,.25,.08,'sawtooth',.08]],
    noise:[[790,.35,.23,.035]],
  },
  'tyrant-slam':{
    tones:[[34,20,.61,.32,'sine'],[53,30,.23,.15,'triangle',.016]],
    noise:[[185,.47,.26,.006],[1040,.14,.12,.004]],
  },
  'tyrant-fire':{
    tones:[[45,36,.66,.13,'sawtooth'],[54,48,.4,.07,'triangle',.10]],
    noise:[[580,.65,.24,.035],[1900,.48,.13,.045,.06]],
  },
  'tyrant-hurricane':{
    tones:[[39,44,1.11,.14,'sine'],[62,48,.57,.10,'triangle',.18],[57,44,.55,.075,'triangle',.55]],
    noise:[[970,1.28,.23,.18],[2600,.63,.12,.13,.27]],
  },
  'grave-ward':{tones:[[55,62,.34,.16,'triangle'],[74,79,.45,.09,'sine',.065]],noise:[[770,.21,.08,.035]]},
  'ward-block':{tones:[[72,49,.19,.19,'triangle'],[84,71,.23,.09,'sine',.027]],noise:[[2200,.11,.13,.006]]},
  'hex-burst':{tones:[[57,32,.48,.19,'triangle'],[76,47,.36,.11,'sawtooth',.03]],noise:[[1320,.38,.20,.025]]},
  'phantom-dash':{tones:[[66,92,.16,.12,'sine'],[85,60,.28,.085,'triangle',.09]],noise:[[2550,.23,.17,.02]]},
  'mage-dodge':{tones:[[86,104,.1,.06,'sine']],noise:[[1650,.14,.13,.01],[720,.17,.07,.025]]},
};
const layeredCues:Partial<Record<HuntSound,LayeredCue>>=combatCues;
// Original sixteen-bar cartoon waltz: celesta melody, pizzicato strings,
// walking bass and a quiet organ bed, in C harmonic minor. No streamed assets.
export const HALLOWEEN_WALTZ=[
  {chord:[48,60,63,67],melody:[79,0,75,74,72,0]},
  {chord:[48,60,63,67],melody:[75,0,79,80,79,0]},
  {chord:[44,60,63,68],melody:[80,79,77,0,75,72]},
  {chord:[43,59,62,67],melody:[74,0,71,74,79,0]},
  {chord:[41,60,65,68],melody:[77,0,80,79,77,75]},
  {chord:[48,60,63,67],melody:[75,74,72,0,67,0]},
  {chord:[43,59,62,65],melody:[71,74,77,0,74,71]},
  {chord:[48,60,63,67],melody:[72,0,0,67,72,75]},
  {chord:[51,58,63,67],melody:[79,0,82,79,77,75]},
  {chord:[46,58,62,65],melody:[77,0,74,77,82,0]},
  {chord:[44,60,63,68],melody:[80,0,79,75,72,0]},
  {chord:[43,59,62,67],melody:[74,71,74,79,0,77]},
  {chord:[41,60,65,68],melody:[77,80,84,0,80,77]},
  {chord:[48,60,63,67],melody:[79,75,72,0,75,79]},
  {chord:[43,59,62,65],melody:[80,79,77,74,71,0]},
  {chord:[48,60,63,67],melody:[72,0,75,74,72,0]},
];

/** Audio graph shared by live playback and offline audio verification. */
export class HalloweenSoundStage {
  readonly music:GainNode;
  readonly effects:GainNode;
  readonly output:GainNode;
  private voices=new Set<AudioScheduledSourceNode>();
  private noise:AudioBuffer;
  private nodes:AudioNode[]=[];
  constructor(readonly context:BaseAudioContext){
    const c=context;
    this.music=c.createGain();this.effects=c.createGain();this.output=c.createGain();
    const compressor=c.createDynamicsCompressor();
    compressor.threshold.value=-18;compressor.knee.value=16;compressor.ratio.value=4;
    compressor.attack.value=.004;compressor.release.value=.2;
    this.output.gain.value=.7;
    this.music.connect(compressor);this.effects.connect(compressor);compressor.connect(this.output);this.output.connect(c.destination);
    const room=c.createConvolver(),wet=c.createGain();wet.gain.value=.17;
    let seed=73;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296};
    const impulse=c.createBuffer(2,Math.floor(c.sampleRate*.85),c.sampleRate);
    for(let channel=0;channel<2;channel++){
      const data=impulse.getChannelData(channel);
      for(let i=0;i<data.length;i++)data[i]=(random()*2-1)*(1-i/data.length)**3*.45;
    }
    room.buffer=impulse;this.music.connect(room);room.connect(wet);wet.connect(compressor);
    this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate);
    const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=random()*2-1;
    this.nodes=[this.music,this.effects,this.output,compressor,room,wet];
  }
  get activeVoices(){return this.voices.size}
  private track(source:AudioScheduledSourceNode,ends:number){
    this.voices.add(source);source.addEventListener('ended',()=>{this.voices.delete(source);source.disconnect()},{once:true});
    source.stop(ends);
  }
  private tone(bus:AudioNode,note:number,start:number,duration:number,volume:number,type:OscillatorType='sine',pan=0,endNote=note,sustained=false){
    const c=this.context,osc=c.createOscillator(),envelope=c.createGain(),position=c.createStereoPanner();
    osc.type=type;osc.frequency.setValueAtTime(frequency(note),start);
    if(note!==endNote)osc.frequency.exponentialRampToValueAtTime(frequency(endNote),start+duration*.9);
    envelope.gain.setValueAtTime(.00001,start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.00002,volume),start+.008);
    if(bus===this.music||sustained)envelope.gain.exponentialRampToValueAtTime(Math.max(.00002,volume*.28),start+duration*.55);
    envelope.gain.exponentialRampToValueAtTime(.00001,start+duration);
    position.pan.value=Math.max(-.75,Math.min(.75,pan));
    osc.connect(envelope);envelope.connect(position);position.connect(bus);
    osc.addEventListener('ended',()=>{envelope.disconnect();position.disconnect()},{once:true});
    osc.start(start);this.track(osc,start+duration+.02);
  }
  private hiss(start:number,duration:number,volume:number,cutoff:number,pan:number,bus=this.effects,attack=.006){
    const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),position=c.createStereoPanner();
    source.buffer=this.noise;source.loop=duration>this.noise.duration;
    filter.type='bandpass';filter.frequency.value=cutoff;filter.Q.value=.7;position.pan.value=pan;
    gain.gain.setValueAtTime(.00001,start);gain.gain.exponentialRampToValueAtTime(volume,start+attack);gain.gain.exponentialRampToValueAtTime(.00001,start+duration);
    source.connect(filter);filter.connect(gain);gain.connect(position);position.connect(bus);
    source.addEventListener('ended',()=>{filter.disconnect();gain.disconnect();position.disconnect()},{once:true});
    source.start(start);this.track(source,start+duration+.01);
  }
  private flame(start:number,duration:number,volume:number,pan:number,cutoff:number,seed:number,opening=false){
    const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),high=c.createBiquadFilter(),gain=c.createGain(),position=c.createStereoPanner();
    const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),samples=buffer.getChannelData(0);
    let state=seed|0,brown=0,flicker=.6,target=.6;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return (state>>>0)/4294967296};
    // A rough, low fire bed with irregular gusts. No pitched oscillators or musical notes.
    for(let i=0;i<samples.length;i++){
      const white=random()*2-1;brown=(brown+white*.035)/1.035;
      if(i%Math.max(1,Math.floor(c.sampleRate*.023))===0)target=.35+random()*.65;
      flicker+=(target-flicker)*.002;samples[i]=(brown*3.4+white*.12)*flicker;
    }
    source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,start);filter.frequency.linearRampToValueAtTime(cutoff*.5,start+duration);filter.Q.value=.45;
    high.type='highpass';high.frequency.value=55;position.pan.value=pan;
    gain.gain.setValueAtTime(.00001,start);
    if(opening){
      gain.gain.linearRampToValueAtTime(volume,start+.055);gain.gain.linearRampToValueAtTime(volume*.5,start+duration*.4);
    }else{
      gain.gain.linearRampToValueAtTime(volume*.45,start+.06);gain.gain.linearRampToValueAtTime(volume,start+.5);
      gain.gain.linearRampToValueAtTime(volume*.38,start+.93);gain.gain.linearRampToValueAtTime(volume*.28,start+1.18);
    }
    gain.gain.exponentialRampToValueAtTime(.00001,start+duration);
    source.connect(high);high.connect(filter);filter.connect(gain);gain.connect(position);position.connect(this.effects);
    source.addEventListener('ended',()=>{high.disconnect();filter.disconnect();gain.disconnect();position.disconnect()},{once:true});
    source.start(start);this.track(source,start+duration+.02);
  }
  private crackles(start:number,duration:number,seed:number,strength:number){
    let state=seed|0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return (state>>>0)/4294967296};
    let t=.025;
    while(t<duration){
      const life=.015+random()*.04,volume=strength*(.4+random()*.6)*(1-t/duration*.75);
      this.hiss(start+t,life,volume,1400+random()*3300,(random()-.5)*1.15);
      if(random()>.65)this.hiss(start+t+.008,life*.7,volume*.35,700+random()*700,(random()-.5)*.7);
      t+=.03+random()*.09;
    }
  }
  scheduleAmbience(index:number,start:number){
    const pan=.55*Math.sin(index*1.7);
    switch(index%8){
      case 0:
      case 4:
        this.hiss(start,1.7,.19,350,pan,this.music,.65);
        this.tone(this.music,36,start,1.6,.047,'sine',-pan,34);
        break;
      case 2:
        for(let i=0;i<3;i++)this.hiss(start+i*.39,.18,.085,230,pan,this.music,.032);
        break;
      case 6:
        this.hiss(start,.83,.085,1050,pan,this.music,.18);
        this.hiss(start+.48,.62,.065,630,-pan,this.music,.13);
        break;
    }
  }
  scheduleBossBar(index:number,start:number,boss=0){
    const root=[[36,36,37,34],[45,42,44,40],[31,34,30,33],[40,43,46,38]][boss][index%4];
    if(boss===1){
      [12,19,18,15].forEach((interval,i)=>this.tone(this.music,root+interval,start+i*bar/4,.66,.10,'sine',i%2?.45:-.45));
      this.hiss(start,bar,.11,610,0,this.music,.65);
      return;
    }
    if(boss===3){
      [24,27,31,30,25,19].forEach((interval,i)=>this.tone(this.music,root+interval,start+i*bar/6,.4,.10,'triangle',i%2?.35:-.35));
      this.tone(this.music,root-12,start,bar,.20,'sine');
      return;
    }
    for(let i=0;i<6;i++){
      const at=start+i*bar/6;
      this.tone(this.music,root+(i===4?7:0),at,.2,i%3===0?.22:.12,'triangle',0);
      if(i%(boss===2?2:3)===0)this.hiss(at,.14,.17,boss===2?165:260,0,this.music);
    }
    this.tone(this.music,root+19,start,bar,.08,'triangle',-.3,root+18);
    this.tone(this.music,root+25,start+bar*.5,bar*.6,.06,'sine',.35,root+24);
  }
  scheduleBar(index:number,start:number){
    const {chord,melody}=HALLOWEEN_WALTZ[index%HALLOWEEN_WALTZ.length];
    this.tone(this.music,chord[0]-12,start,.52,.17,'triangle',-.12);
    this.tone(this.music,chord[0]-5,start+beat*1.5,.32,.055,'sine',.12);
    for(let b=1;b<=2;b++)for(let i=1;i<chord.length;i++){
      this.tone(this.music,chord[i],start+b*beat,.24,.032,'triangle',(i-2)*.24);
      this.tone(this.music,chord[i]+12,start+b*beat,.13,.009,'sine',(i-2)*.24);
    }
    for(let i=1;i<chord.length;i++)this.tone(this.music,chord[i],start,bar*1.2,.012,'sine',(i-2)*.3);
    melody.forEach((note,i)=>{
      if(!note)return;const time=start+i*beat/2;
      this.tone(this.music,note,time,.8,.082,'sine',Math.sin(index*.8)*.25);
      this.tone(this.music,note+19,time,.3,.012,'sine',-.2);
      this.tone(this.music,note+28,time,.15,.004,'sine',.2);
    });
    if(index%4===3)this.tone(this.music,91,start+beat*2.5,1.3,.025,'sine',.55);
  }
  sound(kind:HuntSound,start=this.context.currentTime,pan=0,variation=0,boss=0){
    if(this.voices.size>110)return;
    const cue=layeredCues[kind];
    if(cue){
      for(const [note,end,duration,gain,wave,delay=0] of cue.tones){
        this.tone(this.effects,note,start+delay,duration,gain,wave,pan,end);
      }
      for(const [frequency,duration,gain,attack,delay=0] of cue.noise??[]){
        this.hiss(start+delay,duration,gain,frequency,pan,this.effects,attack);
      }
      return;
    }
    const v=variation%3-1;
    if(kind==='cast'){
      this.tone(this.effects,65+v,start,MAGE_CAST_WINDUP,.035,'sine',pan,82+v);
      this.hiss(start,MAGE_CAST_WINDUP,.035,1600,pan,this.effects,.035);
    }else if(kind==='shot'){
      this.tone(this.effects,83+v,start,.19,.12,'triangle',pan,57+v);
      this.tone(this.effects,95+v,start,.09,.035,'sine',pan,74+v);
      this.hiss(start,.13,.08,2100,pan);
    }else if(kind==='ghost'){
      // A soft cartoon "ooOOo", with formant-like harmonics rather than a scream.
      this.tone(this.effects,63+v,start,.65,.055,'sine',pan,70+v,true);
      this.tone(this.effects,75+v,start+.08,.55,.025,'sine',pan,80+v,true);
      this.tone(this.effects,70+v,start+.38,.5,.035,'sine',pan,59+v,true);
    }else if(kind==='stalker'){
      this.tone(this.effects,44,start,.9,.12,'triangle',pan,32,true);
      this.hiss(start,.85,.1,650,pan,this.effects,.17);
    }else if(kind==='boss-arrive'){
      this.tone(this.effects,38,start,1.6,.19,'triangle',pan,33,true);
      this.tone(this.effects,51,start+.24,1.15,.09,'sine',pan,45,true);
    }else if(kind==='boss-warning'){
      this.tone(this.effects,[33,47,29,61][boss],start,.65,.14,boss===1?'sine':'triangle',pan,[46,52,39,67][boss],true);
      this.hiss(start,.72,.12,[910,1600,360,2200][boss],pan,this.effects,.33);
    }else if(kind==='boss-hit'){
      this.tone(this.effects,69,start,.19,.13,'triangle',pan,54);
      this.hiss(start,.11,.11,2400,pan);
    }else if(kind==='boss-strike'){
      this.tone(this.effects,[48,65,41,82][boss],start,.42,.22,boss===3?'sine':'triangle',pan,[27,47,22,70][boss]);
      this.hiss(start,.45,.21,420,pan);
      this.tone(this.effects,34,start+.045,.65,.19,'sine',pan,22);
    }else if(kind==='phantom-tongue'){
      this.hiss(start,.18,.18,1250,pan,this.effects,.025);
      this.tone(this.effects,63,start,.19,.16,'triangle',pan,34);
      this.hiss(start+.08,.09,.09,3100,pan);
    }else if(kind==='phantom-barrage'){
      [72,79,83,88,91].forEach((note,i)=>{
        const at=start+i*.032;
        this.tone(this.effects,note,at,.26,.085,'triangle',pan+(i-2)*.08,note-14);
      });
      this.hiss(start,.25,.11,1850,pan);
    }else if(kind==='phantom-scream'){
      this.tone(this.effects,52,start,.76,.15,'sawtooth',pan,38,true);
      this.tone(this.effects,71,start+.025,.61,.10,'triangle',pan,51,true);
      this.hiss(start,.72,.13,990,pan,this.effects,.04);
      this.tone(this.effects,32,start+.11,.56,.12,'sine',pan,24);
    }else if(kind==='royal-volley'){
      [79,83,86,91,95].forEach((note,i)=>this.tone(this.effects,note,start+i*.027,.24,.06,'sine',pan+(i-2)*.06,note+4));
      this.hiss(start,.19,.075,2700,pan);
    }else if(kind==='counter'){
      this.tone(this.effects,53,start,.32,.18,'triangle',pan,36);
      this.tone(this.effects,77,start+.07,.29,.1,'sine',pan,84);
    }else if(kind==='escape'){
      [60,67,72,76].forEach((note,i)=>this.tone(this.effects,note,start+i*.13,.6,.12,'triangle',pan));
    }else if(kind==='pickup'){
      [72,79,84].forEach((note,i)=>this.tone(this.effects,note,start+i*.085,.32,.1,'sine',pan));
    }else if(kind==='boss-defeat'){
      [45,52,57].forEach((note,i)=>this.tone(this.effects,note,start+i*.12,.8,.13,'sine',pan));
    }else if(kind==='heartbeat'){
      this.tone(this.effects,41,start,.14,.13,'sine',0,34);
      this.tone(this.effects,39,start+.18,.16,.09,'sine',0,32);
    }else if(kind==='hit'){
      this.tone(this.effects,58+v,start,.12,.15,'triangle',pan,38+v);
      this.hiss(start,.095,.12,1100,pan);
    }else if(kind==='burn'){
      this.flame(start,1.94,.64,-.27,1100,109);
      this.flame(start+.015,1.9,.39,.3,2900,713);
      this.crackles(start,1.82,991,.12);
    }else if(kind==='burn-open'){
      this.flame(start,.72,.52,.1,2400,331,true);this.crackles(start,.68,557,.09);
    }else if(kind==='hurt'){
      this.tone(this.effects,60,start,.22,.13,'triangle',pan,45);
      this.tone(this.effects,67,start+.035,.2,.045,'sine',pan,48);
      this.hiss(start,.12,.08,750,pan);
    }else if(kind==='defeat'){
      // A short, caught breath and cloak movement as the mage loses balance.
      this.hiss(start,.21,.20,970,pan,this.effects,.022);
      this.hiss(start+.025,.22,.105,1820,pan,this.effects,.034);
      this.tone(this.effects,44,start+.012,.23,.09,'triangle',pan,32);
      this.hiss(start+.16,.27,.09,470,pan,this.effects,.07);
    }else if(kind==='defeat-impact'){
      // A soft body thud with two separate strikes from the staff and its crystal.
      this.tone(this.effects,36,start,.23,.28,'sine',pan,24);
      this.hiss(start,.19,.22,280,pan);
      this.hiss(start+.028,.075,.17,920,pan);
      this.tone(this.effects,82,start+.035,.075,.105,'triangle',pan,69);
      this.hiss(start+.112,.085,.11,1730,pan);
      this.tone(this.effects,91,start+.11,.13,.062,'sine',pan,84);
    }else if(kind==='defeat-dissolve'){
      this.hiss(start,.65,.16,780,pan,this.effects,.11);
      this.hiss(start+.065,.46,.095,1560,pan,this.effects,.095);
      for(const [delay,frequency,gain] of [[.09,2600,.11],[.18,1960,.083],[.32,2480,.055],[.47,1310,.04]]){
        this.hiss(start+delay,.055,gain,frequency,pan);
      }
    }else if(kind==='defeat-shadow'){
      // Filtered breath and a quiet undertone as the specter lifts away.
      this.hiss(start,.71,.16,490,pan,this.effects,.19);
      this.hiss(start+.07,.61,.11,1120,pan,this.effects,.15);
      this.tone(this.effects,41,start+.12,.52,.075,'sine',pan,35,true);
    }else{
      // Impact resolves into a descending ghost sigh and a magical reward flourish.
      this.tone(this.effects,81+v,start+.05,.35,.09,'sine',pan,55+v);
      [84,87,91].forEach((note,i)=>this.tone(this.effects,note,start+.12+i*.065,.28,.052,'sine',pan));
    }
  }
  setMix(mix:HalloweenMix){
    const now=this.context.currentTime;
    this.output.gain.setTargetAtTime(mix.muted?0:.7,now,.015);
    this.music.gain.setTargetAtTime(mix.muted?0:clamp(mix.music),now,.035);
    this.effects.gain.setTargetAtTime(mix.muted?0:clamp(mix.effects),now,.025);
  }
  duck(){this.music.gain.cancelScheduledValues(this.context.currentTime);this.music.gain.setTargetAtTime(this.music.gain.value*.68,this.context.currentTime,.015)}
  silence(){
    for(const voice of this.voices){try{voice.stop()}catch{/* Already ended. */}}
    this.voices.clear();for(const node of this.nodes)node.disconnect();
  }
}

/** Prepared inside the toggle's user gesture; playback starts with the visual wipe. */
export function createBurnAudio(){
  const mix=readHalloweenMix();let context:AudioContext|undefined,stage:HalloweenSoundStage|undefined,disposed=false,played=false,revealed=false;
  if(!mix.muted&&mix.effects>0)try{
    context=new AudioContext({latencyHint:'interactive'});stage=new HalloweenSoundStage(context);stage.setMix({...mix,music:0});
    void context.resume().catch(()=>{});
  }catch{if(context)void context.close().catch(()=>{});context=undefined}
  return {
    play(){
      if(disposed||played||!context||!stage)return;played=true;
      const c=context,s=stage;void c.resume().then(()=>{if(!disposed)s.sound('burn',c.currentTime+.015)}).catch(()=>{});
    },
    reveal(){if(!disposed&&!revealed&&played&&context?.state==='running'&&stage){revealed=true;stage.sound('burn-open',context.currentTime+.01)}},
    dispose(){if(disposed)return;disposed=true;stage?.output.gain.setTargetAtTime(0,context?.currentTime??0,.01);setTimeout(()=>{stage?.silence();if(context)void context.close().catch(()=>{})},60)},
  };
}

export function createHalloweenAudio(onStatus:(status:AudioStatus)=>void){
  let context:AudioContext|undefined,stage:HalloweenSoundStage|undefined,timer:ReturnType<typeof setInterval>|undefined;
  let pauseTimer:ReturnType<typeof setTimeout>|undefined;
  let mix=readHalloweenMix(),paused=false,disposed=false,nextBar=0,barIndex=0,variation=0,lastDuck=0;
  let manual=false,bossActive:number|null=null,ambienceIndex=0,bossBar=0;
  let status:AudioStatus='locked';const last=new Map<HuntSound,number>();
  const report=(next:AudioStatus)=>{if(disposed||status===next)return;status=next;onStatus(next)};
  const schedule=()=>{
    if(!context||!stage||context.state!=='running'||paused||disposed)return;
    const now=context.currentTime;
    if(nextBar<now-.1)nextBar=now+.06;
    if(nextBar<now+.2){
      if(bossActive!==null)stage.scheduleBossBar(bossBar++,nextBar,bossActive);
      else if(manual)stage.scheduleAmbience(ambienceIndex++,nextBar);
      else stage.scheduleBar(barIndex++,nextBar);
      nextBar+=bar;
    }
    if(lastDuck&&now-lastDuck>.2){stage.setMix(mix);lastDuck=0}
  };
  const unlock=async()=>{
    if(disposed)return;
    try{
      if(!context){
        context=new AudioContext({latencyHint:'interactive'});stage=new HalloweenSoundStage(context);stage.setMix(mix);
        nextBar=context.currentTime+.08;
        context.addEventListener('statechange',()=>{
          if(context?.state==='running')report(paused?'paused':'running');
          else if(context?.state==='suspended')report(paused?'paused':'locked');
        });
        timer=setInterval(schedule,80);
      }
      if(!paused){await context.resume();if(disposed)return;report(context.state==='running'?'running':'locked');schedule()}
    }catch{report('unavailable')}
  };
  return {
    unlock,
    setBossActive(value:number|null){
      if(value!==bossActive)bossBar=0;
      bossActive=value;
    },
    setManual(value:boolean){
      if(value&&!manual)ambienceIndex=0;
      manual=value;
    },
    setMix(next:HalloweenMix){mix=next;saveHalloweenMix(next);stage?.setMix(mix)},
    setPaused(value:boolean){
      if(value===paused||disposed)return;paused=value;
      if(!context)return;
      if(pauseTimer)clearTimeout(pauseTimer);
      if(value){
        stage?.output.gain.setTargetAtTime(0,context.currentTime,.01);report('paused');
        pauseTimer=setTimeout(()=>{if(paused&&!disposed)void context?.suspend().catch(()=>{})},45);
      }else{stage?.setMix(mix);void unlock()}
    },
    play(kind:HuntSound,x:number,width:number,boss=0){
      if(!context||!stage||context.state!=='running'||paused||mix.muted||mix.effects===0)return;
      const now=context.currentTime;
      const gap=kind==='heartbeat'?1.15:kind==='ghost'?4:kind==='death'||kind==='cast'?.12:.065;
      if(now-(last.get(kind)??-10)<gap)return;
      last.set(kind,now);stage.sound(kind,now,Math.max(-.65,Math.min(.65,(x/Math.max(1,width)-.5)*1.1)),variation++,boss);
      if(kind==='shot'||kind==='hit'){stage.duck();lastDuck=now}
    },
    dispose(){
      disposed=true;if(timer)clearInterval(timer);if(pauseTimer)clearTimeout(pauseTimer);
      stage?.output.gain.setTargetAtTime(0,context?.currentTime??0,.01);
      setTimeout(()=>{stage?.silence();if(context)void context.close().catch(()=>{})},60);
    },
  };
}
