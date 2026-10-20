import {describe,it,expect} from 'vitest';
import {formatPercent,displayPercent} from './koboPercentages';
import {koboTableData,koboTableHtml} from './koboTableData';
import {chartSpec} from './koboChartSpec';
import {koboPdfChartPanels} from './koboChartDensity';
import type {KoboResult} from './koboTypes';
const result:KoboResult={id:'q',name:'q',label:'Question',group:'',repeat:'',kind:'category',denominator:3,missing:0,total:3,rows:[{id:'a',label:'A',count:1,percent:100/3,displayPercent:33.4},{id:'b',label:'B',count:1,percent:100/3,displayPercent:33.3},{id:'c',label:'C',count:1,percent:100/3,displayPercent:33.3}],statistics:{},breakdowns:[],percentageBasis:'Answered respondents',percentageDecimals:1,chart:'column',colors:{},appearance:{labels:'percent'}};
describe('percentage display across outputs',()=>{
 it.each([0,1,2])('retains exactly %s decimal places and distinguishes unavailable from zero',decimals=>{
  expect(formatPercent(42,decimals)).toBe('42'+(decimals?'.'+'0'.repeat(decimals):'')+'%');
  expect(formatPercent(null,decimals)).toBe('-');
  expect(formatPercent(0,decimals,'ar')).toBe(new Intl.NumberFormat('ar',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(0)+'%');
 });
 it('uses balanced display values in copied tables and chart labels, without overwriting raw data',()=>{
  const table=koboTableData(result);expect(table.slice(1,4).map(row=>row[2])).toEqual(['33.4%','33.3%','33.3%']);
  expect(table.at(-1)).toEqual(['Total','3','100.0%']);
  expect(koboTableHtml(result)).toContain('x:num="0.334"');
  const trace=chartSpec(result,'en').data[0] as any;
  expect(trace.text).toEqual(['33.4%','33.3%','33.3%']);expect(trace.hovertext[0]).toContain('33.4%');
  expect(result.rows[0].percent).toBe(100/3);expect(displayPercent(result.rows[0])).toBe(33.4);
 });
 it('keeps rounded values through sorting and PDF chart panel splitting',()=>{
  const sorted=[...result.rows].reverse();expect(koboTableData(result,'both',sorted)[3][2]).toBe('33.4%');
  const dense={...result,rows:Array.from({length:25},(_,i)=>({...result.rows[i%3],id:String(i)}))};
  expect(koboPdfChartPanels(dense).flatMap(panel=>panel.rows).map(row=>row.displayPercent)).toEqual(dense.rows.map(row=>row.displayPercent));
 });
 it('fixes both chart axes and disables drag interaction while retaining hover and mark identities',()=>{
  const spec=chartSpec(result,'ar');expect(spec.layout.dragmode).toBe(false);expect(spec.layout.xaxis?.fixedrange).toBe(true);expect(spec.layout.yaxis?.fixedrange).toBe(true);
  const trace=spec.data[0] as any;expect(trace.hovertext[0]).toContain('# العدد');expect(trace.customdata[0][3]).toBe('a');
 });
});

