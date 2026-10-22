import {koboWorkspaceSections,type KoboWorkspaceSection} from './KoboWorkspaceNavigation';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,ChevronDown,Database,FolderOpen,Home,Maximize2,Minimize2} from 'lucide-react';
import {KoboGroupNavigationHost} from './KoboGroupNavigation';
import './workspace.css';
import './koboWorkspace.css';
import './koboIconMotion.css';

type Props={
 projectId:string;
 activeWorkspace:KoboWorkspaceSection;
 onWorkspaceChange:(workspace:KoboWorkspaceSection)=>void;
 language:'en'|'ar';
 onNavigate:(route:string)=>void;
 onImport:()=>void;
 children:ReactNode;
 dialogs:ReactNode;
};

/** Uses the same workspace chrome, navigation and layout classes as Legal Platform. */
export default function KoboWorkspaceShell({projectId,activeWorkspace,onWorkspaceChange,language,onNavigate,onImport,children,dialogs}:Props){
 const[collapsed,setCollapsed]=useState(()=>localStorage.getItem('kobo-sidebar-collapsed')==='true');
 const[groupHost,setGroupHost]=useState<HTMLDivElement|null>(null);
 const[fullscreen,setFullscreen]=useState(Boolean(document.fullscreenElement));
 useEffect(()=>{const sync=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync)},[]);
 const toggleFullscreen=async()=>{
  const native=(window as any).pywebview?.api;
  if(native?.toggle_fullscreen)setFullscreen(await native.toggle_fullscreen());
  else if(document.fullscreenElement)await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
 };
 return <KoboGroupNavigationHost.Provider value={groupHost}><div className={`app-shell legal-shell kobo-shell ${collapsed?'sidebar-collapsed':''}`} dir="ltr">
  <aside className="sidebar glass" dir="ltr" aria-label="Kobo workspace">
   <div className="brand"><img src="/intersos-symbol-clear.png" alt="INTERSOS"/><div><strong>Kobo Analysis</strong><small>Survey analysis & reports</small></div></div>
   <div className="sidebar-workspace-controls">
    <button className="soft sidebar-fullscreen" onClick={()=>void toggleFullscreen()} title={fullscreen?'Exit full screen':'Enter full screen'} aria-label={fullscreen?'Exit full screen':'Enter full screen'}>{fullscreen?<Minimize2/>:<Maximize2/>}<span>Full screen</span></button>
    <div className="data-source-control app-select app-select-theme"><Database className="app-select-icon"/><span className="app-select-label">Data source</span><button className="app-select-trigger" aria-label="Import Kobo files" onClick={onImport}><span>Choose source</span><ChevronDown/></button></div>
   </div>
   <div className="legal-sidebar-utilities"><button aria-label="Home" title="Home" onClick={()=>onNavigate('#/')}><Home/><span>Home</span></button><button className="legal-menu-slide-toggle" aria-label={collapsed?'Expand menu':'Slide menu left'} aria-expanded={!collapsed} title={collapsed?'Expand menu':'Slide menu left'} onClick={()=>setCollapsed(previous=>{localStorage.setItem('kobo-sidebar-collapsed',String(!previous));return !previous})}><ArrowLeft/><span>{collapsed?'Expand':'Slide left'}</span></button></div>
   <nav aria-label="Kobo navigation">
    <button className={!projectId?'active':''} aria-current={!projectId?'page':undefined} onClick={()=>onNavigate('#/kobo')} title="Projects"><FolderOpen aria-hidden="true"/><span>Projects</span></button>
    {projectId&&koboWorkspaceSections.map(({id,label,Icon})=><button key={id} type="button" className={`kobo-project-section${activeWorkspace===id?' active':''}`} aria-current={activeWorkspace===id?'page':undefined} onClick={()=>onWorkspaceChange(id)} title={label}><Icon aria-hidden="true"/><span>{label}</span></button>)}
    <button className="kobo-mobile-home" aria-label="Home" onClick={()=>onNavigate('#/')} title="Home"><Home/><span>Home</span></button>
   </nav>
   <div className="kobo-group-navigation-host" hidden={!projectId||activeWorkspace!=='analysis'} ref={setGroupHost}/>
  </aside>
  <main>
   <header className="topbar"><div className="mobile-brand">Kobo Analysis</div><div className="header-actions"><div id="legal-header-scroll-controls" className="legal-header-scroll-slot"/></div></header>
   <section className="content legal-content kobo-content">{children}</section>
  </main>
  {dialogs}
 </div></KoboGroupNavigationHost.Provider>;
}
