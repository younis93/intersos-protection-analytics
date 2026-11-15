import {ABILITY_ICONS,abilityPixels} from './halloweenAbilityIcons';
import {useEffect,useRef,useState} from 'react';
import {controlHunt,handoffHunt,createHunt,resizeHunt,stepHunt,BOSSES,BOSS_ORDER,PRACTICE_HINTS,chooseUpgrade,dodgeMage,movementVector,useAbility,isBossAttackSound,type Upgrade,type HuntState} from './halloweenSimulation';
import {createHalloweenRenderer} from './halloweenRenderer';
import {createHalloweenAudio,readHalloweenMix,type AudioStatus,type HalloweenMix} from './halloweenAudio';
import {Settings,Volume2,VolumeX} from 'lucide-react';
import {createGraveyardScene} from './halloweenGraveyard';
import heartPickup from './vendor/pixelfx/heart-pickup.png';

const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const physicalKeys:Record<string,string>={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyX:'x'};
const inputKey=(event:KeyboardEvent)=>physicalKeys[event.code]??event.key.toLowerCase();
const hudSelector=':is(.halloween-combat-hud,.halloween-boss-health,.halloween-notices,.halloween-dock)';
const uiSelector=`a,button,input,textarea,select,label,summary,${hudSelector},[contenteditable="true"],[role="dialog"],[role="combobox"],[role="listbox"],[role="menu"]`;
function AbilityIcon({index}:{index:number}){
  const pixels:string[]=[];
  abilityPixels(index,(x,y)=>pixels.push(`M${x} ${y}h1v1h-1z`));
  return <svg viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges"><path fill={ABILITY_ICONS[index].color} d={pixels.join('')}/></svg>;
}
const bestKey='halloween-manual-record-v1';
type RunReport={boss:string;counters:number;seconds:number;assisted:boolean;best:number|null;newBest:boolean};
function formatRunTime(seconds:number){
  const tenths=Math.floor(seconds*10);
  return `${Math.floor(tenths/600)}:${String(Math.floor(tenths/10)%60).padStart(2,'0')}.${tenths%10}`;
}
function finishReport(s:HuntState):RunReport{
  const assisted=s.mode==='auto'||s.time-s.manualTime>.001;
  let best:number|null=null;
  let newBest=false;
  try{
    const stored=localStorage.getItem(bestKey);
    const previous=stored===null?NaN:Number(stored);
    if(Number.isFinite(previous)&&previous>0)best=previous;
    if(s.won&&!assisted&&(best===null||s.time<best)){
      best=s.time;newBest=true;
      localStorage.setItem(bestKey,String(best));
    }
  }catch{/* Private sessions can still show the run summary. */}
  return {boss:s.boss?BOSSES[s.boss.index].name:s.defeated?BOSSES[BOSS_ORDER[s.defeated-1]].name:`Before ${BOSSES[BOSS_ORDER[0]].name}`,
    counters:s.counters,seconds:s.time,assisted,best,newBest};
}
function RunSummary({report}:{report:RunReport}){
  return <div className="halloween-run-summary">
    <p><b>{report.assisted?'Autoplay or assisted run':'Manual run'}</b> · {formatRunTime(report.seconds)}</p>
    <p>Boss reached: {report.boss} · Counters: {report.counters}</p>
    {report.best!==null&&<p>{report.newBest?'New personal best':'Manual escape record'} · {formatRunTime(report.best)}</p>}
  </div>;
}
export default function HalloweenGame({paused=false,onManualChange}:{paused?:boolean;onManualChange?:(active:boolean)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<HTMLCanvasElement>(null),actor=useRef<HTMLButtonElement>(null);
  const pausedRef=useRef(paused),takeControl=useRef<()=>void>(()=>{}),returnToAuto=useRef<()=>void>(()=>{}),retry=useRef<()=>void>(()=>{}),retryButton=useRef<HTMLButtonElement>(null);
  const rewardButton=useRef<HTMLDivElement>(null);
  const settings=useRef<HTMLDetailsElement>(null);
  const settingsGear=useRef<HTMLElement>(null);
  const claimUpgrade=useRef<(choice:Upgrade)=>void>(()=>{});
  const activateAbility=useRef<(index:number)=>void>(()=>{});
  const dodge=useRef<()=>void>(()=>{});
  const notifyManual=useRef(onManualChange);notifyManual.current=onManualChange;
  const [hud,setHud]=useState({score:0,mode:'auto' as HuntState['mode'],paused:false,available:true,health:3,dead:false,time:0,canResume:false,bossHealth:0,bossIndex:-1,defeated:0,maxHealth:3,focus:0,dropIndex:-1,claimedIndex:-1,rewardPending:false,dodgeCooldown:0,wardActive:false,activeAbility:-1,abilities:[] as number[],nextIn:0,practice:false,siegeIn:null as number|null,won:false,counterText:'',counterTime:0,report:null as RunReport|null});
  const audio=useRef<ReturnType<typeof createHalloweenAudio>|null>(null);
  const [mix,setMix]=useState(readHalloweenMix),[audioStatus,setAudioStatus]=useState<AudioStatus>('locked');
  const changeMix=(update:Partial<HalloweenMix>)=>{
    const next={...mix,...update};setMix(next);audio.current?.setMix(next);
  };
  const runFromSettings=(action:()=>void)=>{
    if(settings.current)settings.current.open=false;
    settingsGear.current?.focus({preventScroll:true});
    action();
  };
  pausedRef.current=paused;
  useEffect(()=>{
    const node=canvas.current;if(!node)return;
    const renderer=createHalloweenRenderer(node);
    if(!renderer){setHud(h=>({...h,available:false}));return}
    const background=scene.current?createGraveyardScene(scene.current):null;
    const sound=createHalloweenAudio(setAudioStatus);audio.current=sound;
    sound.setPaused(document.hidden||pausedRef.current);
    void sound.unlock();
    const unlockSound=()=>{void sound.unlock()};
    window.addEventListener('pointerdown',unlockSound);window.addEventListener('keydown',unlockSound);
    const s=createHunt(window.innerWidth,window.innerHeight);
    const input={keys:new Set<string>(),aim:{x:s.width/2,y:s.height/2},firing:false};
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0,last=0,lastHud=0,blurred=false,disposed=false,reportedManual=false;
    let hasPlayed=false;
    let report:RunReport|null=null;
    let claimedIndex=-1,claimedUntil=0;
    const clear=()=>{input.keys.clear();input.firing=false};
    const blocked=()=>pausedRef.current||Boolean(document.querySelector('[aria-modal="true"],.welcome-page [role="listbox"],.welcome-page [role="menu"]'));
    const publish=(isPaused=false)=>{
      const manual=s.mode==='manual';
      sound.setManual(manual);
      if(s.dead||s.won)report??=finishReport(s);
      else report=null;
      if(manual!==reportedManual){reportedManual=manual;notifyManual.current?.(manual)}
      if(s.abilities.length===0)claimedIndex=-1;
      setHud({score:s.score,mode:s.mode,paused:isPaused,available:true,health:s.health,dead:s.dead,time:s.manualTime,canResume:hasPlayed,bossHealth:s.boss?.health??0,bossIndex:s.boss?.index??-1,defeated:s.defeated,maxHealth:s.maxHealth,focus:s.focus,dropIndex:s.drop?.index??-1,claimedIndex:performance.now()<claimedUntil?claimedIndex:-1,rewardPending:s.rewardPending,dodgeCooldown:s.dodgeCooldown,wardActive:s.ward>0,activeAbility:s.abilityFlash>0?s.lastAbility:-1,abilities:s.abilities.slice(),nextIn:Math.max(0,Math.ceil(s.nextBossAt-s.time)),practice:s.practice,siegeIn:s.siegeUntil===null?null:Math.max(0,Math.ceil(s.siegeUntil-s.time)),won:s.won,counterText:s.counterTime>0?s.counterText:'',counterTime:s.counterTime,report});
    };
    const onCue:NonNullable<Parameters<typeof stepHunt>[4]>=(kind,point)=>{
      const index=s.boss?.index??s.fallenBoss?.index??0;
      if(kind!=='hurt'||s.health>0)sound.play(kind,point.x,s.width,index);
      if(kind==='pickup'){
        claimedIndex=BOSS_ORDER[s.defeated-1];
        claimedUntil=performance.now()+3000;
      }
      if(kind==='hurt')renderer.hurt(point);
      if(index!==3&&isBossAttackSound(kind))renderer.bossEffect('boss-strike',point,s.boss?.radius??0,index);
      else if(kind==='boss-arrive'||kind==='boss-warning'||kind==='boss-strike'||kind==='boss-hit'||kind==='boss-defeat'){
        renderer.bossEffect(kind,point,s.boss?.radius??0,index);
      }
    };
    claimUpgrade.current=(choice)=>{
      if(blocked()||!chooseUpgrade(s,choice))return;
      clear();last=0;publish();
      actor.current?.focus({preventScroll:true});
    };
    dodge.current=()=>{
      if(s.mode!=='manual'||blocked()||blurred||settings.current?.open)return;
      const direction=movementVector(input.keys);
      if(!direction.x&&!direction.y){
        direction.x=input.aim.x-s.mage.x;
        direction.y=input.aim.y-s.mage.y;
        if(Math.hypot(direction.x,direction.y)<8)direction.x=s.facing;
      }
      if(dodgeMage(s,direction,onCue))publish();
    };
    activateAbility.current=(index)=>{
      if(s.mode!=='manual'||blocked()||blurred||settings.current?.open)return;
      s.aim={...input.aim};
      const {x,y}=movementVector(input.keys);
      if(useAbility(s,index,index===2&&(x||y)?{x,y}:undefined,onCue))publish();
    };
    const autoplay=()=>{if(s.dead||s.won){controlHunt(s,'auto');hasPlayed=false}else handoffHunt(s,'auto');clear();last=0;publish()};
    returnToAuto.current=autoplay;
    const startManual=(fresh=false)=>{if(blocked())return;if(fresh||s.dead||s.won)controlHunt(s,'manual');else handoffHunt(s,'manual');hasPlayed=true;clear();last=0;input.aim={...s.aim};publish();queueMicrotask(()=>{if(!disposed)actor.current?.focus({preventScroll:true})})};
    retry.current=()=>startManual(true);
    takeControl.current=()=>{
      if(blocked())return;
      if(settings.current?.open){settings.current.open=false;clear()}
      if(blurred){blurred=false;clear();last=0;sound.setPaused(document.hidden)}
      if(s.mode==='auto')startManual();else publish();
    };
    const interactive=(target:EventTarget|null)=>target instanceof Element&&Boolean(target.closest(uiSelector));
    const down=(event:KeyboardEvent)=>{
      if(blocked()||blurred||event.defaultPrevented)return;
      const key=inputKey(event);
      if(key==='escape'&&settings.current?.open){
        event.preventDefault();settings.current.open=false;settingsGear.current?.focus({preventScroll:true});return;
      }
      if(s.mode!=='manual')return;
      if(key==='escape'){event.preventDefault();if(!event.repeat)autoplay();return}
      if(key==='tab'){
        const controls=Array.from(document.querySelectorAll<HTMLElement>(`.halloween-mage-control,${hudSelector} :is(button,summary,input),.halloween-pumpkin-toggle`))
          .filter(el=>!el.matches(':disabled,.halloween-settings:not([open]) .halloween-settings-panel *')&&el.getClientRects().length>0);
        const current=controls.indexOf(document.activeElement as HTMLElement);
        const next=(current+(event.shiftKey?-1:1)+controls.length)%controls.length;
        event.preventDefault();controls[next]?.focus({preventScroll:true});return;
      }
      if(settings.current?.open||s.dead||s.won||s.rewardPending)return;
      if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
      if(!event.repeat&&key==='x'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();dodge.current();return}
      if(!event.repeat&&/^[1-4]$/.test(key)){event.preventDefault();activateAbility.current(Number(key)-1);return}
      if(movement.has(key)){event.preventDefault();input.keys.add(key)}
    };
    const up=(event:KeyboardEvent)=>input.keys.delete(inputKey(event));
    const aim=(event:PointerEvent)=>{
      if(event.target instanceof Element&&event.target.closest(hudSelector))return;
      const r=node.getBoundingClientRect();input.aim={x:(event.clientX-r.left)*s.width/r.width,y:(event.clientY-r.top)*s.height/r.height};
    };
    const fire=(event:PointerEvent)=>{if(s.mode==='manual'&&!s.dead&&!s.drop&&!s.rewardPending&&event.button===0&&!blocked()&&!settings.current?.open&&(!interactive(event.target)||event.target===actor.current)){aim(event);input.firing=true}};
    const release=()=>{input.firing=false};
    const blur=()=>{blurred=true;clear();last=0;sound.setPaused(true);publish(true)};
    const focus=()=>{blurred=false;clear();last=0;const pause=document.hidden||blocked();sound.setPaused(pause);publish(pause)};
    const visibility=()=>{clear();last=0;const pause=document.hidden||blurred||blocked();sound.setPaused(pause);publish(pause)};
    const resize=()=>resizeHunt(s,window.innerWidth,window.innerHeight);
    const tick=(now:number)=>{
      if(disposed)return;
      const dt=last?Math.min((now-last)/1000,1/30):0;last=now;
      const isPaused=document.hidden||blurred||blocked();
      sound.setPaused(isPaused);
      if(isPaused)clear();
      else{
        if(settings.current?.open)clear();
        const wasDead=s.dead,wasPending=s.rewardPending,wasWon=s.won;
        for(const hit of stepHunt(s,input,dt,Math.random,onCue))renderer.hit(hit);
        sound.setBossActive(s.dead?null:s.boss?.index??null);
        if(!wasPending&&s.rewardPending){
          clear();publish();
          if(s.mode==='manual'){
            if(settings.current)settings.current.open=false;
            requestAnimationFrame(()=>{if(!disposed)rewardButton.current?.querySelector('button')?.focus()});
          }
        }
        if((s.mode==='manual'||s.boss)&&s.health===1&&!s.dead&&!s.won)sound.play('heartbeat',s.width/2,s.width);
        if((!wasWon&&s.won)||(!wasDead&&s.dead)){
          clear();publish();
          if(s.mode==='manual'){
            if(settings.current)settings.current.open=false;
            requestAnimationFrame(()=>{if(!disposed)retryButton.current?.focus()});
          }
        }
      }
      renderer.draw(s,isPaused?0:s.rewardPending?Math.min(dt,s.fallenTime):dt,reduced.matches);
      background?.draw(s.width,s.height,s.time,reduced.matches);
      if(actor.current){
        actor.current.style.left=`${s.mage.x}px`;actor.current.style.top=`${s.mage.y-20}px`;actor.current.disabled=blocked()||s.dead||s.won;
      }
      if(now-lastHud>120){publish(isPaused);lastHud=now}
      frame=requestAnimationFrame(tick);
    };
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);
    window.addEventListener('pointermove',aim);window.addEventListener('pointerdown',fire);
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    window.addEventListener('blur',blur);window.addEventListener('focus',focus);window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',visibility);
    frame=requestAnimationFrame(tick);
    return()=>{
      disposed=true;cancelAnimationFrame(frame);clear();takeControl.current=()=>{};returnToAuto.current=()=>{};retry.current=()=>{};dodge.current=()=>{};
      if(reportedManual)notifyManual.current?.(false);
      window.removeEventListener('pointerdown',unlockSound);window.removeEventListener('keydown',unlockSound);
      sound.dispose();audio.current=null;
      window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);
      window.removeEventListener('pointermove',aim);window.removeEventListener('pointerdown',fire);
      window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);
      window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);window.removeEventListener('resize',resize);
      document.removeEventListener('visibilitychange',visibility);
    };
  },[]);
  const boss=!hud.dead&&!hud.won&&hud.bossHealth>0?BOSSES[hud.bossIndex]:undefined;
  const claimed=!hud.dead&&hud.claimedIndex>=0&&!(hud.mode==='manual'&&hud.rewardPending);
  const practice=hud.practice&&!hud.dead;
  const siege=!hud.dead&&!hud.won&&hud.siegeIn!==null;
  const counter=hud.counterText&&!hud.dead;
  const showNotices=!hud.available||hud.paused||practice||siege||counter||hud.dropIndex>=0||claimed;
  const dodgeTime=(Math.ceil(hud.dodgeCooldown*10)/10).toFixed(1);
  return <>
    <canvas ref={scene} className="halloween-graveyard" aria-hidden="true"/>
    <canvas ref={canvas} className="halloween-canvas" aria-hidden="true"/>
    {hud.mode==='manual'&&<div className="halloween-input-shield" aria-hidden="true"/>}
    {hud.available&&!hud.dead&&!hud.won&&<div className="halloween-mage-viewport">
      <button ref={actor} type="button" className="halloween-mage-control" onPointerDown={()=>takeControl.current()} onClick={()=>takeControl.current()} aria-label="Control the pumpkin mage" aria-pressed={hud.mode==='manual'} title="Click to play as the pumpkin mage"/>
    </div>}
    <div className="halloween-top-hud">
      {hud.available&&<section className="halloween-combat-hud" aria-label="Mage health and abilities">
        <div className="halloween-mage-hud">
          <div className="halloween-mage-portrait" aria-hidden="true"/>
          {!hud.dead&&!hud.won&&<button type="button" className="halloween-dodge-button" data-ready={hud.dodgeCooldown===0}
            aria-label={hud.dodgeCooldown>0?`Dodge · X · ${dodgeTime}s cooldown`:'Dodge · X · Ready'} title="Dodge (X)"
            disabled={hud.mode!=='manual'||hud.paused||hud.dropIndex>=0||hud.rewardPending||hud.dodgeCooldown>0} onClick={()=>dodge.current()}>
            {hud.dodgeCooldown>0?<span>{dodgeTime}s</span>:<>Dodge <kbd>X</kbd></>}
          </button>}
        </div>
        <div className="halloween-combat-stats">
          <span className="halloween-hearts" role="status" aria-label={`Health: ${hud.health} of ${hud.maxHealth} hearts`}>
            {Array.from({length:hud.maxHealth},(_,i)=><img key={i} src={heartPickup} alt="" width={24} height={24} data-filled={i<hud.health}/>)}
          </span>
          {!hud.dead&&<div className="halloween-abilities" role="group" aria-label="Boss abilities">{BOSSES.map(({ability},i)=>{
            const cooldown=hud.abilities[i];
            if(cooldown===undefined){
              const label=`${ability} · Key ${i+1} · Locked`;
              return <span key={i} className="halloween-ability-slot" role="img" aria-label={label} title={label}><AbilityIcon index={i}/><kbd>{i+1}</kbd></span>;
            }
            const state=cooldown>0?`${Math.ceil(cooldown)}s cooldown`:'Ready';
            const label=`${ability} · Key ${i+1} · ${state}`;
            return <button key={i} type="button" className="halloween-ability-slot" data-ready={cooldown===0} data-active={i===0?hud.wardActive:hud.activeAbility===i} aria-label={label} title={label} disabled={hud.mode!=='manual'||hud.paused||hud.dropIndex>=0||hud.rewardPending||cooldown>0} onClick={()=>activateAbility.current(i)}>
              <AbilityIcon index={i}/><kbd>{i+1}</kbd>{cooldown>0&&<span className="halloween-ability-timer" aria-hidden="true">{Math.ceil(cooldown)}s</span>}
            </button>;
          })}</div>}
        </div>
      </section>}
      {boss&&<div className="halloween-boss-health">
        <label htmlFor="halloween-boss-health">{boss.name}</label>
        <progress id="halloween-boss-health" max={boss.health} value={hud.bossHealth}/>
      </div>}
      {showNotices&&<div className="halloween-notices" role="region" aria-label="Hunt updates">
        {!hud.available&&<p role="status">Game unavailable. Toggle the pumpkin to try again.</p>}
        {hud.paused&&<p role="status">Paused</p>}
        {practice&&<p><b>Practice · {hud.nextIn}s</b><br/>{PRACTICE_HINTS[hud.defeated-1]}</p>}
        {siege&&<p role="status">{hud.siegeIn?`Final siege · ${hud.siegeIn}s · Press 4 for Royal Volley`:'Exit open · Walk through the green gate'}</p>}
        {counter&&<div className="halloween-counter-window">
          <p className="halloween-counter" role="status">{hud.counterText} · Double damage</p>
          <progress aria-label="Counter opening time remaining" max={2.5} value={hud.counterTime}/>
          <span aria-hidden="true">{hud.counterTime.toFixed(1)}s</span>
        </div>}
        {hud.dropIndex>=0&&<p className="halloween-drop-status" role="status">
          <AbilityIcon index={hud.dropIndex}/><span><b>{BOSSES[hud.dropIndex].ability}</b> · {hud.mode==='manual'?'Walk over the drop to collect':'Mage is collecting the drop'}</span>
        </p>}
        {claimed&&<p className="halloween-drop-status" role="status">
          <AbilityIcon index={hud.claimedIndex}/><span><b>Ability claimed</b> · {BOSSES[hud.claimedIndex].ability}</span>
        </p>}
      </div>}
    </div>
    <aside className="halloween-dock" aria-label="Hunt controls and points" data-mode={hud.mode} data-paused={hud.paused} data-dead={hud.dead}>
      {hud.won&&<div className="halloween-run-card halloween-game-over" role="group" aria-label="Victory"><p><strong>Escaped the graveyard</strong></p>{hud.report&&<RunSummary report={hud.report}/>}<div><button ref={retryButton} type="button" className="halloween-play-button" onClick={()=>retry.current()}>Play again</button><button type="button" className="halloween-return-button" onClick={()=>returnToAuto.current()}>Restart autoplay</button></div></div>}
      {hud.mode==='manual'&&hud.rewardPending&&<div className="halloween-run-card halloween-reward" ref={rewardButton} role="group" aria-label="Boss victory reward">
        <p role="status"><strong>Ability claimed</strong> · {BOSSES[BOSS_ORDER[hud.defeated-1]].ability}</p>
        {hud.maxHealth<6&&<button type="button" onClick={()=>claimUpgrade.current('vitality')}>Vitality · +1 heart</button>}
        {hud.focus<3&&<button type="button" onClick={()=>claimUpgrade.current('focus')}>Focus · 10% faster cooldowns</button>}
        {hud.maxHealth===6&&hud.focus===3&&<button type="button" onClick={()=>claimUpgrade.current('vitality')}>Restore 1 heart</button>}
      </div>}
      {hud.dead&&hud.mode==='auto'&&<div className="halloween-run-card"><p role="status">The mage fell. Autoplay will restart shortly.</p>{hud.report&&<RunSummary report={hud.report}/>}</div>}
      {hud.dead&&hud.mode==='manual'&&<div className="halloween-run-card halloween-game-over" role="group" aria-label="Game over"><p>The ghosts caught you. Ready for another hunt?</p>{hud.report&&<RunSummary report={hud.report}/>}<div><button ref={retryButton} type="button" className="halloween-play-button" onClick={()=>retry.current()}>Retry</button><button type="button" className="halloween-return-button" onClick={()=>returnToAuto.current()}>Return to autoplay</button></div></div>}
      <div className="halloween-dock-row">
        {hud.mode==='manual'&&<div className="halloween-survival-stats">{Math.floor(hud.time/60).toString().padStart(2,'0')}:{Math.floor(hud.time%60).toString().padStart(2,'0')} survived</div>}
        {hud.available&&<div className="halloween-score"><span>Points</span> <strong>{hud.score.toString().padStart(2,'0')}</strong></div>}
        <details className="halloween-settings" ref={settings}>
          <summary ref={settingsGear} aria-label="Halloween settings" title="Halloween settings"><Settings aria-hidden="true"/></summary>
          <div className="halloween-settings-panel">
            {hud.available&&!hud.dead&&!hud.won&&<div className="halloween-run-controls">
              <div className="halloween-run-actions">
                <button type="button" className="halloween-play-button" disabled={hud.paused} onClick={()=>runFromSettings(hud.mode==='auto'?takeControl.current:returnToAuto.current)}>{hud.mode==='auto'?(hud.canResume?'Resume':'Play'):'Autoplay'}</button>
                {hud.mode==='auto'&&<button type="button" className="halloween-play-button halloween-fresh-run" disabled={hud.paused} onClick={()=>runFromSettings(retry.current)}>New manual run</button>}
              </div>
              <p>{hud.mode==='auto'?'Click the mage to take control.':'WASD / arrows to move · X to dodge · Hold click to shoot · 1–4 for abilities · Esc for autoplay'}</p>
            </div>}
            <div className="halloween-audio-controls" data-audio-status={audioStatus}>
              <div className="halloween-audio-actions">
                <button type="button" className="halloween-sound-toggle" aria-label={mix.muted?'Unmute Halloween audio':'Mute Halloween audio'} aria-pressed={mix.muted} disabled={!hud.available||audioStatus==='unavailable'} onClick={()=>{void audio.current?.unlock();changeMix({muted:!mix.muted})}}>{mix.muted?<VolumeX/>:<Volume2/>}<span>{!hud.available||audioStatus==='unavailable'?'Audio unavailable':mix.muted?'Sound off':'Sound on'}</span></button>
                {hud.available&&audioStatus==='locked'&&!mix.muted&&<button type="button" className="halloween-enable-audio" onClick={()=>void audio.current?.unlock()}>Enable sound</button>}
              </div>
              <label htmlFor="halloween-music-volume">Music &amp; ambience <output>{Math.round(mix.music*100)}%</output></label><input id="halloween-music-volume" aria-label="Halloween music and ambience volume" type="range" min="0" max="100" value={Math.round(mix.music*100)} disabled={!hud.available||audioStatus==='unavailable'} onChange={event=>changeMix({music:Number(event.target.value)/100})}/>
              <label htmlFor="halloween-effects-volume">Effects <output>{Math.round(mix.effects*100)}%</output></label><input id="halloween-effects-volume" aria-label="Halloween effects volume" type="range" min="0" max="100" value={Math.round(mix.effects*100)} disabled={!hud.available||audioStatus==='unavailable'} onChange={event=>changeMix({effects:Number(event.target.value)/100})}/>
            </div>
          </div>
        </details>
      </div>
    </aside>
  </>;
}
