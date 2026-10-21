import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {ChartColumn,Filter,Languages,Layers,Search,Table2} from 'lucide-react';
import {koboApi} from './koboApi';
import {KoboRendering} from './KoboRendering';
import KoboPivotTable from './KoboPivotTable';
import {viewSignature} from './koboSavedViewState';
import {matchingViewAnalysis,previewFilters,sampleViewResults,settingsForViewPreview,viewOrderLabels,viewQuestionSetup} from './koboViewPreviewModel';
import type {KoboAnalysis,KoboProject,KoboResult,KoboSettings} from './koboTypes';
import type {KoboViewSnapshot} from './koboSavedViewTypes';
import './koboViewPreview.css';

const Chart=lazy(()=>import('./KoboChart'));
function SampleCard({result,snapshot}:{result:KoboResult;snapshot:KoboViewSnapshot}){
 const[tab,setTab]=useState<'chart'|'pivot'>(snapshot.viewMode==='table'?'pivot':'chart');
 return <article className="kobo-view-sample-card"><header><div><h5 dir="auto">{result.label}</h5><p>{result.denominator} answered · {result.missing} missing · {result.total} eligible records</p></div>{snapshot.viewMode!=='table'&&<div role="group" aria-label={`Preview display for ${result.name}`}><button type="button" className="soft" aria-pressed={tab==='chart'} onClick={()=>setTab('chart')}>Chart</button><button type="button" className="soft" aria-pressed={tab==='pivot'} onClick={()=>setTab('pivot')}>Pivot</button></div>}</header>{tab==='chart'&&snapshot.viewMode!=='table'?<Suspense fallback={<p role="status">Loading chart...</p>}><Chart result={result} language={snapshot.language}/></Suspense>:<><KoboPivotTable result={result} language={snapshot.language} limit={10} display={snapshot.questions[result.id]?.breakdownDisplay||'both'} showCopyButton={false}/>{result.rows.length>10&&<p className="kobo-view-sample-limit">Showing 10 of {result.rows.length} answer rows. Totals include all answers.</p>}</>}</article>;
}

export default function KoboViewPreview({project,settings,snapshot,title,analysis,issues=[]}:{project:KoboProject;settings:KoboSettings;snapshot:KoboViewSnapshot;title:string;analysis?:KoboAnalysis;issues?:string[]}){
 const[query,setQuery]=useState(''),[open,setOpen]=useState(false),[loaded,setLoaded]=useState<{key:string;data:KoboAnalysis}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const signature=viewSignature(snapshot),key=JSON.stringify([project.id,signature]),matched=matchingViewAnalysis(analysis,snapshot),issueKey=JSON.stringify(issues),t=(en:string,ar:string)=>snapshot.language==='ar'?ar:en;
 const setup=useMemo(()=>viewQuestionSetup(project,snapshot),[project.form,signature]),filters=useMemo(()=>previewFilters(project,snapshot),[project.form,signature]);
 const enabled=setup.filter(q=>q.enabled).length,hidden=setup.length-enabled;
 const shown=setup.filter(q=>`${q.label} ${q.group} ${q.question.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const grouped=new Map<string,typeof setup>();for(const q of shown){const group=grouped.get(q.group)||[];group.push(q);grouped.set(q.group,group)}
 useEffect(()=>{
  setLoaded(null);setError('');
  if(!open||issues.length||matched){setBusy(false);return}
  const controller=new AbortController();setBusy(true);
  koboApi.analyze(project.id,settingsForViewPreview(settings,snapshot),controller.signal).then(data=>{if(!controller.signal.aborted)setLoaded({key,data})}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:String(reason))}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
  return()=>controller.abort();
 },[open,key,project.form,matched,issueKey,retry]);
 const result=matched||(loaded?.key===key?loaded.data:null),samples=result?sampleViewResults(project,snapshot,result):[];
 return <section className="kobo-view-preview" aria-label="Analysis setup preview">
  <header className="kobo-view-preview-heading"><span className="eyebrow">{t('VIEW PREVIEW','معاينة العرض')}</span><h4 dir="auto">{title.trim()||t('Current analysis','التحليل الحالي')}</h4><p>{t('Results recalculate using the latest uploaded data.','تُعاد حساب النتائج باستخدام أحدث البيانات المرفوعة.')}</p></header>
  <div className="kobo-view-preview-cards"><div><Filter/><strong>{snapshot.filters.length}</strong><span>{t('Active filters','فلاتر نشطة')}</span></div><div><Layers/><strong>{enabled}</strong><span>{t('Questions enabled','أسئلة مفعلة')} · {hidden} {t('hidden','مخفية')}</span></div><div>{snapshot.viewMode==='table'?<Table2/>:<ChartColumn/>}<strong>{snapshot.viewMode==='table'?t('Table','جدول'):t('Charts','رسوم بيانية')}</strong><span>{t('Analysis layout','تنسيق التحليل')}</span></div></div>
  <div className="kobo-view-preview-badges"><span><Languages/>{snapshot.language==='ar'?'العربية':'English'}</span><span>{viewOrderLabels[snapshot.questionSort]}</span></div>
  <section className="kobo-view-preview-filters"><h5>{t('Filter scope','نطاق الفلاتر')}</h5>{!filters.length?<p>{t('All responses - no active filters','جميع الاستجابات - لا توجد فلاتر نشطة')}</p>:filters.map((f,i)=><div key={i}><strong dir="auto">{f.label}</strong><div>{f.values.map((value,index)=><span dir="auto" title={value} key={index}>{value}</span>)}</div></div>)}</section>
  <details className="kobo-view-preview-questions"><summary>{t('Question setup','إعداد الأسئلة')} <span>{enabled} {t('enabled','مفعلة')} · {hidden} {t('hidden','مخفية')}</span></summary><label className="kobo-view-preview-search"><Search/><input aria-label="Search preview questions" placeholder="Search questions or groups" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="kobo-view-question-groups">{[...grouped].map(([group,questions])=><section key={group}><h5 dir="auto">{group}</h5>{questions.map(q=><article key={q.question.id} className={q.enabled?'':'is-hidden'}><div><strong dir="auto">{q.label}</strong><span className="kobo-view-question-status">{q.enabled?t('Enabled','مفعل'):t('Hidden','مخفي')}</span></div><p>{q.chart} · {t('Pivot values','قيم الجدول')}: {q.display} · {q.metric}</p>{q.breakdowns.length>0&&<p dir="auto">Breakdowns: {q.breakdowns.join(' / ')}</p>}{q.trend&&<p dir="auto">Date trend: {q.trend}</p>}</article>)}</section>)}{!shown.length&&<p>No questions match your search.</p>}</div></details>
  <details className="kobo-view-preview-display"><summary>{t('Display settings','إعدادات العرض')}</summary><dl>{[['Metadata questions',snapshot.metadata?'Shown':'Hidden'],['Blank answers',snapshot.hideBlanks?'Hidden':'Shown'],['Zero-count answers',snapshot.hideZero?'Hidden':'Shown'],['Questions with no answers',snapshot.hideEmpty?'Hidden':'Shown'],['Percentage precision',`${snapshot.percentageDecimals??0} decimal places`]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
  <details className="kobo-view-preview-sample" onToggle={event=>setOpen(event.currentTarget.open)}><summary>{t('Sample question results','عينة من نتائج الأسئلة')}<span>{t('Showing up to 3 question results','عرض ما يصل إلى 3 نتائج أسئلة')}</span></summary>{open&&<div className="kobo-view-sample-body">{issues.length?<p role="status">Correct this saved view before loading its sample results.</p>:busy?<p role="status">Loading sample results...</p>:error?<div role="alert"><p>{error}</p><button type="button" className="soft" onClick={()=>setRetry(v=>v+1)}>Retry preview</button><p>You can still save a valid setup without loading its sample.</p></div>:result?<>{samples.length?<KoboRendering enabled={false}>{samples.map(sample=><SampleCard key={key+sample.id} result={sample} snapshot={snapshot}/>)}</KoboRendering>:<p role="status">{!result.filtered?'No responses match these filters.':'No eligible question results are available for this sample.'}</p>}<p className="kobo-view-sample-note">Read-only sample using the previewed filter scope. Identifying and text questions are excluded. Preview display changes do not change the setup.</p></>:null}</div>}</details>
 </section>;
}
