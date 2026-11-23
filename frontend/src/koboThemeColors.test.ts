import {describe,expect,it} from 'vitest';
import {chartSpec} from './koboChartSpec';
import {koboThemePalette} from './koboThemeColors';
import {koboPalettes,resolveKoboColors} from './koboCustomizeOptions';
import {koboPdfChartPanels,koboScreenChartPage} from './koboChartDensity';
import {resultWithColors} from './koboMarkColors';
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
  expect(trace.marker.color[0]).toBe(koboThemePalette(theme).at(-1));
  expect(trace.marker.color.at(-1)).toBe(koboThemePalette(theme)[0]);
  const reversed=chartSpec({...base,rows:[...base.rows].reverse()},'en',false,theme,900,automatic).data[0] as any;
  expect(reversed.marker.color).toEqual([...trace.marker.color].reverse());
 });
 it('ranks projected percentage values, gives equal values equal shades and keeps overrides',()=>{
  const rows=[
   {...base.rows[0],count:90,displayPercent:12},
   {...base.rows[1],count:20,displayPercent:35},
   {...base.rows[2],count:10,displayPercent:35},
   {id:'__chart_other__',label:'Other',count:30,percent:3},
  ];
  const result:KoboResult={...base,appearance:{metric:'percent'},chartProjection:{rows,topNTotal:6,topNShown:3,topNOther:true}};
  const ramp=koboThemePalette('glass-light');
  const colors=resolveKoboColors(result,'Blue',{a:'#ABCDEF'},'glass-light');
  expect(rows.map(row=>colors[row.id])).toEqual(['#ABCDEF',ramp[0],ramp[0],ramp.at(-1)]);
 });
 it('ranks calculated values and never restarts the gradient on a long chart',()=>{
  const rows=Array.from({length:110},(_,index)=>({id:String(index),label:String(index),count:110-index,percent:null,value:index-5}));
  const result:KoboResult={...base,rows,measure:{operation:'average',field:'amount',decimals:0,label:'Mean',unit:'',parentValuesRepeated:false}};
  const ramp=koboThemePalette('forest');
  const colors=resolveKoboColors(result,'Blue',{},'forest');
  const ranks=rows.map(row=>ramp.indexOf(colors[row.id]));
  expect(ranks).toEqual([...ranks].sort((a,b)=>b-a));
  expect(ranks[0]).toBe(ramp.length-1);
  expect(ranks.at(-1)).toBe(0);
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

describe('fixed blue gradients',()=>{
 it.each(['Navy','Cobalt','Steel Blue','Glacier Blue'] as const)('ranks %s by the projected metric across themes',palette=>{
  const rows=[
   {...base.rows[0],count:20,displayPercent:16},
   {...base.rows[1],count:10,displayPercent:20},
   {...base.rows[2],count:2,displayPercent:20},
   {...base.rows[3],id:'__chart_other__',count:5,displayPercent:5},
  ];
  const result:KoboResult={...base,appearance:{metric:'percent'},chartProjection:{rows,topNTotal:6,topNShown:3,topNOther:true}};
  const ranked=resolveKoboColors(result,palette,{},'glass-light');
  expect(ranked).toEqual(resolveKoboColors(result,palette,{},'glass-dark'));
  expect(ranked.b).toBe(ranked.c);
  expect(ranked.b).toBe(ranked.series);
  expect(new Set([ranked.a,ranked.b,ranked.__chart_other__]).size).toBe(3);
  const measure:KoboResult={...base,rows:[{...rows[0],value:-5},{...rows[1],value:12}],
   measure:{operation:'sum',field:'amount',decimals:0,label:'Amount',unit:'',parentValuesRepeated:false}};
  expect(resolveKoboColors(measure,palette,{}).b).toBe(ranked.series);
 });
 it('carries the same ranks through screen paging, PDF panels, and export traces',()=>{
  const rows=Array.from({length:105},(_,index)=>({id:String(index),label:String(index),count:index+1,percent:null}));
  const result={...base,rows};
  const settings={...automatic,palette:'Navy' as const,colors:{'103':'#ABCDEF'}};
  const resolved=resultWithColors(result,settings,'glass-light');
  const page=koboScreenChartPage(resolved,rows,1).result;
  const panel=koboPdfChartPanels(resolved).at(-1)!;
  expect(page.colors['100']).toBe(resolved.colors['104']);
  expect(panel.colors['103']).toBe('#ABCDEF');
  for(const view of [page,panel]){
   const trace=chartSpec(view,'en',true,'glass-light').data[0] as any;
   expect(trace.marker.color).toEqual(view.rows.map(row=>resolved.colors[row.id]));
  }
 });
 it('uses its full heatmap ramp on standard and calculated charts and honors high-value overrides',()=>{
  const heatmap={...base,chart:'heatmap' as const,breakdowns:[{id:'x',label:'X',denominator:21}],
   rows:base.rows.map(row=>({...row,series:[{id:'x',count:row.count,percent:row.percent,value:row.count*2}]}))};
  const settings={...automatic,palette:'Navy' as const};
  const ramp=koboPalettes.find(option=>option.name==='Navy')!.colors;
  const measure:KoboResult={...heatmap,measure:{operation:'sum',field:'amount',decimals:0,label:'Amount',unit:'',parentValuesRepeated:false}};
  for(const result of [heatmap,measure]){
   const scale=(cfg:typeof settings)=>(chartSpec(result,'en',true,'forest',900,cfg).data[0] as any).colorscale;
   expect(scale(settings).map((entry:[number,string])=>entry[1])).toEqual([...ramp].reverse());
   expect(scale({...settings,colors:{series:'#ABCDEF'}}).at(-1)).toEqual([1,'#ABCDEF']);
  }
 });
});
