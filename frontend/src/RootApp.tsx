import {useCallback,useEffect,useRef,useState} from 'react';
import Welcome from './Welcome';
import {GUARDIAN_FOX_STORAGE_KEY} from './GuardianFox';
import LegalPlatform from './LazyLegalPlatform';
import StartupScreen from './StartupScreen';
import {beginProcessingCardMotion} from './processingCardMotion';

type Workspace='welcome'|'legal';
type StartupPhase='visible'|'exiting'|'hidden';
const STARTUP_MINIMUM_MS=700;
const STARTUP_EXIT_MS=360;
const STARTUP_MAXIMUM_MS=8000;
const workspaceFromUrl=():Workspace=>{const hash=window.location.hash;if(!hash||hash==='#'||hash==='#/')return 'welcome';if(!hash.startsWith('#/legal'))window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#/legal/overview`);return 'legal'};


export default function RootApp(){
 // Desktop preparation belongs exclusively to the native launcher. Browser
 // launches use this root's preparation screen instead.
 const startupEpoch=Number(new URLSearchParams(window.location.search).get('startupEpoch'));
 const desktopStartup=Number.isFinite(startupEpoch)&&startupEpoch>0;
 const [workspace,setWorkspace]=useState<Workspace>(workspaceFromUrl);
 const [startupReady,setStartupReady]=useState(false);
 const [startupPhase,setStartupPhase]=useState<StartupPhase>(()=>desktopStartup?'hidden':'visible');
 const startupBeganAt=useRef(performance.now());
 const [foxUnlocked,setFoxUnlocked]=useState(()=>{try{return localStorage.getItem(GUARDIAN_FOX_STORAGE_KEY)==='true'}catch{return false}});
 useEffect(()=>{const sync=()=>setWorkspace(workspaceFromUrl());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 useEffect(()=>{if(desktopStartup||workspace!=='legal'||startupReady)return;const timer=window.setTimeout(()=>setStartupReady(true),STARTUP_MAXIMUM_MS);return()=>window.clearTimeout(timer)},[desktopStartup,workspace,startupReady]);
 useEffect(()=>{
  if(desktopStartup||!startupReady)return;
  const remaining=Math.max(0,STARTUP_MINIMUM_MS-(performance.now()-startupBeganAt.current));
  let exitTimer:number|undefined;
  const revealTimer=window.setTimeout(()=>{
   if(document.querySelector('.legal-upload-overlay:not(.is-minimized)')){
    const card=document.querySelector('.app-startup-loading-card');
    if(card)beginProcessingCardMotion(card.getBoundingClientRect());
    // Processing owns the shared surface and outgoing content from this point.
    setStartupPhase('hidden');
   }else{
    setStartupPhase('exiting');
    exitTimer=window.setTimeout(()=>setStartupPhase('hidden'),STARTUP_EXIT_MS);
   }
  },remaining);
  return()=>{window.clearTimeout(revealTimer);if(exitTimer!==undefined)window.clearTimeout(exitTimer)};
 },[desktopStartup,startupReady]);
 const markStartupReady=useCallback(()=>setStartupReady(true),[]);
 const unlockFox=()=>{setFoxUnlocked(true);try{localStorage.setItem(GUARDIAN_FOX_STORAGE_KEY,'true')}catch{/* The fox remains available for this session. */}};
 if(workspace==='welcome')return <Welcome foxUnlocked={foxUnlocked} onFoxUnlock={unlockFox}/>;
 return <><div className={desktopStartup?'desktop-app-content':'startup-app-content'} aria-hidden={startupPhase!=='hidden'} inert={startupPhase!=='hidden'?true:undefined}><LegalPlatform onStartupReady={markStartupReady}/></div>{startupPhase!=='hidden'&&<StartupScreen phase={startupPhase}/>}</>;
}
