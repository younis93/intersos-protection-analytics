import {type CSSProperties,useCallback,useEffect,useRef,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import Welcome from './Welcome';
import {GUARDIAN_FOX_STORAGE_KEY} from './GuardianFox';
import LegalPlatform from './LegalPlatform';

type Workspace='welcome'|'legal';
type StartupPhase='visible'|'exiting'|'hidden';
const STARTUP_MINIMUM_MS=700;
const STARTUP_EXIT_MS=360;
const STARTUP_MAXIMUM_MS=8000;
const workspaceFromUrl=():Workspace=>{const hash=window.location.hash;if(!hash||hash==='#'||hash==='#/')return 'welcome';if(!hash.startsWith('#/legal'))window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#/legal/overview`);return 'legal'};

function StartupScreen({phase}:{phase:Exclude<StartupPhase,'hidden'>}){
 const startupEpoch=Number(new URLSearchParams(window.location.search).get('startupEpoch'));
 const startupOffset=Number.isFinite(startupEpoch)&&startupEpoch>0?Math.max(0,Date.now()-startupEpoch):0;
 const style={'--startup-offset':`-${startupOffset}ms`} as CSSProperties;
 return <section className={`app-startup-loading ${startupEpoch?'is-handoff ':''}${phase==='exiting'?'is-exiting':''}`} style={style} role="status" aria-live="polite" aria-label="Starting Iraq Data Analysis" aria-busy="true">
  <div className="app-startup-loading-ambient ambient-one"/><div className="app-startup-loading-ambient ambient-two"/>
  <div className="app-startup-loading-card glass">
   <div className="app-startup-loading-mark"><span className="app-startup-loading-orbit"/><img src="/intersos-symbol-transparent.png" alt="INTERSOS"/></div>
   <span className="eyebrow">IRAQ DATA ANALYSIS</span><h1>Preparing your workspace</h1><p>Starting the secure local application.</p>
   <div className="app-startup-loading-progress" aria-hidden="true"><i/></div>
   <footer><ShieldCheck/><span>Local and private data workspace</span></footer>
  </div>
 </section>;
}

export default function RootApp(){
 const [workspace,setWorkspace]=useState<Workspace>(workspaceFromUrl);
 const [startupReady,setStartupReady]=useState(false);
 const [startupPhase,setStartupPhase]=useState<StartupPhase>('visible');
 const startupBeganAt=useRef(performance.now());
 const [foxUnlocked,setFoxUnlocked]=useState(()=>{try{return localStorage.getItem(GUARDIAN_FOX_STORAGE_KEY)==='true'}catch{return false}});
 useEffect(()=>{const sync=()=>setWorkspace(workspaceFromUrl());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 useEffect(()=>{if(workspace!=='legal'||startupReady)return;const timer=window.setTimeout(()=>setStartupReady(true),STARTUP_MAXIMUM_MS);return()=>window.clearTimeout(timer)},[workspace,startupReady]);
 useEffect(()=>{if(!startupReady)return;const remaining=Math.max(0,STARTUP_MINIMUM_MS-(performance.now()-startupBeganAt.current));let exitTimer:number|undefined;const revealTimer=window.setTimeout(()=>{setStartupPhase('exiting');exitTimer=window.setTimeout(()=>setStartupPhase('hidden'),STARTUP_EXIT_MS)},remaining);return()=>{window.clearTimeout(revealTimer);if(exitTimer!==undefined)window.clearTimeout(exitTimer)}},[startupReady]);
 const markStartupReady=useCallback(()=>setStartupReady(true),[]);
 const unlockFox=()=>{setFoxUnlocked(true);try{localStorage.setItem(GUARDIAN_FOX_STORAGE_KEY,'true')}catch{/* The fox remains available for this session. */}};
 if(workspace==='welcome')return <Welcome foxUnlocked={foxUnlocked} onFoxUnlock={unlockFox}/>;
 return <><div className="startup-app-content" aria-hidden={startupPhase!=='hidden'} inert={startupPhase!=='hidden'?true:undefined}><LegalPlatform onStartupReady={markStartupReady}/></div>{startupPhase!=='hidden'&&<StartupScreen phase={startupPhase}/>}</>;
}
