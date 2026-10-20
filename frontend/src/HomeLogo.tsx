import {type CSSProperties,type ReactNode,useEffect,useRef,useState} from 'react';
import {createGlobeRenderer,loadGlobeMap} from './homeGlobeRenderer';

const TURN_DURATION=2400;
const smooth=(value:number)=>value*value*value*(value*(value*6-15)+10);

export function HomeLogo({children}:{children?:ReactNode}){
  const [spinning,setSpinning]=useState(false),[highlighted,setHighlighted]=useState(false),[ready,setReady]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<ReturnType<typeof createGlobeRenderer>|undefined>(undefined);
  const initialization=useRef<Promise<void>|undefined>(undefined);
  const busy=useRef(false),frame=useRef<number|undefined>(undefined),timer=useRef<number|undefined>(undefined),generation=useRef(0);
  const cancel=(updateState=true)=>{
    generation.current++;
    if(frame.current!==undefined)cancelAnimationFrame(frame.current);
    if(timer.current!==undefined)window.clearTimeout(timer.current);
    frame.current=undefined;timer.current=undefined;busy.current=false;
    renderer.current?.(0);
    if(updateState){setSpinning(false);setHighlighted(false)}
  };
  const highlight=()=>{
    busy.current=true;setHighlighted(true);
    timer.current=window.setTimeout(()=>{timer.current=undefined;busy.current=false;setHighlighted(false)},200);
  };
  useEffect(()=>{
    let disposed=false;
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    initialization.current=loadGlobeMap().then(map=>{
      if(disposed||!canvas.current)return;
      const render=createGlobeRenderer(canvas.current,map);
      render(0);
      renderer.current=render;
      setReady(true);
    }).catch(()=>{});
    const onPreference=()=>{if(preference.matches&&busy.current){cancel();highlight()}};
    const onVisibility=()=>{if(document.hidden)cancel()};
    const themeObserver=new MutationObserver(()=>renderer.current?.(0));
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    preference.addEventListener('change',onPreference);
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{disposed=true;cancel(false);renderer.current=undefined;themeObserver.disconnect();preference.removeEventListener('change',onPreference);document.removeEventListener('visibilitychange',onVisibility)};
  },[]);
  const spin=async()=>{
    if(busy.current)return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){highlight();return}
    busy.current=true;
    const current=++generation.current;
    try{
      await initialization.current;
      if(current!==generation.current)return;
      const render=renderer.current;
      if(!render){busy.current=false;highlight();return}
      setSpinning(true);
      let started:number|undefined;
      const tick=(now:number)=>{
        if(current!==generation.current)return;
        started??=now;
        const progress=Math.min(1,(now-started)/TURN_DURATION);
        if(progress>=1){render(0);frame.current=undefined;busy.current=false;setSpinning(false);return}
        render(smooth(progress)*Math.PI*2);
        frame.current=requestAnimationFrame(tick);
      };
      frame.current=requestAnimationFrame(tick);
    }catch{
      if(current===generation.current){cancel();highlight()}
    }
  };
  return <button type="button" className="welcome-logo-secret" onClick={()=>void spin()} aria-label="Animate INTERSOS home logo" aria-busy={spinning}>
    <span className={`home-logo-motion${ready?' is-globe-ready':''}${spinning?' is-spinning':''}${highlighted?' is-highlighted':''}`}>
      <span className="welcome-logo-mark"><span className="home-logo-emblem">
        <span className="home-logo-frame" aria-hidden="true"/>
        <canvas className="home-logo-earth" ref={canvas} aria-hidden="true"/>
      </span></span>
      <span className="welcome-logo-word" aria-hidden="true">{'INTERSOS'.split('').map((letter,index)=><b key={index} style={{'--letter':index} as CSSProperties}>{letter}</b>)}</span>
    </span>
    <span className="sr-only">INTERSOS</span>{children}
  </button>;
}
