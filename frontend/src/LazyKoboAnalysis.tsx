import {deferredComponent} from './DeferredComponent';
import {KoboModuleLoading} from './KoboLoading';
import {useEffect,useState} from 'react';
import {allowKoboDraftNavigation} from './koboDraftNavigation';
import type {AnalysisWorkspace} from './koboApi';
const KoboAnalysis=deferredComponent(()=>import('./KoboAnalysis'),<KoboModuleLoading/>);
const QuestionFlow=deferredComponent(()=>import('./KoboQuestionFlow'),<KoboModuleLoading/>);
export default function KoboWorkspaceRoute({workspace='kobo'}:{workspace?:AnalysisWorkspace}){
 const[hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const sync=(event:HashChangeEvent)=>{if(allowKoboDraftNavigation(event))setHash(window.location.hash)};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync)},[]);
 const match=workspace==='kobo'?/^#\/kobo\/([^/]+)\/question-flow$/.exec(hash):null;
 return match?<QuestionFlow key={match[1]} projectId={match[1]}/>:<KoboAnalysis workspace={workspace}/>;
}
