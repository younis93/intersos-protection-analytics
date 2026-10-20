import {describe,it,expect} from 'vitest';
import {chartSpec} from './koboChartSpec';
import type {KoboResult} from './koboTypes';

const result:KoboResult={id:'q',name:'q',label:'Sex of respondent',group:'',repeat:'',kind:'category',denominator:331,missing:1,total:332,statistics:{},percentageBasis:'Respondents',chart:'column',colors:{},breakdowns:[],rows:[{id:'m',label:'Male',count:172,percent:51.963746223564954},{id:'f',label:'Female',count:159,percent:48.03625377643505}]};
describe('professional chart tooltips',()=>{
 it.each(['bar','column','line','pie','donut'] as const)('shows rounded counts and percentages for %s without a redundant question box',chart=>{
  const spec=chartSpec({...result,chart},'en'),trace=spec.data[0] as any;
  expect(trace.hovertext[0]).toBe('<b>Male</b><br># Count: <b>172</b><br>% Share: <b>52%</b>');
  expect(trace.hovertemplate).toBe('%{hovertext}<extra></extra>');
  expect(trace.customdata[0].slice(3)).toEqual(['m',null]);
  expect(spec.layout.hoverlabel).toMatchObject({bgcolor:'#17324d',align:'left',font:{color:'#ffffff'}});
 });
 it('retains breakdown context, separates missing from zero, and safely displays labels',()=>{
  const grouped={...result,breakdowns:[{id:'north',label:'North <area>',denominator:5}],rows:[{id:'a',label:'A & B',count:1,percent:20,series:[{id:'north',count:0,percent:0}]},{id:'b',label:'Unavailable',count:1,percent:null}]};
  const trace=chartSpec(grouped,'en').data[0] as any;
  expect(trace.hovertext[0]).toContain('North &lt;area&gt;');
  expect(trace.hovertext[0]).toContain('# Count: <b>0</b><br>% Share: <b>0%</b>');
  expect(trace.hovertext[1]).toContain('# Count: <b>-</b><br>% Share: <b>-</b>');
 });
 it('localizes Arabic numbers while keeping the same count and percentage values',()=>{
  expect((chartSpec(result,'ar').data[0] as any).hovertext[0]).toContain(new Intl.NumberFormat('ar',{maximumFractionDigits:0}).format(result.rows[0].percent!)+'%');
 });
});
