import {useMemo} from 'react';
import {ListFilter,X} from 'lucide-react';
import {FilterField} from './KoboResponseFilters';
import {visibleQuestionFilterRules} from './koboQuestionFilterState';
import {koboLabel,type KoboFilter,type KoboProject,type KoboQuestionSettings} from './koboTypes';

export default function KoboQuestionFiltersBar({settings,project,language,onEdit,onChange,onError}:{settings:KoboQuestionSettings;project:KoboProject;language:'en'|'ar';onEdit:()=>void;onChange:(rules:KoboFilter[])=>void;onError:(message:string)=>void}){
 const rules=visibleQuestionFilterRules(settings);
 const localProject=useMemo(()=>({...project,settings:{...project.settings,language}}),[project,language]);
 if(!rules.length)return null;
 return <section className="kobo-question-filters-bar" aria-label="Filters for this question">
  <header><span><ListFilter aria-hidden="true"/>Filters</span><button type="button" className="soft" onClick={onEdit}>Choose fields</button></header>
  <div className="kobo-question-filter-grid">{rules.map((rule,index)=>{
   const question=project.form.questions.find(q=>q.id===rule.field),label=question?koboLabel(question,language):rule.field;
   return <div className="kobo-question-filter-control" key={`${rule.field}:${index}`} data-question-filter-control={rule.field}><div className="kobo-question-filter-control-heading"><strong dir="auto">{label}</strong><button type="button" aria-label={`Remove question filter: ${label}`} title="Remove filter field" onClick={()=>onChange(rules.filter((_,i)=>i!==index))}><X aria-hidden="true"/></button></div>{question?<FilterField allowExclude={false} project={localProject} question={question} rule={rule} dateMode={question.kind==='date'?'both':'range'} onError={onError} onChange={next=>onChange(rules.map((item,i)=>i===index?next:item))}/>:<span className="error">Field unavailable. Remove this filter.</span>}{question?.kind==='multiple'&&<small className="kobo-multiple-filter-hint">Matches any selected answer.</small>}</div>;
  })}</div>
 </section>;
}
