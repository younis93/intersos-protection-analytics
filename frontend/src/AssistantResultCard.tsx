import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ChartNoAxesColumn,Copy,ExternalLink,Eye,EyeOff,GitMerge,Layers} from 'lucide-react';
import {analysisSourceNote,comparisonChecks,diagnoseOption,resultDiagnostics,type ChatAnalysisCard} from './assistantAnalysis';
import {KoboChartBoundary,KoboChartSkeleton} from './KoboChartLoading';
import {copyKoboChartImage} from './koboCopy';
import {useKoboCopy} from './koboClipboard';
import KoboPivotTable from './KoboPivotTable';
import {KoboRendering} from './KoboRendering';
import {assistantChart} from './assistantChart';
import {formatPercent,percentageDecimals} from './koboPercentages';

const Chart=lazy(()=>import('./KoboChart'));

export default function AssistantResultCard({card,onOpen,breakdowns,canEditAnswers,busy,onGroup,onOverall,onHide,onMerge,onSave,onReport,onFinding,onSource}:{
 card:ChatAnalysisCard;onOpen:(field:string)=>void;breakdowns:{id:string;label:string}[];
 canEditAnswers:boolean;busy:boolean;onGroup:(field:string,compare:boolean)=>void;onHide:(ids:string[],label?:string)=>void;onMerge:()=>void;
 onOverall:()=>void;
 onSave:(name:string)=>void;onReport:(view:'pivot'|'chart')=>void;onFinding:()=>void;
 onSource:()=>void;
}){
 const [view,setView]=useState<'pivot'|'chart'>(card.showChart?'chart':'pivot');
 const [copying,setCopying]=useState(false);
 const [display,setDisplay]=useState<'count'|'percent'|'both'>('both');
 const [action,setAction]=useState<'breakdown'|'compare'|'hide'>();
 const [selection,setSelection]=useState('');
 const [saveName,setSaveName]=useState('');
 const [saveOpen,setSaveOpen]=useState(false);
 const [expectedOption,setExpectedOption]=useState('');
 const chartRegion=useRef<HTMLDivElement>(null);
 const clipboard=useKoboCopy();
 const {result}=card;
 const hideableRows=result?.rows.filter(row=>row.id!=='__blank__')||[];
 const chart=result&&assistantChart(result);
 const checks=comparisonChecks(card);
 useEffect(()=>{
  if(view==='chart')chartRegion.current?.scrollIntoView({block:'nearest',inline:'nearest'});
 },[view]);
 return <section className="assistant-result-card" aria-label={card.title}>
  <h3 dir="auto">{card.title}{card.period?` · ${card.period}`:''}</h3>
  {!!card.filters.length&&<p className="assistant-result-filters">{card.filters.join(' · ')}</p>}
  {card.filtered&&!card.filters.length&&<p className="assistant-result-filters">Current filters apply.</p>}
  {(card.hiddenRows||card.hiddenColumns)&&<p className="assistant-result-filters">
   {card.hiddenRows&&card.hiddenColumns?'Some answer rows and breakdown columns are hidden.':card.hiddenRows?'Some answer rows are hidden.':'Some breakdown columns are hidden.'}
  </p>}
  {result?<>
   <p className="assistant-result-filters">{result.denominator.toLocaleString()} answered{result.breakdownFields?.length?` · By ${result.breakdownFields.map(field=>field.label).join(' / ')}`:''}</p>
   {result.percentageBasis&&<p className="assistant-result-filters">{result.percentageBasis}</p>}
   <div className="assistant-actions assistant-result-tabs" role="group" aria-label="Result view">
    <button type="button" className="soft" aria-pressed={view==='pivot'} onClick={()=>setView('pivot')}>Pivot table</button>
    <button type="button" className="soft" aria-pressed={view==='chart'} onClick={()=>setView('chart')}>Chart</button>
   </div>
   {view==='pivot'?<div className="kobo-shell assistant-result-pivot">
    <KoboPivotTable result={result} limit={result.rows.length} language="en" copyable display={display}
     onDisplayChange={setDisplay} showDisplaySelector/>
   </div>:
    <div ref={chartRegion} className="assistant-result-chart">
     {!chart?<p>No visible answer data to chart. Review the pivot or adjust the analysis settings.</p>:<>
     {chart.single?<figure className="assistant-single-chart" aria-label={`Chart for ${card.title}`}>
      <figcaption><strong>{chart.single.label}</strong><span>{chart.single.count.toLocaleString('en')}{
       chart.single.percent==null?'':` (${formatPercent(chart.single.percent,percentageDecimals(result),'en')})`
      }</span></figcaption>
      <div className="assistant-single-chart-track" aria-hidden="true"><div style={{
       width:`${chart.single.percent==null?100:Math.min(100,Math.max(1,chart.single.percent))}%`,
      }}/></div>
     </figure>:<KoboRendering enabled={false}><KoboChartBoundary><Suspense fallback={<KoboChartSkeleton height={230}/>}>
      <Chart result={chart.result} language="en" inline/>
     </Suspense></KoboChartBoundary></KoboRendering>}
     <div className="assistant-actions">
     <button type="button" className="soft" disabled={copying} onClick={async()=>{
      setCopying(true);
      try{await clipboard.copyAction(()=>copyKoboChartImage(chart.result,'en'),'Chart image copied');}
      finally{setCopying(false);}
     }}><Copy aria-hidden="true"/> {copying?'Copying image…':'Copy chart image'}</button>
     <button type="button" className="soft" onClick={()=>void clipboard.copyAction(
      ()=>import('./KoboChart').then(module=>module.downloadKoboPng(chart.result,'en')),'Chart PNG downloaded'
     )}>Chart PNG</button>
     </div>
     {clipboard.notification}
     </>}
    </div>}
  </>:<p>{card.message}</p>}
  <details className="assistant-result-details"><summary>Show calculation</summary>
   <p>{analysisSourceNote(card)}</p>
   <button type="button" className="soft" onClick={onSource}>Open source pivot in Analysis</button>
   {result&&<>
    <p>{result.kind==='multiple'?'Numerators count selections per answer.':'Numerators are the counts in the pivot.'}
     {' '}{result.percentageMode==='legacy-respondents'&&!card.hiddenRows&&!card.hiddenColumns
      ?`The overall percentage denominator is ${(result.respondentBasis?.denominator??result.denominator).toLocaleString('en')}.`
      :'The percentage definition above identifies the base used for each count.'}</p>
    {!card.hiddenRows&&!card.hiddenColumns&&<p>Missing answers: {result.missing.toLocaleString('en')}.</p>}
    {!!result.breakdowns.length&&<ul>{result.breakdowns.map(group=><li key={group.id}>{group.label}: {group.denominator.toLocaleString('en')} answered</li>)}</ul>}
   </>}
  </details>
  {!!checks.length&&<details className="assistant-result-details" open={card.recipe?.compare||undefined}><summary>Comparison checks</summary>
   <ul>{checks.map(check=><li key={check}>{check}</li>)}</ul>
  </details>}
  <details className="assistant-result-details"><summary>Explain unexpected results</summary>
   <ul>{resultDiagnostics(card).map(note=><li key={note}>{note}</li>)}</ul>
   {!!card.diagnosticChoices?.length&&<div className="assistant-result-control">
    <label>Check an expected answer<input value={expectedOption} onChange={event=>setExpectedOption(event.target.value)} placeholder="Enter an answer label or code"/></label>
   </div>}
   {expectedOption.trim()&&<p aria-live="polite">{diagnoseOption(card,expectedOption)}</p>}
  </details>
  <div className="assistant-actions assistant-result-actions" role="group" aria-label="Pivot actions">
   {!card.period&&card.privacyWithheld&&card.grouped&&<button type="button" className="soft assistant-result-accent" disabled={busy} onClick={onOverall}>
    <ChartNoAxesColumn aria-hidden="true"/> Try overall result
   </button>}
   {!card.period&&(!!result||card.privacyWithheld&&card.grouped)&&!!breakdowns.length&&<>
    <button type="button" className="soft assistant-result-accent" disabled={busy} aria-expanded={action==='breakdown'} onClick={()=>{
     setAction(action==='breakdown'?undefined:'breakdown');setSelection(card.requestedBreakdown||'');
    }}><Layers aria-hidden="true"/>{card.grouped?'Change breakdown':'Add breakdown'}</button>
    {!!result&&<button type="button" className="soft assistant-result-accent" disabled={busy} aria-expanded={action==='compare'} onClick={()=>{
     setAction(action==='compare'?undefined:'compare');setSelection(card.requestedBreakdown||result.breakdownFields?.[0]?.id||'');
    }}><ChartNoAxesColumn aria-hidden="true"/>Compare groups</button>}
   </>}
   {!card.period&&canEditAnswers&&!!hideableRows.length&&<button type="button" className="soft" disabled={busy} aria-expanded={action==='hide'} onClick={()=>{
    setAction(action==='hide'?undefined:'hide');setSelection('');
   }}><EyeOff aria-hidden="true"/>Hide answer</button>}
   {!!card.chatHiddenAnswers?.length&&<button type="button" className="soft" disabled={busy} onClick={()=>onHide([])}><Eye aria-hidden="true"/>Restore chat-hidden answers</button>}
   {canEditAnswers&&!!result&&<button type="button" className="soft" disabled={busy} onClick={onMerge}><GitMerge aria-hidden="true"/> Merge answers</button>}
   {(result||card.privacyWithheld||card.hiddenRows||card.hiddenColumns)&&<button type="button" className="soft" onClick={()=>onOpen(card.field)}><ExternalLink aria-hidden="true"/> Review in Analysis</button>}
  </div>
  {result&&card.recipe&&<div className="assistant-actions" role="group" aria-label="Save and report actions">
    <button type="button" className="soft" aria-expanded={saveOpen} disabled={busy} onClick={()=>{setSaveOpen(!saveOpen);setSaveName(card.title.slice(0,180));}}>Save analysis</button>
    <button type="button" className="soft" disabled={busy||!result.rows.length||view==='chart'&&!chart} onClick={()=>onReport(view)}>Add {view==='pivot'?'pivot':'chart'} to report</button>
    <button type="button" className="soft" disabled={busy||!result.rows.length} onClick={onFinding}>Add finding to report</button>
  </div>}
  {saveOpen&&<div className="assistant-result-control"><label>Analysis name<input value={saveName} maxLength={180} onChange={event=>setSaveName(event.target.value)}/></label>
   <button type="button" className="primary" disabled={busy||!saveName.trim()} onClick={()=>{onSave(saveName.trim());setSaveOpen(false);}}>Save</button>
  </div>}
  {action&&<div className="assistant-result-control">
   <label>{action==='hide'?'Answer to hide':'Group by'}
    <select value={selection} disabled={busy} onChange={event=>setSelection(event.target.value)}>
     <option value="">{action==='hide'?'Choose an answer':'Choose a field'}</option>
     {(action==='hide'?hideableRows:breakdowns).map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
   </label>
   <button type="button" className="primary" disabled={busy||!selection} onClick={()=>{
    if(action==='hide'){
     const row=hideableRows.find(row=>row.id===selection);
     if(!row)return;
     onHide([...(card.chatHiddenAnswers||[]),row.id],row.label);
    }else onGroup(selection,action==='compare');
    setAction(undefined);
   }}>{action==='hide'?'Hide in chat':action==='compare'?'Compare':'Apply breakdown'}</button>
  </div>}
 </section>;
}
