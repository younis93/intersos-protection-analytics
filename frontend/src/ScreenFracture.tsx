import {useEffect,useMemo,useRef,useState} from 'react';
import html2canvas from 'html2canvas';
import {registerGuardianFoxPress,type GuardianFoxPressState} from './GuardianFox';

export type FracturePhase='normal'|'breaking'|'shattered'|'restoring';
const EMPTY_PRESS:GuardianFoxPressState={count:0,startedAt:0};
const wait=(milliseconds:number)=>new Promise(resolve=>window.setTimeout(resolve,milliseconds));

export function useFractureSequence(){
  const [phase,setPhase]=useState<FracturePhase>('normal');
  const logoPresses=useRef<GuardianFoxPressState>(EMPTY_PRESS);
  const restorePresses=useRef<GuardianFoxPressState>(EMPTY_PRESS);
  const pressLogo=()=>{
    if(phase!=='normal')return;
    const result=registerGuardianFoxPress(logoPresses.current,performance.now());
    logoPresses.current=result.unlocked?EMPTY_PRESS:result.state;
    if(result.unlocked)setPhase('breaking');
  };
  const pressShattered=()=>{
    if(phase!=='shattered')return;
    const result=registerGuardianFoxPress(restorePresses.current,performance.now());
    restorePresses.current=result.unlocked?EMPTY_PRESS:result.state;
    if(result.unlocked)setPhase('restoring');
  };
  const finishRestore=()=>{logoPresses.current=EMPTY_PRESS;restorePresses.current=EMPTY_PRESS;setPhase('normal')};
  return {phase,pressLogo,pressShattered,setPhase,finishRestore};
}

const PARTICLES=Array.from({length:84},(_,index)=>({id:index,x:18+(index*37%65),y:13+(index*53%58),dx:(index*71%180)-90,dy:(index*43%150)-90,size:2+(index*17%5),delay:(index%12)*18}));

export function ScreenFracture({phase,onShattered,onRestorePress,onRestored}:{phase:FracturePhase;onShattered:()=>void;onRestorePress:()=>void;onRestored:()=>void}){
  const [snapshot,setSnapshot]=useState<string>();
  const [pulse,setPulse]=useState(0);
  const reduced=useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const particles=useMemo(()=>PARTICLES,[]);
  useEffect(()=>{
    if(phase!=='breaking')return;
    let cancelled=false;
    const run=async()=>{
      await wait(reduced.current?260:1180);
      const page=document.querySelector<HTMLElement>('.welcome-page');
      if(page)try{const canvas=await html2canvas(page,{backgroundColor:null,scale:Math.min(window.devicePixelRatio,2),logging:false,useCORS:true,foreignObjectRendering:true,ignoreElements:element=>element.classList.contains('fracture-overlay')});if(!cancelled)setSnapshot(canvas.toDataURL('image/jpeg',.92))}catch{/* Styled panels are the fallback. */}
      await wait(reduced.current?120:180);
      if(!cancelled)onShattered();
    };
    run();
    return()=>{cancelled=true};
  },[phase,onShattered]);
  useEffect(()=>{if(phase!=='restoring')return;const timer=window.setTimeout(onRestored,reduced.current?650:1900);return()=>window.clearTimeout(timer)},[phase,onRestored]);
  if(phase==='normal')return null;
  const press=()=>{if(phase==='shattered'){setPulse(value=>value+1);onRestorePress()}};
  return <div className={`fracture-overlay fracture-${phase}`} onClick={press} role={phase==='shattered'?'button':undefined} tabIndex={phase==='shattered'?0:-1} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&phase==='shattered'){event.preventDefault();press()}}} aria-label={phase==='shattered'?'Shattered INTERSOS screen':undefined}>
    <div className="fracture-half fracture-half-top" style={snapshot?{backgroundImage:`url(${snapshot})`}:undefined}/><div className="fracture-half fracture-half-bottom" style={snapshot?{backgroundImage:`url(${snapshot})`}:undefined}/>
    <svg className="fracture-crack" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><path className="fracture-crack-glow" d="M-20 255 L155 300 244 426 357 390 466 535 575 490 682 635 783 594 881 730 1020 770"/><path key={pulse} className="fracture-crack-core" d="M-20 255 L155 300 244 426 357 390 466 535 575 490 682 635 783 594 881 730 1020 770"/><path className="fracture-branch" d="M244 426 L192 500 M357 390 L414 315 M575 490 L526 602 M783 594 L845 520"/></svg>
    <div className="fracture-particles" aria-hidden="true">{particles.map(p=><i key={p.id} style={{'--px':`${p.x}%`,'--py':`${p.y}%`,'--dx':`${p.dx}px`,'--dy':`${p.dy}px`,'--ps':`${p.size}px`,'--pd':`${p.delay}ms`} as React.CSSProperties}/>)}</div><div className="fracture-flash"/>
  </div>;
}
