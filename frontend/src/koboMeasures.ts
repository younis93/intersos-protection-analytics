import type {KoboResult,KoboRow,KoboMeasureCell} from './koboTypes';
export const measured=(result:KoboResult)=>!!result.measure&&result.measure.operation!=='count';
export function measureNumber(result:KoboResult,value:number|null|undefined,language='en'){
 return value==null?'-':new Intl.NumberFormat(language,{minimumFractionDigits:result.measure?.operation==='unique'?0:result.measure?.decimals??2,maximumFractionDigits:result.measure?.operation==='unique'?0:result.measure?.decimals??2}).format(value);
}
export function measureTableData(result:KoboResult,rows:KoboRow[]=result.rows,policy={row:result.rows.length>1,column:result.breakdowns.length>1}):string[][]{
 const number=(cell:KoboMeasureCell|undefined)=>cell?.value==null?'-':cell.value.toFixed(result.measure?.operation==='unique'?0:result.measure?.decimals??2);
 const headings=['Answer',...result.breakdowns.map(column=>`${column.label} - ${result.measure!.label}`),...(!result.breakdowns.length?[result.measure!.label]:policy.column?['Total - '+result.measure!.label]:[])];
 const values=rows.map(row=>[row.label,...result.breakdowns.map(column=>number(row.series?.find(cell=>cell.id===column.id))),...(!result.breakdowns.length||policy.column?[number(row)]:[])]);
 const totals=['Total',...result.breakdowns.map(number),...(!result.breakdowns.length||policy.column?[number(result.measureTotal||undefined)]:[])];
 return [headings,...values,...(policy.row?[totals]:[])];
}
