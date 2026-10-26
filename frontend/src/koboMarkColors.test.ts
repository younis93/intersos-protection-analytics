import {describe,it,expect} from 'vitest';
import {chartSpec} from './koboChartSpec';
import {editMarkColor,markTargetFromPoint,markColor,markColorKey,resultWithColors} from './koboMarkColors';
import {questionDefaults,type KoboResult} from './koboTypes';

const base:KoboResult={id:'q',name:'q',label:'Question',group:'',repeat:'',kind:'category',denominator:10,missing:0,total:10,statistics:{},percentageBasis:'Respondents',chart:'column',colors:{f:'#123456',m:'#789ABC',series:'#123456'},breakdownFields:[{id:'gender',label:'Gender'}],breakdowns:[{id:'f',label:'Female',values:['f'],denominator:5},{id:'m',label:'Male',values:['m'],denominator:5}],rows:['a','b'].map(id=>({id,label:'Same translated label',count:5,percent:50,series:[{id:'f',count:2,percent:40},{id:'m',count:3,percent:60}]}))};
describe('individual chart colors',()=>{
 it('uses forest defaults while preserving explicit answer, point, and category colors',()=>{
  const plain={...base,breakdowns:[],colors:{}};
  expect((chartSpec(plain,'en',false,'forest').data[0] as any).marker.color).toEqual(['#347653','#459467']);
  expect((chartSpec(plain,'en',false,'glass-light').data[0] as any).marker.color).toEqual(['#2166AC','#3787C0']);
  const custom={...plain,colors:{a:'#abcdef'}};
  expect((chartSpec(custom,'en',false,'forest').data[0] as any).marker.color).toEqual(['#abcdef','#459467']);
  const pie={...plain,chart:'pie' as const};
  expect((chartSpec(pie,'en',false,'forest').data[0] as any).marker.colors).not.toEqual((chartSpec(pie,'en',false,'glass-light').data[0] as any).marker.colors);
  const line={...plain,chart:'line' as const,pointColors:{[markColorKey(plain,{answer:'a'})]:'#123456'}};
  expect(markColor(line,{answer:'a'},'forest')).toBe('#123456');
 });
 it('resolves stable identifiers from ordinary and nested pie event payloads',()=>{
  expect(markTargetFromPoint(base,[2,'40%','Label','b','f'])).toEqual({answer:'b',breakdown:'f'});
  expect(markTargetFromPoint(base,[[2,'40%','Label','b',null]])).toEqual({answer:'b'});
  expect(markTargetFromPoint(base,[2,'40%','Label','missing',null])).toBeNull();
 });
 it.each(['column','bar'] as const)('changes only one %s mark and retains stable click identifiers in exports',chart=>{
  const result={...base,chart,pointColors:{[markColorKey(base,{answer:'b',breakdown:'f'})]:'#FF0000'}};
  for(const exporting of [false,true]){
   const spec=chartSpec(result,'ar',exporting),trace=spec.data[0] as any;
   expect(trace.marker.color).toEqual(['#123456','#FF0000']);
   expect((spec.data[1] as any).marker.color).toEqual(['#789ABC','#789ABC']);
   expect(trace.customdata[1].slice(3)).toEqual(['b','f']);
   expect((chartSpec({...result,rows:[...result.rows].reverse()},'en').data[0] as any).marker.color).toEqual(['#FF0000','#123456']);
  }
 });
 it('uses existing answer overrides for pie slices and ordinary bars',()=>{
  const result={...base,chart:'pie' as const,breakdowns:[],breakdownFields:[],colors:{a:'#123456',b:'#789ABC'}};
  const cfg=editMarkColor(result,{...questionDefaults,colors:result.colors},{answer:'b'},'#FF0000');
  expect(cfg.colors.a).toBe('#123456');expect(cfg.pointColors).toEqual({});
  const trace=chartSpec(resultWithColors(result,cfg),'en').data[0] as any;
  expect(trace.marker.colors).toEqual(['#123456','#FF0000']);expect(trace.customdata[1].slice(3)).toEqual(['b',null]);
 });
 it('changes a line marker without recoloring its connecting line',()=>{
  const result={...base,chart:'line' as const,breakdowns:[],breakdownFields:[]};
  result.pointColors={[markColorKey(result,{answer:'b'})]:'#FF0000'};
  const trace=chartSpec(result,'en').data[0] as any;
  expect(trace.marker.color).toEqual(['#123456','#FF0000']);expect(trace.line.color).toBe('#123456');
 });
 it('resets one override to the inherited palette and preserves other edits without mutating settings',()=>{
  const target={answer:'b',breakdown:'f'},key=markColorKey(base,target),other=markColorKey(base,{answer:'a',breakdown:'m'});
  const cfg={...questionDefaults,palette:'Blue' as const,colors:{},pointColors:{[key]:'#FF0000',[other]:'#00FF00'}};
  const reset=editMarkColor(base,cfg,target,null);
  expect(reset.pointColors).toEqual({[other]:'#00FF00'});expect(cfg.pointColors[key]).toBe('#FF0000');
  expect(markColor(resultWithColors(base,reset),target)).not.toBe('#FF0000');
  expect(markColorKey({...base,breakdownFields:[{id:'other',label:'Other'}]},target)).not.toBe(key);
 });
});
