import {preloadAnalysisWorkspace} from './LazyKoboAnalysis';
import CustomAnalysisIcon from './CustomAnalysisIcon';
import './welcomeCompact.css';
import './customAnalysis.css';
import {AppUpdateDialog} from "./AppUpdateDialog";
import {useAppUpdate} from "./useAppUpdate";
import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import PumpkinIcon from './PumpkinIcon';
import HalloweenTransition from './HalloweenTransition';
import {createBurnAudio} from './halloweenAudio';
import './halloween.css';
import {ArrowRight,BriefcaseBusiness,ChartColumnIncreasing,CloudRain,Maximize2,Minimize2,Palette,Power,RefreshCw,Snowflake} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import type {Theme} from './types';
import {GuardianFox} from './GuardianFox';
import {AVATAR_ENABLED,RIVE_HOME_AVATAR_ENABLED} from './features';
import {HomeLogo} from './HomeLogo';
import './workspaceCardMotion.css';
import {AnimatedSectionIcon} from './AnimatedNavigationIcon';
import {HomeRiveAvatar} from './HomeRiveAvatar';
import ProcessingBackground from './ProcessingBackground';
import {mountHomeCardRefraction} from './homeCardRefraction';
import './homeCardGlass.css';
import {mountHomeWeather,type HomeWeatherMode} from './homeWeather';
import {useRemoteHomeWeather} from './useRemoteHomeWeather';
import {createHomeWeatherAudio} from './homeWeatherAudio';
import HomeSnowman from './HomeSnowman';
import type {SnowmanCue} from './homeSnowmanAudio';
import './homeWeather.css';
import {readStartupPage,saveStartupPage,STARTUP_PAGE_LABELS,type StartupPage} from './startupPage';

const HalloweenGame=lazy(()=>import('./HalloweenGame'));
const HOME_THEME_OPTIONS:[Theme,string][]=[
  ['glass-light','Liquid Glass Light'],
  ['glass-dark','Liquid Glass Dark'],
  ['unhcr','INTERSOS'],
  ['multicolor','Chromatic Executive'],
  ['executive','Executive Minimal'],
  ['forest','Forest Professional'],
];

export interface WorkspaceDefinition {id:string;label:string;description:string;route:string;icon:any;accent:string;badge?:string;enabled:boolean}
export const workspaces:WorkspaceDefinition[]=[
  {id:'legal',label:'Legal Platform',description:'Review legal-platform data, investigate findings, explore beneficiary cases and analyze lawyer activity.',route:'/legal/overview',icon:BriefcaseBusiness,accent:'violet',badge:'Review & case analysis',enabled:true},
  {id:'kobo',label:'Kobo Analysis',description:'Turn Kobo forms and responses into clear analysis, bilingual reports and editable Excel pivots.',route:'/kobo',icon:ChartColumnIncreasing,accent:'blue',badge:'Survey analysis & reports',enabled:true},
  {id:'custom',label:'Custom Analysis',description:'Import Excel or CSV data, configure your columns and build clear analysis, charts and reports.',route:'/custom',icon:CustomAnalysisIcon,accent:'teal',badge:'Excel & CSV analysis',enabled:true},
];

export default function Welcome({foxUnlocked}:{foxUnlocked:boolean;onFoxUnlock:()=>void}){
  const [theme,setTheme]=useState<Theme>(()=>{
    const startupTheme=new URLSearchParams(window.location.search).get('appTheme');
    return (localStorage.getItem('app-theme') as Theme)||(startupTheme==='vice-city'?null:startupTheme as Theme|null)||'glass-light';
  });
  const [fullscreen,setFullscreen]=useState(false);
  const [halloween,setHalloween]=useState(false);
  const glassCards=useRef<HTMLDivElement>(null);
  const showCardGlass=!halloween&&(theme==='glass-light'||theme==='glass-dark');
  useEffect(()=>{
    if(showCardGlass&&glassCards.current)return mountHomeCardRefraction(glassCards.current);
  },[showCardGlass]);
  const [halloweenTransition,setHalloweenTransition]=useState<boolean|null>(null),transitionGuard=useRef(false);
  const burnAudio=useRef<ReturnType<typeof createBurnAudio>|null>(null);
  useEffect(()=>()=>{burnAudio.current?.dispose()},[]);
  const [manualPlay,setManualPlay]=useState(false),[pumpkinPulse,setPumpkinPulse]=useState(0);
  const homeLocked=(halloween&&manualPlay)||halloweenTransition!==null;
  const manualPlayRef=useRef(false);manualPlayRef.current=homeLocked;
  const [koboIconMotion,setKoboIconMotion]=useState(0);
  const prepareWorkspace=(id:string)=>{
    if(id==='kobo')setKoboIconMotion(value=>value+1);
    if(id==='kobo'||id==='custom')void preloadAnalysisWorkspace();
  };
  const [startupPage,setStartupPage]=useState<StartupPage>(readStartupPage);
  const [startupSaving,setStartupSaving]=useState(false);
  const [startupNotice,setStartupNotice]=useState(''),[startupError,setStartupError]=useState('');
  const saveStartup=async(next:StartupPage)=>{
    if(startupSaving||next===startupPage)return;
    setStartupSaving(true);setStartupNotice('');setStartupError('');
    try{await saveStartupPage(next);setStartupPage(next);setStartupNotice(`Saved. ${STARTUP_PAGE_LABELS[next]} will open next time you launch the app.`)}
    catch(reason:unknown){setStartupError(reason instanceof Error?reason.message:'Unable to save the startup page. Please try again.')}
    finally{setStartupSaving(false)}
  };
  useEffect(()=>{if(!startupNotice)return;const timer=window.setTimeout(()=>setStartupNotice(''),4000);return()=>window.clearTimeout(timer)},[startupNotice]);
  const [avatarRevealed,setAvatarRevealed]=useState(false);
  const canAutoOpenUpdate=useCallback(()=>!manualPlayRef.current,[]);
  const update=useAppUpdate(canAutoOpenUpdate);
  const {info:updateInfo,open:updateOpen,check:checkUpdates}=update;
  const weatherTest=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('homeWeatherTest')==='1';
  const [testWeather,setTestWeather]=useState<HomeWeatherMode|null>(null);
  const remoteWeather=useRemoteHomeWeather(!weatherTest);
  const weather=weatherTest?testWeather:remoteWeather;
  const toggleTestWeather=(mode:HomeWeatherMode)=>setTestWeather(current=>current===mode?null:mode);
  const weatherAudio=useRef<ReturnType<typeof createHomeWeatherAudio>>(null);
  const playSnowmanCue=useCallback((cue:SnowmanCue)=>weatherAudio.current?.playSnowmanCue(cue),[]);
  const home=useRef<HTMLElement>(null);
  const weatherScene=useRef<ReturnType<typeof mountHomeWeather>>(undefined);
  const shuffleSnow=useCallback((x:number,y:number,strength:number)=>weatherScene.current?.shuffleSnow(x,y,strength),[]);
  const activeWeather=halloween||homeLocked||updateOpen?null:weather;
  const weatherSurface=activeWeather?<canvas key={activeWeather} className="home-weather-surface" aria-hidden="true"/>:null;
  const disposeWeatherAudio=useCallback(()=>{
    weatherAudio.current?.dispose();
    weatherAudio.current=null;
  },[]);
  useEffect(()=>{
    if(!activeWeather||!home.current)return;
    const scene=mountHomeWeather(home.current,activeWeather);
    weatherScene.current=scene;
    return ()=>{scene?.dispose();weatherScene.current=undefined};
  },[activeWeather]);
  useEffect(()=>{
    if(!weather){disposeWeatherAudio();return}
    const unlock=()=>{if(activeWeather&&!document.hidden)weatherAudio.current?.unlock()};
    const syncAudio=()=>{
      const mode=document.hidden?null:activeWeather;
      if(mode)weatherAudio.current??=createHomeWeatherAudio();
      weatherAudio.current?.setMode(mode);
      unlock();
    };
    syncAudio();
    document.addEventListener('visibilitychange',syncAudio);
    window.addEventListener('click',unlock,true);
    window.addEventListener('keydown',unlock,true);
    return()=>{
      document.removeEventListener('visibilitychange',syncAudio);
      window.removeEventListener('click',unlock,true);
      window.removeEventListener('keydown',unlock,true);
    };
  },[activeWeather,disposeWeatherAudio,weather]);
  useEffect(()=>disposeWeatherAudio,[disposeWeatherAudio]);
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    localStorage.setItem('app-theme',theme);
    localStorage.setItem('legal-platform-theme',theme);
    let attempts=0,timer:number|undefined,cancelled=false;
    const syncNativeTitleBar=async()=>{
      try{
        const nativeApi=(window as any).pywebview?.api;
        if(nativeApi?.set_title_bar_theme&&await nativeApi.set_title_bar_theme(theme))return;
      }catch{/* The native window may still be initializing on first launch. */}
      if(!cancelled&&attempts++<50)timer=window.setTimeout(()=>void syncNativeTitleBar(),100);
    };
    void syncNativeTitleBar();
    const onNativeReady=()=>void syncNativeTitleBar();
    window.addEventListener('pywebviewready',onNativeReady,{once:true});
    return()=>{cancelled=true;window.removeEventListener('pywebviewready',onNativeReady);if(timer)window.clearTimeout(timer)};
  },[theme]);
  useEffect(()=>{const sync=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[]);
  const toggleFullscreen=async()=>{const nativeApi=(window as any).pywebview?.api;if(nativeApi?.toggle_fullscreen)setFullscreen(await nativeApi.toggle_fullscreen());else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()};
  const toggleAvatar=()=>setAvatarRevealed(current=>!current);
  const toggleHalloween=()=>{
    if(transitionGuard.current)return;
    transitionGuard.current=true;burnAudio.current?.dispose();burnAudio.current=createBurnAudio();setHalloweenTransition(!halloween);setPumpkinPulse(value=>value+1);
  };
  const finishHalloweenTransition=()=>{
    transitionGuard.current=false;burnAudio.current?.dispose();burnAudio.current=null;setHalloweenTransition(null);
    requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.halloween-pumpkin-toggle')?.focus({preventScroll:true}));
  };
  return <main ref={home} data-home-weather={activeWeather??undefined} data-home-weather-test={weatherTest||undefined} className={`welcome-page${halloween?' is-halloween':''}${halloween&&manualPlay?' is-playing-halloween':''}`}>
    {!halloween&&<ProcessingBackground speed={3}/>}
    {activeWeather&&<canvas key={activeWeather} className="home-weather-sky" aria-hidden="true"/>}
    {halloweenTransition!==null&&<HalloweenTransition onStart={()=>burnAudio.current?.play()} onReveal={()=>burnAudio.current?.reveal()} onCovered={()=>{setHalloween(halloweenTransition);setManualPlay(false)}} onComplete={finishHalloweenTransition}/>}
    {halloween&&<Suspense fallback={<span className="halloween-loading" role="status">Waking the pumpkin mage...</span>}><HalloweenGame paused={updateOpen||halloweenTransition!==null} onManualChange={setManualPlay}/></Suspense>}
    <div className="welcome-home-actions"><button type="button" className="halloween-pumpkin-toggle" aria-label={halloween?'Turn off Halloween mode':'Turn on Halloween mode'} aria-pressed={halloween} title={halloween?'Return to the original home screen':'A little Halloween magic'} onClick={toggleHalloween} disabled={halloweenTransition!==null} aria-busy={halloweenTransition!==null}><PumpkinIcon active={halloween}/>{pumpkinPulse>0&&<span key={pumpkinPulse} className="pumpkin-toggle-burst" data-on={halloween} aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{'--spark-x':`${Math.cos(i*Math.PI/6)*38}px`,'--spark-y':`${Math.sin(i*Math.PI/6)*38}px`,'--spark-delay':`${i*.01}s`} as React.CSSProperties}/>)}</span>}</button><div className="welcome-home-controls" inert={homeLocked}><button className={`soft fullscreen-button update-button ${updateInfo?.available?'update-available':''}`} onClick={checkUpdates} title={updateInfo?.available?`Version ${updateInfo.latestVersion} is available`:'Check for updates'} aria-label="Check for updates"><RefreshCw/>{updateInfo?.available&&<b aria-label="New update available">New</b>}{weatherSurface}</button><div className="startup-launch-select" aria-busy={startupSaving}><AppSelect decoration={weatherSurface} label="Open on launch" ariaLabel="Open on launch" icon={Power} value={startupPage} disabled={startupSaving} onChange={value=>void saveStartup(value as StartupPage)} options={Object.entries(STARTUP_PAGE_LABELS) as [string,string][]}/>{startupSaving&&<span role="status" className="sr-only">Saving startup page...</span>}{startupNotice&&<p className="startup-launch-feedback" role="status">{startupNotice}</p>}{startupError&&<p className="startup-launch-feedback is-error" role="alert">{startupError}</p>}</div><AppSelect decoration={weatherSurface} label="Theme" value={theme} onChange={value=>setTheme(value as Theme)} variant="theme" icon={Palette} ariaLabel="Application theme" options={HOME_THEME_OPTIONS}/><button className="soft fullscreen-button" onClick={toggleFullscreen} title={fullscreen?'Exit full screen':'Enter full screen'} aria-label={fullscreen?'Exit full screen':'Enter full screen'}>{fullscreen?<Minimize2/>:<Maximize2/>}{weatherSurface}</button>
      {weatherTest&&<div className="home-weather-test-buttons" role="group" aria-label="Local weather test">
        <button type="button" className="soft home-weather-test-button" aria-pressed={testWeather==='rain'} disabled={halloween||homeLocked||updateOpen} onClick={()=>toggleTestWeather('rain')}><CloudRain aria-hidden="true"/>Rain{weatherSurface}</button>
        <button type="button" className="soft home-weather-test-button" aria-pressed={testWeather==='snow'} disabled={halloween||homeLocked||updateOpen} onClick={()=>toggleTestWeather('snow')}><Snowflake aria-hidden="true"/>Snow{weatherSurface}</button>
      </div>}
    </div></div>
    <section className="welcome-content" inert={homeLocked}>
      <header className="welcome-header welcome-header-compact">
        <div className="welcome-brand-stage">
          <HomeLogo halloween={halloween} frameDecoration={weatherSurface}>{!halloween&&AVATAR_ENABLED&&foxUnlocked&&<GuardianFox mode="home"/>}</HomeLogo>
        </div>
        <span>Iraq Data Analysis</span>
      </header>
      <div ref={glassCards} className={`workspace-cards${showCardGlass?' home-card-glass':''}`}>{workspaces.filter(x=>x.enabled).map((workspace,index)=>{const Icon=workspace.icon;return <a key={workspace.id} href={`#${workspace.route}`} className={`workspace-card workspace-${workspace.accent}`} onPointerEnter={()=>prepareWorkspace(workspace.id)} onFocus={()=>prepareWorkspace(workspace.id)} style={{'--card-index':index} as React.CSSProperties}><span className="workspace-card-glow"/>{weatherSurface}<span className="workspace-icon">{workspace.id==='kobo'?<AnimatedSectionIcon key={koboIconMotion} Icon={ChartColumnIncreasing} iconStyle="chart-column-increasing" size={28}/>:<Icon/>}</span><span className="workspace-badge">{workspace.badge}</span><strong>{workspace.label}</strong><p>{workspace.description}</p><span className="workspace-enter">Enter workspace <ArrowRight/></span></a>})}</div>

      {activeWeather==='snow'&&<HomeSnowman playCue={playSnowmanCue} shuffleSnow={shuffleSnow}/>}
    </section>
    <footer className="welcome-footer" inert={homeLocked}><span>Designed for clear, local and decision-ready legal data review.</span><button type="button" className="designer-unlock" onClick={toggleAvatar} aria-pressed={avatarRevealed} aria-label={`${avatarRevealed?'Hide':'Reveal'} the cartoon boy`}>Designed by <strong>Younis Jamal</strong></button></footer>
    {!halloween&&RIVE_HOME_AVATAR_ENABLED&&avatarRevealed&&<HomeRiveAvatar disabled={false} phase="normal"/>}
    <AppUpdateDialog {...update}/>
  </main>;
}
