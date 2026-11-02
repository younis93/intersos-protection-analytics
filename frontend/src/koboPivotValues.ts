import type {KoboMeasureCell,KoboResult} from './koboTypes';
export const additiveMeasure=(r:KoboResult)=>r.measure?.operation==='sum'&&(r.percentageMode??'legacy-respondents')!=='legacy-respondents';
export const pivotValue=(r:KoboResult,c:KoboMeasureCell&{count?:number}|undefined)=>r.measure?c?.value??null:c?.count??null;
export function pivotColumnTotal(r:KoboResult,column:KoboResult['breakdowns'][number]){return r.measure?column.totalValue===undefined?column.value??null:column.totalValue:column.totalCount??column.denominator}
export function pivotGrandTotal(r:KoboResult){return r.measure?r.pivotTotal?.value===undefined?r.measureTotal?.value??null:r.pivotTotal.value:r.pivotTotal?.count??r.denominator}
export function pivotBottomPercent(r:KoboResult,column?:KoboResult['breakdowns'][number]){return column?column.totalPercent===undefined?column.denominator?100:null:column.totalPercent:r.pivotTotal?.percent===undefined?r.denominator?100:null:r.pivotTotal.percent}
export const pivotHasMetrics=(r:KoboResult)=>!r.measure||additiveMeasure(r);
