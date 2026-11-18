import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown,Copy,Cpu,Download,FileText,FolderOpen,HelpCircle,Layers,LoaderCircle,Maximize2,MessageSquare,Minimize2,Send,Settings,ShieldCheck,Sparkles,Square,Trash2,X} from 'lucide-react';
import {createKoboApi,downloadBlob} from './koboApi';
import {koboLabel,type AssistantAnalysisRecipe,type KoboAnalysis,type KoboFilter,type KoboProject,type KoboReport,type ReportAnalysis} from './koboTypes';
import type {KoboIndicatorDefinition} from './koboIndicatorTypes';
import {checkReportClaims,draftChatIndicator,proposeChatFilters,similarAnswerFields,type FilterProposal} from './assistantProjectReview';
import AssistantCrossCheck from './AssistantCrossCheck';
import {surveyInterpretationCatalog} from './assistantDictionary';
import {duplicateQuestions,isProjectTotal,looksLikeProjectRequest,projectTotalAnswer,validatedInterpretation} from './assistantUnderstanding';
import {assistantFields,assistantRequest,assistantStream,comparePeriods,fieldEvidence,projectAssistant,qualityFindings,
 type AssistantStatus,type Periods,type ProjectAssistant,type QualityFinding,type Turn} from './localAssistantApi';
import {cancelPausedModel,clearModelInstallStatus,dismissModelInstallMessage,installAssistantModel,modelInstallBusy,modelInstallState,stopAssistantModelInstall,subscribeModelInstall} from './assistantModelInstall';
import AssistantOrb from './AssistantOrb';
import KoboConfirmDialog from './KoboConfirmDialog';
import {writeKoboClipboard} from './koboClipboard';
import AssistantResultCard from './AssistantResultCard';
import {analysisSourceNote,answerFromPivot,chatAnalysisEvidence,loadChatAnalysis,resolveChatAnalysis,runAnalysisRecipe,type AnalysisChoice,type ChatAnalysisCard,type ChatAnalysisRequest,type ChatAnalysisTurn,type ChatContext} from './assistantAnalysis';
import './localAssistant.css';

const defaultOutline='Key findings\nData quality and limitations\nLessons learned\nRecommendations';
const modelGuide:Record<string,string>={
 'qwen3:1.7b':'quick questions and short summaries, such as explaining a field or summarizing a single table.',
 'qwen3:4b-instruct':'everyday data review and English report drafts.',
 'qwen3:8b':'detailed drafts that combine findings from several tables.',
};
const dateFields=[['firstFrom','First period starts'],['firstTo','First period ends'],['secondFrom','Second period starts'],['secondTo','Second period ends']] as const;
type ReportSection='findings'|'methodology'|'recommendations';
type ChatSetup=Pick<AssistantStatus,'enabled'|'model'|'installed'|'smallGroupMin'>;
type Props={project:KoboProject;analysis:KoboAnalysis;analysisBusy:boolean;onInsert:(text:string,section:ReportSection)=>void;
 onReview:(finding:QualityFinding)=>void;onEvidence:(field:string)=>void;onOpenAnalysis:(field:string,mode?:'merge')=>void;
 onReportResult:(attachment:ReportAnalysis)=>boolean;onSource:(field:string)=>void;report?:KoboReport;
 onIndicator:(draft:KoboIndicatorDefinition)=>void;onOpenReview:()=>void;onMappings:()=>void};

export default function LocalAssistant({project,analysis,analysisBusy,onInsert,onReview,onEvidence,onOpenAnalysis,onReportResult,onSource,report,onIndicator,onOpenReview,onMappings}:Props){
 const [open,setOpen]=useState(false),[status,setStatus]=useState<AssistantStatus|null>(null);
 const [chatSetup,setChatSetup]=useState<ChatSetup|null>(null);
 const [setup,setSetup]=useState(true),[toolsOpen,setToolsOpen]=useState(false),[removal,setRemoval]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [folderEntry,setFolderEntry]=useState<string|null>(null);
 const [question,setQuestion]=useState(''),[turns,setTurns]=useState<(Turn & ChatAnalysisTurn)[]>([]),[partial,setPartial]=useState('');
 const [pendingQuestion,setPendingQuestion]=useState('');
 const [pendingId,setPendingId]=useState('');
 const [pendingResults,setPendingResults]=useState<ChatAnalysisCard[]>([]);
 const [copiedReply,setCopiedReply]=useState<number|null>(null);
 const recentContext=useRef<ChatContext>({fields:[]});
 const [chatFilters,setChatFilters]=useState<FilterProposal>();
 const [crossCheck,setCrossCheck]=useState<{prompt:string;analysis:KoboAnalysis}>();
 const [cleanupOpen,setCleanupOpen]=useState(false);
 const [reportDraft,setReportDraft]=useState('');
 const [reportChecks,setReportChecks]=useState<ReturnType<typeof checkReportClaims>>();
 const [unmatchedFigures,setUnmatchedFigures]=useState<string[]>([]);
 const [error,setError]=useState(''),[activity,setActivity]=useState(''),[notice,setNotice]=useState('');
 const modelJob=useSyncExternalStore(subscribeModelInstall,modelInstallState);
 const installingModel=modelInstallBusy(modelJob);
 const [selected,setSelected]=useState<string[]>([]),[quality,setQuality]=useState<QualityFinding[]>([]);
 const [saved,setSaved]=useState<ProjectAssistant>({}),[outline,setOutline]=useState(defaultOutline);
 const [section,setSection]=useState<ReportSection>('findings');
 const [periods,setPeriods]=useState<Periods>({field:'',firstFrom:'',firstTo:'',secondFrom:'',secondTo:''});
 const [wordFile,setWordFile]=useState<File|null>(null),[sections,setSections]=useState<Record<string,string>>({});
 const dialog=useRef<HTMLDialogElement>(null);
 const launcher=useRef<HTMLButtonElement>(null);
 const thread=useRef<HTMLDivElement>(null);
 const followThread=useRef(true);
 const settingsLauncher=useRef<HTMLButtonElement>(null);
 const openerRef=useRef<HTMLButtonElement|null>(null);
 const active=useRef<{id:string;controller:AbortController}|null>(null);
 const available=assistantFields(project,analysis);
 const selection=available.filter(field=>selected.includes(field.id));
 const currentAnswer=turns.at(-1)?.answer||'';
 const loadedOutline=useRef(false);
 const setupRead=useRef(0);
 const ready=Boolean(chatSetup?.enabled&&chatSetup.installed&&chatSetup.model);
 const busy=Boolean(activity);

 useEffect(()=>{
  const node=thread.current;
  if(open&&!toolsOpen&&node&&followThread.current)node.scrollTop=node.scrollHeight;
 },[open,toolsOpen,expanded,turns,partial,pendingQuestion,pendingResults]);

 function stop(){
  if(!active.current)return;
  const {id,controller}=active.current;
  void assistantRequest('/stop',{operation:id}).catch(()=>{});
  controller.abort();
 }

 useEffect(()=>()=>stop(),[]);
 useEffect(()=>{
  if(!open)return;
  const opener=openerRef.current;
  const node=dialog.current;
  if(setup)node?.showModal();
  else node?.show();
  node?.querySelector<HTMLElement>('#local-ai-title')?.focus({preventScroll:true});
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog:modal')){
    event.preventDefault();
    close();
   }
  };
  document.addEventListener('keydown',escape);
  return ()=>{
   document.removeEventListener('keydown',escape);
   node?.close();
   if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});
  };
 },[open,setup]);
 useEffect(()=>{setQuality([]);},[analysis,selected]);
 useEffect(()=>{
  if(!open||!status?.installing)return;
  const controller=new AbortController();
  let checking=false;
  const timer=window.setInterval(async()=>{
   if(checking||active.current||installingModel)return;
   checking=true;
   try{await refresh(controller.signal);}
   catch{ /* The next check retries a temporary connection failure. */ }
   finally{checking=false;}
  },2500);
  return ()=>{window.clearInterval(timer);controller.abort();};
 },[open,status?.installing,installingModel]);

 const applyStatus=(next:AssistantStatus)=>{
  setupRead.current++;
  setStatus(next);
  setChatSetup({
   enabled:next.enabled,installed:next.installed,smallGroupMin:next.smallGroupMin,
   model:next.connected&&!next.models.some(item=>item.name===next.model)?'':next.model,
  });
 };

 const refresh=async(signal?:AbortSignal)=>{
  const response=await assistantRequest('/status',undefined,'GET',signal);
  const next:AssistantStatus=await response.json();
  applyStatus(next);
  return next;
 };

 const loadChatSetup=async(signal?:AbortSignal)=>{
  const request=++setupRead.current;
  const response=await assistantRequest('/selection',undefined,'GET',signal);
  const next:ChatSetup=await response.json();
  if(request===setupRead.current&&!signal?.aborted)setChatSetup(next);
 };

 useEffect(()=>{
  const controller=new AbortController();
  void loadChatSetup(controller.signal).catch(()=>{});
  return()=>controller.abort();
 },[project.id]);

 useEffect(()=>{
  if(!open||!toolsOpen)return;
  const controller=new AbortController();
  void projectAssistant(project.id,undefined,controller.signal).then(projectState=>{
   if(controller.signal.aborted)return;
   setSaved(projectState);
   if(!loadedOutline.current){setOutline(projectState.outline||defaultOutline);loadedOutline.current=true;}
  }).catch(issue=>{if(!controller.signal.aborted)setError(issue.message);});
  return()=>controller.abort();
 },[open,toolsOpen,project.id,project.updated]);

 useEffect(()=>{
  if(open&&setup&&modelJob.phase==='complete')void refresh().catch(()=>{});
 },[open,setup,modelJob.phase]);

 async function run(label:string,action:(signal:AbortSignal,operation:string)=>Promise<void>){
  if(active.current)return;
  const controller=new AbortController(),id=crypto.randomUUID();
  active.current={id,controller};
  setActivity(label);setError('');setNotice('');
  try{await action(controller.signal,id);}
  catch(issue){
   if(controller.signal.aborted)setNotice('Stopped.');
   else setError(issue instanceof Error?issue.message:String(issue));
  }finally{
   active.current=null;
   setActivity('');
  }
 }

 const recommended=(value:AssistantStatus)=>value.ramGb!==null&&value.ramGb<16?'qwen3:1.7b':'qwen3:4b-instruct';
 function show(view:'chat'|'settings'){
  if(active.current)return;
  openerRef.current=view==='settings'?settingsLauncher.current:launcher.current;
  setToolsOpen(false);
  setSetup(view==='settings');
  setOpen(true);
  if(view==='settings'||!chatSetup){
   void run('Checking assistant setup…',async signal=>{
    if(view==='settings')await refresh(signal);
    else await loadChatSetup(signal);
   });
  }else{
   setError('');
   void loadChatSetup().catch(()=>{});
  }
 }

 function toggle(enabled:boolean){
  if(!status)return;
  void run(enabled?'Preparing setup…':'Turning off assistant…',async signal=>{
   await assistantRequest('/settings',{enabled,model:status.model||'',smallGroupMin:status.smallGroupMin||5},'PUT',signal);
   applyStatus({...status,enabled});
   setSetup(true);
   if(!enabled){recentContext.current={fields:[]};setChatFilters(undefined);setTurns([]);setPartial('');setQuestion('');}
   await refresh(signal);
  });
 }

 async function generate(prompt:string,mode:'chat'|'quality'|'compare'|'draft'|'check'='chat',placeholder?:string,choice:AnalysisChoice={},confirmed?:FilterProposal){
  if(installingModel){setError('Pause the model download or wait for it to finish before generating a response.');return;}
  if(active.current)return;
  if(mode==='chat'&&!choice.field&&(/\bif\s+q(?:uestion\s*)?\d+.+\bq(?:uestion\s*)?\d+\s+(?:should|must)\b/i.test(prompt)
   ||/\b(?:cross[- ]check|across questions|contradict\w*|inconsistent answers|answers? (?:do(?:es)? not|don’t|don't) match)\b/i.test(prompt))){
   setQuestion('');openCrossCheck(prompt);return;
  }
  if(mode==='chat'&&!choice.field&&/\b(?:review (?:the )?answers?|clean(?:ing)? (?:the )?(?:answers?|data)|merg(?:e|ing) (?:the )?(?:answers?|questions?)|duplicate (?:answers?|questions?))\b/i.test(prompt)){
   if(analysisBusy){setError('Wait for the current analysis to finish.');return;}
   setQuestion('');setToolsOpen(true);setCleanupOpen(true);queueReview();return;
  }
  if(mode==='chat'&&!confirmed&&!choice.field&&!choice.breakdown&&(
   /\bindicator\b/i.test(prompt)&&/\b(build|draft|create|make|define)\b/i.test(prompt)||/\b(?:share|percentage) of eligible\b/i.test(prompt))){
   const proposal=draftChatIndicator(project,analysis,prompt);
   followThread.current=true;setQuestion('');setError('');
   setTurns(turns=>[...turns,{question:prompt,answer:proposal.note,indicatorDraft:proposal.draft}].slice(-12));
   return;
  }
  const proposal=mode==='chat'&&!confirmed&&!choice.field&&!choice.breakdown?proposeChatFilters(project,analysis,prompt,chatSetup?.smallGroupMin):undefined;
  if(proposal){
   followThread.current=true;setQuestion('');setError('');
   const answer='message' in proposal?proposal.message:`Apply this filter in chat? ${proposal.summary}. Existing filters on other fields stay in effect.`;
   setTurns(turns=>[...turns,{question:prompt,answer,filterProposal:'filters' in proposal?proposal:undefined}].slice(-12));
   return;
  }
  const scope=mode==='chat'?(confirmed||chatFilters):undefined;
  const selectedIds=selection.map(field=>field.id);
  const projectTotal=mode==='chat'&&!choice.field&&isProjectTotal(prompt);
  let request=mode==='chat'&&!projectTotal?resolveChatAnalysis(project,analysis,prompt,recentContext.current,selectedIds,choice):undefined;
  let ids=request?.fields||selectedIds;
  const interpret=mode==='chat'&&!projectTotal&&!ids.length&&looksLikeProjectRequest(prompt)&&
   (!request?.message||request.message.startsWith('Which survey field'));

  if(analysisBusy&&(projectTotal||ids.length||interpret||mode!=='chat')){setError('Wait for the current analysis to finish.');return;}
  if(!selection.length&&mode!=='chat'&&mode!=='quality'){setError('Choose the fields you want to include.');return;}
  if(request?.clarification||request?.message&&!interpret){
   followThread.current=true;
   setQuestion('');
   setError('');
   const clarification=request;
   setTurns(previous=>[...previous,{question:prompt,answer:clarification.message||'Which field did you mean?',request:clarification,choice,filterProposal:confirmed}].slice(-12));
   return;
  }
  let responseComplete=false;
  await run('Preparing response…',async(signal,operation)=>{
   if(!placeholder&&mode!=='quality')setToolsOpen(false);
   followThread.current=true;
   setCopiedReply(null);
   setPendingQuestion(prompt);
   setPendingId(operation);
   if(mode==='chat')setQuestion('');
   const minimum=chatSetup?.smallGroupMin||5;
   if(interpret&&chatSetup?.model){
    const fields=surveyInterpretationCatalog(available,analysis,prompt,recentContext.current.fields,!!project.customConfig);
    const catalog=fields.map(field=>({...field,answers:field.answers.map(answer=>({...answer,label:answer.label.slice(0,80)}))}));
    while(JSON.stringify(catalog).length>12000)catalog.pop();
    let interpretation='';
    try{
     if(catalog.length)await assistantStream('/chat',{model:chatSetup.model,question:prompt,evidence:JSON.stringify(catalog),operation,interpret:true},
      signal,item=>{interpretation+=item.message?.content||'';});
    }catch{signal.throwIfAborted();}
    request=validatedInterpretation(interpretation,new Set(catalog.map(field=>field.id)),{
     breakdowns:new Set(catalog.filter(field=>field.breakdown).map(field=>field.id)),
     answers:new Map(fields.slice(0,catalog.length).map(field=>[field.id,new Map(field.answers.map(answer=>[answer.code,answer.label]))])),
    });
    ids=request?.fields||[];
   }
   let sourceAnalysis=analysis;
   if(scope&&(projectTotal||request?.fields.length)){
    const eligible=new Set(available.filter(field=>field.kind==='category'&&!field.repeat).map(field=>field.id));
    if(scope.filters.some(filter=>!eligible.has(filter.field)))throw new Error('A chat filter is no longer available. Clear it and try again.');
    const fields=new Set(scope.filters.map(filter=>filter.field));
    const overlay=(filters:KoboFilter[])=>[...filters.filter(filter=>!fields.has(filter.field)),...scope.filters];
    const questions={...analysis.settings.questions};
    for(const id of request?.fields||[]){
     const cfg=questions[id];
     if(cfg?.filterMode==='own'||cfg?.filterMode==='additional')questions[id]={...cfg,
      ownFilters:cfg.filterMode==='own'?overlay(cfg.ownFilters||[]):(cfg.ownFilters||[]).filter(filter=>!fields.has(filter.field))};
    }
    sourceAnalysis=await createKoboApi().analyze(project.id,{...analysis.settings,questions,filters:overlay(analysis.settings.filters)},signal);
   }
   const summarize=(source:KoboAnalysis)=>({
    selection:source.filtered>=minimum?source.filtered:undefined,
    filters:source.settings.filters.filter(filter=>filter.values.length||filter.minimum!=null||filter.maximum!=null||filter.months?.length).map(filter=>{
     const field=available.find(item=>item.id===filter.field);
     return field?koboLabel(field,'en'):'Restricted field';
    }),
    fields:fieldEvidence(project,source,ids,minimum),
   });
   const current=summarize(sourceAnalysis);
   let evidence:unknown=mode==='chat'&&!ids.length?{}:current;
   setUnmatchedFigures([]);
   if(mode==='check'){
    const availablePercentages=current.fields.flatMap(field=>('rows' in field?field.rows:undefined)||[])
     .flatMap(row=>row.percent===null?[]:[row.percent]);
    const draftPercentages=[...question.matchAll(/\b\d+(?:\.\d+)?\s*%/g)].map(match=>match[0]);
    const unmatched=draftPercentages.filter(value=>{
     const decimals=String(value.match(/\.(\d+)/)?.[1]||'').length;
     return !availablePercentages.some(percent=>Math.abs(percent-Number.parseFloat(value))<=0.5*10**-decimals+1e-8);
    });
    setUnmatchedFigures([...new Set(unmatched)]);
   }
   if(mode==='quality'){
    const findings=(await qualityFindings(project.id,analysis,signal)).filter(item=>ids.length?ids.includes(item.question):
     !item.question||available.some(field=>field.id===item.question));
    setQuality(findings);
    evidence={analysis:evidence,quality:findings.filter(item=>item.count>=minimum&&analysis.filtered-item.count>=minimum)
     .map(item=>({field:item.question,check:item.title,affected:item.count})),smallFindingsOmitted:findings.some(item=>item.count<minimum)};
   }
   let results:ChatAnalysisCard[]=[];
   let periodAnswer='';
   if(mode==='compare'){
    const [first,second]=await comparePeriods(project.id,analysis,periods,signal);
    const api=createKoboApi();
    const comparison={fields:ids,intent:'distribution' as const};
    const snapshots=await Promise.all([first,second].map(snapshot=>loadChatAnalysis(project,snapshot,comparison,minimum,
     (settings,id,abort)=>api.previewQuestion(project.id,settings,id,abort),signal)));
    results=snapshots.flatMap((cards,index)=>cards.map(card=>({...card,period:index===0?'First period':'Second period'})));
    const overlap=periods.firstFrom<=periods.secondTo&&periods.secondFrom<=periods.firstTo;
    const changed=saved.fieldHistory?.some(entry=>entry.changes.some(change=>ids.includes(change.question)));
    const checks=[overlap?'The date ranges overlap, so some records may appear in both periods.':'The date ranges do not overlap.',
     'Both periods use the same non-date page filters and the current form definition.',
     changed?'The project records changes to a selected field. Review Field changes before treating the periods as comparable.':'',
     'Check the answered and missing counts for each period before comparing percentages.'];
    periodAnswer=[...checks.filter(Boolean),...snapshots.map((cards,index)=>`${index===0?'First':'Second'} period: ${answerFromPivot(comparison,cards)}`)].join('\n\n');
   }
   let overallAnswer='';
   if(request?.fields.length){
    const api=createKoboApi();
    const preview=(settings:KoboAnalysis['settings'],id:string,abort:AbortSignal)=>api.previewQuestion(project.id,settings,id,abort);
    results=await loadChatAnalysis(project,sourceAnalysis,request,minimum,preview,signal);
    const blocked=results.filter(card=>card.privacyWithheld&&card.grouped);
    if(blocked.length){
     const overall:ChatAnalysisRequest={...request,fields:blocked.map(card=>card.field),breakdown:undefined,breakdowns:[],intent:'distribution'};
     const safe=(await loadChatAnalysis(project,sourceAnalysis,overall,minimum,preview,signal)).filter(card=>card.result);
     if(safe.length){
      const detail=answerFromPivot(overall,safe);
      overallAnswer=`The requested breakdown is withheld for privacy. Here is the overall result for the same filters.\n\n${detail}`;
      results=[...results,...safe.map(card=>({...card,period:'Overall result'}))];
     }
    }
    if(request.intent==='compare'&&request.breakdown||/\b(chart|graph|plot|visuali[sz]e)\b/i.test(prompt))results=results.map(card=>({...card,showChart:true}));
    setPendingResults(results);
    evidence={results:chatAnalysisEvidence(results)};
   }
   let context=JSON.stringify(evidence);
   if(context.length>20000){
    if(!results.length)throw new Error('Choose fewer fields so the evidence fits in one request.');
    context=JSON.stringify({results:results.map(card=>({field:card.field,label:card.title.slice(0,300),
     answered:card.result?.denominator,availability:card.message})),note:'The full computed tables are shown in the app. Give a short summary using only these totals.'});
   }
   const history=mode==='chat'?turns.slice(-2).flatMap(turn=>[
    {role:'user',content:turn.question.slice(0,250)},
    {role:'assistant',content:turn.answer.slice(0,450)},
   ]):[];
   let answer=overallAnswer||periodAnswer||(projectTotal?projectTotalAnswer(sourceAnalysis,minimum):request?answerFromPivot(request,results)||'':'');
   if(request?.refreshVisibility&&answer&&!overallAnswer&&results.some(card=>card.result))
    answer=`I refreshed the chat pivot. For rows hidden in the project, use the source pivot in Analysis.\n\n${answer}`;
   if(!answer&&interpret&&!ids.length)answer='Which survey field should I use? Give its label or question number. For a project count, try “total submissions.”';
   if(!answer&&results.length&&results.every(card=>!card.result))answer=answerFromPivot({fields:ids,intent:'distribution'},results)||'';
   if(!answer)setActivity('Writing on this computer…');
   setPartial('');
   try{
    if(!answer)await assistantStream('/chat',{model:chatSetup?.model,question:prompt,evidence:context,history,operation},signal,item=>{
     answer+=(item.message?.content||'').replaceAll(String.fromCharCode(8212),'-');
     setPartial(answer);
    });
    if(!answer.trim())throw new Error('The model returned an empty answer. Try again or select another model.');
   }catch(issue){
    if(!results.length)throw issue;
    answer=signal.aborted?'Response stopped. The results are available below.':
     'The model could not write an explanation. The calculated results are available below.';
   }
   responseComplete=true;
   if(confirmed&&(results.length||projectTotal))setChatFilters(confirmed);
   if(request&&ids.length){
    const prior=recentContext.current;
    const sameField=ids.length===1&&prior.fields.length===1&&ids[0]===prior.fields[0];
    recentContext.current={fields:ids,breakdown:request.breakdown,overall:request.breakdowns?.length===0,answers:request.answers||(sameField?prior.answers:undefined),hiddenAnswers:request.hiddenAnswers};
   }
   setTurns(previous=>[...previous,{id:operation,question:prompt,answer,results}].slice(-12));
   setPendingQuestion('');
   setPendingResults([]);
   setPartial('');
   if(placeholder)setSections(previous=>({...previous,[placeholder]:answer.trim()}));
   if(placeholder)setNotice('Word section ready for review.');
  });
  setPendingQuestion('');
  setPendingResults([]);
  setPartial('');
  if(mode==='chat'&&!responseComplete)setQuestion(draft=>draft||prompt);
 }

 const saveProject=(changes:ProjectAssistant,message:string)=>void run('Saving…',async signal=>{
  await projectAssistant(project.id,changes,signal);
  setSaved(previous=>({...previous,...changes}));
  setNotice(message);
 });

 function saveAnalysis(card:ChatAnalysisCard,name:string){
  const analyses=saved.analyses||[];
  if(!card.recipe)return;
  if(analyses.length>=30){setError('Remove a saved analysis before adding another.');return;}
  if(analyses.some(item=>item.name.toLowerCase()===name.toLowerCase())){setError('Choose a different name for this analysis.');return;}
  saveProject({analyses:[...analyses,{...card.recipe,name,id:crypto.randomUUID()}]},'Analysis saved to this project.');
 }

 function rerunAnalysis(recipe:AssistantAnalysisRecipe){
  void run('Refreshing saved analysis…',async(signal,operation)=>{
   const api=createKoboApi();
   const {cards,answer}=await runAnalysisRecipe(project,analysis,recipe,chatSetup?.smallGroupMin||5,
    (settings,id,abort)=>api.previewQuestion(project.id,settings,id,abort),signal);
   recentContext.current={fields:[recipe.field],breakdown:recipe.breakdowns.length===1?recipe.breakdowns[0]:undefined,overall:!recipe.breakdowns.length,hiddenAnswers:recipe.hiddenAnswers};
   followThread.current=true;
   setToolsOpen(false);
   setTurns(previous=>[...previous,{id:operation,question:`Run ${recipe.name}`,answer,results:cards}].slice(-12));
  });
 }

 function queueReview(){
  void run('Checking data quality…',async signal=>{
   const ids=new Set(available.map(field=>field.id));
   const findings=(await qualityFindings(project.id,analysis,signal)).filter(finding=>!finding.question||ids.has(finding.question));
   setQuality(findings.sort((a,b)=>Number(b.severity==='correction')-Number(a.severity==='correction')||b.count-a.count));
   setNotice(findings.length?'Review queue updated.':'No open findings in the current scope.');
  });
 }

 function openCrossCheck(prompt=''){
  if(analysisBusy){setError('Wait for the current analysis to finish.');return;}
  const show=(source:KoboAnalysis)=>{setCrossCheck({prompt,analysis:source});setToolsOpen(true);};
  if(!chatFilters){show(analysis);return;}
  void run('Preparing the cross-question check…',async signal=>{
   const ids=new Set(chatFilters.filters.map(filter=>filter.field));
   const filters=[...analysis.settings.filters.filter(filter=>!ids.has(filter.field)),...chatFilters.filters];
   show(await createKoboApi().analyze(project.id,{...analysis.settings,filters},signal));
  });
 }

 function factCheckReport(){
  void run('Refreshing report evidence…',async signal=>{
   setReportChecks(undefined);
   const api=createKoboApi(),minimum=chatSetup?.smallGroupMin||5;
   const preview=(settings:KoboAnalysis['settings'],id:string,abort:AbortSignal)=>api.previewQuestion(project.id,settings,id,abort);
   const integrity:NonNullable<typeof reportChecks>=[];
   const sources=[];
   for(const attachment of report?.assistantResults||[]){
    if(signal.aborted)return;
    try{
     const {cards}=await runAnalysisRecipe(project,analysis,attachment,minimum,preview,signal);
     const result=cards[0]?.result;
     if(result)sources.push({label:attachment.name,result});
     else integrity.push({claim:attachment.name,note:cards[0]?.message||'This report source is unavailable.'});
    }catch(error){
     if(signal.aborted)return;
     integrity.push({claim:attachment.name,note:error instanceof Error?error.message:'This report source is unavailable.'});
    }
   }
   const fields=[...new Set([...(report?.questions||[]),...selection.map(field=>field.id)])]
    .filter(id=>available.some(field=>field.id===id));
   for(let offset=0;offset<fields.length;offset+=8){
    const cards=await loadChatAnalysis(project,analysis,{fields:fields.slice(offset,offset+8)},minimum,preview,signal);
    for(const card of cards){
     if(card.result)sources.push({label:card.title,result:card.result});
     else integrity.push({claim:card.title,note:card.message||'This report source is unavailable.'});
    }
   }
   const distinct=[...new Map(sources.map(source=>[JSON.stringify(source.result),source])).values()];
   setReportChecks([...integrity,...checkReportClaims(reportDraft,distinct)]);
  });
 }

 function uploadWord(file:File){
  setWordFile(null);setSections({});
  void run('Checking Word template…',async signal=>{
   const body=new FormData();
   body.append('file',file);
   const response=await assistantRequest('/templates/inspect',body,'POST',signal);
   const result:{placeholders:string[]}=await response.json();
   setWordFile(file);
   setSections(Object.fromEntries(result.placeholders.map(name=>[name,''])));
  });
 }

 function exportWord(){
  if(!wordFile)return;
  void run('Filling Word template…',async signal=>{
   const body=new FormData();
   body.append('file',wordFile);
   body.append('values',JSON.stringify(sections));
   const response=await assistantRequest('/templates/fill',body,'POST',signal);
   downloadBlob(await response.blob(),'report-draft.docx');
   setNotice('Word draft downloaded.');
  });
 }

 function useModel(name:string){
  void run('Activating model…',async signal=>{
   const response=await assistantRequest('/models/activate',{model:name},'POST',signal);
   const next:AssistantStatus=await response.json();
   if(!next.connected||!next.models.some(item=>item.name===name)){
    throw new Error('The model was selected, but Ollama could not confirm it is available. Try again.');
   }
   applyStatus(next);
   openerRef.current=launcher.current;
   setSetup(false);
   setNotice('Model ready. Select project fields to start chatting.');
  });
 }

 function testModel(name:string){
  void run('Testing an English response…',async(signal,operation)=>{
   let sample='';
   await assistantStream('/chat',{model:name,question:'Reply in one short English sentence saying you are ready to help.',evidence:'Synthetic setup test.',operation,test:true},signal,item=>{sample+=item.message?.content||'';});
   if(!sample.trim())throw new Error('The model returned empty text. Try again or choose another model.');
   await refresh(signal);
   setNotice(sample.trim());
  });
 }

 function close(){stop();setRemoval('');setOpen(false);}

 async function saveFolder(folder:string|null,signal:AbortSignal){
  const response=await assistantRequest('/storage',{folder},'PUT',signal);
  const next:AssistantStatus=await response.json();
  if(next.modelFolder!==status?.modelFolder)clearModelInstallStatus();
  applyStatus(next);
  setFolderEntry(null);
  setRemoval('');
  setNotice('Model storage updated.');
 }

 function chooseFolder(){
  const native=(window as Window & {pywebview?:{api?:{choose_assistant_model_folder?:(current:string)=>Promise<string|null>}}}).pywebview?.api;
  if(!native?.choose_assistant_model_folder){
   setFolderEntry(status?.modelFolder||'');
   return;
  }
  const pick=native.choose_assistant_model_folder;
  void run('Choosing storage folder…',async signal=>{
   const folder=await pick(status?.modelFolder||'');
   signal.throwIfAborted();
   if(folder)await saveFolder(folder,signal);
  });
 }

 return <>
  <button ref={settingsLauncher} type="button" className="soft" aria-haspopup="dialog"
   aria-expanded={open&&setup} aria-controls={open&&setup?'local-ai-panel':undefined} onClick={()=>show('settings')}>
   <Settings aria-hidden="true"/> AI Settings
  </button>
  {createPortal(<div className="assistant-dock">
  {chatSetup?.enabled&&<button ref={launcher} type="button" className="assistant-launcher" aria-haspopup="dialog" aria-expanded={open&&!setup}
   aria-controls={open&&!setup?'local-ai-panel':undefined} aria-label={open&&!setup?'Close AI Assistant':'AI Assistant'}
   title={open&&!setup?'Close AI Assistant':'AI Assistant'} onClick={()=>open&&!setup?close():show('chat')}>
   {open&&!setup?<X aria-hidden="true"/>:<AssistantOrb/>}
   {installingModel&&<span className="assistant-launcher-progress"><LoaderCircle className="assistant-job-spinner" role="img" aria-label="Model installation in progress"/></span>}
  </button>}
  {open&&<dialog ref={dialog} id="local-ai-panel" className={`glass local-assistant ${setup?'is-setup':'is-chat'}${!setup&&expanded?' is-expanded':''}${!setup&&ready&&!toolsOpen?' has-thread':''}`} aria-labelledby="local-ai-title" dir="ltr"
   onCancel={event=>{event.preventDefault();close();}}>
   <header className="assistant-header">
    <span className="assistant-icon">{setup?<Settings aria-hidden="true"/>:<Sparkles aria-hidden="true"/>}</span>
    <div className="assistant-heading"><h2 id="local-ai-title" tabIndex={-1}>{setup?'AI Settings':'AI Assistant'}</h2><p>{project.name}</p></div>
    {ready&&!setup&&<button type="button" className="soft assistant-icon-button" aria-label={toolsOpen?'Back to chat':'Project tools'}
     aria-pressed={toolsOpen} title={toolsOpen?'Back to chat':'Project tools'} onClick={()=>setToolsOpen(!toolsOpen)}>
     {toolsOpen?<MessageSquare aria-hidden="true"/>:<Layers aria-hidden="true"/>}
    </button>}
    {!setup&&<button type="button" className="soft assistant-icon-button" aria-label={expanded?'Restore chat size':'Expand chat'}
     title={expanded?'Restore chat size':'Expand chat'} aria-pressed={expanded} onClick={()=>setExpanded(!expanded)}>
     {expanded?<Minimize2 aria-hidden="true"/>:<Maximize2 aria-hidden="true"/>}
    </button>}
    <button type="button" className="soft assistant-icon-button" aria-label={setup?'Close AI settings':'Close assistant'} onClick={close}><X aria-hidden="true"/></button>
   </header>
   <div className="assistant-body">
    {error&&<p className="assistant-error" role="alert">{error}</p>}
    {!(setup?status:chatSetup)&&<div className="assistant-loading">
     {busy?<><LoaderCircle aria-hidden="true"/><span role="status">Checking local AI setup…</span></>:
      <button type="button" className="soft" onClick={()=>show(setup?'settings':'chat')}>Retry setup check</button>}
    </div>}
    {status&&setup&&<section className="assistant-model-panel" aria-label="Local AI settings">
     <label className="assistant-enable">
      <span><strong>Enable local AI</strong><small>Use a model on this computer to explore project data and draft English reports.</small></span>
      <input type="checkbox" role="switch" aria-label="Enable local AI" checked={status.enabled} disabled={busy||installingModel} onChange={event=>toggle(event.target.checked)}/>
      <span className="assistant-switch" aria-hidden="true"/>
     </label>
     {status.enabled&&<>
      <div className="assistant-model-content">
       <div className="assistant-model-heading">
        <h3><Cpu aria-hidden="true"/> Local models</h3>
        <p>{status.ramGb===null?'':`${status.ramGb} GB RAM · `}{status.freeGb===null?'Disk space unavailable':`${status.freeGb} GB free`}</p>
       </div>
       <p className="assistant-model-prerequisite">All models support the same assistant tools, from explaining fields to filling Word templates.</p>
       <section className="assistant-storage" aria-label="Model storage">
        <div className="assistant-storage-heading">
         <FolderOpen aria-hidden="true"/>
         <strong>Model storage</strong>
         <span className="assistant-model-tag">{status.usingDefaultFolder===false?'Custom folder':'Default folder'}</span>
        </div>
        <p className="assistant-storage-path" title={status.modelFolder}>{status.modelFolder||'Ollama default folder'}</p>
        <div className="assistant-actions">
         <button type="button" className="soft" disabled={busy||installingModel} onClick={chooseFolder}>Choose folder</button>
         {status.usingDefaultFolder===false&&<button type="button" className="soft" disabled={busy||installingModel}
          onClick={()=>void run('Restoring default folder…',signal=>saveFolder(null,signal))}>Use default folder</button>}
        </div>
        <p>Models stay in their original folders. Switch back to see or delete models stored there.</p>
        {folderEntry!==null&&<form className="assistant-storage-form" onSubmit={event=>{
         event.preventDefault();
         if(folderEntry.trim())void run('Saving model storage…',signal=>saveFolder(folderEntry.trim(),signal));
        }}>
         <label>Folder path<input type="text" value={folderEntry} onChange={event=>setFolderEntry(event.target.value)} required/></label>
         <div className="assistant-actions">
          <button type="submit" className="primary" disabled={busy||installingModel||!folderEntry.trim()}>Save folder</button>
          <button type="button" className="soft" onClick={()=>setFolderEntry(null)}>Cancel</button>
         </div>
        </form>}
       </section>
       {!status.connected&&!status.installing&&<p className="assistant-model-prerequisite">Installing the first model sets up Ollama automatically.</p>}
       {status.installing&&!busy&&!installingModel&&<div className="assistant-install-progress" role="status">
        <strong><LoaderCircle aria-hidden="true"/> Installing Ollama</strong>
        <progress aria-label="Ollama installation in progress"/>
       </div>}
       <ul className="assistant-models" aria-label="AI models">
        {[
         ...status.catalog.map(item=>({...item,installed:status.models.some(local=>local.name===item.name)})),
         ...status.models.filter(item=>!status.catalog.some(entry=>entry.name===item.name))
          .map(item=>({name:item.name,label:item.name,size:Number((item.size/1e9).toFixed(1)),ram:null,installed:true})),
        ].map(item=>{
         const paused=modelJob.paused.includes(item.name);
         const inUse=item.name===status.model;
         const running=installingModel&&modelJob.name===item.name;
         const settingUp=running&&modelJob.phase==='setup';
         const rowMessage=modelJob.name===item.name&&!running?modelJob.message:'';
         return <li className={`assistant-model-option${inUse?' is-current':''}`} key={item.name}>
          <div className="assistant-model-choice">
           <strong>{item.label}</strong>
           {inUse?<span className="assistant-model-tag">In use</span>:
            item.installed?<span className="assistant-model-tag">Installed</span>:
            paused?<span className="assistant-model-tag">Paused</span>:
            item.name===recommended(status)&&<span className="assistant-model-tag">Recommended</span>}
           <small>{item.label!==item.name&&`${item.name} · `}{item.size} GB {item.installed?'installed':'download'}{item.ram&&` · ${item.ram} GB RAM suggested`}</small>
           {modelGuide[item.name]&&<small className="assistant-model-use"><strong>Best for</strong> {modelGuide[item.name]}</small>}
          </div>
          <div className="assistant-actions assistant-model-actions">
           {item.installed?<>
            <button type="button" className={inUse?'soft':'primary assistant-use-model'} disabled={busy||installingModel}
             onClick={()=>inUse?testModel(item.name):useModel(item.name)} aria-label={`${inUse?'Test':'Use'} ${item.label}`}>
             {!inUse&&<Check aria-hidden="true"/>}{inUse?'Test':'Use model'}
            </button>
            <button type="button" className="soft assistant-model-delete" disabled={busy||installingModel} onClick={()=>{setError('');setRemoval(item.name);}} aria-label={`Delete ${item.label}`}><Trash2 aria-hidden="true"/> Delete</button>
           </>:!running&&<>
            <button type="button" className={item.name===recommended(status)?'primary':'soft'} disabled={busy||installingModel}
             onClick={()=>{setRemoval('');void installAssistantModel(item.name);}} aria-label={`${paused?'Resume':'Install'} ${item.label}`}>
             <Download aria-hidden="true"/> {paused?'Resume':'Install'}
            </button>
            {paused&&<button type="button" className="soft" disabled={busy||installingModel}
             onClick={()=>cancelPausedModel(item.name)}>Cancel</button>}
           </>}
          </div>
          {running&&<div className="assistant-install-progress assistant-model-detail">
           <div className="assistant-download-heading">
            <strong><Download aria-hidden="true"/> {settingUp?'Installing Ollama':modelJob.phase==='preparing'?'Preparing installation':`Downloading ${item.label}`}</strong>
            {modelJob.percent!==null&&<span className="assistant-download-percent" title="Estimated progress">{modelJob.percent}%</span>}
           </div>
           <div className={`assistant-download-track${modelJob.percent===null?' is-indeterminate':''}`}
            role="progressbar" aria-label={`Installing ${item.label}`} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={modelJob.percent??undefined}
            aria-valuetext={modelJob.percent===null?modelJob.message:`${modelJob.percent}% estimated. ${modelJob.message}`}>
            <i style={modelJob.percent===null?undefined:{width:`${modelJob.percent}%`}}/>
           </div>
           <p className="assistant-download-caption">{modelJob.message}</p>
           {settingUp&&<p>Pausing or cancelling stops the queued model download. Windows can finish installing Ollama.</p>}
           <div className="assistant-actions">
            <button type="button" className="soft" onClick={()=>stopAssistantModelInstall('paused')}>Pause</button>
            <button type="button" className="soft" onClick={()=>stopAssistantModelInstall('cancelled')}>Cancel download</button>
            <button type="button" className="soft" onClick={close}>Continue in background</button>
           </div>
          </div>}
          {rowMessage&&<p className="assistant-model-detail" role={modelJob.phase==='failed'?'alert':'status'}>{rowMessage}</p>}
         </li>;
        })}
       </ul>
      </div>
      {status.connected&&<details className="assistant-model-privacy">
       <summary><ShieldCheck aria-hidden="true"/> Data protection</summary>
       <label>Minimum group size<select value={status.smallGroupMin||5} disabled={busy}
        onChange={event=>{const smallGroupMin=Number(event.target.value);void run('Saving privacy settings…',async signal=>{
         await assistantRequest('/settings',{enabled:true,model:status.model,smallGroupMin},'PUT',signal);await refresh(signal);
        });}}>
         {[5,10,15,20,30].map(size=><option key={size} value={size}>{size} responses</option>)}
        </select></label><p>Small results and totals that expose a small group are withheld from the model.</p></details>}
     </>}
    </section>}
    {chatSetup&&!ready&&!setup&&<section className="assistant-welcome" aria-labelledby="assistant-welcome-title">
     <span className="assistant-welcome-icon"><MessageSquare aria-hidden="true"/></span>
     <div className="assistant-welcome-copy">
      <h3 id="assistant-welcome-title">Start chatting with local AI</h3>
      <p>Choose a model to ask about this project, review data quality, or draft a report.</p>
     </div>
     <button type="button" className="primary" disabled={busy} onClick={()=>show('settings')}>
      <Settings aria-hidden="true"/> Open AI Settings
     </button>
     <p className="assistant-welcome-privacy"><ShieldCheck aria-hidden="true"/> Runs on this computer</p>
    </section>}
    {ready&&!setup&&<>
     <section className="assistant-tools-content" aria-label="Project tools" hidden={!toolsOpen}>
     <h3>Project tools</h3>
     <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>openCrossCheck()}>Check answers across questions</button>
     {crossCheck&&<AssistantCrossCheck key={`${crossCheck.prompt}:${JSON.stringify(crossCheck.analysis.settings.filters)}`}
      project={project} analysis={crossCheck.analysis} prompt={crossCheck.prompt} minimum={chatSetup?.smallGroupMin||5}
      onOpenReview={()=>{close();onOpenReview();}} onReview={finding=>{close();onReview(finding);}}/>}
     <details className="assistant-card"><summary>New upload briefing</summary>
      {saved.upload?(()=>{
       const upload=saved.upload;
       const changed=new Set(upload.changes.map(item=>item.question));
       const needsReview=(saved.analyses||[]).filter(recipe=>{
        const fields=[recipe.field,...recipe.breakdowns,...recipe.filters.map(filter=>filter.field),...recipe.ownFilters.map(filter=>filter.field)];
        return fields.some(id=>changed.has(id)||!available.some(field=>field.id===id));
       });
       const minimum=chatSetup?.smallGroupMin||5;
       const safe=(count:number,total:number)=>total>=minimum&&(count===0||count>=minimum)&&(count===total||total-count>=minimum);
       return <>
        <p>Latest replacement: {new Date(upload.at).toLocaleDateString('en')}.</p>
        {!!upload.changes.length&&<ul>{upload.changes.map((item,index)=><li key={index}>
         {available.find(field=>field.id===item.question)?koboLabel(available.find(field=>field.id===item.question)!,'en'):item.question} · {item.change}</li>)}</ul>}
        {!!upload.missingIncreases.length&&<><h4>Fields with more missing answers by share</h4><ul>
         {upload.missingIncreases.filter(item=>available.some(field=>field.id===item.field)).map(item=><li key={item.field}>{koboLabel(available.find(field=>field.id===item.field)!,'en')} · {
          safe(item.before,upload.beforeTotal)&&safe(item.after,upload.afterTotal)?`${item.before}/${upload.beforeTotal} before, ${item.after}/${upload.afterTotal} after`:'Counts withheld for privacy'}</li>)}
        </ul></>}
        {!!needsReview.length&&<><h4>Saved analyses to review</h4><ul>{needsReview.map(recipe=><li key={recipe.id}>{recipe.name}</li>)}</ul></>}
        {!upload.changes.length&&!upload.missingIncreases.length&&!needsReview.length&&<p>No form changes or increased missingness detected in eligible main-form fields.</p>}
       </>;
      })():<p>A briefing will be available after the next replacement upload.</p>}
     </details>
     <details className="assistant-card" open={cleanupOpen} onToggle={event=>setCleanupOpen(event.currentTarget.open)}><summary>Data quality review queue</summary>
      <p>Review corrections first, followed by checks, in order of affected records.</p>
      <button type="button" className="soft" disabled={busy||analysisBusy} onClick={queueReview}>Refresh review queue</button>
      {!!quality.length&&<ul className="assistant-review-list">{quality.map(finding=><li key={finding.id}>
       <span>{finding.title} · {finding.severity==='correction'?'Correction':'Check'}{finding.count>=(chatSetup?.smallGroupMin||5)&&analysis.filtered-finding.count>=(chatSetup?.smallGroupMin||5)?` · ${finding.count} affected`:''}</span>
       <button type="button" className="soft" disabled={busy} onClick={()=>{close();onReview(finding);}}>Review affected records</button>
      </li>)}</ul>}
      {similarAnswerFields(project,analysis).map(field=><div key={field.id} className="assistant-actions">
       <span>{field.label}: answer labels are similar. Check whether the categories mean the same thing before standardizing or merging them.</span>
       <button type="button" className="soft" disabled={busy} onClick={()=>onOpenAnalysis(field.id,'merge')}>Review similar answers</button>
      </div>)}
      {duplicateQuestions(project,analysis).map(item=><div key={item.fields.join(':')} className="assistant-actions">
       <span>{item.label} appears in {item.fields.join(', ')}.{
        item.differentChoices||item.differentLogic?' Review differences in '+[item.differentChoices?'answer options or question type':'',item.differentLogic?'skip or required rules':''].filter(Boolean).join(' and ')+'.':
        ' Check whether these questions measure the same thing before combining source columns.'
       }</span>
       <button type="button" className="soft" disabled={busy} onClick={()=>{close();onMappings();}}>Review source mapping</button>
      </div>)}
     </details>
     <details className="assistant-card"><summary>Report fact-check</summary>
      <p>Checks figures against refreshed report attachments and selected fields. Claims with ambiguous sources or unsupported interpretations are flagged for review.</p>
      <div className="assistant-actions"><button type="button" className="soft" disabled={busy||!report} onClick={()=>{
       setReportDraft([report?.findings,report?.methodology,report?.recommendations].filter(Boolean).join('\n\n').slice(0,90000));setReportChecks(undefined);
      }}>Load report draft</button></div>
      <label>Draft to check<textarea value={reportDraft} maxLength={90000} rows={6} onChange={event=>{setReportDraft(event.target.value);setReportChecks(undefined);}}/></label>
      <button type="button" className="primary" disabled={busy||analysisBusy||!reportDraft.trim()} onClick={factCheckReport}>Check report claims</button>
      {reportChecks&&(reportChecks.length?<ul>{reportChecks.map((check,index)=><li key={index}><strong>{check.claim}</strong><p>{check.note}</p></li>)}</ul>:<p>No supported numeric or interpretation patterns found in this draft.</p>)}
     </details>
     <details className="assistant-card"><summary>Saved analyses ({saved.analyses?.length||0})</summary>
      {saved.analyses?.length?<ul className="assistant-review-list">{saved.analyses.map(recipe=><li key={recipe.id}>
       <span>{recipe.name}</span><div className="assistant-actions">
        <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>rerunAnalysis(recipe)}>Run analysis</button>
        <button type="button" className="soft" aria-label={`Remove saved analysis ${recipe.name}`} disabled={busy}
         onClick={()=>saveProject({analyses:saved.analyses?.filter(item=>item.id!==recipe.id)},'Saved analysis removed.')}>Remove</button>
       </div>
      </li>)}</ul>:<p>Use Save analysis on a pivot to rerun it later with its saved filters.</p>}
     </details>
     <details className="assistant-card" open={!selection.length||undefined}>
      <summary><Layers aria-hidden="true"/> Fields in this conversation ({selection.length})</summary>
      <div className="assistant-fields">{available.map(field=><label key={field.id}>
       <input type="checkbox" disabled={busy} checked={selected.includes(field.id)} onChange={event=>{
        const checked=event.target.checked;setSelected(previous=>checked?[...previous,field.id]:previous.filter(id=>id!==field.id));
       }}/>
       <span>{koboLabel(field,'en')} <small>{field.type}{field.addedFromData||field.localDerived?' · Added field':''}</small></span>
      </label>)}</div>
      {!available.length&&<p>No eligible fields in the current analysis.</p>}
      {!!selection.length&&<div className="assistant-actions">
       {selection.filter(field=>analysis.questions.some(result=>result.id===field.id)).map(field=><button type="button" className="soft" key={field.id} disabled={busy} onClick={()=>{close();onEvidence(field.id);}}>
        View {koboLabel(field,'en')}
       </button>)}
      </div>}
     </details>
     <div className="assistant-actions">
      <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate('Explain the selected fields, answer choices, and when each question applies.')}>Explain fields</button>
      <button type="button" className="soft" disabled={busy} onClick={()=>onIndicator(draftChatIndicator(project,analysis,'').draft)}>Build indicator</button>
      <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate('Explain the data quality checks and suggest cleaning steps for review.','quality')}>Review data quality</button>
      <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate('Summarize the findings and limitations. Explain the respondent bases and percentage definitions.')}>Explain findings</button>
     </div>
     <details className="assistant-card"><summary>Field changes</summary>
      <p>{saved.baseline?`History starts ${new Date(saved.baseline).toLocaleDateString()}.`:'History starts with the next saved schema change for this project.'}</p>
      {saved.fieldHistory?.length?<ul>{[...saved.fieldHistory].reverse().flatMap(entry=>entry.changes.map((change,index)=><li key={entry.at+index}>
       <strong>{project.form.questions.find(field=>field.id===change.question)?.name||change.question}</strong> · {change.change} · {new Date(entry.at).toLocaleDateString()}
      </li>))}</ul>:<p>No field changes recorded yet.</p>}
     </details>
     <details className="assistant-card"><summary>Compare periods</summary>
      <label>Date field<select value={periods.field} onChange={event=>setPeriods({...periods,field:event.target.value})}>
       <option value="">Choose a date field</option>{available.filter(field=>field.kind==='date'&&!field.repeat).map(field=><option key={field.id} value={field.id}>{koboLabel(field,'en')}</option>)}
      </select></label>
      <div className="assistant-periods">{dateFields.map(([key,label])=><label key={key}>{label}<input type="date" value={periods[key]} onChange={event=>setPeriods({...periods,[key]:event.target.value})}/></label>)}</div>
      <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate('Compare these two periods. Cite each respondent base and note limits to comparability.','compare')}>Compare results</button>
     </details>
     <details className="assistant-card"><summary><FileText aria-hidden="true"/> Draft a report</summary>
      <label>Section headings and instructions<textarea value={outline} maxLength={4500} onChange={event=>setOutline(event.target.value)}/></label>
      <div className="assistant-actions">
       <button type="button" className="primary" disabled={busy||analysisBusy||!outline.trim()} onClick={()=>void generate('Draft a report using this outline. Cite each finding and explain limitations.\n'+outline,'draft')}>Draft report</button>
       <button type="button" className="soft" disabled={busy||!outline.trim()} onClick={()=>saveProject({outline},'Report outline saved with this project.')}>Save outline</button>
      </div>
     </details>
     <details className="assistant-card"><summary><FileText aria-hidden="true"/> Fill a Word template</summary>
      <p>Add named placeholders such as {'{{key_findings}}'} in Word paragraphs or table cells. Review the text before downloading your filled document.</p>
      <input type="file" accept=".docx" aria-label="Word report template" disabled={busy} onChange={event=>{
       const file=event.target.files?.[0];event.target.value='';if(file)uploadWord(file);
      }}/>
      {wordFile&&<p>{wordFile.name}</p>}
      {Object.entries(sections).map(([name,value])=><div className="assistant-word-section" key={name}>
       <label>{name.replaceAll('_',' ')}<textarea value={value} readOnly={busy} maxLength={16000}
        onChange={event=>{const text=event.target.value;setSections(previous=>({...previous,[name]:text}));}}/></label>
       <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate('Draft the following report section using available evidence. State when evidence is insufficient. Section: '+name.replaceAll('_',' '),'draft',name)}>Draft this section</button>
      </div>)}
      {wordFile&&<button type="button" className="primary" disabled={busy||Object.values(sections).some(value=>!value.trim())} onClick={exportWord}>Download filled Word draft</button>}
     </details>
     {currentAnswer&&<details className="assistant-card">
      <summary>Latest response</summary>
      <textarea aria-label="Edit latest response" className="assistant-answer" value={currentAnswer} readOnly={busy} maxLength={16000} onChange={event=>{
       const answer=event.target.value;setTurns(previous=>previous.map((turn,index)=>index===previous.length-1?{...turn,answer}:turn));
      }}/>
      {unmatchedFigures.length>0&&<p>Percentages to verify against the source tables <strong>{unmatchedFigures.join(', ')}</strong></p>}
      {!!currentAnswer&&<div className="assistant-actions">
       <select aria-label="Report section" value={section} onChange={event=>setSection(event.target.value as ReportSection)}>
        <option value="findings">Findings</option><option value="methodology">Methodology and limitations</option><option value="recommendations">Recommendations</option>
       </select>
       <button type="button" className="soft" disabled={busy} onClick={()=>{onInsert(currentAnswer,section);close();}}>Insert into report</button>
       <button type="button" className="soft" onClick={()=>void navigator.clipboard.writeText(currentAnswer).then(()=>setNotice('Copied.')).catch(()=>setError('Select the response and copy it manually.'))}>Copy</button>
       <button type="button" className="soft" disabled={busy} onClick={()=>saveProject({conversation:turns.map(({question,answer})=>({question,answer}))},'Conversation saved with this project.')}>Save conversation</button>
       <button type="button" className="soft" disabled={busy} onClick={()=>{recentContext.current={fields:[]};setChatFilters(undefined);setTurns([]);setPartial('');setCopiedReply(null);}}>New conversation</button>
      </div>}
     </details>}
     {!!saved.conversation?.length&&<div className="assistant-actions">
      <button type="button" className="soft" disabled={busy} onClick={()=>{recentContext.current={fields:[]};setChatFilters(undefined);setTurns(saved.conversation||[]);setPartial('');}}>Load saved conversation</button>
      <button type="button" className="soft" disabled={busy} onClick={()=>saveProject({conversation:null},'Saved conversation deleted.')}>Delete saved conversation</button>
     </div>}
     {question.trim()&&<button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate('Check this draft against the selected tables. Flag figures, denominators and interpretations that the evidence does not support.\n\n'+question.slice(0,5600),'check')}>Check draft</button>}
     </section>
     <section className="assistant-chat" aria-label="Chat" hidden={toolsOpen}>
      <div className="assistant-thread" ref={thread} role="log" aria-label="Conversation" onScroll={event=>{
       const node=event.currentTarget;
       followThread.current=node.scrollHeight-node.scrollTop-node.clientHeight<30;
      }}>
       {!turns.length&&!pendingQuestion&&<div className="assistant-message is-assistant">
        <p>Ask about your project or mention a field to see its results.</p>
       </div>}
       {[...turns,...pendingQuestion?[{id:pendingId,question:pendingQuestion,answer:partial,results:pendingResults}]:[]].map((turn:Turn & ChatAnalysisTurn,index)=>{
        const pending=!!pendingQuestion&&turn.id===pendingId;
        return <div className="assistant-turn" key={turn.id||index}>
        <div className="assistant-message is-user" aria-label="You">{turn.question}</div>
        <div className="assistant-message is-assistant" aria-label="Assistant">
         <div className="assistant-reply-text">{turn.answer||<span className="assistant-typing"><LoaderCircle aria-hidden="true"/> Working…</span>}</div>
         {!pending&&<button type="button" className="soft assistant-copy-reply" aria-label={copiedReply===index?'Answer copied':'Copy answer'}
          onClick={event=>void writeKoboClipboard(turn.answer,event.currentTarget).then(()=>setCopiedReply(index)).catch(()=>setError('Select the answer text and copy it manually.'))}>
          {copiedReply===index?<Check aria-hidden="true"/>:<Copy aria-hidden="true"/>}{copiedReply===index?'Copied':'Copy'}
         </button>}
        </div>
        {turn.request?.clarification&&<div className="assistant-actions">
         {turn.request.clarification.options.map(option=><button type="button" className="soft" key={option.id} disabled={busy}
          onClick={()=>void generate(turn.question,'chat',undefined,{...turn.choice,[turn.request!.clarification!.target]:option.id},turn.filterProposal)}>{option.label}</button>)}
        </div>}
        {turn.filterProposal&&!turn.request&&<div className="assistant-actions">
         <button type="button" className="soft" disabled={busy||analysisBusy} onClick={()=>void generate(turn.filterProposal!.question,'chat',undefined,{},turn.filterProposal)}>Apply filter in chat</button>
        </div>}
        {turn.indicatorDraft&&<div className="assistant-actions"><button type="button" className="soft" disabled={busy}
         onClick={()=>onIndicator(turn.indicatorDraft!)}>Review indicator draft</button></div>}
        {turn.results?.map(card=>{
         const editable=available.some(field=>field.id===card.field&&!field.repeat&&(field.kind==='category'||field.kind==='multiple'));
         const breakdowns=available.filter(field=>field.id!==card.field&&field.kind==='category'&&!field.repeat)
          .map(field=>({id:field.id,label:koboLabel(field,'en')}));
         return <AssistantResultCard key={`${card.period||''}:${card.field}`} card={card} busy={busy||analysisBusy} breakdowns={breakdowns} canEditAnswers={editable}
          onOpen={field=>{close();if(card.hiddenRows||card.hiddenColumns)onSource(field);else onOpenAnalysis(field);}} onMerge={()=>onOpenAnalysis(card.field,'merge')}
          onSource={()=>{close();onSource(card.field);}} onSave={name=>saveAnalysis(card,name)}
          onReport={view=>{
           if(!card.recipe)return;
           if(onReportResult({...card.recipe,id:crypto.randomUUID(),name:card.title.slice(0,180),view}))close();
           else setError('Remove a report result before adding another.');
          }}
          onFinding={()=>{
           const finding=answerFromPivot({fields:[card.field],intent:card.recipe?.compare?'compare':'distribution',breakdowns:card.recipe?.breakdowns},[card]);
           onInsert([finding,analysisSourceNote(card)].filter(Boolean).join('\n'),'findings');
           close();
          }}
          onGroup={(field,compare)=>void generate(`${compare?'Compare':'Break down'} ${card.title} by ${breakdowns.find(group=>group.id===field)?.label}`,
           'chat',undefined,{field:card.field,breakdown:field,hiddenAnswers:card.chatHiddenAnswers||[],intent:compare?'compare':'distribution'})}
          onOverall={()=>void generate(`Show the overall result for ${card.title}`,'chat',undefined,
           {field:card.field,overall:true,hiddenAnswers:card.chatHiddenAnswers||[],intent:'distribution'})}
          onHide={(ids,label)=>void generate(label?`Hide ${label} in the chat pivot for ${card.title}`:`Restore chat-hidden answers for ${card.title}`,
           'chat',undefined,{field:card.field,breakdown:card.requestedBreakdown,overall:card.overall,hiddenAnswers:ids,intent:'distribution'})}/>;
        })}
       </div>;
       })}
      </div>
      {chatFilters&&<div className="assistant-actions"><span>Chat filter: {chatFilters.summary}</span>
       <button type="button" className="soft" disabled={busy} onClick={()=>setChatFilters(undefined)}>Clear chat filter</button></div>}
      <form className="assistant-compose assistant-chat-compose" onSubmit={event=>{
       event.preventDefault();if(question.trim()&&!busy)void generate(question.trim());
      }}>
       <div className="assistant-compose-input">
        <span aria-hidden="true">{question}{'\n'}</span>
        <textarea aria-label="Message" value={question} onChange={event=>setQuestion(event.target.value)}
         onKeyDown={event=>{if(!busy&&event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}
         placeholder="Message AI Assistant" maxLength={6000} rows={1}/>
       </div>
       {busy&&pendingQuestion?<button type="button" className="soft" aria-label="Stop response" onClick={stop}><Square aria-hidden="true"/></button>:
        <button type="submit" className="primary" aria-label="Send message" disabled={busy||!question.trim()}><Send aria-hidden="true"/></button>}
      </form>
     </section>
    </>}
    {(activity||notice)&&(setup?status:chatSetup)&&(setup||toolsOpen||!ready)&&<div className="assistant-status"><span>{busy?<LoaderCircle aria-hidden="true"/>:<Check aria-hidden="true"/>}</span><p role="status">{activity||notice}</p>
     {busy&&activity!=='Checking assistant setup…'&&<button type="button" className="soft" onClick={stop}><Square aria-hidden="true"/> Stop</button>}
    </div>}
    {(setup||toolsOpen||!ready)&&<details className="assistant-help"><summary><HelpCircle aria-hidden="true"/> Getting started and data protection <ChevronDown className="assistant-chevron" aria-hidden="true"/></summary>
     <div className="assistant-guide">
      <ol className="assistant-guide-steps">
       <li><div><strong>Choose a model</strong><p>Enable local AI and select a model. Smaller models usually respond faster.</p></div></li>
       <li><div><strong>Choose your fields</strong><p>Ask about the selected results or use them to draft a report from a template.</p></div></li>
       <li><div><strong>Review the response</strong><p>Check generated numbers against the source tables before adding them to your report.</p></div></li>
      </ol>
      <section className="assistant-guide-privacy" aria-label="Data protection">
       <ShieldCheck aria-hidden="true"/>
       <div>
        <h3>Data protection</h3>
        <p>Project evidence goes to a model on this computer. The assistant excludes identifying fields, free-text answers, and small aggregate results.</p>
        <p>Keep personal details out of your questions. <strong>Save conversation</strong> adds the chat to the project and its backups.</p>
       </div>
      </section>
     </div>
    </details>}
   </div>
  </dialog>}
 </div>,document.body)}
 {open&&setup&&removal&&<KoboConfirmDialog
  title={`Delete ${status?.catalog.find(item=>item.name===removal)?.label||removal} model?`}
  variant="danger" confirmLabel="Delete model" busy={busy} busyLabel="Deleting model…" confirmDisabled={installingModel}
  error={error} onCancel={()=>{setRemoval('');setError('');}}
  onConfirm={()=>void run('Removing model…',async signal=>{
   await assistantRequest('/models',{model:removal},'DELETE',signal);
   dismissModelInstallMessage(removal);
   setRemoval('');await refresh(signal);setNotice('Model removed.');
  })}>
   <p>This removes <strong>{removal}</strong> from this computer. You can download it again later.</p>
   {status?.model===removal&&<p>This is the current AI Assistant model. Choose another model to resume chatting after deletion.</p>}
   <p>Other apps using Ollama may also use this model.</p>
 </KoboConfirmDialog>}
 </>;
}
