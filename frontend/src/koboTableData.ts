import {displayPercent,formatPercent,percentageDecimals} from './koboPercentages';
import type {KoboResult,KoboRow} from './koboTypes';

export type BreakdownDisplay='count'|'percent'|'both';
const clean=(value:string|number)=>String(value).replace(/[\t\r\n]+/g,' ');
const numeric=(value:number)=>String(Number(value.toFixed(2)));


/** Rectangular, unlocalized values suitable for pasting into Excel. */
export function koboTableData(result:KoboResult,display:BreakdownDisplay='both',rows:KoboRow[]=result.rows):string[][]{
 const percent=(value:number|null|undefined)=>formatPercent(value,percentageDecimals(result));
 const metrics=display==='both'?['count','percent']:[display];
 const headers=['Answer',...result.breakdowns.flatMap(column=>metrics.map(metric=>`${(column.labels||[column.label]).map((label,index)=>`${result.breakdownFields?.[index]?.label||'Breakdown'}: ${label}`).join(' / ')} - ${metric==='count'?'Count':'Percent'}`))];
 if(!result.breakdowns.length)headers.push(...metrics.map(metric=>metric==='count'?'Count':'Percent'));
 const data=rows.map(row=>[row.label,...(result.breakdowns.length?result.breakdowns.flatMap(column=>{
  const value=row.series?.find(series=>series.id===column.id);
  return metrics.map(metric=>metric==='count'?(value?numeric(value.count):'-'):percent(displayPercent(value)));
 }):metrics.map(metric=>metric==='count'?numeric(row.count):percent(displayPercent(row))))]);
 const totals=['Total',...(result.breakdowns.length?result.breakdowns.flatMap(column=>metrics.map(metric=>metric==='count'?numeric(column.denominator):percent(column.denominator?100:null))):metrics.map(metric=>metric==='count'?numeric(result.denominator):percent(result.denominator?100:null)))];
 return [headers,...data,totals].map(row=>row.map(clean));
}

export function koboTableText(result:KoboResult,display:BreakdownDisplay='both',rows:KoboRow[]=result.rows){
 const [headers,...data]=koboTableData(result,display,rows);
 const metrics=display==='both'?['Count','Percent']:[display==='count'?'Count':'Percent'];
 const compactHeaders=result.breakdowns.length?['Answer',...result.breakdowns.flatMap(column=>metrics.map(metric=>`${(column.labels||[column.label]).join(' / ')} - ${metric}`))]:headers;
 return [clean(result.label),...(result.breakdowns.length&&result.breakdownFields?.length?[`Breakdowns: ${result.breakdownFields.map(field=>clean(field.label)).join(' / ')}`]:[]),...[compactHeaders,...data].map(row=>row.map(clean).join('\t'))].join('\r\n');
}

const htmlEscape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
/** Self-contained inline styles survive pasting into Excel, Word, and email editors. */
export function koboTableHtml(result:KoboResult,display:BreakdownDisplay='both',rows:KoboRow[]=result.rows){
 const [headers,...data]=koboTableData(result,display,rows);
 const palette=['#eef5fb','#fff5e8','#edf7f1','#f4effa'];
 const metrics=display==='both'?2:1;
 const paths=result.breakdowns.map(column=>column.labels||[column.label]);
 const depth=result.breakdowns.length?Math.max(1,result.breakdownFields?.length||0,...paths.map(path=>path.length)):0;
 // Category identities, not translated captions, determine adjacent merged groups.
 const key=(index:number,level:number)=>JSON.stringify(Array.from({length:level+1},(_,position)=>result.breakdowns[index].values?.[position]??result.breakdowns[index].id));
 const roots=[...new Set(result.breakdowns.map((_,index)=>key(index,0)))];
 const band=(index:number)=>roots.indexOf(key(index,0))%palette.length;
 const border='border:1px solid #cfdae5;';
 const heading=`${border}padding:9px 12px;background-color:#234b70;color:#ffffff;font-weight:700;text-align:center;vertical-align:middle;white-space:normal;word-break:normal;overflow-wrap:normal;`;
 const headerCell=(label:string,attributes='')=>`<th ${attributes} bgcolor="#234b70" dir="auto" style="${heading}">${htmlEscape(clean(label))}</th>`;
 const groupedHeaders=Array.from({length:depth},(_,level)=>{
  const groups:{start:number;span:number}[]=[];
  result.breakdowns.forEach((_,index)=>{const previous=groups.at(-1);if(previous&&key(previous.start,level)===key(index,level))previous.span++;else groups.push({start:index,span:1})});
  return '<tr>'+(level===0?headerCell('Answer',`scope="col" rowspan="${depth+1}"`):'')+groups.map(group=>headerCell(paths[group.start][level]??result.breakdowns[group.start].label,`scope="colgroup" colspan="${group.span*metrics}"`)).join('')+'</tr>';
 }).join('');
 const metricLabels=display==='both'?['#','%']:[display==='count'?'#':'%'];
 const metricHeaders='<tr>'+(!depth?headerCell('Answer','scope="col"'):'')+Array.from({length:depth?result.breakdowns.length:1},()=>metricLabels.map(label=>headerCell(label,'scope="col"')).join('')).join('')+'</tr>';
 const body=data.map((row,index)=>{
  const total=index===data.length-1;
  return '<tr>'+row.map((value,column)=>{
   const numericValue=column>0&&value!=='-';
   const percentage=numericValue&&value.endsWith('%');
   const background=total?'#dce9f5':column===0?(index%2?'#f3f6fa':'#ffffff'):palette[depth?band(Math.floor((column-1)/metrics)):0];
   const decimals=(percentage?value.slice(0,-1):value).split('.')[1]?.length||0;
   const format=column===0?'\\@':`${percentage?'0':'#,##0'}${decimals?'.'+'0'.repeat(decimals):''}${percentage?'%':''}`;
   const numericAttribute=numericValue?` x:num="${percentage?Number((Number(value.slice(0,-1))/100).toFixed(6)):Number(value)}"`:' x:str';
   return `<${column===0?'th scope="row"':'td'}${numericAttribute} bgcolor="${background}" style="${border}padding:8px 14px;background-color:${background};color:#17324d;text-align:${column===0?'left':'right'};vertical-align:top;white-space:normal;word-break:normal;font-weight:${total?700:400};${total?'border-top:2px solid #47759b;':''}mso-number-format:'${format}';" dir="auto">${htmlEscape(value)}</${column===0?'th':'td'}>`;
  }).join('')+'</tr>';
 }).join('');
 return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="0" cellspacing="0" cellpadding="0" width="${220+(headers.length-1)*110}" style="width:${220+(headers.length-1)*110}px;table-layout:fixed;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4;">`+
 `<colgroup><col width="220" style="width:220px;">${headers.slice(1).map(()=>'<col width="110" style="width:110px;">').join('')}</colgroup>`+
 `<thead><tr><th colspan="${headers.length}" bgcolor="#17324d" dir="auto" style="padding:14px;background-color:#17324d;color:#ffffff;font-size:14pt;font-weight:700;text-align:left;">${htmlEscape(clean(result.label))}</th></tr>`+
 (depth&&result.breakdownFields?.length?`<tr><th colspan="${headers.length}" dir="auto" bgcolor="#eef3f8" style="${border}padding:9px 14px;background-color:#eef3f8;color:#34536f;font-weight:400;text-align:left;">${htmlEscape(result.breakdownFields.map(field=>clean(field.label)).join(' / '))}</th></tr>`:'')+
 groupedHeaders+metricHeaders+`</thead><tbody>${body}</tbody></table></body></html>`;
}
