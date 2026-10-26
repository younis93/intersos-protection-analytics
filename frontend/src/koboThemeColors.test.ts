import {describe,expect,it} from 'vitest';
import {chartSpec} from './koboChartSpec';
import {koboThemePalette} from './koboThemeColors';
import {resolveKoboColors} from './koboCustomizeOptions';
import {questionDefaults,type KoboResult} from './koboTypes';
import type {Theme} from './types';

const themes:Theme[]=['glass-light','glass-dark','unhcr','executive','multicolor','forest'];
const base:KoboResult={id:'q',name:'q',label:'Services',group:'',repeat:'',kind:'category',chart:'column',denominator:21,total:21,missing:0,statistics:{},percentageBasis:'Answered',breakdowns:[],colors:{a:'#174A7E',b:'#2166AC'},rows:['a','b','c','d','e','f'].map((id,index)=>({id,label:id,count:index+1,percent:(index+1)/21*100}))};
const automatic={...questionDefaults,palette:'Blue' as const};

describe('automatic theme gradients in shared Kobo and Custom charts',()=>{
 it.each(themes)('recolors legacy Blue results using the %s theme without changing saved data',theme=>{
  const before=structuredClone(base);
  const trace=chartSpec(base,'en',false,theme,900,automatic).data[0] as any;
  expect(new Set(trace.marker.color).size).toBe(6);
  for(const color of trace.marker.color)expect(koboThemePalette(theme)).toContain(color);
  expect(base).toEqual(before);
  const reversed=chartSpec({...base,rows:[...base.rows].reverse()},'en',false,theme,900,automatic).data[0] as any;
  expect(reversed.marker.color).toEqual([...trace.marker.color].reverse());
 });
 it('changes automatic colors between every theme and preserves custom colors and fixed palettes',()=>{
  const colors=themes.map(theme=>resolveKoboColors(base,'Blue',{a:'#ABCDEF'},theme));
  expect(new Set(colors.map(value=>value.b)).size).toBe(themes.length);
  expect(colors.every(value=>value.a==='#ABCDEF')).toBe(true);
  expect(resolveKoboColors(base,'Warm',{},'forest')).toEqual(resolveKoboColors(base,'Warm',{},'executive'));
 });
 it.each(['pie','donut','line','histogram'] as const)('uses theme colors for %s charts and exported images',chart=>{
  const result={...base,chart};
  for(const exporting of [false,true]){
   const green=chartSpec(result,'en',exporting,'forest',900,automatic).data[0] as any;
   const amber=chartSpec(result,'en',exporting,'executive',900,automatic).data[0] as any;
   expect(green.marker).not.toEqual(amber.marker);
  }
 });
 it('renders multiple heatmap stops and preserves a custom high-value color',()=>{
  const heatmap={...base,chart:'heatmap' as const,breakdowns:[{id:'x',label:'X',denominator:21}],rows:base.rows.map(row=>({...row,series:[{id:'x',count:row.count,percent:row.percent}]}))};
  const scale=(theme:Theme,settings=automatic)=>(chartSpec(heatmap,'en',false,theme,900,settings).data[0] as any).colorscale;
  expect(scale('forest')).toHaveLength(8);
  expect(scale('forest')).not.toEqual(scale('executive'));
  const custom=scale('forest',{...automatic,colors:{series:'#ABCDEF'}});
  expect(custom.at(-1)).toEqual([1,'#ABCDEF']);
 });
});
