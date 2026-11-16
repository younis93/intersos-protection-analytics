import {describe,expect,it} from 'vitest';
import {barValueLabel,labelInk} from './koboDataLabels';
import {chartSpec} from './koboChartSpec';
import {chartLabel} from './koboAppearance';

import type {Data} from 'plotly.js';
import type {KoboResult} from './koboTypes';
const result={id:'q',name:'q',label:'Gender',kind:'category',denominator:200,rows:[{id:'a',label:'Male',count:145,percent:72.5},{id:'b',label:'Female',count:54,percent:27},{id:'c',label:'Other',count:1,percent:.5},{id:'d',label:'Unanswered option',count:0,percent:0}],colors:{a:'#ffffff',b:'#123456'},breakdowns:[],chart:'bar'} as unknown as KoboResult;
const texts=(trace:Data)=>(trace as {text?:string[]}).text;
it('can hide rounded zero percentages in charts and exports while keeping counts and data',()=>{
 const source={...result,chart:'column' as const,breakdowns:[],rows:[
  {...result.rows[0],percent:0},
  {...result.rows[1],percent:0.4},
  {...result.rows[2],percent:0.5},
 ]};
 for(const exporting of [false,true]){
  const shown=chartSpec({...source,appearance:{metric:'percent',labels:'percent'}},'en',exporting).data[0];
  const hidden=chartSpec({...source,appearance:{metric:'percent',labels:'percent',zeroPercentLabels:'hide'}},'en',exporting).data[0];
  expect(shown).toMatchObject({y:[0,0.4,0.5],text:['0%','0%','1%']});
  expect(hidden).toMatchObject({y:[0,0.4,0.5],text:['','','1%']});
  expect(hidden).toMatchObject({hovertext:(shown as {hovertext?:string[]}).hovertext});
 }
 expect(chartLabel(7,0.004,'both','en',2,'hide')).toBe('7');
 expect(chartLabel(7,0.005,'percent','en',2,'hide')).toBe('0.01%');
});

describe('readable chart values',()=>{
 it('uses contrast from the bar fill',()=>{expect(labelInk('#fff')).toBe('#081827');expect(labelInk('#123456')).toBe('#ffffff');expect(labelInk('#1683d8')).toBe('#081827')});
 it('uses larger bold value labels independently of axes and respects explicit sizes',()=>{const spec=chartSpec(result,'en');expect(spec.layout.font?.size).toBe(12);expect(spec.data[0]).toMatchObject({insidetextfont:{size:14,weight:700},outsidetextfont:{size:14,weight:700}});expect(chartSpec({...result,appearance:{fontSize:10}},'en').data[0]).toMatchObject({insidetextfont:{size:10,weight:700}});expect(chartSpec(result,'en',true).data[0]).toMatchObject({insidetextfont:{size:14*2.3,weight:700}});expect(chartSpec({...result,chart:'line'},'en').data[0]).toMatchObject({textfont:{size:14,weight:700}});expect(chartSpec({...result,chart:'pie'},'en').data[0]).toMatchObject({insidetextfont:{size:14,weight:700}})});
 it('places short unstacked values outside and suppresses short stacked values',()=>{expect(barValueLabel('145',145,145,600,30,12,true,false)).toEqual({text:'145',position:'inside'});expect(barValueLabel('1',1,145,600,30,12,true,false)).toEqual({text:'1',position:'outside'});expect(barValueLabel('1',1,145,600,30,12,true,true)).toEqual({text:'',position:'inside'});expect(barValueLabel('999999',100,100,220,15,12,false,false).position).toBe('outside')});
 it('uses outside labels for new charts and charts saved with legacy automatic placement',()=>{
  const spec=chartSpec(result,'en');
  expect(spec.data[0]).toMatchObject({text:['145','54','1',''],textposition:['outside','outside','outside','outside']});
  expect(chartSpec({...result,appearance:{labelPosition:'auto'}},'en')).toEqual(spec);
 });
 it('forces outside labels and reserves room for their full text on narrow and exported charts',()=>{
  for(const chart of ['bar','column','histogram'] as const)for(const exporting of [false,true]){
   const spec=chartSpec({...result,chart,appearance:{labelPosition:'outside',labels:'both',fontSize:24}},'en',exporting,undefined,300);
   expect(spec.data[0]).toMatchObject({textposition:['outside','outside','outside','outside'],text:['145 / 73%','54 / 27%','1 / 1%','0 / 0%']});
   expect(spec.layout[chart==='bar'?'xaxis':'yaxis']?.range?.[1]).toBeGreaterThan(145);
  }
 });
 it('shrinks labels that can fit inside and moves smaller labels outside',()=>{
  const source={...result,appearance:{fontSize:28,labelPosition:'inside',labels:'both'}} as KoboResult;
  const spec=chartSpec(source,'en',false,undefined,430);
  expect(spec.data[0]).toMatchObject({textposition:['inside','inside','outside','outside'],text:['145 / 73%','54 / 27%','1 / 1%','0 / 0%'],hovertext:expect.arrayContaining([expect.stringContaining('# Count: <b>1</b>')])});
  const sizes=(spec.data[0] as unknown as {insidetextfont:{size:number[]}}).insidetextfont.size;
  expect(sizes[0]).toBe(28);
  expect(sizes[1]).toBeGreaterThanOrEqual(8);
  expect(sizes[1]).toBeLessThan(28);
 });
 it('retains automatic placement for stacks, hidden labels and unsupported charts',()=>{
  const source={...result,breakdowns:[{id:'b',label:'Group',denominator:200}],rows:result.rows.map(row=>({...row,series:[{id:'b',count:row.count,percent:row.percent}]})),appearance:{bars:'stack'}} as KoboResult;
  expect(chartSpec({...source,appearance:{bars:'stack',labelPosition:'outside'}},'en')).toEqual(chartSpec({...source,appearance:{bars:'stack',labelPosition:'auto'}},'en'));
  expect(chartSpec({...source,appearance:{bars:'stack',labelPosition:'inside'}},'en').data[0]).toMatchObject({text:['145','54','',''],textposition:['inside','inside','inside','inside']});
  expect(chartSpec({...result,appearance:{labels:'hidden',labelPosition:'outside'}},'en').data[0]).toMatchObject({text:undefined,textposition:'none'});
  expect(chartSpec({...result,chart:'pie',appearance:{labelPosition:'inside'}},'en').data[0]).toMatchObject({textposition:'auto'});
 });
 it('reserves room at both ends for outside labels on signed calculated bars',()=>{
  const spec=chartSpec({...result,rows:result.rows.map((row,index)=>({...row,value:index===0?-100:index===1?200:null})),measure:{operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false},appearance:{labelPosition:'outside'}},'en');
  expect(spec.data[0]).toMatchObject({x:[-100,200,null,null],textposition:'outside'});
  expect(spec.layout.xaxis!.range![0]).toBeLessThan(-100);
  expect(spec.layout.xaxis!.range![1]).toBeGreaterThan(200);
 });
 it('follows percentage metrics and retains explicit hidden/both modes',()=>{expect(chartSpec({...result,appearance:{metric:'percent'}},'en').data[0]).toMatchObject({text:['73%','27%','1%','']});expect(chartSpec({...result,appearance:{labels:'hidden'}},'en').data[0]).toMatchObject({text:undefined,textposition:'none'});expect(chartSpec({...result,appearance:{labels:'both'}},'en').data[0]).toMatchObject({text:['145 / 73%','54 / 27%','1 / 1%','0 / 0%']})});
 it('formats Arabic and preserves label values when exporting',()=>{const web=chartSpec(result,'ar'),exported=chartSpec(result,'ar',true);expect(web.data[0]).toMatchObject({text:texts(exported.data[0])});expect(String(texts(web.data[0])?.[0])).toContain(new Intl.NumberFormat('ar').format(145))});
 it('includes values on pies, hides tiny slice labels and labels line markers',()=>{const pie=chartSpec({...result,chart:'donut'},'en').data[0];expect(texts(pie)?.[0]).toBe('Male<br>145');expect(texts(pie)?.[2]).toBe('');expect(chartSpec({...result,chart:'line'},'en').data[0]).toMatchObject({mode:'text+lines+markers',textposition:'top center'});expect(chartSpec({...result,rows:[]},'en').data).toHaveLength(1)});
 it('uses horizontal space and keeps every positive value on dense narrow comparisons',()=>{const dense={...result,chart:'bar' as const,rows:Array.from({length:40},(_,index)=>({id:String(index),label:String(index),count:100,percent:50}))};const spec=chartSpec(dense,'en',false,'glass-light',300);expect(spec.data[0]).toMatchObject({orientation:'h'});expect(texts(spec.data[0])?.filter(Boolean)).toHaveLength(40);expect(spec.layout.yaxis?.tickvals).toHaveLength(40);expect(texts(chartSpec({...dense,appearance:{labels:'count'}},'en',false,'glass-light',300).data[0])?.filter(Boolean)).toHaveLength(40)});

});
