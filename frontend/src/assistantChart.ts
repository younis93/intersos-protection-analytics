import {displayPercent} from './koboPercentages';
import type {KoboResult} from './koboTypes';

export function assistantChart(result:KoboResult){
 if(!result.denominator||result.pivotHasHiddenColumns&&!result.breakdowns.length)return null;
 const rows=result.rows.filter(row=>row.id!=='__blank__');
 const plotted=rows.filter(row=>result.breakdowns.length
  ?row.series?.some(cell=>cell.count>0)
  :row.count>0);
 if(!plotted.length)return null;

 const single=!result.breakdowns.length&&plotted.length===1?plotted[0]:undefined;
 const needsBar=!!single||result.chart==='heatmap'&&!result.breakdowns.length;
 const chartResult=needsBar?{
  ...result,chart:'bar' as const,rows:single?[single]:rows,
  appearance:{...result.appearance,metric:'count' as const,labels:'both' as const},
 }:result;
 return {result:chartResult,single:single&&{label:single.label,count:single.count,percent:displayPercent(single)}};
}
