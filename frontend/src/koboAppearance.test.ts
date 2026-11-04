import {describe,it,expect} from 'vitest';
import {chartSpec} from './koboChartSpec';
import {chartLabel,resolveAppearance} from './koboAppearance';
import {bulkQuestionSettings} from './koboBulkSettings';
import {calculationKey} from './koboCustomizeOptions';
import {questionDefaults,type KoboResult,type KoboSettings,type KoboQuestion} from './koboTypes';
const result={id:'q',name:'q',label:'Needs',kind:'multiple',denominator:2,missing:0,total:2,rows:[{id:'a',label:'Refugee registered with UNHCR or authorities',count:2,percent:100,series:[{id:'f',count:1,percent:50}]},{id:'b',label:'IDP',count:1,percent:50,series:[{id:'f',count:2,percent:100}]}],breakdowns:[{id:'f',label:'Female',denominator:2}],breakdownFields:[{id:'sex',label:'Sex'}],statistics:{},colors:{},chart:'column'} as KoboResult;
describe('Kobo reporting appearance',()=>{
 it('keeps titles optional and adds wrapped plain-text titles to screen and exported charts',()=>{
  for(const chart of ['bar','column','line','pie','donut','heatmap'] as const)for(const exporting of [false,true]){
   const source={...result,chart};
   const plain=chartSpec(source,'en',exporting);
   expect(plain.layout.title).toBeUndefined();
   expect(chartSpec({...source,appearance:{title:'   '}},'en',exporting)).toEqual(plain);
   const titled=chartSpec({...source,appearance:{title:'Needs <overview> & priorities'}},'en',exporting);
   expect(titled.layout.title).toMatchObject({text:'Needs &lt;overview&gt; &amp; priorities'});
   expect(titled.data).toEqual(plain.data);
   expect(Number(titled.layout.height)).toBeGreaterThan(Number(plain.layout.height));
   expect(titled.layout.margin!.t).toBeGreaterThan(plain.layout.margin!.t!);
  }
  const narrow=chartSpec({...result,appearance:{title:'A long chart title that wraps clearly on a narrow screen without changing any category values'}},'en',false,undefined,320);
  expect(narrow.layout.title).toMatchObject({text:expect.stringContaining('<br>')});
 });
 it('adds titles to calculated charts too',()=>{
  const source={...result,measure:{operation:'sum',field:'amount',label:'Amount',unit:'',parentValuesRepeated:false},appearance:{title:'Total amount'}} as KoboResult;
  expect(chartSpec(source,'en').layout.title).toMatchObject({text:'Total amount'});
  expect(chartSpec(source,'en',true).layout.title).toMatchObject({text:'Total amount'});
 });
 it('shows automatic metric labels while preserving values and dimensions',()=>{const spec=chartSpec(result,'en');expect(spec.layout.barmode).toBe('group');expect(spec.layout.height).toBe(360);expect(spec.data[0]).toMatchObject({y:[1,2],text:['1','2']});expect(resolveAppearance().metric).toBe('auto')});
 it('uses respondent percentages without normalizing stacked series',()=>{const spec=chartSpec({...result,appearance:{metric:'percent',bars:'stack',labels:'both'}},'en');expect(spec.layout.barmode).toBe('stack');expect(spec.data[0]).toMatchObject({y:[50,100],text:['1 / 50%','2 / 100%']});expect(spec.layout.yaxis?.ticksuffix).toBe('%');expect(result.rows[0].count).toBe(2)});
 it('uses custom respondent percentages for multi-select pie labels',()=>{const spec=chartSpec({...result,chart:'donut',breakdowns:[],appearance:{labels:'percent'}},'en');expect(spec.data[0]).toMatchObject({values:[2,1],text:['100%','50%'],textinfo:'text'});expect(chartLabel(0,null,'both','en')).toBe('0 / -')});
 it('applies legend, grid, fonts and export height consistently',()=>{const value={...result,appearance:{legend:'right',grid:'hide',height:560,fontSize:14} as const},app=chartSpec(value,'en'),exported=chartSpec(value,'en',true);expect(app.layout.legend?.orientation).toBe('v');expect(app.layout.font?.size).toBe(14);expect(app.layout.xaxis?.showgrid).toBe(false);expect(app.layout.height).toBe(560);expect(exported.layout.height).toBe(784);expect(exported.layout.font?.size).toBeCloseTo(32.2)});
 it('wraps long category captions without diagonal overlap',()=>{const spec=chartSpec(result,'en');expect(spec.layout.xaxis?.tickangle).toBe(0);expect(spec.layout.xaxis?.ticktext?.[0]).toContain('<br>')});
 it('merges only selected bulk appearance settings and excludes them from calculation keys',()=>{const settings={questions:{q:{...questionDefaults,appearance:{legend:'left',fontSize:16}}}} as unknown as KoboSettings;const cfg=bulkQuestionSettings({id:'q',kind:'multiple'} as KoboQuestion,settings,{appearance:{metric:'percent'}});expect(cfg.appearance).toEqual({legend:'left',fontSize:16,metric:'percent'});expect(calculationKey(cfg)).toBe(calculationKey({...questionDefaults}));expect(settings.questions.q.appearance?.metric).toBeUndefined()});
 it('handles empty charts, hidden legends, horizontal bars and line labels',()=>{expect(chartSpec({...result,rows:[],appearance:{legend:'hidden'}},'ar').layout.showlegend).toBe(false);expect(chartSpec({...result,chart:'bar',appearance:{metric:'percent'}},'en').data[0]).toMatchObject({x:[50,100],orientation:'h'});expect(chartSpec({...result,chart:'line',appearance:{labels:'count'}},'en').data[0]).toMatchObject({mode:'text+lines+markers',text:['1','2']})});
});


describe('optional chart labels',()=>{
 for(const chart of ['bar','column','line','pie','donut','heatmap'] as const){
  for(const exporting of [false,true]){
   it(`hides ${chart} labels for ${exporting?'export':'preview'} while preserving data and hover details`,()=>{
    const shown={...result,chart,breakdowns:chart==='pie'||chart==='donut'?[]:result.breakdowns,appearance:{labels:'both' as const}};
    const before=structuredClone(shown);
    const visible=chartSpec(shown,'en',exporting);
    const hidden=chartSpec({...shown,appearance:{labels:'hidden'}},'en',exporting);
    if(chart==='pie'||chart==='donut')expect(hidden.data[0]).toMatchObject({textinfo:'none'});
    else if(chart==='heatmap')expect(hidden.data[0]).toMatchObject({texttemplate:''});
    else if(chart==='line')expect(hidden.data[0]).toMatchObject({mode:'lines+markers',text:undefined});
    else expect(hidden.data[0]).toMatchObject({text:undefined,textposition:'none'});
    for(const key of ['x','y','z','values','labels','hovertext','hovertemplate','customdata'] as const){
     expect(Reflect.get(hidden.data[0],key)).toEqual(Reflect.get(visible.data[0],key));
    }
    expect(hidden.layout.xaxis?.ticktext).toEqual(visible.layout.xaxis?.ticktext);
    expect(hidden.layout.yaxis?.ticktext).toEqual(visible.layout.yaxis?.ticktext);
    expect(shown).toEqual(before);
    for(const labels of ['auto','count','percent','both'] as const){
     const restored=chartSpec({...shown,appearance:{labels}},'en',exporting).data[0];
     if(chart==='pie'||chart==='donut')expect(restored).toMatchObject({textinfo:'text'});
     else if(chart==='heatmap')expect(restored).toMatchObject({texttemplate:'%{text}'});
     else expect(Reflect.get(restored,'text')).toEqual(expect.arrayContaining([expect.stringMatching(/\d/)]));
    }
   });
  }
 }
 it('applies hidden labels in bulk without changing other appearance settings',()=>{
  const settings={questions:{q:{...questionDefaults,appearance:{metric:'percent',legend:'left'}}}} as unknown as KoboSettings;
  const cfg=bulkQuestionSettings({id:'q',kind:'multiple'} as KoboQuestion,settings,{appearance:{labels:'hidden'}});
  expect(cfg.appearance).toEqual({metric:'percent',legend:'left',labels:'hidden'});
  expect(settings.questions.q.appearance?.labels).toBeUndefined();
 });
});

describe('value axis visibility',()=>{for(const chart of ['bar','column'] as const)it('hides only the value scale for '+chart,()=>{const spec=chartSpec({...result,chart,appearance:{valueAxis:'hide'}},'en');expect(spec.layout[chart==='bar'?'xaxis':'yaxis']?.showticklabels).toBe(false);expect(spec.layout[chart==='bar'?'yaxis':'xaxis']?.showticklabels).not.toBe(false);expect(spec.data).toEqual(chartSpec({...result,chart},'en').data)});});


it('formats escaped titles consistently in preview and export',()=>{
 for(const exporting of [false,true])for(const align of ['left','center','right'] as const){
  const spec=chartSpec({...result,appearance:{title:'Title <safe>',titleBold:true,titleItalic:true,titleUnderline:true,titleAlign:align,titleFont:'Georgia',titleSize:24,titleColor:'#123456'}},'en',exporting);
  expect(spec.layout.title).toMatchObject({text:'<u><i><b>Title &lt;safe&gt;</b></i></u>',xanchor:align,x:align==='left'?0:align==='right'?1:.5,font:{family:'Georgia',size:exporting?48:24,color:'#123456'}});
 }
});
