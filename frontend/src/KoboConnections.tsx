import {connectionMessage,conditionSummary,ruleIssue} from './koboConnectionHealth';
import KoboConnectionRuleEditor,{emptyConnectionRule} from './KoboConnectionRuleEditor';
import {KoboHiddenAnswerControls} from './KoboHiddenAnswerControls';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Link2,Link2Off,AlertTriangle,CheckCircle2,Pencil,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {koboLabel,type KoboProject,type KoboQuestionSettings,type KoboResult} from './koboTypes';
import {formatPercent} from './koboPercentages';
import './koboConnections.css';

export function connectionHealth(result:KoboResult,language:'en'|'ar'){
 const ar=language==='ar',details=result.connections,issues=details?.reviewIssues||details?.issues||[],diagnostics=details?.diagnostics||[];
 const count=new Set([...(details?.parents.map(p=>p.id)||[]),...(result.respondentBasis?.parentId?[result.respondentBasis.parentId]:[])]).size;
 const broken=diagnostics.some(d=>d.code!=='unsupported-condition')||issues.some(code=>/missing|unresolved|incomplete|incompatible|invalid/.test(code));
 const status=broken?'broken':issues.length||result.respondentBasis?.issue?'review':count?'connected':'none';
 const label=status==='broken'?(ar?'ارتباط معطّل':'Broken connection'):status==='review'?(ar?'بحاجة إلى مراجعة':'Needs review'):status==='connected'?(ar?'مرتبط':'Connected'):(ar?'لا يوجد ارتباط':'No connection');
 const Icon=status==='broken'?Link2Off:status==='review'?AlertTriangle:status==='connected'?CheckCircle2:Link2;
 return {status,label,Icon,count};
}

export function KoboOriginalConnections({result,language}:{result:KoboResult;language:'en'|'ar'}){
 const details=result.connections,ar=language==='ar',conditions=details?.conditions||[];
 return <section className="kobo-original-connections" aria-label={ar?'الارتباط الأصلي في كوبو':'Original Kobo connection'}><h4>{ar?'الارتباط الأصلي في كوبو':'Original Kobo connection'}</h4>
  {!conditions.length?<p>{ar?'لا يوجد شرط أصلي محفوظ في هذا النموذج المستورد.':'No original condition is stored in this imported form.'}</p>:<>
   {(details?.originalParents||details?.parents||[]).map(parent=><p className="kobo-original-reference" key={parent.id}><strong dir="auto">{parent.label}</strong><code>{parent.name}</code></p>)}
   {details?.unresolvedReferences?.map(item=><p className="kobo-original-missing" key={item.reference}><span>{ar?'سؤال مفقود أو غير محسوم':'Missing or unresolved question'}</span><code dir="ltr">{item.reference}</code></p>)}
   {conditions.map((condition,index)=><div className="kobo-original-condition" key={`${condition.source}:${index}`}><small>{condition.source===result.id?(ar?'شرط السؤال الأصلي':'Original question condition'):(ar?'شرط المجموعة الأصلي':'Original group condition')}</small>{condition.readable&&<p dir="auto">{condition.readable}</p>}<code dir="ltr">{condition.expression}</code>{!condition.supported&&<small className="kobo-original-missing">{ar?'بعض المراجع أو الإجابات مفقودة، أو يحتاج الشرط إلى مراجعة. النص الأصلي محفوظ أعلاه.':'Some references or answers are unavailable, or this condition needs review. The original expression is preserved above.'}</small>}</div>)}
  </>}
  <small>{ar?'يبقى الارتباط الأصلي ظاهراً حتى عند استخدام قواعد تحليل يدوية.':'The original connection remains visible when manual analysis rules are used.'}</small>
 </section>;
}

export function KoboConnectionControls({result,project,value,language,onChange,section='all'}:{section?:'all'|'connection'|'percentages';result:KoboResult;project:KoboProject;value:KoboQuestionSettings;language:'en'|'ar';onChange:(patch:Partial<KoboQuestionSettings>)=>void}){
 const ar=language==='ar',text=(en:string,arabic:string)=>ar?arabic:en,conditions=result.connections?.conditions||[];
 const target=project.form.questions.find(q=>q.id===result.id);
 const fields=project.form.questions.filter(q=>q.id!==result.id&&(!q.repeat||q.repeat===target?.repeat||target?.repeat.startsWith(q.repeat+'/')));
 const source=value.connectionSource||'automatic';
 const references=(node:typeof value.connectionRules):string[]=>!node?[]:node.type==='rule'?[node.field]:node.rules.flatMap(references);
 const connected=new Set(source==='manual'?references(value.connectionRules):result.connections?.parents.map(p=>p.id));
 const parents=fields.filter(q=>connected.has(q.id));
 const selected=value.percentageParent||result.respondentBasis?.parentId||(parents.length===1?parents[0].id:'');
 const mode=value.connectedPercentageMode||(value.percentageBase==='parent'?'keep-original':'adjust');
 const seed=value.connectionRules||result.connections?.effectiveTree;
 const manualTree=seed?.type==='group'?seed:{type:'group' as const,match:'all' as const,rules:seed?[seed]:[emptyConnectionRule()]};
 const measured=!!value.calculation&&value.calculation.operation!=='count';
 const linked=source==='manual'||conditions.length>0||value.percentageBase==='parent';
 const localIssue=source==='manual'?ruleIssue(manualTree,fields):'';
 const health=connectionHealth(result,language),review=source==='automatic'&&!!(result.connections?.reviewIssues?.length||result.connections?.issues.length);
 const summary=source==='manual'?conditionSummary(manualTree,fields,language):result.connections?.effectiveCondition||conditions.map(c=>c.readable||c.expression).join(' AND ');
 const editManual=()=>onChange({connectionSource:'manual',connectionRules:manualTree});
 const StatusIcon=localIssue?AlertTriangle:health.Icon;
 const statusLabel=localIssue?text('Needs review','بحاجة إلى مراجعة'):health.label;
 return <>
 {section!=='percentages'&&<section className="kobo-values-card kobo-connection-settings" data-connection-section dir={ar?'rtl':'ltr'} aria-label={text('Question connection','ارتباط السؤال')}><header><h4>{text('Question connection','ارتباط السؤال')}</h4><span className={`kobo-connection-health is-${localIssue?'review':health.status}`}><StatusIcon aria-hidden="true"/>{statusLabel}</span></header>
 {summary&&<div className="kobo-condition-preview"><strong>{text('Active condition','الشرط النشط')}</strong><p dir="auto">{summary}</p></div>}
 {measured?<p className="kobo-values-hint">{text('Connection conditions and parent percentages are available with Count. Switch the calculation to Count to edit them.','شروط الارتباط ونسب السؤال الأصل متاحة مع العدد. اختر حساب العدد لتعديلها.')}</p>:<>
 <div className="kobo-connection-modes" role="group" aria-label={text('Condition mode','وضع الشروط')}>{(['automatic','manual'] as const).map(mode=><button type="button" key={mode} aria-pressed={source===mode} onClick={()=>onChange({connectionSource:mode,...(mode==='manual'?{connectionRules:manualTree}:{})})}>{mode==='automatic'?text('Detected conditions','الشروط المكتشفة'):text('Manual conditions','شروط يدوية')}</button>)}</div>
 {source==='manual'&&<><KoboConnectionRuleEditor node={manualTree} fields={fields} language={language} onChange={connectionRules=>onChange({connectionRules})}/><p className="kobo-values-hint">{text('Applies to this question in your analysis. The uploaded Kobo form stays unchanged.','يُطبق على هذا السؤال في التحليل. يبقى نموذج كوبو المرفوع دون تغيير.')}</p></>}
 {source==='automatic'&&!conditions.length&&<div className="kobo-connection-empty"><Link2Off aria-hidden="true"/><strong>{text('No connection detected','لم يتم اكتشاف ارتباط')}</strong><p>{text('Connect this question by choosing a question, condition and answer.','اربط هذا السؤال باختيار سؤال وشرط وإجابة.')}</p><button type="button" className="soft" onClick={editManual}><Pencil aria-hidden="true"/>{text('Add manual connection','إضافة ارتباط يدوي')}</button></div>}
 {review&&<div className="kobo-connection-diagnostics" role="status"><p>{text('Review the detected conditions below, or repair them with manual conditions.','راجع الشروط المكتشفة أدناه، أو أصلحها باستخدام شروط يدوية.')}</p>{result.connections?.diagnostics?.map((issue,index)=><p key={index}>{connectionMessage(issue.code,ar)} <code>{issue.field}</code>{issue.value&&<code>{issue.value}</code>}</p>)}<button type="button" className="soft" onClick={editManual}>{text('Repair connection','إصلاح الارتباط')}</button></div>}
 </>}
 {conditions.length>0&&<details className="kobo-original-logic" open={review}><summary>{text('Original Kobo logic','منطق كوبو الأصلي')}</summary><KoboOriginalConnections result={result} language={language}/></details>}
 </section>}
 {section!=='connection'&&linked&&!measured&&<section className="kobo-values-card kobo-connection-percentages" dir={ar?'rtl':'ltr'} aria-label={text('Percentages','النسب المئوية')}><header><h4>{text('Percentages','النسب المئوية')}</h4></header>
  {linked&&!measured&&<><AppSelect label={text('Original base question','سؤال القاعدة الأصلية')} searchable value={selected} options={[["",text('Choose a connected question','اختر سؤالاً مرتبطاً')],...(!parents.some(q=>q.id===selected)&&selected?[[selected,text('Review this question - not in conditions','راجع السؤال - غير موجود في الشروط')] as [string,string]]:[]),...parents.map(q=>[q.id,koboLabel(q,language)] as [string,string])]} onChange={percentageParent=>onChange({percentageParent})}/>
   <KoboHiddenAnswerControls language={language} mode={mode} keepOriginalDisabled={!result.respondentBasis?.canKeepOriginal||source==='manual'&&!!ruleIssue(manualTree,fields)} onChange={mode=>onChange({connectedPercentageMode:mode,percentageBase:mode==='keep-original'?'parent':'question',percentageParent:selected,percentageMode:'legacy-respondents'})}/>
   <small>{mode==='adjust'?text('Visible answers are a share of this follow-up’s answered group.','الإجابات الظاهرة هي نسبة من مجموعة من أجابوا عن سؤال المتابعة.'):text('Visible answers are a share of the original parent group, before these conditions and hidden answers.','الإجابات الظاهرة هي نسبة من مجموعة السؤال الأصل قبل تطبيق هذه الشروط وإخفاء الإجابات.')}</small>
  </>}
 {(!selected||!parents.some(p=>p.id===selected))&&<p className="kobo-values-hint">{text('Choose a connected base question to enable Keep original %.','اختر سؤال قاعدة مرتبطاً لتفعيل الاحتفاظ بالنسبة الأصلية.')}</p>}
 {result.respondentBasis?.issue&&<p className="kobo-placement-error" role="alert">{connectionMessage(result.respondentBasis.issue,ar)}</p>}
 </section>}
 </>;
}

export function KoboBasisSummary({result,language}:{result:KoboResult;language:'en'|'ar'}){
 const basis=result.respondentBasis;if(!basis)return null;
 const ar=language==='ar',n=new Intl.NumberFormat(language);
 return <p className={`kobo-basis-summary${basis.issue?' has-issue':''}`} dir={ar?'rtl':'ltr'}>{basis.issue?(ar?'قاعدة النسبة غير متاحة - راجع السؤال المرتبط في تخصيص.':'Percentage base unavailable - review the connected question in Customize.'):!basis.active?result.percentageBasis:<>{ar?'القاعدة: ':'Base: '}<strong>{n.format(basis.denominator??0)}</strong>{basis.kind==='parent'?` · ${basis.label}`:ar?' أجابوا عن هذا السؤال':' answered this question'} · {basis.hiddenMode==='adjust'?(ar?'قاعدة سؤال المتابعة بعد الضبط':'Adjusted follow-up base'):(ar?'قاعدة السؤال الأصلية':'Original parent base')}{basis.repeatEntries&&(ar?' · إدخالات متكررة':' · Repeat entries')}</>}</p>;
}

function ConnectionDialog({result,project,language,onClose,onEdit}:{onEdit?:()=>void;result:KoboResult;project:KoboProject;language:'en'|'ar';onClose:()=>void}){
 const navigating=useRef<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),opener=useRef(document.activeElement),ar=language==='ar',details=result.connections;
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>{node?.close();if(navigating.current){const id=navigating.current;requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('kobo-question-navigate',{detail:id})));return}if(opener.current instanceof HTMLElement&&opener.current.isConnected)opener.current.focus({preventScroll:true})}},[]);
 const basis=result.respondentBasis,example=result.rows.find(row=>row.id!=='__blank__'&&row.percent!=null),n=new Intl.NumberFormat(language,{maximumFractionDigits:2});
 const parents=[...(details?.parents||[])];
 if(basis?.kind==='parent'&&basis.parentId&&!parents.some(p=>p.id===basis.parentId)){
  const parent=project.form.questions.find(q=>q.id===basis.parentId);
  if(parent)parents.push({id:parent.id,name:parent.name,label:koboLabel(parent,language),hidden:project.settings.hidden.includes(parent.id),compatible:true,triggers:[]});
 }
 return createPortal(<dialog ref={dialog} className="kobo-dialog glass kobo-connections-dialog" dir={ar?'rtl':'ltr'} aria-labelledby="kobo-connections-title" onCancel={event=>{event.preventDefault();onClose()}}><header><div><span className="eyebrow">{ar?'منطق السؤال':'QUESTION LOGIC'}</span><h2 id="kobo-connections-title">{ar?'الأسئلة المرتبطة وقاعدة النسبة':'Connected questions & percentage basis'}</h2></div><button type="button" className="soft" aria-label={ar?'إغلاق':'Close connection details'} onClick={onClose}><X aria-hidden="true"/></button></header>
  <p className="kobo-connections-question" dir="auto">{result.label}</p>
  <section><h3>{ar?'مرتبط بـ':'Connected to'}</h3><ul>{parents.map(parent=><li key={parent.id}><div>{parent.hidden?<strong dir="auto">{parent.label}</strong>:<button type="button" className="kobo-connection-link" dir="auto" onClick={()=>{navigating.current=parent.id;onClose()}}>{parent.label}</button>}<code>{parent.name}</code>{parent.hidden&&<span className="kobo-connection-status">{ar?'مخفي':'Hidden'}</span>}{!parent.compatible&&<span className="kobo-connection-status">{ar?'نطاق مختلف':'Different response scope'}</span>}</div>{parent.triggers.length>0&&<small dir="auto">{parent.triggers.join(' · ')}</small>}</li>)}</ul></section>
  <section><h3>{ar?'الشرط الكامل':'Complete condition'}</h3>{details?.source==='manual'&&<div className="kobo-connection-condition"><small>{ar?'ارتباط يدوي للتحليل':'Manual analysis connection'}</small><p dir="auto">{details.effectiveCondition}</p><small>{ar?'تحل هذه القاعدة محل الشروط المكتشفة لهذا التحليل فقط.':'This rule replaces detected conditions for this analysis only.'}</small></div>}{details?.conditions.map((condition,index)=><div className="kobo-connection-condition" key={`${condition.source}:${index}`}><small>{condition.source===result.id?(ar?'شرط السؤال':'Question condition'):(ar?'شرط المجموعة':'Group condition')}</small>{condition.readable&&<p dir="auto">{condition.readable}</p>}<details open={!condition.supported}><summary>{ar?'الشرط الأصلي في كوبو':'Original Kobo condition'}</summary><code dir="ltr">{condition.expression}</code></details></div>)}{details?.source!=='manual'&&(details?.conditions.length||0)>1&&<small>{ar?'يجب تحقق جميع شروط المجموعات والسؤال معاً (AND).':'All group and question conditions must hold together (AND).'}</small>}{!!details?.issues.length&&<p className="kobo-connection-review" role="status">{ar?'تحتاج بعض الشروط أو المراجع إلى مراجعة. راجع النص الأصلي؛ لا يتم تخمين تفسير الشروط غير المدعومة. يمكنك اختيار سؤال القاعدة يدوياً في تخصيص.':'Some conditions or references need review. Check the original expressions; unsupported conditions are not interpreted. You can select the base question manually in Customize.'}</p>}</section>
  <section><h3>{ar?'كيف تُحسب النسبة؟':'How is the percentage calculated?'}</h3><KoboBasisSummary result={result} language={language}/>{basis?.active&&!basis.issue&&example&&basis.denominator!==null&&basis.denominator>0&&<p className="kobo-connection-formula" dir="auto"><span>{example.label}</span><strong dir="ltr">{n.format(example.count)} ÷ {n.format(basis.denominator)} × 100 = {formatPercent(example.percent,result.percentageDecimals??0,language)}</strong></p>}{basis?.denominator===0&&<p>{ar?'القاعدة صفر؛ تظهر النسبة كقيمة غير متاحة.':'The base is zero; percentages are unavailable.'}</p>}<p>{ar?'تُطبّق عوامل تصفية الاستجابات أولاً. لكل فئة تقسيم وفترة زمنية قاعدتها. إخفاء سؤال أو إجابة في السؤال الأصل لا يغيّر قاعدة هذا السؤال.':'Response filters apply first. Each breakdown group and time period has its own base. Hiding a parent question or its answers does not change this question’s base.'}</p><p>{basis?.hiddenMode==='adjust'?(ar?'ضبط النسبة: قسمة الأعداد الظاهرة على مجموعة من أجابوا عن سؤال المتابعة بعد تطبيق الشروط واستبعاد الإجابات المخفية.':'Adjust % divides visible counts by the follow-up answered group, after conditions and hidden-answer exclusions.'):(ar?'الاحتفاظ بالنسبة الأصلية: قسمة الأعداد الظاهرة على مجموعة من أجابوا عن السؤال الأصل قبل شروط الارتباط واستبعاد الإجابات المخفية.':'Keep original % divides visible counts by the original parent answered group, before connection conditions and hidden-answer exclusions.')}</p></section>
  <footer>{onEdit&&<button type="button" className="soft" onClick={()=>{onClose();setTimeout(onEdit,0)}}>{ar?'تعديل الارتباط':'Edit connection'}</button>}<button type="button" className="primary" onClick={onClose}>{ar?'إغلاق':'Close'}</button></footer>
 </dialog>,document.body);
}

export default function KoboConnections({result,project,language,onConfigure,trailingAction}:{trailingAction?:ReactNode;onConfigure?:()=>void;result:KoboResult;project:KoboProject;language:'en'|'ar'}){
 const[open,setOpen]=useState(false),details=result.connections;
 if(result.measure)return trailingAction?<div className="kobo-connection-overview" dir={language==='ar'?'rtl':'ltr'}><div className="kobo-connection-status-row">{trailingAction}</div></div>:null;
 const ar=language==='ar',issues=details?.reviewIssues||details?.issues||[],diagnostics=details?.diagnostics||[];
 const {count,status,label:statusLabel,Icon}=connectionHealth(result,language);
 const triggerLabel=`${statusLabel}${status==='connected'?ar?` · ${count} أسئلة`:` · ${count} ${count===1?'question':'questions'}`:''} · ${ar?'تعديل':'Edit'}`;
 const summary=details?.source!=='manual'&&issues.includes('unsupported-condition')?details?.conditions.map(c=>c.readable||c.expression).join(' AND '):details?.effectiveTree?conditionSummary(details.effectiveTree,project.form.questions,language):details?.effectiveCondition||details?.conditions.map(c=>c.readable||c.expression).join(' AND ');
 return <div className="kobo-connection-overview" dir={ar?'rtl':'ltr'}><div className="kobo-connection-status-row"><button type="button" className={`kobo-connections-trigger kobo-connection-edit is-${status}`} aria-label={triggerLabel} aria-haspopup="dialog" onClick={()=>onConfigure?onConfigure():setOpen(true)}><Icon aria-hidden="true"/><span>{statusLabel}{status==='connected'&&<span className="kobo-connection-count"> · {count} {ar?'أسئلة':count===1?'question':'questions'}</span>}</span><span className="kobo-connection-edit-label"><Pencil aria-hidden="true"/>{ar?'تعديل':'Edit'}</span></button>{trailingAction}</div>
 {summary&&<div className="kobo-condition-card"><p dir="auto">{summary}</p><button type="button" className="kobo-connection-link" onClick={()=>setOpen(true)}>{ar?'عرض الشروط':'View conditions'}</button></div>}
 {diagnostics.length>0&&<p className="kobo-connection-card-issue">{connectionMessage(diagnostics[0].code,ar)} <code>{diagnostics[0].field}</code> <code>{diagnostics[0].value}</code></p>}
 {open&&<ConnectionDialog result={result} project={project} language={language} onEdit={onConfigure} onClose={()=>setOpen(false)}/>}</div>;
}
