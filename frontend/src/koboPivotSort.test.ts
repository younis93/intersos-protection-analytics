import {describe,expect,it} from 'vitest';
import {defaultPivotSort,resultWithPivotSort,sortPivotRows,type PivotSort} from './koboPivotSort';
import type {KoboResult,KoboRow} from './koboTypes';
import {chartSpec} from './koboChartSpec';

const row=(label:string,count:number,percent:number|null,series?:KoboRow['series']):KoboRow=>({id:label,label,count,percent,series});
const result={rows:[row('Answer 10',9,90,[{id:'f',count:1,percent:10}]),row('Answer 2',10,100,[{id:'f',count:8,percent:80}]),row('Missing',2,null)],breakdowns:[{id:'f',label:'Female',denominator:10}]};
const sort=(metric:PivotSort['metric'],direction:PivotSort['direction']='desc',series?:string[]):PivotSort=>({id:metric,label:metric,metric,direction,series});

const chartResult=():KoboResult=>({...result,id:'q',name:'q',label:'Answers',kind:'category',chart:'bar',group:'',repeat:'',denominator:21,total:21,missing:0,statistics:{},percentageBasis:'Answered',colors:{}});

it('updates table and chart order together while the server result still has the previous sort',()=>{
 const source=chartResult();
 for(const metric of ['answer','count','percent'] as const)for(const direction of ['asc','desc'] as const){
  const selected=sort(metric,direction,['f']);
  const next=resultWithPivotSort(source,selected,'both','en');
  expect(next.rows).toEqual(sortPivotRows(source,selected,'en'));
  const spec=chartSpec(next,'en');
  expect(spec.layout.yaxis?.categoryarray).toEqual(next.rows.map(row=>row.id));
  expect((spec.data[0] as any).customdata.map((cell:any[])=>cell[3])).toEqual(next.rows.map(row=>row.id));
 }
 expect(source.rows[0].label).toBe('Answer 10');
});

it('reorders Top N rows and trend legends without changing membership or the Other aggregate',()=>{
 const source=chartResult(),other=row('__chart_other__',2,10);
 source.chartProjection={rows:[source.rows[0],source.rows[1],other],topNTotal:3,topNShown:2,topNOther:true};
 source.trend={dateField:'d',unit:'month',excluded:0,periods:[],denominators:[],series:source.rows.map(row=>({id:row.id,label:row.label,points:[]}))};
 const next=resultWithPivotSort(source,sort('answer','asc'),'both','en');
 expect(next.chartProjection?.rows.map(row=>row.id)).toEqual(['Answer 2','Answer 10','__chart_other__']);
 expect(next.chartProjection?.rows.at(-1)).toBe(other);
 expect(next.trend?.series.map(series=>series.id)).toEqual(next.rows.map(row=>row.id));
 expect(source.chartProjection.rows[0].id).toBe('Answer 10');
});

it('preserves natural chart axes when sorting dates and histogram bins',()=>{
 for(const source of [{...chartResult(),kind:'date' as const},{...chartResult(),chart:'histogram' as const,bins:[{id:'bin'}]}]){
  const next=resultWithPivotSort(source,sort('count','asc'),'both','en');
  expect(next.rows).not.toEqual(source.rows);
  expect(next.chartProjection?.rows).toBe(source.rows);
  expect(next.chartProjection?.axisOrder).toBe(true);
 }
});
describe('pivot header sorting',()=>{
 it('sorts numeric totals without comparing formatted strings',()=>{
  expect(sortPivotRows(result,sort('count'),'en').map(row=>row.count)).toEqual([10,9,2]);
  expect(sortPivotRows(result,sort('count','asc'),'en').map(row=>row.count)).toEqual([2,9,10]);
 });
 it('sorts breakdown metrics independently and leaves absent answers last',()=>{
  expect(sortPivotRows(result,sort('count','asc',['f']),'en').map(row=>row.label)).toEqual(['Answer 10','Answer 2','Missing']);
  expect(sortPivotRows(result,sort('percent','desc',['f']),'en').map(row=>row.label)).toEqual(['Answer 2','Answer 10','Missing']);
 });
 it('uses natural answer order and keeps missing percentages last in both directions',()=>{
  expect(sortPivotRows(result,sort('answer','asc'),'en').map(row=>row.label)).toEqual(['Answer 2','Answer 10','Missing']);
  for(const direction of ['asc','desc'] as const)expect(sortPivotRows(result,sort('percent',direction),'en').at(-1)?.label).toBe('Missing');
 });
 it('sorts the full result before the visible row limit and preserves ties',()=>{
  const rows=Array.from({length:40},(_,index)=>row(String(index),index,100));
  expect(sortPivotRows({rows,breakdowns:[]},sort('count'),'en').slice(0,30)[0].count).toBe(39);
  expect(sortPivotRows(result,sort('percent','desc'),'en')[0].label).toBe('Answer 2');
  expect(result.rows[0].label).toBe('Answer 10');
  expect(sortPivotRows({rows:[row('B',2,50),row('A',2,50)],breakdowns:[]},sort('count'),'en').map(row=>row.label)).toEqual(['B','A']);
 });
 it('aggregates counts across a grouped category header',()=>{
  const grouped={rows:[row('A',5,50,[{id:'x',count:2,percent:20},{id:'y',count:3,percent:30}]),row('B',4,40,[{id:'x',count:4,percent:40},{id:'y',count:0,percent:0}])],breakdowns:[{id:'x',label:'X',denominator:10},{id:'y',label:'Y',denominator:10}]};
  expect(sortPivotRows(grouped,sort('count','desc',['x','y']),'en')[0].label).toBe('A');
 });
});


it('keeps unanswered entries last during manual sorting',()=>{
 const pivot={breakdowns:[],rows:[{id:'a',label:'A',count:2,percent:50},{id:'b',label:'B',count:1,percent:25},{id:'__blank__',label:'Blank',count:100,percent:null}]};
 for(const direction of ['asc','desc'] as const){
  const sorted=sortPivotRows(pivot,{id:'total:count',label:'Count',metric:'count',direction},'en');
  expect(sorted.at(-1)?.id).toBe('__blank__');
 }
});


it('sorts count API rows even when optional measured values are null',()=>{
 const result={breakdowns:[],rows:[{id:'a',label:'A',count:1,percent:25,value:null},{id:'b',label:'B',count:3,percent:75,value:null}]};
 expect(sortPivotRows(result,{id:'total:count',label:'Count',metric:'count',direction:'desc'},'en').map(row=>row.id)).toEqual(['b','a']);
});


it('keeps saved sort choices and natural date and bin order',()=>{
 const base={kind:'category' as const,chart:'bar' as const,breakdowns:[]};
 expect(defaultPivotSort(base)?.direction).toBe('desc');
 for(const answerSort of ['form','count-asc','label-asc','label-desc'] as const)expect(defaultPivotSort({...base,answerSort})).toBeNull();
 expect(defaultPivotSort({...base,kind:'date'})).toBeNull();
 expect(defaultPivotSort({...base,chart:'histogram'})).toBeNull();
 expect(defaultPivotSort({...base,bins:[{id:'bin:0'}]})).toBeNull();
});
