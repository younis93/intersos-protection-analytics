import {useEffect,useRef,useState} from 'react';
import {controlHunt,handoffHunt,createHunt,resizeHunt,stepHunt,type HuntState} from './halloweenSimulation';
import {createHalloweenRenderer} from './halloweenRenderer';
import {createHalloweenAudio,readHalloweenMix,type AudioStatus,type HalloweenMix} from './halloweenAudio';
import {Heart,Volume2,VolumeX,SlidersHorizontal} from 'lucide-react';
import {createGraveyardScene} from './halloweenGraveyard';

const movement=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const physicalKeys:Record<string,string>={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d'};
const inputKey=(event:KeyboardEvent)=>physicalKeys[event.code]??event.key.toLowerCase();
const uiSelector='a,button,input,textarea,select,label,summary,.halloween-audio-controls,[contenteditable="true"],[role="dialog"],[role="combobox"],[role="listbox"],[role="menu"]';
export default function HalloweenGame({paused=false,onManualChange}:{paused?:boolean;onManualChange?:(active:boolean)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<HTMLCanvasElement>(null),actor=useRef<HTMLButtonElement>(null);
  const pausedRef=useRef(paused),takeControl=useRef<()=>void>(()=>{}),returnToAuto=useRef<()=>void>(()=>{}),retry=useRef<()=>void>(()=>{}),retryButton=useRef<HTMLButtonElement>(null);
  const notifyManual=useRef(onManualChange);notifyManual.current=onManualChange;
  const [hud,setHud]=useState({score:0,mode:'auto' as HuntState['mode'],paused:false,available:true,health:3,dead:false,time:0,canResume:false});
  const audio=useRef<ReturnType<typeof createHalloweenAudio>|null>(null);
  const [mix,setMix]=useState(readHalloweenMix),[audioStatus,setAudioStatus]=useState<AudioStatus>('locked');
  const changeMix=(update:Partial<HalloweenMix>)=>{
    const next={...mix,...update};setMix(next);audio.current?.setMix(next);
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
    const clear=()=>{input.keys.clear();input.firing=false};
    const blocked=()=>pausedRef.current||Boolean(document.querySelector('[aria-modal="true"],.welcome-page [role="listbox"],.welcome-page [role="menu"]'));
    const publish=(isPaused=false)=>{
      const manual=s.mode==='manual';
      if(manual!==reportedManual){reportedManual=manual;notifyManual.current?.(manual)}
      setHud({score:s.score,mode:s.mode,paused:isPaused,available:true,health:s.health,dead:s.dead,time:s.manualTime,canResume:hasPlayed});
    };
    const autoplay=()=>{if(s.dead){controlHunt(s,'auto');hasPlayed=false}else handoffHunt(s,'auto');clear();last=0;publish()};
    returnToAuto.current=autoplay;
    const startManual=(fresh=false)=>{if(blocked())return;if(fresh||s.dead)controlHunt(s,'manual');else handoffHunt(s,'manual');hasPlayed=true;clear();last=0;input.aim={...s.aim};publish();queueMicrotask(()=>{if(!disposed)actor.current?.focus({preventScroll:true})})};
    retry.current=()=>startManual(true);
    takeControl.current=()=>{
      if(blocked())return;
      if(blurred){blurred=false;clear();last=0;sound.setPaused(document.hidden)}
      if(s.mode==='auto')startManual();else publish();
    };
    const interactive=(target:EventTarget|null)=>target instanceof Element&&Boolean(target.closest(uiSelector));
    const down=(event:KeyboardEvent)=>{
      if(s.mode!=='manual'||blocked()||blurred||event.defaultPrevented)return;
      const key=inputKey(event);
      if(key==='escape'){event.preventDefault();autoplay();return}
      if(key==='tab'){
        const controls=Array.from(document.querySelectorAll<HTMLElement>('.halloween-mage-control,.halloween-hud button,.halloween-hud summary,.halloween-hud input,.halloween-pumpkin-toggle')).filter(el=>!el.matches(':disabled')&&el.getClientRects().length>0);
        const current=controls.indexOf(document.activeElement as HTMLElement);
        const next=(current+(event.shiftKey?-1:1)+controls.length)%controls.length;
        event.preventDefault();controls[next]?.focus({preventScroll:true});return;
      }
      if(s.dead)return;
      if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
      if(movement.has(key)){event.preventDefault();input.keys.add(key)}
    };
    const up=(event:KeyboardEvent)=>input.keys.delete(inputKey(event));
    const aim=(event:PointerEvent)=>{const r=node.getBoundingClientRect();input.aim={x:(event.clientX-r.left)*s.width/r.width,y:(event.clientY-r.top)*s.height/r.height}};
    const fire=(event:PointerEvent)=>{if(s.mode==='manual'&&!s.dead&&event.button===0&&!blocked()&&(!interactive(event.target)||event.target===actor.current)){aim(event);input.firing=true}};
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
        const wasDead=s.dead;
        for(const hit of stepHunt(s,input,dt,Math.random,(kind,point)=>{sound.play(kind,point.x,s.width);if(kind==='hurt')renderer.hurt(point)}))renderer.hit(hit);
        if(!wasDead&&s.dead){clear();publish();queueMicrotask(()=>{if(!disposed)retryButton.current?.focus({preventScroll:true})})}
      }
      renderer.draw(s,isPaused?0:dt,reduced.matches);
      background?.draw(s.width,s.height,s.time,reduced.matches);
      if(actor.current){
        actor.current.style.left=`${s.mage.x}px`;actor.current.style.top=`${s.mage.y-20}px`;actor.current.disabled=blocked()||s.dead;
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
      disposed=true;cancelAnimationFrame(frame);clear();takeControl.current=()=>{};returnToAuto.current=()=>{};retry.current=()=>{};
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
  return <>
    <canvas ref={scene} className="halloween-graveyard" aria-hidden="true"/>
    <canvas ref={canvas} className="halloween-canvas" aria-hidden="true"/>
    {hud.mode==='manual'&&<div className="halloween-input-shield" aria-hidden="true"/>}
    {hud.available&&!hud.dead&&<button ref={actor} type="button" className="halloween-mage-control" onPointerDown={()=>takeControl.current()} onClick={()=>takeControl.current()} aria-label="Control the pumpkin mage" aria-pressed={hud.mode==='manual'} title="Click to play as the pumpkin mage"/>}
    <aside className="halloween-hud" aria-label="Ghost hunt" data-mode={hud.mode} data-paused={hud.paused} data-dead={hud.dead}>
      <div><span className="halloween-hud-eyebrow">MIDNIGHT GHOST HUNT</span><strong>{hud.score.toString().padStart(2,'0')} <small>ghosts caught</small></strong></div>
      {hud.mode==='manual'&&<div className="halloween-survival-stats"><span className="halloween-hearts" role="status" aria-label={`Health: ${hud.health} of 3 hearts`}>{[0,1,2].map(i=><Heart key={i} aria-hidden="true" data-filled={i<hud.health}/>)}</span><span>{Math.floor(hud.time/60).toString().padStart(2,'0')}:{Math.floor(hud.time%60).toString().padStart(2,'0')} survived</span></div>}
      <span className="halloween-mode" role="status">{!hud.available?'Game unavailable':hud.dead?'Game over':hud.paused?'Paused':hud.mode==='auto'?'Autoplay':'You are playing'}</span>
      {hud.available&&!hud.dead&&<button type="button" className="halloween-play-button" disabled={hud.paused} onClick={()=>hud.mode==='auto'?takeControl.current():returnToAuto.current()}>{hud.mode==='auto'?(hud.canResume?'Resume':'Play'):'Autoplay'}</button>}
      {hud.dead&&<div className="halloween-game-over" aria-label="Game over"><p>The ghosts caught you. Ready for another hunt?</p><div><button ref={retryButton} type="button" className="halloween-play-button" onClick={()=>retry.current()}>Retry</button><button type="button" className="halloween-return-button" onClick={()=>returnToAuto.current()}>Return to autoplay</button></div></div>}
      <p className="halloween-desktop-help">{!hud.available?'Toggle the pumpkin to try again.':hud.dead?'Retry for a fresh run · ESC to return to autoplay':hud.mode==='auto'?(hud.canResume?'Click the mage to resume your run.':'Click the pumpkin mage to take control.'):'WASD / arrows to move · Mouse to aim · Hold click to shoot · ESC for autoplay'}</p>
      <p className="halloween-touch-help">Sit back and enjoy the ghost hunt.</p>
      <div className="halloween-audio-controls" data-audio-status={audioStatus}>
        <button type="button" className="halloween-sound-toggle" aria-label={mix.muted?'Unmute Halloween audio':'Mute Halloween audio'} aria-pressed={mix.muted} disabled={audioStatus==='unavailable'} onClick={()=>{void audio.current?.unlock();changeMix({muted:!mix.muted})}}>{mix.muted?<VolumeX/>:<Volume2/>}<span>{audioStatus==='unavailable'?'Audio unavailable':mix.muted?'Sound off':'Sound on'}</span></button>
        {audioStatus==='locked'&&!mix.muted&&<button type="button" className="halloween-enable-audio" onClick={()=>void audio.current?.unlock()}>Enable sound</button>}
        <details className="halloween-audio-settings"><summary aria-label="Halloween audio settings"><SlidersHorizontal/><span>Audio mix</span></summary><div>
          <label htmlFor="halloween-music-volume">Music <output>{Math.round(mix.music*100)}%</output></label><input id="halloween-music-volume" aria-label="Halloween music volume" type="range" min="0" max="100" value={Math.round(mix.music*100)} onChange={event=>changeMix({music:Number(event.target.value)/100})}/>
          <label htmlFor="halloween-effects-volume">Effects <output>{Math.round(mix.effects*100)}%</output></label><input id="halloween-effects-volume" aria-label="Halloween effects volume" type="range" min="0" max="100" value={Math.round(mix.effects*100)} onChange={event=>changeMix({effects:Number(event.target.value)/100})}/>
        </div></details>
      </div>
    </aside>
  </>;
}
