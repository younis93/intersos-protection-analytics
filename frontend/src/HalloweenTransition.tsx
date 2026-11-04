import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export default function HalloweenTransition({onCovered,onComplete,onStart,onReveal}:{onCovered:()=>void;onComplete:()=>void;onStart?:()=>void;onReveal?:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onCovered,onComplete,onStart,onReveal});callbacks.current={onCovered,onComplete,onStart,onReveal};
  const [fallback,setFallback]=useState(false);
  useEffect(()=>{
    let disposed=false,covered=false,finished=false,frame=0,lastPaint=-Infinity,audioStarted=false,revealed=false;
    const startAudio=()=>{if(!audioStarted){audioStarted=true;callbacks.current.onStart?.()}};
    let loadTimer:ReturnType<typeof setTimeout>|undefined,watchdog:ReturnType<typeof setTimeout>|undefined;
    const timers:ReturnType<typeof setTimeout>[]=[];
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    host.current?.focus({preventScroll:true});
    const cover=()=>{if(!covered&&!disposed){covered=true;callbacks.current.onCovered()}};
    const finish=()=>{
      if(finished||disposed)return;finished=true;cover();cancelAnimationFrame(frame);
      if(loadTimer)clearTimeout(loadTimer);if(watchdog)clearTimeout(watchdog);
      callbacks.current.onComplete();
    };
    const crossfade=()=>{
      if(disposed||finished)return;
      cancelAnimationFrame(frame);if(loadTimer)clearTimeout(loadTimer);
      startAudio();
      setFallback(true);timers.push(setTimeout(cover,120),setTimeout(finish,260));
    };
    const onHidden=()=>{if(document.hidden)finish()};
    const onPreference=()=>{if(preference.matches)crossfade()};
    const key=(event:KeyboardEvent)=>{
      if(['Tab','Enter',' ','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(event.key)){
        event.preventDefault();event.stopPropagation();
      }
    };
    document.addEventListener('visibilitychange',onHidden);preference.addEventListener('change',onPreference);window.addEventListener('keydown',key,true);
    if(document.hidden)finish();
    else if(preference.matches)crossfade();
    else{
      loadTimer=setTimeout(crossfade,1200);
      void import('./halloweenBurnRenderer').then(({createBurnRenderer})=>{
        if(disposed||finished||preference.matches)return;
        if(loadTimer)clearTimeout(loadTimer);
        // If loading already fell back, let that short crossfade finish.
        if(timers.length)return;
        const render=createBurnRenderer(canvas.current!);let started:number|undefined;
        const tick=(now:number)=>{
          if(disposed||finished)return;
          if(started===undefined){started=now;startAudio()}const elapsed=(now-started)/1000;
          try{
            if(!covered&&elapsed>=.9){render.draw(.9);lastPaint=now;cover()}
            else if(now-lastPaint>=30||elapsed>=2){render.draw(elapsed);lastPaint=now}
            if(elapsed>=1.2&&!revealed){revealed=true;callbacks.current.onReveal?.()}
            if(elapsed>=2){finish();return}
            frame=requestAnimationFrame(tick);
          }catch{crossfade()}
        };
        watchdog=setTimeout(finish,3000);frame=requestAnimationFrame(tick);
      }).catch(crossfade);
    }
    return()=>{
      disposed=true;cancelAnimationFrame(frame);if(loadTimer)clearTimeout(loadTimer);if(watchdog)clearTimeout(watchdog);timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange',onHidden);preference.removeEventListener('change',onPreference);window.removeEventListener('keydown',key,true);
    };
  },[]);
  return createPortal(<div ref={host} tabIndex={-1} className={`halloween-transition${fallback?' is-crossfade':''}`} role="status" aria-label="Changing Halloween theme"><canvas ref={canvas} aria-hidden="true"/><span className="sr-only">Changing Halloween theme</span></div>,document.body);
}
