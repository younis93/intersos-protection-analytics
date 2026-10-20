import {useEffect,useId,useState} from 'react';
import {ChevronDown,SlidersHorizontal} from 'lucide-react';
import {CheckboxMultiSelect} from './SelectionControls';
import {AnimatedActionIcon} from './AnimatedActionIcon';
import {koboApi} from './koboApi';
import {koboLabel,type KoboFilter,type KoboProject,type KoboQuestion,type KoboSettings} from './koboTypes';

const errorMessage=(reason:unknown)=>reason instanceof Error?reason.message:String(reason);
function FilterField({project,question,rule,onChange,onError}:{project:KoboProject;question:KoboQuestion;rule?:KoboFilter;onChange:(f:KoboFilter)=>void;onError:(s:string)=>void}){
 const[options,setOptions]=useState<string[]>([]);
 const categorical=!['number','date'].includes(question.kind);
 useEffect(()=>{if(!categorical)return;let active=true;koboApi.options(project.id,question.id).then(values=>{if(active)setOptions(values)}).catch(e=>onError(errorMessage(e)));return()=>{active=false}},[project.id,question.id,categorical]);
 const fieldLabel=koboLabel(question,project.settings.language);
 if(categorical){const labels=new Map(question.choices.map(c=>[c.name,koboLabel(c,project.settings.language)]));const display=options.map(v=>v==='__blank__'?'Blank / unanswered':labels.get(v)||v);const unique=display.map((v,i)=>display.indexOf(v)!==display.lastIndexOf(v)?`${v} [${options[i]}]`:v);return <CheckboxMultiSelect hideLabel label={fieldLabel} values={unique} selected={(rule?.values||[]).map(v=>unique[options.indexOf(v)]).filter(Boolean)} onChange={vs=>onChange({field:question.id,kind:'category',values:vs.map(v=>options[unique.indexOf(v)])})}/>}
 const kind=question.kind==='number'?'number':'date';
 return <fieldset className="kobo-range"><legend>{fieldLabel}</legend>{(['minimum','maximum'] as const).map(key=><label key={key}>{key==='minimum'?'From':'To'}<input type={kind} value={rule?.[key]??''} onChange={e=>onChange({field:question.id,kind,values:[],...rule,[key]:e.target.value===''?null:kind==='number'?Number(e.target.value):e.target.value})}/></label>)}</fieldset>;
}

export default function KoboResponseFilters({project,settings,pinned,open,onOpenChange,onChange,onChooseFields,onError}:{project:KoboProject;settings:KoboSettings;pinned:boolean;open:boolean;onOpenChange:(open:boolean)=>void;onChange:(settings:KoboSettings)=>void;onChooseFields:()=>void;onError:(message:string)=>void}){
 const[pinnedOpen,setPinnedOpen]=useState(false),id=useId();
 useEffect(()=>{if(!pinned)setPinnedOpen(false)},[pinned]);
 const expanded=pinned?pinnedOpen:open;
 const toggle=()=>{if(pinned)setPinnedOpen(value=>!value);else onOpenChange(!open)};
 return <section className={`kobo-filters kobo-response-filters${pinned?' is-pinned':''}`} aria-label="Response filters">
  <header><button type="button" className="kobo-filter-heading kobo-filter-toggle" aria-expanded={expanded} aria-controls={`${id}-fields`} onClick={toggle}><span className="kobo-section-icon"><SlidersHorizontal aria-hidden="true"/></span><h2>{'Filter responses'}</h2>{settings.filters.length>0&&<span className="kobo-filter-count" aria-label={`${settings.filters.length} active filters`}>{settings.filters.length}</span>}<ChevronDown aria-hidden="true"/></button><div className="kobo-filter-actions"><button type="button" className="soft" disabled={!settings.filters.length} onClick={()=>onChange({...settings,filters:[]})}><AnimatedActionIcon type="reset"/>Reset</button><button type="button" className="soft" onClick={onChooseFields}><AnimatedActionIcon type="filters"/>Choose fields</button></div></header>
  <div id={`${id}-fields`} hidden={!expanded} className="kobo-filter-grid">{settings.filterFields.map(field=>{const question=project.form.questions.find(q=>q.id===field);return question?<FilterField key={field} project={project} question={question} rule={settings.filters.find(f=>f.field===field)} onError={onError} onChange={rule=>{const active=rule.kind==='category'?rule.values.length>0:rule.minimum!=null||rule.maximum!=null;onChange({...settings,filters:[...settings.filters.filter(f=>f.field!==field),...(active?[rule]:[])]})}}/>:null})}{!settings.filterFields.length&&<p className="kobo-filter-empty">Choose fields to add response filters.</p>}</div>
  {!!settings.filters.length&&<div className="kobo-active-filters" aria-label="Active response filters">{settings.filters.map(filter=>{const question=project.form.questions.find(q=>q.id===filter.field),name=question?koboLabel(question,settings.language):filter.field;const value=filter.kind==='category'?filter.values.map(value=>{const choice=question?.choices.find(choice=>choice.name===value);return choice?koboLabel(choice,settings.language):value==='__blank__'?'Blank / unanswered':value}).join(', '):`${filter.minimum??'Any'} - ${filter.maximum??'Any'}`;return <span key={filter.field} title={`${name}: ${value}`}><span className="kobo-filter-chip-text">{name}: {value}</span><button type="button" aria-label={`Remove filter ${question?.name||filter.field}`} onClick={()=>onChange({...settings,filters:settings.filters.filter(f=>f.field!==filter.field)})}>×</button></span>})}</div>}
 </section>;
}
