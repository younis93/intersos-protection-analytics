import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronRight,ListFilter,Search,X} from 'lucide-react';
import {koboApi} from './koboApi';
import KoboAnswerShare from './KoboAnswerShare';
import {koboLabel,type KoboFilter,type KoboProject,type KoboQuestion,type KoboQuestionSettings,type KoboResult} from './koboTypes';
import {answerFilterSettings,visibleQuestionFilterRules} from './koboQuestionFilterState';
import './koboQuestionFilters.css';

const isChoiceQuestion=(q:KoboQuestion)=>q.kind==='category'||q.kind==='multiple';
export function FilterByAnswerButton({settings,language,questions,onClick}:{settings:KoboQuestionSettings;language:'en'|'ar';questions:KoboQuestion[];onClick:()=>void}){
 const label=language==='ar'?'التصفية حسب الإجابة':'Filter by answer';
 const disabled=!!settings.calculation&&settings.calculation.operation!=='count';
 const count=disabled?0:(settings.answerFilters||[]).filter(rule=>rule.values.length&&questions.some(q=>q.id===rule.field&&isChoiceQuestion(q))).length;
 return <button type="button" className={`soft kobo-question-filter-action${count?' has-question-filters':''}`} aria-haspopup="dialog"
  disabled={disabled} aria-label={label} aria-description={count?(language==='ar'?`عدد الأسئلة المصفاة: ${count}`:`${count} filtered questions`):undefined}
  onClick={onClick}><ListFilter aria-hidden="true"/>{label}{count>0&&<small>{count}</small>}</button>;
}

type PickerProps={project:KoboProject;settings:KoboQuestionSettings;language:'en'|'ar';repeat:string;
 onChange:(rules:KoboFilter[],moved:readonly string[])=>void;searchInput?:React.RefObject<HTMLInputElement|null>};

export function AnswerFilterPicker({project,settings,language,repeat,onChange,searchInput}:PickerProps){
 const text=(en:string,ar:string)=>language==='ar'?ar:en;
 const rules=settings.answerFilters||[];
 const[search,setSearch]=useState(''),[field,setField]=useState(rules[0]?.field||'');
 const[filteredOnly,setFilteredOnly]=useState(false);
 const questionList=useRef<HTMLDivElement>(null),activeQuestion=useRef<HTMLButtonElement>(null);
 const localInput=useRef<HTMLInputElement>(null),answersId=useId();
 const input=searchInput||localInput;
 const questions=project.form.questions.filter(q=>isChoiceQuestion(q)&&(!q.repeat||q.repeat===repeat||repeat.startsWith(q.repeat+'/')));
 const counts=new Map(rules.map(rule=>[rule.field,rule.values.length]));
 const filteredCount=questions.filter(q=>counts.get(q.id)).length;
 const question=questions.find(q=>q.id===field);
 const rule=rules.find(rule=>rule.field===field);
 const selected=rule?.values||[];
 const choices=new Map(question?.choices.map(choice=>[choice.name,koboLabel(choice,language)]));
 const values=[...new Set([...choices.keys(),'__blank__',...selected])];
 const query=search.trim().normalize('NFC').toLocaleLowerCase();
 const matches=questions.filter(q=>(!filteredOnly||counts.get(q.id))&&
  `${koboLabel(q,language)} ${q.name} ${q.id}`.normalize('NFC').toLocaleLowerCase().includes(query));
 useEffect(()=>{
  if(query)return;
  const frame=requestAnimationFrame(()=>{
   const list=questionList.current,row=activeQuestion.current;
   if(!list)return;
   if(!row){list.scrollTop=0;return}
   const top=row.offsetTop,bottom=top+row.offsetHeight;
   if(top<list.scrollTop)list.scrollTop=top;
   else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
  });
  return()=>cancelAnimationFrame(frame);
 },[field,filteredOnly,query]);

 const movable=visibleQuestionFilterRules(settings).filter(rule=>rule.kind==='category'&&rule.values.length&&questions.some(q=>q.id===rule.field));
 const update=(next:string[])=>{
  const rest=rules.filter(item=>item.field!==field);
  onChange(next.length?[...rest,{field,kind:'category',values:next}]:rest,[]);
 };
 return <div className="kobo-answer-filter-picker" dir={language==='ar'?'rtl':'ltr'}>
   {movable.length>0&&<details className="kobo-move-answer-filters">
    <summary>{text('Move existing answer filters','نقل عوامل تصفية الإجابات الحالية')}</summary>
    <p>{text('Move an answer rule from Question filters so it becomes part of this percentage calculation.','انقل عامل تصفية الإجابة إلى هذا الحساب.')}</p>
    {movable.map(rule=><button type="button" className="soft" key={rule.field} onClick={()=>{
     setField(rule.field);
     onChange([...rules.filter(item=>item.field!==rule.field),rule],[rule.field]);
    }}>{text('Move','نقل')} <bdi>{koboLabel(questions.find(q=>q.id===rule.field)!,language)}</bdi></button>)}
   </details>}
   <div className="kobo-answer-filter-layout">
    <section className="kobo-answer-filter-browser" aria-label={text('Find a question','البحث عن سؤال')}>
     <div className="kobo-question-filter-search"><Search aria-hidden="true"/>
      <input ref={input}
       aria-label={text('Search questions','البحث عن الأسئلة')} placeholder={text('Search questions…','البحث عن الأسئلة…')}
       value={search} onChange={event=>{setSearch(event.target.value);if(questionList.current)questionList.current.scrollTop=0}}/>
      {search&&<button type="button" aria-label={text('Clear question search','مسح البحث عن الأسئلة')}
       onClick={()=>{setSearch('');input.current?.focus()}}><X aria-hidden="true"/></button>}
     </div>
     <div className="kobo-answer-filter-tabs" role="group" aria-label={text('Show questions','عرض الأسئلة')}>
      <button type="button" aria-pressed={!filteredOnly} onClick={()=>setFilteredOnly(false)}>{text('All questions','كل الأسئلة')}</button>
      <button type="button" aria-pressed={filteredOnly} onClick={()=>setFilteredOnly(true)}>{text('Filtered','المصفّاة')} <span>{filteredCount}</span></button>
     </div>
     <div ref={questionList} className="kobo-answer-filter-questions" role="group" aria-label={text('Questions','الأسئلة')}>
      {matches.map(q=>{
       const active=field===q.id,count=counts.get(q.id)||0;
       return <button type="button" className="kobo-answer-filter-question" ref={active?activeQuestion:undefined} key={q.id}
        aria-pressed={active} aria-description={count?text(`Checked answers: ${count}`,`الإجابات المحددة: ${count}`):undefined} onClick={()=>setField(q.id)}>
        <span className="kobo-answer-filter-question-text"><span dir="auto">{koboLabel(q,language)}</span>
         {q.name!==koboLabel(q,language)&&<small dir="auto">{q.name}</small>}</span>
        {count>0&&<span className="kobo-answer-filter-count" aria-hidden="true"><Check/>{count}</span>}
        <ChevronRight className="kobo-answer-filter-chevron" aria-hidden="true"/>
       </button>;
      })}
      {!matches.length&&<p className="kobo-answer-filter-empty" role="status">{filteredOnly&&!query?
       text('No questions have checked answers yet.','لا توجد أسئلة بإجابات محددة بعد.'):
       text('No matching choice questions.','لا توجد أسئلة اختيار مطابقة.')}</p>}
     </div>
    </section>
    {question?<section className="kobo-answer-filter-panel" aria-labelledby={answersId}>
     <div className="kobo-answer-filter-heading">
      <div><span>{text('Answers','الإجابات')}</span><h4 id={answersId} dir="auto">{koboLabel(question,language)}</h4></div>
      <span className="kobo-answer-filter-count" role="status">{text(`${selected.length} checked`,`المحدد: ${selected.length}`)}</span>
     </div>
     {rule?.excludeSelected&&<p>{text('This question excludes the selected answers. Changing the selection switches it to include matching answers.','يستبعد هذا السؤال الإجابات المحددة. يؤدي تغيير الاختيار إلى تضمين الإجابات المطابقة.')}</p>}
     <fieldset className="kobo-answer-filter-choices" aria-labelledby={answersId}>
      {values.map(value=><label className="kobo-answer-filter-choice" key={value}><input type="checkbox" checked={selected.includes(value)}
       onChange={event=>update(event.target.checked?[...selected,value]:selected.filter(item=>item!==value))}/>
       <span dir="auto">{choices.get(value)||(value==='__blank__'?text('Blank / unanswered','فارغ / بلا إجابة'):value)}</span>
      </label>)}
     </fieldset>
     {selected.length>0&&<button type="button" className="kobo-answer-filter-clear" onClick={()=>update([])}>
      <X aria-hidden="true"/>{text('Clear checked answers','مسح الإجابات المحددة')}
     </button>}
    </section>:<div className="kobo-answer-filter-panel kobo-answer-filter-placeholder"><ListFilter aria-hidden="true"/>
     <p>{text('Choose a question to see its answers.','اختر سؤالاً لعرض إجاباته.')}</p></div>}
   </div>
 </div>;
}

export default function KoboFilterByAnswer({project,settings,questionId,language,repeat,label,onApply,onClose}:{
 project:KoboProject;settings:KoboQuestionSettings;questionId:string;language:'en'|'ar';repeat:string;label:string;
 onApply:(rules:KoboFilter[],moved:readonly string[])=>void;onClose:()=>void;
}){
 const text=(en:string,ar:string)=>language==='ar'?ar:en;
 const dialog=useRef<HTMLDialogElement>(null),searchInput=useRef<HTMLInputElement>(null);
 const[draft,setDraft]=useState(settings),[moved,setMoved]=useState<string[]>([]);
 const[preview,setPreview]=useState<{draft:KoboQuestionSettings;result?:KoboResult;error?:boolean}>();
 const[retry,setRetry]=useState(0);
 const hasAnswers=!!draft.answerFilters?.some(rule=>rule.values.length);
 const currentPreview=preview?.draft===draft?preview:undefined;
 useEffect(()=>{
  const opener=document.activeElement as HTMLElement|null;
  const node=dialog.current;
  node?.showModal();
  searchInput.current?.focus();
  return()=>{node?.close();if(opener?.isConnected)opener.focus({preventScroll:true})};
 },[]);
 useEffect(()=>{
  if(!hasAnswers)return;
  const controller=new AbortController();
  const timer=setTimeout(()=>{
   const next={...project.settings,questions:{...project.settings.questions,[questionId]:draft}};
   void koboApi.previewQuestion(project.id,next,questionId,controller.signal).then(result=>{
    if(!controller.signal.aborted)setPreview({draft,result});
   }).catch(()=>{
    if(!controller.signal.aborted)setPreview({draft,error:true});
   });
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[draft,hasAnswers,project.id,project.settings,questionId,retry]);
 const title=text('Filter by answer','التصفية حسب الإجابة');
 return <dialog ref={dialog} className="kobo-dialog glass kobo-question-filter-dialog kobo-filter-by-answer" aria-label={title}
  dir={language==='ar'?'rtl':'ltr'} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose()}}>
  <header><span className="kobo-question-filter-icon"><ListFilter aria-hidden="true"/></span><div><h2>{title}</h2><p dir="auto">{label}</p></div>
   <button type="button" className="soft" aria-label={text('Close answer filter','إغلاق تصفية الإجابات')} onClick={onClose}><X aria-hidden="true"/></button>
  </header>
  <div className="kobo-question-filter-body">
   <AnswerFilterPicker project={project} settings={draft} language={language} repeat={repeat} searchInput={searchInput}
    onChange={(rules,fields)=>{setDraft(current=>answerFilterSettings(current,rules,fields));setMoved(current=>[...current,...fields])}}/>
   {hasAnswers&&<div aria-live="polite">
    {currentPreview?.result?<KoboAnswerShare result={currentPreview.result} language={language}/>:
     currentPreview?.error?<p>{text('Percentage preview unavailable.','معاينة النسبة المئوية غير متاحة.')} <button className="soft" type="button"
      onClick={()=>{setPreview(undefined);setRetry(value=>value+1)}}>{text('Retry','إعادة المحاولة')}</button></p>:
     <p>{text('Updating percentage…','جارٍ تحديث النسبة المئوية…')}</p>}
   </div>}
  </div>
  <footer className="kobo-dialog-actions"><div className="kobo-dialog-action-buttons">
   <button type="button" className="soft" onClick={onClose}>{text('Cancel','إلغاء')}</button>
   <button type="button" className="primary" disabled={!moved.length&&JSON.stringify(draft.answerFilters||[])===JSON.stringify(settings.answerFilters||[])}
    onClick={()=>onApply(draft.answerFilters||[],moved)}>{text('Apply filters','تطبيق عوامل التصفية')}</button>
  </div></footer>
 </dialog>;
}
