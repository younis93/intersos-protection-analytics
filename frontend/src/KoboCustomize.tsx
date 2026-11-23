import {percentageBasisChange} from './koboPercentageSettings';
import KoboTitleFormatting from './KoboTitleFormatting';
import {ruleIssue} from './koboConnectionHealth';
import {KoboConnectionControls} from './KoboConnections';
import {hasPercentageConnection} from './KoboHiddenAnswerControls';
import {useKoboUnsavedChanges} from './useKoboUnsavedChanges';
import KoboAppearanceControls from './KoboAppearanceControls';
import {readableKoboChartType} from './koboChartDensity';
import KoboSettingsSelect from './KoboSettingsSelect';
import ColorControl from './KoboColorControl';
import {lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {BarChart3,ChartColumn,ChartLine,ChevronDown,Palette,PieChart,RotateCcw,SlidersHorizontal,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {koboApi} from './koboApi';
import {koboLabel,type KoboProject,type KoboQuestionSettings,type KoboResult,type KoboSettings} from './koboTypes';
import {calculationKey,colorEntries,customizeDraft,defaultKoboColor,koboPalettes,resolveKoboColors} from './koboCustomizeOptions';
import {supportsAllBarsColor} from './koboMarkColors';
import {KoboRendering} from './KoboRendering';
import KoboPivotTable from './KoboPivotTable';
import {resultWithPivotColumns} from './koboPivotSort';
import KoboQuestionExport from './KoboQuestionExport';
import KoboAnswerShare from './KoboAnswerShare';
import {AnswerFilterPicker} from './KoboFilterByAnswer';
import {answerFilterSettings} from './koboQuestionFilterState';
import KoboValueSelector from './KoboValueSelector';
import {withValueDisplay} from './koboValueDisplay';
import {useKoboCopy} from './koboClipboard';
import {startKoboExport} from './koboExportManager';
import './koboCustomize.css';

const Chart=lazy(()=>import('./KoboChart'));
type Section='values'|'chart'|'appearance'|'breakdowns'|'colors';
export default function KoboCustomize({result,project,settings,onApply,onClose,onExcel}:{result:KoboResult;project:KoboProject;settings:KoboSettings;onApply:(draft:KoboQuestionSettings)=>void;onClose:()=>void;onExcel:(settings:KoboSettings)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),chartHost=useRef<HTMLDivElement>(null),base=useRef(settings),initial=useRef(customizeDraft(result,settings)),original=useRef(result);
 const clipboard=useKoboCopy();
 const[exportError,setExportError]=useState('');
 const[draft,setDraft]=useState(()=>initial.current),[section,setSection]=useState<Section>(result.connectionEditor?'values':'appearance'),[mobilePane,setMobilePane]=useState<'settings'|'preview'>('settings');
 const refreshInitial=useRef(!!(initial.current.answerFilters?.length||result.answerFilterSummary));
 const[preview,setPreview]=useState(()=>({key:refreshInitial.current?'':calculationKey(initial.current),result})),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const[colorLimit,setColorLimit]=useState(20),[selectedPalette,setSelectedPalette]=useState(initial.current.palette||'');
 const[customTopN,setCustomTopN]=useState(()=>!!initial.current.chartTopN&&![5,10,20].includes(initial.current.chartTopN));
 const[answerFilterOpen,setAnswerFilterOpen]=useState(()=>!!initial.current.answerFilters?.length);
 const answerBasis=answerFilterOpen&&(!draft.calculation||draft.calculation.operation==='count');
 const key=calculationKey(draft),initialKey=calculationKey(initial.current),pending=busy||preview.key!==key;
 const draftSettings=()=>({...base.current,questions:{...base.current.questions,[result.id]:draft}});
 const patch=(change:Partial<KoboQuestionSettings>)=>setDraft(current=>({...current,...change,...(change.answerSort!==undefined&&change.answerSort!==current.answerSort?{pivotSort:null}:{}),...(change.breakdowns!==undefined?{pointColors:{}}:{})}));
 const changeCalculation=(operation:NonNullable<KoboQuestionSettings['calculation']>['operation'])=>{
  const field=project.form.questions.find(field=>field.id===draft.calculation?.field);
  const compatible=field&&field.kind!=='multiple'&&(operation==='unique'||field.kind==='number');
  if(operation!=='count')setAnswerFilterOpen(false);
  patch({...(operation!=='count'?{answerFilters:[],percentageBase:'question' as const,percentageParent:'',connectedPercentageMode:null}:{}),...((operation!=='count'&&draft.percentageMode==='visible-selections'||operation==='sum'&&(!draft.percentageMode||draft.percentageMode==='legacy-respondents'))?{percentageMode:'grand-total' as const}:{}),calculation:operation==='count'?null:{operation,field:compatible?field.id:'',decimals:operation==='unique'?0:draft.calculation?.operation==='unique'?2:draft.calculation?.decimals??2},...(operation!=='count'&&['pie','donut','histogram'].includes(draft.chart||'')?{chart:'bar' as const}:{})});
 };

 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close()},[]);
 useEffect(()=>{
  if(key===initialKey&&!refreshInitial.current){setPreview({key,result:original.current});setBusy(false);setError('');return}
  const controller=new AbortController();setBusy(true);setError('');
  const timer=setTimeout(()=>{
   void koboApi.previewQuestion(project.id,draftSettings(),result.id,controller.signal).then(value=>{if(!controller.signal.aborted)setPreview({key,result:value})}).catch(issue=>{if(!controller.signal.aborted)setError(issue instanceof Error?issue.message:String(issue))}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[key,initialKey,project.id,result.id,retry]);
 const shown=useMemo(()=>{
  const chart=preview.result.answerFilterSummary?preview.result.chart:draft.chart||preview.result.chart;
  const appearance=draft.appearance;
  const colors=resolveKoboColors({...preview.result,chart,appearance},draft.palette,draft.colors);
  return resultWithPivotColumns({...preview.result,chart,appearance,colors,pointColors:draft.pointColors||{},breakdownDisplay:draft.breakdownDisplay},draft,settings.language);
 },[preview.result,draft,settings.language]);
 const breakdowns=draft.breakdowns||[];
 const answerSources=project.form.questions.filter(question=>question.repeat===result.repeat&&['category','multiple'].includes(question.kind)&&question.choices.length);
 const shareQuestion=answerSources.find(question=>question.id===draft.answerShareQuestion);
 const canStack=!answerBasis&&breakdowns.length===1&&['bar','column'].includes(draft.chart||'')&&
  (!draft.calculation||draft.calculation.operation==='count')&&!!(shareQuestion||answerSources.find(question=>question.id===result.id));
 const tableValuesAvailable=!shown.measure||shown.measure.operation==='sum'&&shown.percentageMode!=='legacy-respondents';
 const fields=useMemo(()=>project.form.questions.filter(question=>['category','text'].includes(question.kind)&&(!question.repeat||question.repeat===result.repeat)),[project.form.questions,result.repeat]);
 const dateFields=project.form.questions.filter(field=>field.kind==='date'&&!field.identifying&&(!field.repeat||field.repeat===result.repeat||result.repeat.startsWith(field.repeat+'/')));
 const types=[{id:'bar',label:'Bar',Icon:BarChart3,reason:''},{id:'column',label:'Column',Icon:ChartColumn,reason:''},{id:'line',label:'Line',Icon:ChartLine,reason:result.kind==='text'?'Use a category, multiple-choice, number or date question.':''},{id:'histogram',label:'Histogram',Icon:ChartColumn,reason:result.kind!=='number'?'Requires a numeric question.':''},{id:'heatmap',label:'Heatmap',Icon:SlidersHorizontal,reason:!breakdowns.length?'Add at least one breakdown.':''},{id:'pie',label:'Pie',Icon:PieChart,reason:breakdowns.length||['number','date'].includes(result.kind)?'Requires categorical answers without breakdowns.':''},{id:'donut',label:'Donut',Icon:PieChart,reason:breakdowns.length||['number','date'].includes(result.kind)?'Requires categorical answers without breakdowns.':''}];
 const calculated=!!draft.calculation&&draft.calculation.operation!=='count';
 const trendSource=draft.chart==='line'&&['category','multiple','number'].includes(result.kind);
 const usingDateField=trendSource&&!!draft.trendDateField;
 const canRank=result.kind!=='date'&&!usingDateField&&draft.chart!=='histogram'&&(result.kind!=='number'||draft.numericMode==='values');
 const supportsOther=!draft.calculation||['count','sum'].includes(draft.calculation.operation);
 const chartTypes=types.map(type=>({...type,reason:type.reason||(answerBasis&&['pie','donut'].includes(type.id)?'This percentage uses a fixed response base. Choose a bar, column or line chart.':'')||(calculated&&['pie','donut','histogram'].includes(type.id)?'Unavailable with calculated values.':'')}));
 const orderedTypes=[...chartTypes.filter(type=>!type.reason),...chartTypes.filter(type=>type.reason)];
 const entries=colorEntries(shown),palette=koboPalettes.find(value=>value.name===selectedPalette);
 const supportsSingleColor=!shown.answerStack&&supportsAllBarsColor(shown.chart),allBarsColor=supportsSingleColor?draft.allBarsColor:null;
 const firstColorId=entries[0]?.id||'series';
 const suggestedBarsColor=shown.colors[firstColorId]||defaultKoboColor(shown,firstColorId);
 const changeBreakdown=(index:number,value:string)=>{
  const next=[...breakdowns];if(value)next[index]=value;else next.splice(index,1);
  patch({breakdown:'',breakdowns:next.filter(Boolean),pivotColumnSort:null,hiddenPivotColumns:[],...((next.some(Boolean)&&['pie','donut'].includes(draft.chart||''))||(!next.some(Boolean)&&draft.chart==='heatmap')?{chart:'bar' as const}:{})});
 };
 const dirty=JSON.stringify(draft)!==JSON.stringify(initial.current);
 const invalidBase=!!shown.respondentBasis?.issue||(draft.connectionSource==='manual'&&(!draft.connectionRules||!!ruleIssue(draft.connectionRules,project.form.questions.filter(q=>q.id!==result.id&&(!q.repeat||q.repeat===result.repeat||result.repeat.startsWith(q.repeat+'/'))))));
 const invalid=invalidBase;
 const apply=()=>{if(!pending&&!error&&!invalid&&dirty)onApply(draft)};
 const text=(en:string,ar:string)=>settings.language==='ar'?ar:en;
 const invalidReason=text('Complete the connection conditions and select a valid percentage base.','أكمل شروط الارتباط واختر قاعدة نسبة صالحة.');
 const calculationHints:Record<string,string>={count:text('Counts responses for each answer.','يحسب الاستجابات لكل إجابة.'),sum:text('Adds values from the selected column.','يجمع قيم العمود المحدد.'),average:text('Shows the average of values in the selected column.','يعرض متوسط قيم العمود المحدد.'),median:text('Shows the middle value in the selected column.','يعرض القيمة الوسطى في العمود المحدد.'),unique:text('Counts distinct nonblank values in the selected column. Text matching ignores letter case.','يحسب القيم الفريدة غير الفارغة في العمود المحدد. لا تميز مطابقة النص حالة الأحرف.')};
 const calculationHint=calculationHints[draft.calculation?.operation||'count'];
 useEffect(()=>{if(result.connectionEditor&&section==='values'){const frame=requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>('[data-connection-section]')?.scrollIntoView({block:'start'}));return()=>cancelAnimationFrame(frame)}},[result.connectionEditor,section]);
 const {requestClose,confirmation}=useKoboUnsavedChanges({dirty,canSave:dirty&&!pending&&!error&&!invalid,onSave:apply,onClose,reason:invalid?invalidReason:pending?'Wait for the preview to finish updating.':error?'Resolve the preview error before saving.':''});
 return <><dialog ref={dialog} className="kobo-dialog glass kobo-customize" aria-label={`Customize ${result.name}`} dir="ltr" onCancel={event=>{event.preventDefault();requestClose()}}>
  <header>
   <div>
    <span className="eyebrow">CUSTOMIZE QUESTION · {result.name}</span><h2 dir="auto">{result.label}</h2><p>Answered: <strong>{shown.denominator}</strong> · Missing: {shown.missing} · Changes stay in preview until applied.</p>
   </div>
   <button type="button" className="soft" aria-label="Close customization" onClick={requestClose}><X/></button>
  </header>
  <div className="kobo-customize-mobile-tabs" role="tablist" aria-label="Customization view">{(['settings','preview'] as const).map(pane=><button type="button" role="tab" id={`kobo-customize-${pane}-tab`} aria-controls={`kobo-customize-${pane}`} aria-selected={mobilePane===pane} tabIndex={mobilePane===pane?0:-1} key={pane} onClick={()=>setMobilePane(pane)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'settings':event.key==='End'?'preview':pane==='settings'?'preview':'settings';setMobilePane(next);document.getElementById(`kobo-customize-${next}-tab`)?.focus()}}}>{pane==='settings'?'Settings':'Preview'}</button>)}</div>
  <div className={`kobo-customize-body pane-${mobilePane}`}>
   <section id="kobo-customize-settings" className="kobo-customize-settings" aria-label="Question settings">
    <nav className="kobo-customize-tabs" aria-label="Customize sections">{([{id:'values',label:text('Values & connections','القيم والارتباطات'),Icon:SlidersHorizontal},{id:'chart',label:'Chart',Icon:BarChart3},{id:'appearance',label:'Appearance',Icon:SlidersHorizontal},{id:'breakdowns',label:'Breakdowns',Icon:SlidersHorizontal},{id:'colors',label:'Colors',Icon:Palette}] as const).map(tab=><button type="button" key={tab.id} aria-pressed={section===tab.id} onClick={()=>setSection(tab.id)}><tab.Icon aria-hidden="true"/>{tab.label}</button>)}</nav>
    <div hidden={section!=='values'} className="kobo-customize-section kobo-values-section" dir={settings.language==='ar'?'rtl':'ltr'}><h3>{text('Values, calculations & connections','القيم والحسابات والارتباطات')}</h3>
     <section className="kobo-values-card" aria-label={text('Percentages','النسب المئوية')}><header><h4>{text('Percentages','النسب المئوية')}</h4></header><AppSelect label={text('Percentage basis','قاعدة النسبة')} value={answerBasis?'answer-filter':draft.percentageMode||'legacy-respondents'} disabled={!!draft.calculation&&!['count','sum'].includes(draft.calculation.operation)} options={[...(!draft.calculation||draft.calculation.operation==='count'?[['answer-filter',text('% matching selected answers','نسبة مطابقة الإجابات المحددة')] as [string,string]]:[]),["grand-total",text("% of Grand Total","٪ من الإجمالي العام")],["column-total",text("% of Column Total","٪ من إجمالي العمود")],["row-total",text("% of Row Total","٪ من إجمالي الصف")],["breakdown-group",text("% within breakdown group","٪ ضمن مجموعة التقسيم")],["legacy-respondents",text("% of Respondents","٪ من المستجيبين")],...(draft.percentageMode==='visible-selections'||(!draft.calculation||draft.calculation.operation==='count')&&hasPercentageConnection(result,draft)&&['category','multiple','text'].includes(result.kind)?[["visible-selections",draft.additiveAnswerScope==='all'?text("% of all selections","٪ من جميع الاختيارات"):text("% of visible selections","٪ من الاختيارات الظاهرة")] as [string,string]]:[])]} onChange={value=>{
       setAnswerFilterOpen(value==='answer-filter');
       if(value!=='answer-filter')patch({...percentageBasisChange(value as NonNullable<KoboQuestionSettings['percentageMode']>),answerFilters:[]});
      }}/>{!answerBasis&&draft.percentageMode==='breakdown-group'&&<><AppSelect label={text('Percentage group level','مستوى مجموعة النسبة')} value={String(draft.percentageGroupLevel||1)} options={Array.from({length:Math.max(1,breakdowns.length)},(_,i)=>[String(i+1),`Level ${i+1}${project.form.questions.find(q=>q.id===breakdowns[i])?' - '+koboLabel(project.form.questions.find(q=>q.id===breakdowns[i])!,settings.language):''}`] as [string,string])} onChange={value=>patch({percentageGroupLevel:Number(value)})}/><p>{text('Each group at the selected breakdown level totals 100%. Without breakdowns, Grand Total applies.','يبلغ مجموع كل مجموعة في مستوى التقسيم المحدد 100٪. بدون تقسيم، يُستخدم الإجمالي العام.')}</p></>}<p>{answerBasis?text('Uses eligible responses before the selected answers are applied.','يستخدم الاستجابات المؤهلة قبل تطبيق الإجابات المحددة.'):draft.calculation&&!['count','sum'].includes(draft.calculation.operation)?text('Percentages are available with Count or Sum.','النسب المئوية متاحة مع العدد أو المجموع.'):draft.percentageMode==='legacy-respondents'?text('Percentages use the number of respondents who answered this question.','تستخدم النسب عدد المستجيبين الذين أجابوا عن هذا السؤال.'):draft.percentageMode==='visible-selections'&&draft.additiveAnswerScope==='all'?text('Each answer uses the total selections, including hidden answers.','تُحسب كل إجابة كنسبة من جميع الاختيارات بما فيها المخفية.'):draft.percentageMode==='visible-selections'?text('Each visible answer is divided by the total number of visible selections.','يُقسم عدد اختيارات كل إجابة ظاهرة على إجمالي الاختيارات الظاهرة.'):text('Percentages use answer selections. Multiple-choice responses can contribute to several answers.','تستخدم النسب اختيارات الإجابات. يمكن أن تساهم الاستجابة متعددة الاختيارات في عدة إجابات.')}</p>{answerBasis&&<AnswerFilterPicker settings={draft} project={project} language={settings.language} repeat={result.repeat}
      onChange={(rules,moved)=>setDraft(current=>answerFilterSettings(current,rules,moved))}/>}
      {answerBasis&&!!draft.answerFilters?.length&&<div aria-live="polite">
       {error?<p>{text('Percentage preview unavailable.','معاينة النسبة المئوية غير متاحة.')} <button className="soft" type="button"
        onClick={()=>setRetry(current=>current+1)}>{text('Retry','إعادة المحاولة')}</button></p>:
        pending?<p>{text('Updating percentage…','جارٍ تحديث النسبة المئوية…')}</p>:<KoboAnswerShare result={shown} language={settings.language}/>}
      </div>}
     </section>
     <KoboConnectionControls section="percentages" result={shown} project={project} value={draft} language={settings.language} onChange={patch}/>
     {!answerBasis&&draft.answerShareQuestion&&draft.answerShareAnswer&&<section className="kobo-values-card" aria-label={text('Selected answer percentage','نسبة الإجابة المختارة')}>
      <header><h4>{text('Selected answer percentage','نسبة الإجابة المختارة')}</h4></header>
      <button type="button" className="soft" onClick={()=>patch({answerShareAnswer:'',...(!draft.answerStackMode?{answerShareQuestion:''}:{})})}>
       {text('Clear percentage summary','مسح ملخص النسبة')}
      </button>
     </section>}
     <section className="kobo-values-card" aria-label={text('Calculation','الحساب')}><header><h4>{text('Calculation','الحساب')}</h4></header><AppSelect label={text('Calculation','الحساب')} value={draft.calculation?.operation||'count'} options={[["count",text("Count","العدد")],["unique",text("Unique count","العدد الفريد")],["sum",text("Sum","المجموع")],["average",text("Average","المتوسط")],["median",text("Median","الوسيط")]]} onChange={operation=>changeCalculation(operation as NonNullable<KoboQuestionSettings['calculation']>['operation'])}/>{draft.calculation&&draft.calculation.operation!=='count'&&<><AppSelect label={text('Value column','عمود القيمة')} searchable value={draft.calculation.field} options={[["",text("Choose a value column","اختر عمود القيمة")],...project.form.questions.filter(field=>field.kind!=='multiple'&&(draft.calculation!.operation==='unique'||field.kind==='number')&&(!field.repeat||field.repeat===result.repeat||result.repeat.startsWith(field.repeat+'/'))).map(field=>[field.id,koboLabel(field,settings.language)] as [string,string])]} onChange={field=>patch({calculation:{...draft.calculation!,field}})}/><label className="kobo-field">{text('Decimal places','المنازل العشرية')}<input aria-label={text('Calculation decimal places','المنازل العشرية للحساب')} type="number" min={0} max={6} value={draft.calculation.decimals} disabled={draft.calculation.operation==='unique'} onChange={event=>patch({calculation:{...draft.calculation!,decimals:Math.max(0,Math.min(6,Number(event.target.value)||0))}})}/></label><p className="kobo-values-hint">{text('Blank values are excluded. Click a result to inspect its contributing records.','تُستبعد القيم الفارغة. انقر على النتيجة للاطلاع على السجلات المساهمة.')}</p></>}<p className="kobo-values-hint">{calculationHint}</p></section>
     <KoboConnectionControls section="connection" result={shown} project={project} value={draft} language={settings.language} onChange={patch}/>
    </div>
    <div hidden={section!=='chart'} className="kobo-customize-section">
     <section className="kobo-setting-group">
      <h3>{text('Chart type','نوع الرسم البياني')}</h3>
      <div className="kobo-chart-types" role="group" aria-label="Chart type">
       {orderedTypes.map(type=><button type="button" key={type.id} aria-pressed={(shown.answerFilterSummary?shown.chart:draft.chart)===type.id} disabled={!!type.reason}
        title={type.reason||type.label} onClick={()=>patch({chart:type.id as KoboQuestionSettings['chart'],...(type.id==='histogram'?{numericMode:'bins' as const}:{})})}>
        <type.Icon aria-hidden="true"/><span>{type.label}</span>{type.reason&&<small>{type.reason}</small>}
       </button>)}
      </div>
      {(canStack||draft.answerStackMode)&&<AppSelect label={text('Bar layout','تخطيط الأعمدة')} preserveOrder
       value={draft.answerStackMode||''} options={[[ '',text('Use appearance settings','استخدم إعدادات المظهر')],['count',text('Stacked bar','أعمدة مكدّسة')],['percent',text('100% stacked bar','أعمدة مكدّسة بنسبة 100٪')]]}
       disabled={!canStack} onChange={mode=>patch({answerStackMode:mode==='count'||mode==='percent'?mode:null})}/>}
      {draft.answerStackMode&&<p>{canStack?text('Each breakdown group gets one bar. Set segment colors in Colors.','يظهر عمود لكل مجموعة تقسيم. اضبط ألوان الأجزاء من تبويب الألوان.'):text('Answer stacks need a bar or column chart, one breakdown, and a choice question.','يتطلب التكديس رسم أعمدة وتقسيماً واحداً وسؤال اختيار.')}</p>}
      {canStack&&draft.answerStackMode==='percent'&&shown.answerStack?.multiple&&<p>{text('Each bar shows the share of selections in that group.','يعرض كل عمود حصة الاختيارات ضمن المجموعة.')}</p>}
     </section>
     {(result.kind==='number'||result.kind==='date'||trendSource)&&<section className="kobo-setting-group">
      <h3>{text('Distribution & time','التوزيع والوقت')}</h3>
      {trendSource&&<>
       <KoboSettingsSelect label="Date field" searchable value={draft.trendDateField||''}
        options={[["",result.kind==='number'?'No date field - numeric distribution':'Choose a date field'],...dateFields.map(field=>[field.id,koboLabel(field,settings.language)] as [string,string])]}
        onChange={value=>patch({trendDateField:value})}/>
       {usingDateField&&<><AppSelect label="Time grouping" preserveOrder value={draft.trendUnit||'month'} options={[["day","Day"],["month","Month"],["year","Year"]]}
        onChange={value=>patch({trendUnit:value as KoboQuestionSettings['trendUnit']})}/>
        <small>Pivot breakdowns stay in the table while the chart shows answers over time.</small></>}
       {!dateFields.length&&<small>No compatible non-identifying date fields are available.</small>}
      </>}
      {result.kind==='number'&&!usingDateField&&<>
       {draft.chart!=='histogram'&&<AppSelect label="Distribution" preserveOrder value={draft.numericMode} options={[["auto","Automatic"],["values","Exact values"],["bins","Equal-width bins"]]}
        onChange={value=>patch({numericMode:value as KoboQuestionSettings['numericMode']})}/>}
       {(draft.chart==='histogram'||draft.numericMode!=='values')&&<label className="kobo-field">Number of bins
        <input aria-label="Number of bins" type="number" min={1} max={100} value={draft.bins}
         onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))patch({bins:Math.max(1,Math.min(100,event.target.valueAsNumber))})}}/>
       </label>}
      </>}
      {result.kind==='date'&&<AppSelect label="Time grouping" preserveOrder value={draft.dateUnit} options={[["day","Day"],["month","Month"],["year","Year"]]}
       onChange={value=>patch({dateUnit:value as KoboQuestionSettings['dateUnit']})}/>}
     </section>}
     <section className="kobo-setting-group">
      <h3>{text('Categories & order','الفئات والترتيب')}</h3>
      <AppSelect label="Answer order" preserveOrder value={draft.answerSort} options={[["form","Form order"],["count-desc","Count high to low"],["count-asc","Count low to high"],["label-asc","Label A-Z"],["label-desc","Label Z-A"]]}
       onChange={value=>patch({answerSort:value as KoboQuestionSettings['answerSort']})}/>
      {canRank?<div className="kobo-chart-categories">
       <label className="kobo-category-toggle">
        <input type="checkbox" checked={!!draft.chartTopN} onChange={event=>patch({chartTopN:event.target.checked?10:null})}/>
        <span><strong>{text('Show Top N','عرض أعلى الفئات')}</strong><small>{text('Limit the chart to the highest-ranking answers.','عرض الإجابات الأعلى ترتيباً في الرسم فقط.')}</small></span>
        <span className="kobo-category-switch" aria-hidden="true"/>
       </label>
       {draft.chartTopN&&<div className="kobo-category-options">
        <AppSelect label="Top N preset" preserveOrder value={!customTopN&&[5,10,20].includes(draft.chartTopN)?String(draft.chartTopN):'custom'}
         options={[["5","Top 5"],["10","Top 10"],["20","Top 20"],["custom","Custom"]]}
         onChange={value=>{setCustomTopN(value==='custom');if(value!=='custom')patch({chartTopN:Number(value)})}}/>
        <label className="kobo-field">Number of categories
         <input aria-label="Number of top chart categories" type="number" min={1} max={1000000} value={draft.chartTopN}
          onChange={event=>{if(Number.isInteger(event.target.valueAsNumber)&&event.target.valueAsNumber>0)patch({chartTopN:Math.min(1000000,event.target.valueAsNumber)})}}/>
        </label>
        {supportsOther&&<label className="kobo-check"><input type="checkbox" checked={!!draft.chartOther} onChange={event=>patch({chartOther:event.target.checked})}/>
         <span>{text('Combine remaining answers as Other','دمج الإجابات المتبقية ضمن أخرى')}</span></label>}
       </div>}
      </div>:<small>Time axes and numeric bins keep their natural order. Answer order can still apply to the table.</small>}
     </section>
    </div>
    <div hidden={section!=='appearance'} className="kobo-customize-section">
     <KoboAppearanceControls showTitle={false} value={draft.appearance} onChange={appearance=>patch({appearance})}
      automaticLegend={breakdowns.length>0||shown.chart==='line'&&(!!shown.trend||usingDateField)||['pie','donut'].includes(readableKoboChartType(shown))}
      chart={shown.chart} breakdowns={breakdowns.length>0} measured={calculated&&draft.calculation?.operation!=='sum'}
      calculated={calculated} legacyMeasure={calculated&&draft.percentageMode==='legacy-respondents'} trend={!!shown.trend||usingDateField}
      typography={<div className="kobo-appearance-control kobo-chart-title-control" dir={settings.language==='ar'?'rtl':'ltr'}>
       <label><span className="kobo-chart-title-label">{text('Chart title','عنوان الرسم البياني')}</span>
        <input type="text" className="kobo-chart-title-input" dir="auto" aria-label={text('Chart title (optional)','عنوان الرسم البياني (اختياري)')} maxLength={200}
         placeholder={text('Enter an optional title','أدخل عنواناً اختيارياً')} value={draft.appearance?.title||''}
         onChange={event=>patch({appearance:{...draft.appearance,title:event.target.value}})}/>
       </label>
       <KoboTitleFormatting value={draft.appearance} language={settings.language} onChange={appearance=>patch({appearance})}/>
      </div>}/>
    </div>
    <div hidden={section!=='breakdowns'} className="kobo-customize-section"><h3>Pivot breakdowns</h3><p>Choose up to three levels. Each level groups columns within the previous one.</p><div className="kobo-customize-breakdowns">{[0,1,2].map(index=><div key={index}><span>{index+1}</span><AppSelect label={`Breakdown ${index+1}`} searchable disabled={index>breakdowns.length} value={breakdowns[index]||''} options={[["",index===0?'No breakdown':'None'],...fields.filter(question=>question.id===breakdowns[index]||!breakdowns.includes(question.id)).map(question=>[question.id,koboLabel(question,settings.language)] as [string,string])]} onChange={value=>changeBreakdown(index,value)}/><button type="button" className="soft" disabled={!breakdowns[index]} aria-label={`Remove breakdown ${index+1}`} onClick={()=>changeBreakdown(index,'')}><X/></button></div>)}</div>
    </div>
    <div hidden={section!=='colors'} className="kobo-customize-section">
     <div className="kobo-color-section-heading"><h3>Suggested palettes</h3>{allBarsColor&&<button type="button" className="soft" disabled={pending} onClick={()=>{patch({allBarsColor:null})}}><RotateCcw aria-hidden="true"/>{text('Restore previous colors','استعادة الألوان السابقة')}</button>}</div>
     <div className="kobo-palette-cards">
      {supportsSingleColor&&<ColorControl entry={{id:'allBarsColor',label:text('All bars','جميع الأعمدة')}} value={allBarsColor||suggestedBarsColor} palette={draft.palette} disabled={pending} paletteCard={{selected:!!allBarsColor}} onChange={value=>patch({allBarsColor:value})}/>}
      {koboPalettes.map(option=><button type="button" key={option.name} disabled={pending} aria-label={`${option.label||option.name} palette`} aria-pressed={!allBarsColor&&selectedPalette===option.name} onClick={()=>{setSelectedPalette(option.name);patch({palette:option.name,colors:{},pointColors:{},...(supportsSingleColor?{allBarsColor:null}:{})})}}><span>{option.label||option.name}</span><small>{option.description}</small><span className="kobo-palette-swatches">{option.colors.slice(0,6).map(color=><i key={color} style={{background:color}}/>)}</span></button>)}
     </div>
     {!allBarsColor&&<>
     {palette&&(!palette.byValue||shown.breakdowns.length>0||shown.chart==='line')&&entries.length>palette.colors.length&&<p>{palette.colors.length===1?'All categories use the same blue; labels identify each category.':`Colors repeat across ${entries.length} categories; labels identify each category.`}</p>}
     <div className="kobo-color-section-heading"><h4>Individual colors</h4><button type="button" className="soft" disabled={pending} onClick={()=>{patch({palette:null,colors:{},pointColors:{}});setSelectedPalette('')}}><RotateCcw/> Reset colors</button></div>
     <div className="kobo-customize-colors">{entries.slice(0,colorLimit).map(entry=><ColorControl key={entry.id} entry={entry} value={shown.colors[entry.id]||defaultKoboColor(shown,entry.id)} palette={draft.palette} disabled={pending} onChange={value=>{setDraft(current=>({...current,colors:{...current.colors,[entry.id]:value}}))}}/>)}</div>{entries.length>colorLimit&&<button type="button" className="soft" onClick={()=>setColorLimit(current=>current+20)}>Show more colors ({entries.length-colorLimit} remaining)</button>}{!entries.length&&<p>No answered categories are available for colors.</p>}
     </>}
    </div>
   </section>
   <section id="kobo-customize-preview" className="kobo-customize-preview" aria-label="Draft preview" aria-busy={pending&&!error}>
    <div className="kobo-preview-heading">
     <div><span className="eyebrow">LIVE PREVIEW</span><h3 dir="auto">{result.label}</h3></div>
     <div className="kobo-preview-actions">
      <span role="status">{error?'Preview unavailable':pending?'Updating preview…':'Preview only'}</span>
      <div className="kobo-preview-export-controls">
       {tableValuesAvailable&&<KoboValueSelector settings={draft} language={settings.language} question={result.name}
        onChange={display=>setDraft(current=>withValueDisplay(current,display))}/>}
      <KoboQuestionExport chartHost={chartHost} result={shown} language={settings.language} colorSettings={draft}
       disabled={pending||!!error||invalid} chartDisabled={!!shown.pivotHasHiddenColumns&&!shown.breakdowns.length}
       pageOnly excelTitle="Pivot Excel" copyAction={clipboard.copyAction}
       onPdf={()=>{startKoboExport({projectId:project.id,projectName:project.name,settings:draftSettings(),format:'pdf',question:result.id})}}
       onExcel={()=>onExcel(draftSettings())} onError={setExportError}/>
      </div>
     </div>
    </div>
    {exportError&&<div className="kobo-preview-error" role="alert"><p>{exportError}</p><button type="button" className="soft" onClick={()=>setExportError('')}>Dismiss export error</button></div>}
    {error&&<div className="kobo-preview-error" role="alert"><p>{error}</p><button type="button" className="soft" onClick={()=>setRetry(current=>current+1)}>Retry preview</button></div>}
    {shown?.chart==='line'&&shown.trend?.periods.length===1&&shown.trend.unit!=='day'&&!pending&&!error&&<button type="button" className="soft" onClick={()=>patch({trendUnit:'day'})}>{settings.language==='ar'?'التجميع حسب اليوم':'Group by day'}</button>}
    {!pending&&!error&&<div className={section==='values'&&answerBasis?'kobo-preview-share-in-settings':undefined}><KoboAnswerShare result={shown} language={settings.language}/></div>}
    <KoboRendering enabled={false}><div ref={chartHost} className="kobo-customize-preview-chart"><Suspense fallback={<p role="status">Loading preview…</p>}><Chart result={shown} language={settings.language} colorSettings={draft}/></Suspense></div></KoboRendering>
    <details className="kobo-customize-table" open><summary>Table preview <ChevronDown aria-hidden="true"/></summary>
     <KoboPivotTable showCopyButton={false} result={shown} language={settings.language} limit={30} display={draft.breakdownDisplay||'both'}/>{shown.rows.length>30&&<p>First 30 answers shown. Totals include every answer.</p>}
    </details>
   </section>
  </div>
  <footer className="kobo-dialog-actions"><p role="status">{invalid?invalidReason:error?'Resolve the preview error before applying.':pending?'Updating question preview…':dirty?'Changes have not been applied.':'Your current question settings.'}</p><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={requestClose}>Cancel</button><button type="button" className="primary" disabled={!dirty||pending||!!error||invalid} onClick={apply}>Apply changes</button></div></footer>
  {clipboard.notification}
 </dialog>{confirmation}</>;
}
