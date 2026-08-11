import {useEffect,useState} from 'react';
import Welcome from './Welcome';
import {GUARDIAN_FOX_STORAGE_KEY,GuardianFox} from './GuardianFox';
import {AVATAR_ENABLED} from './features';
import AnalyticsApp from './App';
import LegalPlatform from './LegalPlatform';

type Workspace='welcome'|'analytics'|'legal';
const workspaceFromUrl=():Workspace=>{const hash=window.location.hash;if(!hash||hash==='#'||hash==='#/'||hash==='#')return 'welcome';return hash.startsWith('#/legal')?'legal':'analytics'};

export default function RootApp(){
 const [workspace,setWorkspace]=useState<Workspace>(workspaceFromUrl);
 const [foxUnlocked,setFoxUnlocked]=useState(()=>{try{return localStorage.getItem(GUARDIAN_FOX_STORAGE_KEY)==='true'}catch{return false}});
 useEffect(()=>{const sync=()=>setWorkspace(workspaceFromUrl());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 const unlockFox=()=>{setFoxUnlocked(true);try{localStorage.setItem(GUARDIAN_FOX_STORAGE_KEY,'true')}catch{/* The fox still remains available for this session. */}};
 if(workspace==='welcome')return <Welcome foxUnlocked={foxUnlocked} onFoxUnlock={unlockFox}/>;
 const app=workspace==='legal'?<LegalPlatform onBack={()=>{window.location.hash='/executive'}}/>:<AnalyticsApp/>;
 return <>{app}{AVATAR_ENABLED&&foxUnlocked&&<GuardianFox mode="workspace"/>}</>;
}
