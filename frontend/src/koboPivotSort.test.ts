import {describe,expect,it} from 'vitest';
import {sortPivotRows,type PivotSort} from './koboPivotSort';
import type {KoboRow} from './koboTypes';

const row=(label:string,count:number,percent:number|null,series?:KoboRow['series']):KoboRow=>({id:label,label,count,percent,series});
const result={rows:[row('Answer 10',9,90,[{id:'f',count:1,percent:10}]),row('Answer 2',10,100,[{id:'f',count:8,percent:80}]),row('Missing',2,null)],breakdowns:[{id:'f',label:'Female',denominator:10}]};
const sort=(metric:PivotSort['metric'],direction:PivotSort['direction']='desc',series?:string[]):PivotSort=>({id:metric,label:metric,metric,direction,series});
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
