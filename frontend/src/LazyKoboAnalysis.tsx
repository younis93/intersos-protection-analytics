import {deferredComponent} from './DeferredComponent';
import {KoboModuleLoading} from './KoboLoading';
import {useEffect,useState} from 'react';
import {allowKoboDraftNavigation} from './koboDraftNavigation';
import type {AnalysisWorkspace} from './koboApi';
import {koboProjectLists} from './koboProjectListCache';
function KoboAnalysisLoading(){
 return <KoboModuleLoading projectMenu={!window.location.hash.split('/')[2]}/>;
}
const KoboAnalysis=deferredComponent(()=>import('./KoboAnalysis'),<KoboAnalysisLoading/>);
const QuestionFlow=deferredComponent(()=>import('./KoboQuestionFlow'),<KoboModuleLoading/>);
export const preloadAnalysisWorkspace=KoboAnalysis.preload;
export default function KoboWorkspaceRoute({workspace='kobo'}:{workspace?:AnalysisWorkspace}){
 const[hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const sync=(event:HashChangeEvent)=>{if(allowKoboDraftNavigation(event))setHash(window.location.hash)};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 const match=workspace==='kobo'?/^#\/kobo\/([^/]+)\/question-flow$/.exec(hash):null;
 const home=!hash.split('/')[2];
 useEffect(()=>{if(home)void koboProjectLists[workspace].refresh()},[home,workspace]);
 return match?<QuestionFlow key={match[1]} projectId={match[1]}/>:<KoboAnalysis workspace={workspace}/>;
}
