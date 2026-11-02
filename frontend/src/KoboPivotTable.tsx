import KoboAnswerActions from './KoboAnswerActions';
import {usePivotSelection} from './koboPivotSelection';
import {additiveMeasure,pivotValue,pivotColumnTotal,pivotGrandTotal,pivotBottomPercent} from './koboPivotValues';
import {useRetainedKoboState} from './KoboRendering';
import {VirtualRows} from './VirtualRows';
import {useKoboPivotViewport} from './koboPivotViewport';
import {KoboPivotColumns,pivotGapStyle} from './KoboPivotColumns';
import {measured} from './koboMeasures';
import KoboMeasureTable from './KoboMeasureTable';
import {displayPercent,formatPercent,percentageDecimals} from './koboPercentages';
import {Copy} from 'lucide-react';
import KoboSegmentedControl from './KoboSegmentedControl';
import {useImperativeHandle,useMemo,type Ref} from 'react';
import {koboCopyCell,useKoboCopy} from './koboClipboard';
import {koboPivotTotals,koboTableHtml,koboTableText,type BreakdownDisplay} from './koboTableData';
import {resolvePivotSort,sortPivotRows,type PivotSort} from './koboPivotSort';
import type {KoboResult} from './koboTypes';
import './koboPivotTable.css';

export type KoboPivotSelection={answer?:string;breakdown?:string;count:number};
export type KoboPivotTableHandle={copyText:()=>string;copyHtml:()=>string};
export default function KoboPivotTable({onHideAnswer,onRestoreAnswers,hiddenAnswerCount=0,result,language,limit,display='both',onDisplayChange,showDisplaySelector=false,copyable=false,showCopyButton=true,onDrilldown,onEditAnswer,ref}:{onHideAnswer?:(answer:string)=>void;onRestoreAnswers?:()=>void;hiddenAnswerCount?:number;onEditAnswer?:(answer?:string)=>void;result:KoboResult;language:'en'|'ar';limit:number;display?:BreakdownDisplay;copyable?:boolean;showCopyButton?:boolean;ref?:Ref<KoboPivotTableHandle>;onDrilldown?:(selection:KoboPivotSelection)=>void;onDisplayChange?:(display:BreakdownDisplay)=>void;showDisplaySelector?:boolean}){
 const clipboard=useKoboCopy();
 const metrics:('count'|'percent')[]=display==='both'?['count','percent']:[display];
 const[sort,setSort]=useRetainedKoboState<PivotSort|null>('pivotSort',null);
 const activeSort=useMemo(()=>resolvePivotSort(result,display,sort),[result,display,sort]);
 const sortedRows=useMemo(()=>sortPivotRows(result,activeSort,language),[result,activeSort,language]);
 useImperativeHandle(ref,()=>({copyText:()=>koboTableText(result,display,sortedRows),copyHtml:()=>koboTableHtml(result,display,sortedRows)}),[result,display,sortedRows]);
 const rowLabels=useMemo(()=>new Map(result.rows.map(row=>[row.id,row.label])),[result.rows]);
 const totalsPolicy=koboPivotTotals(result);
 const columns=result.breakdowns,fields=result.breakdownFields||[];
 const viewport=useKoboPivotViewport(columns.length,metrics.length,JSON.stringify([activeSort,display,result.id]));
 const shownRows=useMemo(()=>sortedRows.slice(0,limit),[sortedRows,limit]);
 const selection=usePivotSelection(result,shownRows,display,viewport.ref,viewport.revealColumn,JSON.stringify([activeSort,display,limit]),measured(result)&&!additiveMeasure(result));
 const seriesIndex=useMemo(()=>new Map(shownRows.map(row=>[row.id,new Map(row.series?.map(value=>[value.id,value]))])),[shownRows]);
 const totalMetrics=!columns.length||totalsPolicy.column?metrics.length:0;
 const virtual=shownRows.length>100||shownRows.length*(columns.length*metrics.length+totalMetrics)>2000;
 const gap=(index:number,span:number,header=false)=>{const Tag=header?'th':'td';return <Tag key={`gap${index}`} className="kobo-pivot-gap" aria-hidden="true" style={pivotGapStyle(span,metrics.length)}/>};
 const hasDisplaySelector=!!onDisplayChange&&(columns.length>0||showDisplaySelector),displayLabel=columns.length?'Breakdown values':'Values';
 const depth=columns.length?Math.max(1,fields.length):0;
 const formatter=useMemo(()=>new Intl.NumberFormat(language,{maximumFractionDigits:additiveMeasure(result)?result.measure!.decimals:2,minimumFractionDigits:additiveMeasure(result)?result.measure!.decimals:0}),[language]);
 const number=(value:number|null|undefined)=>value==null?'-':formatter.format(value);
 const cell=(value:string)=>copyable?koboCopyCell(value,language):{};
 const percent=(value:number|null|undefined)=>formatPercent(value,percentageDecimals(result),language);
 const numeric=(text:string,count:number|undefined,answer?:string,breakdown?:string)=>{
  if(!onDrilldown||count===undefined||text==='-')return text;
  const label=answer===undefined?'All answered responses':rowLabels.get(answer)||answer;
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
  return <button type="button" className="kobo-pivot-sort" aria-label={`Sort by ${label}`} title={`Sort by ${label}`} onClick={()=>setSort({id,label,metric,series,direction:active&&activeSort.direction==='desc'?'asc':'desc'})}><span dir="auto">{text}</span>{active&&<span aria-hidden="true">{activeSort.direction==='asc'?'▲':'▼'}</span>}</button>;
 };
 const ariaSort=(id:string)=>activeSort?.id===id?(activeSort.direction==='asc'?'ascending':'descending'):'none';
 if(measured(result)&&!additiveMeasure(result))return <>{showCopyButton&&<button type="button" className="soft kobo-copy-table" onClick={event=>void clipboard.copy(koboTableText(result,'count',sortedRows),event.currentTarget,'Formatted table copied',koboTableHtml(result,'count',sortedRows))}><Copy aria-hidden="true"/>Copy</button>}<KoboMeasureTable onHideAnswer={onHideAnswer} onRestoreAnswers={onRestoreAnswers} hiddenAnswerCount={hiddenAnswerCount} result={result} rows={sortedRows} sort={activeSort} onSort={setSort} language={language} limit={limit} onDrilldown={onDrilldown}/>{clipboard.notification}</>;
 return <>
  {(showCopyButton||fields.length>0||hasDisplaySelector)&&<div className="kobo-pivot-toolbar">
   {fields.length>0&&<p className="kobo-pivot-field-labels" dir="auto">{fields.map(field=>field.label).join(' / ')}</p>}
   {showCopyButton&&<button type="button" className="soft kobo-copy-table" aria-label={`Copy table for ${result.name}`} onClick={event=>void clipboard.copy(koboTableText(result,display,sortedRows),event.currentTarget,'Formatted table copied',koboTableHtml(result,display,sortedRows))}><Copy aria-hidden="true"/>Copy</button>}
   {hasDisplaySelector&&<div className="kobo-pivot-display"><KoboSegmentedControl label={displayLabel} value={display} options={[["count","#","Counts"],["percent","%","Percentages"],["both","Both","Counts and percentages"]]} onChange={value=>onDisplayChange?.(value)}/></div>}
  </div>}
  {result.percentageMode&&result.percentageMode!=='legacy-respondents'&&<p className="kobo-pivot-field-labels">{result.percentageBasis}</p>}
  {result.kind==='multiple'&&(!result.percentageMode||result.percentageMode==='legacy-respondents')&&<small>Multiple selections allowed. Percentages use answered respondents and may total more than 100%.</small>}
  {selection.controls}
  <div {...selection.events} ref={viewport.ref} onKeyDown={viewport.keyboard} onFocusCapture={viewport.focus} className={`legal-table-wrap kobo-table-wrap kobo-pivot-wrap${viewport.wide?' is-windowed-columns':''}${selection.enabled?' is-selecting':''}`} role="region" aria-label="Pivot table" tabIndex={0}>
   <table className="kobo-pivot-table" aria-colcount={1+columns.length*metrics.length+totalMetrics} aria-rowcount={depth+1+shownRows.length+(totalsPolicy.row?1:0)} style={viewport.tableStyle&&{...viewport.tableStyle,width:Number(viewport.tableStyle.width)+totalMetrics*112}}>{viewport.wide&&<KoboPivotColumns slots={viewport.slots} metrics={metrics.length} totals={totalMetrics}/>}<caption className="kobo-pivot-caption">{result.label}</caption><thead>
    {Array.from({length:depth},(_,level)=>{
     const cells:{start:number;span:number;label:string}[]=[];
     keys.forEach((path,index)=>{const previous=cells.at(-1);if(previous&&JSON.stringify(keys[previous.start].slice(0,level+1))===JSON.stringify(path.slice(0,level+1)))previous.span++;else cells.push({start:index,span:1,label:paths[index][level]||columns[index].label})});
     return <tr key={level}>{level===0&&<th scope="col" rowSpan={depth+1} className="no-sort kobo-pivot-answer" aria-sort={ariaSort('answer')}>{sortButton('answer','Answer','answer','Answer')}</th>}{viewport.slots.flatMap(slot=>{if(slot.gap)return gap(slot.index,slot.span,true);const cell=cells.find(cell=>slot.index>=cell.start&&slot.index<cell.start+cell.span)!;const previous=viewport.slots.find(value=>!value.gap&&value.index===slot.index-1);if(previous&&previous.index>=cell.start)return [];let span=1;while(span<cell.span&&viewport.slots.some(value=>!value.gap&&value.index===slot.index+span)&&slot.index+span<cell.start+cell.span)span++;return <th key={slot.index} colSpan={span*metrics.length} scope="colgroup" className={`no-sort ${band(cell.start)}`} aria-sort={ariaSort(`group:${level}:${JSON.stringify(keys[cell.start].slice(0,level+1))}`)}>{sortButton(`group:${level}:${JSON.stringify(keys[cell.start].slice(0,level+1))}`,paths[cell.start].slice(0,level+1).join(' / '),'count',cell.label,columns.slice(cell.start,cell.start+cell.span).map(column=>column.id))}</th>})}{level===0&&totalsPolicy.column&&<th scope="colgroup" rowSpan={depth} colSpan={metrics.length} className="no-sort kobo-pivot-total">Total</th>}</tr>;
    })}
    <tr>{!depth&&<th scope="col" className="no-sort kobo-pivot-answer" aria-sort={ariaSort('answer')}>{sortButton('answer','Answer','answer','Answer')}</th>}{viewport.slots.flatMap(slot=>{if(slot.gap)return gap(slot.index,slot.span,true);const index=slot.index,column=columns[index];return metrics.map((metric,metricIndex)=><th data-pivot-column={index*metrics.length+metricIndex} aria-colindex={2+index*metrics.length+metricIndex} scope="col" key={`${column.id}:${metric}`} className={`no-sort ${band(index)}`} aria-sort={ariaSort(`${column.id}:${metric}`)}>{sortButton(`${column.id}:${metric}`,`${column.label} ${metric==='count'?'count':'percentage'}`,metric,metric==='count'?(result.measure?.label||'#'):'%',[column.id])}</th>)})}{(!depth||totalsPolicy.column)&&metrics.map(metric=><th key={metric} scope="col" className="no-sort kobo-pivot-total" aria-sort={ariaSort(`total:${metric}`)}>{sortButton(`total:${metric}`,metric==='count'?'Total count':'Total percentage',metric,metric==='count'?(result.measure?.label||'#'):'%')}</th>)}</tr>
   </thead><VirtualRows items={shownRows} table navigateTable revealIndex={selection.focusRow} enabled={virtual} columns={viewport.physicalColumns+totalMetrics} estimate={44} render={(row,rowIndex)=><tr key={row.id} aria-rowindex={depth+2+rowIndex}><th scope="row" aria-colindex={1} dir="auto" className="no-sort kobo-pivot-answer" {...cell(row.label)}>{onHideAnswer||onEditAnswer?<KoboAnswerActions label={row.label} language={language} hiddenCount={hiddenAnswerCount} onRename={onEditAnswer&&row.id!=='__blank__'?()=>onEditAnswer(row.id):undefined} onManage={onEditAnswer?()=>onEditAnswer():undefined} onHide={onHideAnswer?()=>onHideAnswer(row.id):undefined} onRestore={onRestoreAnswers}>{row.label}</KoboAnswerActions>:row.label}</th>{viewport.slots.flatMap(slot=>{if(slot.gap)return gap(slot.index,slot.span);const index=slot.index,column=columns[index],value=seriesIndex.get(row.id)?.get(column.id);return metrics.map((metric,metricIndex)=>{const text=metric==='count'?(value?number(pivotValue(result,value)):'-'):percent(displayPercent(value));return <td {...selection.attributes(rowIndex,index*metrics.length+metricIndex)} data-pivot-column={index*metrics.length+metricIndex} aria-colindex={2+index*metrics.length+metricIndex} key={`${column.id}:${metric}`} className={`${band(index)}${metric==='percent'?' kobo-pivot-percent':''}`} {...numericCopy(text)}>{numeric(text,result.measure?value?.contributingCount:value?.count,row.id,column.id)}</td>})})}{(!depth||totalsPolicy.column)&&metrics.map(metric=>{const text=metric==='count'?number(pivotValue(result,row)):percent(displayPercent(row));return <td {...selection.attributes(rowIndex,columns.length*metrics.length+metrics.indexOf(metric))} aria-colindex={2+columns.length*metrics.length+metrics.indexOf(metric)} key={metric} className={`kobo-pivot-total${metric==='percent'?' kobo-pivot-percent':''}`} {...numericCopy(text)}>{numeric(text,result.measure?row.contributingCount:row.count,row.id)}</td>})}</tr>}/>
   {totalsPolicy.row&&<tfoot><tr><th scope="row" className="no-sort kobo-pivot-answer" title={result.percentageMode&&result.percentageMode!=='legacy-respondents'?'Answer selections, including answers beyond the visible row limit':'Answered respondents, including answers beyond the visible row limit'} {...cell('Total')}>Total</th>{depth?viewport.slots.flatMap(slot=>{if(slot.gap)return gap(slot.index,slot.span);const index=slot.index,column=columns[index];return metrics.map(metric=><td {...selection.attributes(shownRows.length,index*metrics.length+metrics.indexOf(metric))} key={`${column.id}:${metric}`} className={band(index)} {...numericCopy(metric==='count'?number(pivotColumnTotal(result,column)):percent(pivotBottomPercent(result,column)))}>{numeric(metric==='count'?number(pivotColumnTotal(result,column)):percent(pivotBottomPercent(result,column)),result.measure?column.contributingCount:column.denominator,undefined,column.id)}</td>) }):metrics.map(metric=>{const text=metric==='count'?number(pivotGrandTotal(result)):percent(pivotBottomPercent(result));return <td {...selection.attributes(shownRows.length,metrics.indexOf(metric))} key={metric} {...numericCopy(text)}>{numeric(text,result.measure?result.measureTotal?.contributingCount:result.denominator)}</td>})}{depth>0&&totalsPolicy.column&&metrics.map(metric=>{const text=metric==='count'?number(pivotGrandTotal(result)):percent(pivotBottomPercent(result));return <td {...selection.attributes(shownRows.length,columns.length*metrics.length+metrics.indexOf(metric))} key={`total:${metric}`} className="kobo-pivot-total" {...numericCopy(text)}>{numeric(text,result.measure?result.measureTotal?.contributingCount:result.denominator)}</td>})}</tr></tfoot>}</table>
  </div>{selection.bar}{clipboard.notification}
 </>;
}
