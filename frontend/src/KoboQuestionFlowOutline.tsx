import {useId,useMemo,useState,type ReactNode} from 'react';
import {ChevronDown,ChevronRight,Eye,EyeOff,Focus,Layers,MoreHorizontal,Repeat,Search} from 'lucide-react';
import KoboActionMenu from './KoboActionMenu';
import {flowAncestors,flowChildren,flowItems,flowSubtree,GENERAL,isQuestion,matchingFlowQuestions,TECHNICAL,type FlowData,type FlowItem,type FlowQuestion,type FlowVisibilityAction} from './koboQuestionFlowModel';
import {flowKindLabel,QuestionPreview,type FlowText} from './koboQuestionFlowPresentation';
import './koboQuestionFlowOutline.css';

type Props={data:FlowData;totalQuestions:number;collapsed:Set<string>;selected:string;search:string;onToggle:(id:string)=>void;onSelect:(id:string)=>void;onVisibility:(id:string,action:FlowVisibilityAction)=>void;onClearSearch:()=>void;t:FlowText};

/** The main Outline is a document of sections; the navigation keeps its compact tree. */
export default function KoboQuestionFlowOutline({data,totalQuestions,collapsed,selected,search,onToggle,onSelect,onVisibility,onClearSearch,t}:Props){
 const prefix=useId(),[preview,setPreview]=useState<FlowItem|null>(null);
 const items=useMemo(()=>flowItems(data),[data]),children=useMemo(()=>flowChildren(data),[data]);
 const matching=useMemo(()=>new Set(matchingFlowQuestions(data,search).map(q=>q.id)),[data,search]);
 const needle=search.trim().toLocaleLowerCase();
 const included=useMemo(()=>{
  const result=new Set<string>(matching);
  for(const id of matching)for(const ancestor of flowAncestors(id,items))result.add(ancestor);
  // A group can still be found when it contains no response questions.
  for(const group of data.groups)if(!needle||[group.label,group.name,group.id].some(value=>value.toLocaleLowerCase().includes(needle))){
   result.add(group.id);for(const parent of flowAncestors(group.id,items))result.add(parent);
  }
  return result;
 },[data,items,matching,needle]);
 const previewEvents=(item:FlowItem)=>({onMouseEnter:()=>setPreview(item),onMouseLeave:()=>setPreview(null),onFocus:()=>setPreview(item),onBlur:()=>setPreview(null),onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==='Escape')setPreview(null)}});
 function menu(id:string,label:string){return <KoboActionMenu label="" ariaLabel={t('Review actions: ','إجراءات المراجعة: ')+label} icon={<MoreHorizontal aria-hidden="true"/>} className="qf-item-actions qf-section-menu">
  <button type="button" onClick={()=>onVisibility(id,'show')}><Eye/>{t('Show','إظهار')}</button>
  <button type="button" onClick={()=>onVisibility(id,'hide')}><EyeOff/>{t('Hide','إخفاء')}</button>
  <button type="button" onClick={()=>onVisibility(id,'only')}><Focus/>{t('Show only','إظهار فقط')}</button>
 </KoboActionMenu>}
 function badges(item:FlowItem){return <>
  <span className="qf-section-badge">{flowKindLabel(item,t)}</span>
  {!!item.connections.conditions.length&&<span className="qf-section-badge is-conditional">{t('Conditional','مشروط')}</span>}
  {!!item.connections.issues.length&&<span className="qf-section-badge is-review">{t('Needs review','تحتاج مراجعة')}</span>}
 </>}
 function questionRow(q:FlowQuestion){return <div key={q.id} data-flow-item={q.id} className={`qf-section-question${selected===q.id?' is-selected':''}`}>
  <button type="button" className="qf-section-question-button" aria-label={q.label} aria-pressed={selected===q.id} aria-describedby={`${prefix}-${encodeURIComponent(q.id)}-meta${preview?.id===q.id?` ${prefix}-preview`:''}`} {...previewEvents(q)} onClick={()=>{setPreview(null);onSelect(q.id)}}>
   <span className="qf-section-number" aria-hidden="true">{String(q.number).padStart(2,'0')}</span>
   <span className="qf-section-question-copy"><span className="qf-section-question-label" dir="auto">{q.label}</span><span id={`${prefix}-${encodeURIComponent(q.id)}-meta`} className="qf-section-question-meta">{badges(q)}</span></span>
  </button>
  {menu(q.id,q.label)}
 </div>}
 function section(id:string,nested=false,seen=new Set<string>()):ReactNode{
  if(seen.has(id))return null;
  const next=new Set([...seen,id]),item=items.get(id),technical=id===TECHNICAL,general=id===GENERAL;
  const label=general?t('General questions','أسئلة عامة'):technical?t('Technical & calculated fields','الحقول التقنية والحسابات'):item!.label;
  const childIds=(general?(children.get('')||[]).filter(key=>items.has(key)&&isQuestion(items.get(key)!)):children.get(id)||[]).filter(key=>included.has(key));
  const count=general?childIds.length:[...flowSubtree(data,id)].filter(key=>matching.has(key)).length;
  const expanded=!!needle||!collapsed.has(id),bodyId=`${prefix}-${encodeURIComponent(id)}`,titleId=`${bodyId}-title`;
  return <section key={id} data-flow-item={id} className={`qf-section-card${nested?' is-nested':''}${technical?' is-technical':''}${selected===id?' is-selected':''}`} aria-labelledby={titleId}>
   <header className="qf-section-header">
    <h3><button id={titleId} type="button" className="qf-section-toggle" aria-expanded={expanded} aria-controls={expanded?bodyId:undefined} onClick={()=>{setPreview(null);onToggle(id)}}>
     {expanded?<ChevronDown aria-hidden="true"/>:<ChevronRight aria-hidden="true"/>}
     <span className="qf-section-heading-copy"><span className="qf-section-name" dir="auto">{label}</span><span className="qf-section-group-meta">
      <span className="qf-section-count">{count} {t(count===1?'question':'questions','أسئلة')}</span>
      {item&&item.repeat&&<span className="qf-section-badge is-repeat"><Repeat aria-hidden="true"/>{t('Repeat','متكررة')}</span>}
      {!!item?.connections.conditions.length&&<span className="qf-section-badge is-conditional">{t('Conditional','مشروط')}</span>}
      {!!item?.connections.issues.length&&<span className="qf-section-badge is-review">{t('Needs review','تحتاج مراجعة')}</span>}
     </span></span>
    </button></h3>
    {!general&&<div className="qf-section-header-actions">{item&&<button type="button" className="qf-section-details" aria-label={t('Details: ','تفاصيل: ')+label} onClick={()=>onSelect(id)}>{t('Details','التفاصيل')}</button>}{menu(id,label)}</div>}
   </header>
   {expanded&&<div id={bodyId} className="qf-section-body">{childIds.length?childIds.map(key=>{const child=items.get(key);return child&&isQuestion(child)?questionRow(child):section(key,true,next)}):<p className="qf-section-empty">{t('No questions in this group.','لا توجد أسئلة في هذه المجموعة.')}</p>}</div>}
  </section>;
 }
 const rootIds=(children.get('')||[]).filter(id=>id!==TECHNICAL&&included.has(id)&&items.has(id)&&!isQuestion(items.get(id)!));
 const hasGeneral=(children.get('')||[]).some(id=>included.has(id)&&items.has(id)&&isQuestion(items.get(id)!));
 const hasTechnical=(children.get(TECHNICAL)||[]).some(id=>matching.has(id));
 const hasContent=hasGeneral||rootIds.length>0||hasTechnical;
 return <div className="qf-section-outline" aria-label={t('Question outline','قائمة الأسئلة')}>
  <header className="qf-outline-heading"><div><span className="qf-outline-heading-icon"><Layers aria-hidden="true"/></span><h2>{t('Questionnaire outline','محتويات الاستبيان')}</h2></div><span role="status">{matching.size} / {totalQuestions} {t('questions','أسئلة')}</span></header>
  {hasContent?<div className="qf-section-list">{hasGeneral&&section(GENERAL)}{rootIds.map(id=>section(id))}{hasTechnical&&section(TECHNICAL)}</div>:<div className="qf-outline-empty" role="status"><Search aria-hidden="true"/><h3>{needle?t('No matching questions','لا توجد أسئلة مطابقة'):t('No questions are shown','لا توجد أسئلة ظاهرة')}</h3><p>{needle?t('Try another question or group name.','جرّب اسماً آخر للسؤال أو المجموعة.'):t('Use Show all to restore hidden questions.','استخدم إظهار الكل لاستعادة الأسئلة المخفية.')}</p>{needle&&<button type="button" className="soft" onClick={onClearSearch}>{t('Clear search','مسح البحث')}</button>}</div>}
  {preview&&<div id={`${prefix}-preview`} className="qf-preview qf-outline-preview glass" role="tooltip"><QuestionPreview item={preview} t={t}/></div>}
 </div>;
}
