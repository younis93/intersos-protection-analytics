import {koboLabel,type KoboAnalysis,type KoboProject,type KoboQuestion,type KoboSettings} from './koboTypes';
import {viewSignature} from './koboSavedViewState';
import type {KoboViewSnapshot} from './koboSavedViewTypes';

export const questionEnabled=(q:KoboQuestion,snapshot:KoboViewSnapshot)=>!snapshot.hidden.includes(q.id)&&(!q.metadata||snapshot.metadata);
export const viewOrderLabels={'form':'Form order','name-asc':'Name A-Z','name-desc':'Name Z-A','answered-desc':'Most answered first','answered-asc':'Least answered first'};
const chartNames:Record<string,string>={bar:'Bar',column:'Column',line:'Line',pie:'Pie',donut:'Donut',histogram:'Histogram',heatmap:'Heatmap'};
export function viewQuestionSetup(project:KoboProject,snapshot:KoboViewSnapshot){
 const groups=new Map(project.form.groups.map(g=>[g.id,g])),lookup=new Map(project.form.questions.map(q=>[q.id,q]));
 const caption=(id:string)=>{const q=lookup.get(id);return q?koboLabel(q,snapshot.language):'Unavailable question'};
 const path=(id:string)=>{const parts:string[]=[],seen=new Set<string>();while(id&&!seen.has(id)){seen.add(id);const g=groups.get(id);if(!g)break;parts.unshift(koboLabel(g,snapshot.language));id=g.parent}return parts.join(' / ')||'General'};
 return project.form.questions.map(q=>{const cfg=snapshot.questions[q.id],fields=cfg?.breakdowns?.length?cfg.breakdowns:cfg?.breakdown?[cfg.breakdown]:[];
  const appearance=cfg?.appearance,metric=appearance?.metric==='count'?'Counts':appearance?.metric==='percent'?'Percentages':'Automatic chart values';
  return {question:q,label:koboLabel(q,snapshot.language),group:path(q.group),enabled:questionEnabled(q,snapshot),chart:chartNames[cfg?.chart||'']||(q.kind==='date'?'Line (automatic)':'Column (automatic)'),breakdowns:fields.map(caption),trend:cfg?.trendDateField?`${caption(cfg.trendDateField)} · ${{day:'Day',month:'Month',year:'Year'}[cfg.trendUnit||'month']}`:'',display:cfg?.breakdownDisplay==='count'?'#':cfg?.breakdownDisplay==='percent'?'%':'# and %',metric};
 });
}
export function previewFilters(project:KoboProject,snapshot:KoboViewSnapshot){return snapshot.filters.map(rule=>{
 const q=project.form.questions.find(q=>q.id===rule.field),label=q?koboLabel(q,snapshot.language):'Unavailable question';
 const values=rule.kind==='category'?rule.values.map(code=>{const choice=q?.choices.find(c=>c.name===code);return code==='__blank__'?'Blank / unanswered':choice?koboLabel(choice,snapshot.language):code}):[...(rule.months?.length?['Months: '+rule.months.join(', ')]:[]),...(rule.minimum!=null||rule.maximum!=null||!rule.months?.length?[`From ${rule.minimum??'any value'} to ${rule.maximum??'any value'}`]:[])];
 return {label,values};
})}
export function matchingViewAnalysis(analysis:KoboAnalysis|undefined,snapshot:KoboViewSnapshot){return analysis&&viewSignature(analysis.settings)===viewSignature(snapshot)?analysis:undefined}
export function sampleViewResults(project:KoboProject,snapshot:KoboViewSnapshot,analysis:KoboAnalysis){
 const eligible=new Set(project.form.questions.filter(q=>questionEnabled(q,snapshot)&&!q.identifying&&['category','multiple','number','date'].includes(q.kind)).map(q=>q.id));
 return analysis.questions.filter(result=>eligible.has(result.id)).slice(0,3);
}
export function settingsForViewPreview(settings:KoboSettings,snapshot:KoboViewSnapshot):KoboSettings{return {...settings,...snapshot,savedViews:[],activeViewId:'',indicators:[]}}
