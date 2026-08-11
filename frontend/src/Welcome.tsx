import {useCallback,useEffect,useState} from 'react';
import {ArrowRight,BarChart3,BriefcaseBusiness,Maximize2,Minimize2,Palette,RefreshCw} from 'lucide-react';
import {checkForUpdates,getUpdateStatus,installUpdate} from './api';
import {AppSelect} from './components';
import type {Theme,UpdateCheck,UpdateStatus} from './types';
import {GuardianFox} from './GuardianFox';
import {AVATAR_ENABLED,RIVE_HOME_AVATAR_ENABLED} from './features';
import {ScreenFracture,useFractureSequence} from './ScreenFracture';
import {HomeRiveAvatar} from './HomeRiveAvatar';

const UPDATE_CHECK_INTERVAL_MS=6*60*60*1000;

export interface WorkspaceDefinition {id:string;label:string;description:string;route:string;icon:any;accent:string;badge?:string;enabled:boolean}
export const workspaces:WorkspaceDefinition[]=[
  {id:'analytics',label:'Protection Analytics',description:'Explore programme reach, legal-service delivery, protection trends and reporting quality.',route:'/executive',icon:BarChart3,accent:'blue',badge:'Analytics & reporting',enabled:true},
  {id:'legal',label:'Legal Platform',description:'Review legal-platform data, investigate findings, explore beneficiary cases and analyze lawyer activity.',route:'/legal/overview',icon:BriefcaseBusiness,accent:'violet',badge:'Review & case analysis',enabled:true},
];

export default function Welcome({foxUnlocked}:{foxUnlocked:boolean;onFoxUnlock:()=>void}){
  const [theme,setTheme]=useState<Theme>(()=>(localStorage.getItem('app-theme') as Theme)||'glass-light');
  const [fullscreen,setFullscreen]=useState(false);
  const [avatarRevealed,setAvatarRevealed]=useState(false);
  const [updateInfo,setUpdateInfo]=useState<UpdateCheck|null>(null);
  const [updateStatus,setUpdateStatus]=useState<UpdateStatus|null>(null);
  const [updateOpen,setUpdateOpen]=useState(false);
  const {phase,pressLogo,pressShattered,setPhase,finishRestore}=useFractureSequence();
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('app-theme',theme);localStorage.setItem('legal-platform-theme',theme);(window as any).pywebview?.api?.set_title_bar_theme?.(theme)},[theme]);
  useEffect(()=>{const sync=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[]);
  const toggleFullscreen=async()=>{const nativeApi=(window as any).pywebview?.api;if(nativeApi?.toggle_fullscreen)setFullscreen(await nativeApi.toggle_fullscreen());else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()};
  useEffect(()=>{let active=true;const refresh=(openWhenAvailable:boolean)=>checkForUpdates().then(info=>{if(!active)return;setUpdateInfo(info);if(openWhenAvailable&&info.available)setUpdateOpen(true)}).catch(()=>{});refresh(true);const timer=window.setInterval(()=>refresh(false),UPDATE_CHECK_INTERVAL_MS);return()=>{active=false;window.clearInterval(timer)}},[]);
  useEffect(()=>{if(!updateStatus||!["downloading","verifying","installing","restarting"].includes(updateStatus.phase))return;const timer=window.setInterval(()=>getUpdateStatus().then(setUpdateStatus).catch(()=>{}),700);return()=>window.clearInterval(timer)},[updateStatus?.phase]);
  const checkUpdates=()=>checkForUpdates().then(info=>{setUpdateInfo(info);setUpdateOpen(true)}).catch(()=>setUpdateOpen(true));
  const beginUpdate=()=>installUpdate().then(setUpdateStatus).catch((error:Error)=>setUpdateStatus({phase:'error',progress:0,error:error.message,currentVersion:updateInfo?.currentVersion||'1.0.0'}));
  const toggleAvatar=()=>setAvatarRevealed(revealed=>!revealed);
  const markShattered=useCallback(()=>setPhase('shattered'),[setPhase]);
  const markRestored=useCallback(()=>finishRestore(),[finishRestore]);
  return <main className={`welcome-page fracture-page-${phase}`}>
    <div className="welcome-home-actions"><button className={`soft fullscreen-button update-button ${updateInfo?.available?'update-available':''}`} onClick={checkUpdates} title={updateInfo?.available?`Version ${updateInfo.latestVersion} is available`:'Check for updates'} aria-label="Check for updates"><RefreshCw/>{updateInfo?.available&&<b aria-label="New update available">New</b>}</button><AppSelect label="Theme" value={theme} onChange={value=>setTheme(value as Theme)} variant="theme" icon={Palette} ariaLabel="Application theme" options={[["glass-light","Liquid Glass Light"],["glass-dark","Liquid Glass Dark"],["unhcr","INTERSOS"],["multicolor","Chromatic Executive"],["executive","Executive Minimal"]]}/><button className="soft fullscreen-button" onClick={toggleFullscreen} title={fullscreen?'Exit full screen':'Enter full screen'} aria-label={fullscreen?'Exit full screen':'Enter full screen'}>{fullscreen?<Minimize2/>:<Maximize2/>}</button></div>
    <div className="welcome-aurora welcome-aurora-one"/><div className="welcome-aurora welcome-aurora-two"/><div className="welcome-orb welcome-orb-one"/><div className="welcome-orb welcome-orb-two"/><div className="welcome-grid"/>
    <section className="welcome-content">
      <header className="welcome-header welcome-header-compact">
        <div className="welcome-brand-stage">
          <button type="button" className="welcome-logo-secret" onClick={pressLogo} aria-label="INTERSOS home logo"><span className="welcome-logo-mark"><img src="/intersos-symbol-transparent.png" alt=""/></span><span className="welcome-logo-word" aria-hidden="true">{'INTERSOS'.split('').map((letter,index)=><b key={`${letter}-${index}`} style={{'--letter':index} as React.CSSProperties}>{letter}</b>)}</span><span className="sr-only">INTERSOS</span>{AVATAR_ENABLED&&foxUnlocked&&<GuardianFox mode="home"/>}</button>
        </div>
        <span>Protection Analysis Platform</span>
      </header>
      <div className="workspace-cards">{workspaces.filter(x=>x.enabled).map((workspace,index)=>{const Icon=workspace.icon;return <a key={workspace.id} href={`#${workspace.route}`} className={`workspace-card workspace-${workspace.accent}`} style={{'--card-index':index} as React.CSSProperties}><span className="workspace-card-glow"/><span className="workspace-icon"><Icon/></span><span className="workspace-badge">{workspace.badge}</span><strong>{workspace.label}</strong><p>{workspace.description}</p><span className="workspace-enter">Enter workspace <ArrowRight/></span></a>})}</div>
      <footer><span>Designed for clear, local and decision-ready protection analysis.</span><button type="button" className="designer-unlock" onClick={toggleAvatar} aria-pressed={avatarRevealed} aria-label={`${avatarRevealed?'Hide':'Show'} the guardian pet`}>Designed by <strong>Younis Jamal</strong></button></footer>
    </section>
    {RIVE_HOME_AVATAR_ENABLED&&avatarRevealed&&<HomeRiveAvatar disabled={phase!=='normal'} phase={phase}/>} 
    <ScreenFracture phase={phase} onShattered={markShattered} onRestorePress={pressShattered} onRestored={markRestored}/>
    {updateOpen&&<div className="modal-backdrop"><section className="update-modal glass" role="dialog" aria-modal="true" aria-label="Application update"><div className="update-icon"><RefreshCw/></div><span className="eyebrow">APPLICATION UPDATE</span><h2>{updateInfo?.available?`Version ${updateInfo.latestVersion} is available`:updateInfo?.enabled===false?'Updates need configuration':updateInfo?.message?.startsWith('Unable')?'Unable to check for updates':'You’re up to date'}</h2><p>{updateInfo?.available?(updateInfo.notes||'A new signed version of Protection Analytics is ready to install.'):(updateInfo?.message||`You are using version ${updateInfo?.currentVersion||'1.0.0'}.`)}</p>{updateStatus&&updateStatus.phase!=='idle'&&<div className="update-progress"><div><span>{updateStatus.phase}</span><strong>{updateStatus.progress}%</strong></div><i><b style={{width:`${updateStatus.progress}%`}}/></i>{updateStatus.error&&<em>{updateStatus.error}</em>}</div>}<div className="update-actions">{updateInfo?.available&&(!updateStatus||['idle','error'].includes(updateStatus.phase))&&<button className="primary" onClick={beginUpdate}>Update now</button>}<button className="soft" onClick={()=>setUpdateOpen(false)} disabled={Boolean(updateStatus&&['installing','restarting'].includes(updateStatus.phase))}>{updateInfo?.available?'Later':'Close'}</button></div></section></div>}
  </main>;
}
