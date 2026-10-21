import {displayPercent,formatPercent,percentageDecimals} from './koboPercentages';
import {Copy} from 'lucide-react';
import KoboSegmentedControl from './KoboSegmentedControl';
import {useImperativeHandle,useMemo,useState,type Ref} from 'react';
import {koboCopyCell,useKoboCopy} from './koboClipboard';
import {koboTableHtml,koboTableText,type BreakdownDisplay} from './koboTableData';
import {sortPivotRows,type PivotSort} from './koboPivotSort';
import type {KoboResult} from './koboTypes';
import './koboPivotTable.css';

export type KoboPivotSelection={answer?:string;breakdown?:string;count:number};
export type KoboPivotTableHandle={copyText:()=>string;copyHtml:()=>string};
export default function KoboPivotTable({result,language,limit,display='both',onDisplayChange,showDisplaySelector=false,copyable=false,showCopyButton=true,onDrilldown,ref}:{result:KoboResult;language:'en'|'ar';limit:number;display?:BreakdownDisplay;copyable?:boolean;showCopyButton?:boolean;ref?:Ref<KoboPivotTableHandle>;onDrilldown?:(selection:KoboPivotSelection)=>void;onDisplayChange?:(display:BreakdownDisplay)=>void;showDisplaySelector?:boolean}){
 const clipboard=useKoboCopy();
 const metrics:('count'|'percent')[]=display==='both'?['count','percent']:[display];
 const[sort,setSort]=useState<PivotSort|null>(null);
 const activeSort=sort?.series&&(sort.series.some(id=>!result.breakdowns.some(column=>column.id===id))||sort.id.endsWith(':count')&&display==='percent'||sort.id.endsWith(':percent')&&display==='count')?null:sort;
 const sortedRows=useMemo(()=>sortPivotRows(result,activeSort,language),[result,activeSort,language]);
 useImperativeHandle(ref,()=>({copyText:()=>koboTableText(result,display,sortedRows),copyHtml:()=>koboTableHtml(result,display,sortedRows)}),[result,display,sortedRows]);
 const columns=result.breakdowns,fields=result.breakdownFields||[];
 const hasDisplaySelector=!!onDisplayChange&&(columns.length>0||showDisplaySelector),displayLabel=columns.length?'Breakdown values':'Values';
 const depth=columns.length?Math.max(1,fields.length):0;
 const formatter=useMemo(()=>new Intl.NumberFormat(language,{maximumFractionDigits:2}),[language]);
 const number=(value:number)=>formatter.format(value);
 const cell=(value:string)=>copyable?koboCopyCell(value,language):{};
 const percent=(value:number|null|undefined)=>formatPercent(value,percentageDecimals(result),language);
 const numeric=(text:string,count:number|undefined,answer?:string,breakdown?:string)=>{
  if(!onDrilldown||count===undefined||text==='-')return text;
  const label=answer===undefined?'All answered responses':result.rows.find(row=>row.id===answer)?.label||answer;
  const column=columns.find(column=>column.id===breakdown)?.label;
  return <button type="button" className="kobo-pivot-drilldown" data-answer={answer} data-breakdown={breakdown} aria-label={`View ${number(count)} matching responses: ${label}${column?` / ${column}`:''}`} title="View matching response records" onClick={()=>onDrilldown({answer,breakdown,count})}>{text}</button>;
 };
 const numericCopy=(text:string)=>onDrilldown?{}:cell(text);
 const paths=columns.map(column=>column.labels||[column.label]);
 const keys=columns.map(column=>column.values||[column.id]);
 const roots=[...new Set(keys.map(path=>path[0]))];
 const band=(index:number)=>`kobo-pivot-band-${roots.indexOf(keys[index]?.[0])%4}`;
 const sortButton=(id:string,label:string,metric:PivotSort['metric'],text:string,series?:string[])=>{
  const active=activeSort?.id===id;
  return <button type="button" className="kobo-pivot-sort" aria-label={`Sort by ${label}`} title={`Sort by ${label}`} onClick={()=>setSort({id,label,metric,series,direction:active&&activeSort.direction==='desc'?'asc':active&&activeSort.direction==='asc'?'desc':metric==='answer'?'asc':'desc'})}><span dir="auto">{text}</span>{active&&<span aria-hidden="true">{activeSort.direction==='asc'?'▲':'▼'}</span>}</button>;
 };
 const ariaSort=(id:string)=>activeSort?.id===id?(activeSort.direction==='asc'?'ascending':'descending'):'none';
 return <>
  {(showCopyButton||fields.length>0||hasDisplaySelector)&&<div className="kobo-pivot-toolbar">
   {fields.length>0&&<p className="kobo-pivot-field-labels" dir="auto">{fields.map(field=>field.label).join(' / ')}</p>}
   {showCopyButton&&<button type="button" className="soft kobo-copy-table" aria-label={`Copy table for ${result.name}`} onClick={event=>void clipboard.copy(koboTableText(result,display,sortedRows),event.currentTarget,'Formatted table copied',koboTableHtml(result,display,sortedRows))}><Copy aria-hidden="true"/>Copy</button>}
   {hasDisplaySelector&&<div className="kobo-pivot-display"><KoboSegmentedControl label={displayLabel} value={display} options={[["count","#","Counts"],["percent","%","Percentages"],["both","Both","Counts and percentages"]]} onChange={value=>onDisplayChange?.(value)}/></div>}
  </div>}
  {result.kind==='multiple'&&<small>Multiple selections allowed. Percentages use answered respondents and may total more than 100%.</small>}
  <div className="legal-table-wrap kobo-table-wrap kobo-pivot-wrap" role="region" aria-label="Pivot table" tabIndex={0}>
   <table className="kobo-pivot-table"><caption className="kobo-pivot-caption">{result.label}</caption><thead>
    {Array.from({length:depth},(_,level)=>{
     const cells:{start:number;span:number;label:string}[]=[];
     keys.forEach((path,index)=>{const previous=cells.at(-1);if(previous&&JSON.stringify(keys[previous.start].slice(0,level+1))===JSON.stringify(path.slice(0,level+1)))previous.span++;else cells.push({start:index,span:1,label:paths[index][level]||columns[index].label})});
     return <tr key={level}>{level===0&&<th scope="col" rowSpan={depth+1} className="no-sort kobo-pivot-answer" aria-sort={ariaSort('answer')}>{sortButton('answer','Answer','answer','Answer')}</th>}{cells.map(cell=><th key={cell.start} colSpan={cell.span*metrics.length} scope="colgroup" className={`no-sort ${band(cell.start)}`} aria-sort={ariaSort(`group:${level}:${JSON.stringify(keys[cell.start].slice(0,level+1))}`)}>{sortButton(`group:${level}:${JSON.stringify(keys[cell.start].slice(0,level+1))}`,paths[cell.start].slice(0,level+1).join(' / '),'count',cell.label,columns.slice(cell.start,cell.start+cell.span).map(column=>column.id))}</th>)}</tr>;
    })}
    <tr>{!depth&&<th scope="col" className="no-sort kobo-pivot-answer" aria-sort={ariaSort('answer')}>{sortButton('answer','Answer','answer','Answer')}</th>}{columns.flatMap((column,index)=>metrics.map(metric=><th scope="col" key={`${column.id}:${metric}`} className={`no-sort ${band(index)}`} aria-sort={ariaSort(`${column.id}:${metric}`)}>{sortButton(`${column.id}:${metric}`,`${column.label} ${metric==='count'?'count':'percentage'}`,metric,metric==='count'?'#':'%',[column.id])}</th>))}{!depth&&metrics.map(metric=><th key={metric} scope="col" className="no-sort kobo-pivot-total" aria-sort={ariaSort(`total:${metric}`)}>{sortButton(`total:${metric}`,metric==='count'?'Total count':'Total percentage',metric,metric==='count'?'#':'%')}</th>)}</tr>
   </thead><tbody>{sortedRows.slice(0,limit).map(row=><tr key={row.id}><th scope="row" dir="auto" className="no-sort kobo-pivot-answer" {...cell(row.label)}>{row.label}</th>{columns.flatMap((column,index)=>{const value=row.series?.find(series=>series.id===column.id);return metrics.map(metric=>{const text=metric==='count'?(value?number(value.count):'-'):percent(displayPercent(value));return <td key={`${column.id}:${metric}`} className={`${band(index)}${metric==='percent'?' kobo-pivot-percent':''}`} {...numericCopy(text)}>{numeric(text,value?.count,row.id,column.id)}</td>})})}{!depth&&metrics.map(metric=>{const text=metric==='count'?number(row.count):percent(displayPercent(row));return <td key={metric} className={`kobo-pivot-total${metric==='percent'?' kobo-pivot-percent':''}`} {...numericCopy(text)}>{numeric(text,row.count,row.id)}</td>})}</tr>)}</tbody>
   <tfoot><tr><th scope="row" className="no-sort kobo-pivot-answer" title="Answered respondents, including answers beyond the visible row limit" {...cell('Total')}>Total</th>{depth?columns.flatMap((column,index)=>metrics.map(metric=><td key={`${column.id}:${metric}`} className={band(index)} {...numericCopy(metric==='count'?number(column.denominator):percent(column.denominator?100:null))}>{numeric(metric==='count'?number(column.denominator):percent(column.denominator?100:null),column.denominator,undefined,column.id)}</td>)):metrics.map(metric=>{const text=metric==='count'?number(result.denominator):percent(result.denominator?100:null);return <td key={metric} {...numericCopy(text)}>{numeric(text,result.denominator)}</td>})}</tr></tfoot></table>
  </div>{clipboard.notification}
 </>;
}
