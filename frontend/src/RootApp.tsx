import {useEffect,useState} from 'react';
import Welcome from './Welcome';
import {GUARDIAN_FOX_STORAGE_KEY} from './GuardianFox';
import LegalPlatform from './LegalPlatform';

type Workspace='welcome'|'legal';
const workspaceFromUrl=():Workspace=>{const hash=window.location.hash;if(!hash||hash==='#'||hash==='#/')return 'welcome';if(!hash.startsWith('#/legal'))window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#/legal/overview`);return 'legal'};

export default function RootApp(){
 const [workspace,setWorkspace]=useState<Workspace>(workspaceFromUrl);
 const [foxUnlocked,setFoxUnlocked]=useState(()=>{try{return localStorage.getItem(GUARDIAN_FOX_STORAGE_KEY)==='true'}catch{return false}});
 useEffect(()=>{const sync=()=>setWorkspace(workspaceFromUrl());window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 const unlockFox=()=>{setFoxUnlocked(true);try{localStorage.setItem(GUARDIAN_FOX_STORAGE_KEY,'true')}catch{/* The fox remains available for this session. */}};
 if(workspace==='welcome')return <Welcome foxUnlocked={foxUnlocked} onFoxUnlock={unlockFox}/>;
 return <LegalPlatform/>;
}
