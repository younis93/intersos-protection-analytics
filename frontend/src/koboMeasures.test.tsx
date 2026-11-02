import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {koboTableData,koboTableText,koboTableHtml} from './koboTableData';
import KoboPivotTable from './KoboPivotTable';
import {chartSpec} from './koboChartSpec';
import type {KoboResult} from './koboTypes';
const result:KoboResult={id:'q',name:'q',label:'Region',kind:'category',group:'',repeat:'',denominator:4,missing:0,total:4,statistics:{},percentageBasis:'Answered',chart:'bar',colors:{},measure:{operation:'average',field:'amount',decimals:2,label:'Average of Amount',unit:'Records',parentValuesRepeated:false},measureTotal:{value:1000.25,contributingCount:4},breakdowns:[{id:'north',label:'North',denominator:2,value:1200.5,contributingCount:2},{id:'south',label:'South',denominator:2,value:800,contributingCount:2}],rows:[{id:'a',label:'A',count:3,percent:75,value:1000.5,contributingCount:3,series:[{id:'north',count:2,percent:100,value:1200.5,contributingCount:2}]},{id:'b',label:'B',count:1,percent:25,value:-5.5,contributingCount:1}]};
describe('measured pivot presentation',()=>{
 it('copies actual measured totals and precision without changing response counts',()=>{
  const before=structuredClone(result),data=koboTableData(result);
  expect(data[1].slice(-1)).toEqual(['1000.50']);expect(data.at(-1)?.slice(-1)).toEqual(['1000.25']);
  expect(koboTableText(result)).toContain('Average of Amount');expect(koboTableText(result)).not.toContain('75%');
  expect(koboTableHtml(result)).toContain('x:num="1000.5"');expect(koboTableHtml(result)).not.toContain('NaN');
  expect(result).toEqual(before);
 });
 it('renders measured values and contributing-record drilldown without percentage controls',()=>{
  const html=renderToStaticMarkup(<KoboPivotTable result={result} language="en" limit={1} onDrilldown={()=>{}}/>);
  expect(html).toContain('1,000.50');expect(html).toContain('View 3 contributing records');expect(html).toContain('<tfoot>');expect(html).not.toContain('75%');
 });
 it('preserves negative chart values and missing gaps with the correct label',()=>{
  const plot=chartSpec({...result,breakdowns:[]},'en');
  expect((plot.data[0] as any).x).toEqual([1000.5,-5.5]);expect(plot.layout.yaxis?.autorange).toBe('reversed');
  expect((plot.data[0] as any).hovertext[0]).toContain('3 contributing records');
 });
 it('evaluates total axes independently in every shape',()=>{
  for(const n of [0,1,2])for(const m of [0,1,2]){
   const data=koboTableData({...result,rows:result.rows.slice(0,n),breakdowns:result.breakdowns.slice(0,m)});
   expect(data.length).toBe(1+n+Number(n>1));expect(data[0].length).toBe(1+Math.max(1,m)+Number(m>1));
  }
 });
});
