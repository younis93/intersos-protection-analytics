import {useEffect,useState} from 'react';

export const GUARDIAN_FOX_STORAGE_KEY='guardian-fox-unlocked';
export const GUARDIAN_FOX_PRESS_WINDOW_MS=3000;

export interface GuardianFoxPressState {count:number;startedAt:number}

export function registerGuardianFoxPress(state:GuardianFoxPressState,now:number,windowMs=GUARDIAN_FOX_PRESS_WINDOW_MS){
  const withinWindow=state.count>0&&now-state.startedAt<=windowMs;
  const next={count:withinWindow?state.count+1:1,startedAt:withinWindow?state.startedAt:now};
  return {state:next,unlocked:next.count>=5};
}

export const HOME_FOX_ACTIONS=['swing','idle','walk','jump','wave'] as const;
export const WORKSPACE_FOX_ACTIONS=['idle','wave'] as const;
type HomeFoxAction=typeof HOME_FOX_ACTIONS[number];
type WorkspaceFoxAction=typeof WORKSPACE_FOX_ACTIONS[number];

const HOME_ACTION_MS:Record<HomeFoxAction,number>={swing:4020,idle:3015,walk:3015,jump:2814,wave:3015};
const WORKSPACE_ACTION_MS:Record<WorkspaceFoxAction,number>={idle:6030,wave:3015};
const SPIDER_3D_ASSETS=['idle','walk','jump','wave','swing'] as const;

export function chooseNextFoxAction<T extends string>(actions:readonly T[],previous:T,random=Math.random):T{
  if(actions.length<2)return actions[0];
  const alternatives=actions.filter(action=>action!==previous);
  return alternatives[Math.min(alternatives.length-1,Math.floor(random()*alternatives.length))];
}

function useReducedMotion(){
  const [reduced,setReduced]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const query=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>setReduced(query.matches);
    query.addEventListener('change',sync);
    return()=>query.removeEventListener('change',sync);
  },[]);
  return reduced;
}

function useRandomFoxAction<T extends string>(actions:readonly T[],durations:Record<T,number>,disabled=false){
  const [action,setAction]=useState<T>(actions[0]);
  const [paused,setPaused]=useState(()=>typeof document!=='undefined'&&document.hidden);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    const sync=()=>{const hidden=document.hidden;setPaused(hidden);if(!hidden)setVersion(current=>current+1)};
    document.addEventListener('visibilitychange',sync);
    return()=>document.removeEventListener('visibilitychange',sync);
  },[]);
  useEffect(()=>{
    if(paused||disabled)return;
    const timer=window.setTimeout(()=>setAction(current=>chooseNextFoxAction(actions,current)),durations[action]);
    return()=>window.clearTimeout(timer);
  },[action,actions,disabled,durations,paused]);
  return {action,paused,version};
}

function usePreloadFoxAssets(){
  useEffect(()=>{[...SPIDER_3D_ASSETS.map(name=>`${name}.webp`),'wave-poster.webp','idle-poster.webp'].forEach(file=>{const image=new Image();image.src=`/lego-spiderman-3d/${file}`})},[]);
}

function HomeFox(){
  const reduced=useReducedMotion();
  const {action,paused,version}=useRandomFoxAction(HOME_FOX_ACTIONS,HOME_ACTION_MS,reduced);
  const source=reduced?'/lego-spiderman-3d/wave-poster.webp':`/lego-spiderman-3d/${action}.webp`;
  return <div className="guardian-fox guardian-fox-home spider-3d-home" data-action={action} data-paused={paused} aria-hidden="true">
    <div className="spider-3d-stage"><img key={`${action}-${version}-${reduced}`} className="spider-3d-clip" src={source} alt=""/></div>
  </div>;
}

function WorkspaceFox(){
  const reduced=useReducedMotion();
  const {action,paused,version}=useRandomFoxAction(WORKSPACE_FOX_ACTIONS,WORKSPACE_ACTION_MS,reduced);
  const source=reduced?'/lego-spiderman-3d/idle-poster.webp':`/lego-spiderman-3d/${action}.webp`;
  return <div className="guardian-fox guardian-fox-workspace spider-3d-workspace" data-action={action} data-paused={paused} aria-hidden="true">
    <img key={`${action}-${version}-${reduced}`} className="spider-3d-clip" src={source} alt=""/>
  </div>;
}

export function GuardianFox({mode}:{mode:'home'|'workspace'}){
  usePreloadFoxAssets();
  return mode==='home'?<HomeFox/>:<WorkspaceFox/>;
}
