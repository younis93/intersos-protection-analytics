import {useState} from 'react';
import {ArrowDownUp} from 'lucide-react';
import KoboActionMenu from './KoboActionMenu';
import {AppSelect} from './SelectionControls';
import type {PivotColumnSort,PivotSort} from './koboPivotSort';
import type {KoboResult} from './koboTypes';

type Direction='asc'|'desc';
type Option=[string,string];
type ValueMetric='count'|'percent';

export default function KoboPivotSortMenu({result,language,metric,rowSort,rowReset,columnSort,onRowSort,onColumnSort}:{
 result:KoboResult;language:'en'|'ar';metric:ValueMetric;
 rowSort:PivotSort|null;rowReset:boolean;columnSort?:PivotColumnSort|null;
 onRowSort:(sort:PivotSort|null)=>void;onColumnSort?:(sort:PivotColumnSort|null)=>void;
}){
 const [showAnswerSource,setShowAnswerSource]=useState(false);
 const t=(en:string,ar:string)=>language==='ar'?ar:en;
 const largest=t('Largest first','الأكبر أولاً'),smallest=t('Smallest first','الأصغر أولاً');
 const aToZ=t('A to Z','أ إلى ي'),zToA=t('Z to A','ي إلى أ');
 const orderOptions:Option[]=[['value-desc',largest],['value-asc',smallest],['name-asc',aToZ],['name-desc',zToA]];
 const nameOrder=(direction:Direction)=>`name-${direction}`;
 const valueOrder=(direction:Direction)=>`value-${direction}`;
 const defaultOrder=t('Default order','الترتيب الافتراضي');
 const reset=t('Reset','إعادة تعيين');
 const columns=result.breakdowns;
 const showColumns=!!onColumnSort&&(columns.length>1||!!columnSort);
 const rowSource=rowSort?.series?.length===1?columns.find(column=>column.id===rowSort.series?.[0])?.label:rowSort?.label;
 const selectedAnswer=columnSort?.answer?result.rows.find(row=>row.id===columnSort.answer):undefined;
 const rowCurrent=rowSort?.series?.length&&rowSource?`${rowSource} · ${rowSort.metric==='percent'?'%':'#'} · ${rowSort.direction==='desc'?largest:smallest}`:undefined;
 const rowValue=rowCurrent?'current':rowSort?rowSort.metric==='answer'?nameOrder(rowSort.direction):valueOrder(rowSort.direction):'default';
 const columnValue=columnSort&&(!columnSort.answer||selectedAnswer)?columnSort.metric==='name'?nameOrder(columnSort.direction):valueOrder(columnSort.direction):'default';
 const rowOptions:Option[]=[['default',defaultOrder],...(rowCurrent?[['current',rowCurrent] as Option]:[]),...orderOptions];
 const columnOptions:Option[]=[['default',defaultOrder],...orderOptions];
 const chooseRow=(value:string)=>{
  if(value==='current')return;
  if(value==='default'){onRowSort(null);return}
  const direction=value.endsWith('desc')?'desc':'asc';
  onRowSort(value.startsWith('name')?{id:'answer',label:t('Answer','الإجابة'),metric:'answer',direction}
   :{id:`total:${metric}`,label:metric==='percent'?t('Total percentage','النسبة الإجمالية'):result.measure?.label||t('Total count','العدد الإجمالي'),metric,direction});
 };
 const chooseColumn=(value:string)=>{
  if(value==='default'){onColumnSort?.(null);return}
  const direction=value.endsWith('desc')?'desc':'asc';
  onColumnSort?.(value.startsWith('name')?{metric:'name',direction}:{metric,direction,...(selectedAnswer?{answer:selectedAnswer.id}:{})});
 };
 const answerSources=()=>{
  const answers=result.rows.filter(row=>row.id!=='__blank__');
  const counts=new Map<string,number>();
  for(const answer of answers)counts.set(answer.label,(counts.get(answer.label)??0)+1);
  return answers.map(({id,label}):Option=>[id,counts.get(label)===1?label:`${label} (${id})`]);
 };
 const answerSourceLabel=t('Sort by a specific answer','الترتيب حسب إجابة محددة');
 const focusOrder=(button:HTMLButtonElement)=>button.parentElement?.querySelector<HTMLButtonElement>('.app-select-trigger:not(:disabled)')?.focus();

 return <KoboActionMenu label={t('Sort','ترتيب')} ariaLabel={t('Sort pivot table','ترتيب الجدول المحوري')} icon={<ArrowDownUp aria-hidden="true"/>} closeOnSelect={false} className="kobo-pivot-sort-menu">
  <div className="kobo-pivot-sort-options" dir={language==='ar'?'rtl':'ltr'}>
   <div className="kobo-pivot-sort-axis">
    <AppSelect label={t('Rows','الصفوف')} ariaLabel={t('Sort rows','ترتيب الصفوف')} value={rowValue} options={rowOptions} onChange={chooseRow} preserveOrder/>
    <button type="button" className="soft" aria-label={t('Reset row order','إعادة ترتيب الصفوف')} disabled={!rowReset} onClick={event=>{focusOrder(event.currentTarget);onRowSort(null)}}>{reset}</button>
   </div>
   {showColumns&&<>
    <div className="kobo-pivot-sort-axis">
     <AppSelect label={t('Columns','الأعمدة')} ariaLabel={t('Sort columns','ترتيب الأعمدة')} disabled={columns.length<2}
      value={columnValue} options={columnOptions} onChange={chooseColumn} preserveOrder/>
     <button type="button" className="soft" aria-label={t('Reset column order','إعادة ترتيب الأعمدة')} disabled={!columnSort} onClick={event=>{focusOrder(event.currentTarget);onColumnSort?.(null)}}>{reset}</button>
    </div>
    {columns.length>1&&<details open={showAnswerSource||undefined} onToggle={event=>setShowAnswerSource(event.currentTarget.open)}>
     <summary>{selectedAnswer?<>{t('By answer','حسب الإجابة')}: <bdi>{selectedAnswer.label}</bdi></>:answerSourceLabel}</summary>
     {showAnswerSource&&<AppSelect label={t('Answer','الإجابة')} ariaLabel={answerSourceLabel} searchable preserveOrder value={selectedAnswer?.id??''}
      options={[['',t('All answers','جميع الإجابات')],...answerSources()]} onChange={answer=>onColumnSort?.({metric,direction:columnSort?.metric==='name'?'desc':columnSort?.direction??'desc',...(answer?{answer}:{})})}/>}
    </details>}
   </>}
  </div>
 </KoboActionMenu>;
}
