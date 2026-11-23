import {describe,it,expect} from 'vitest';
import {chartImageSpec,chartSpec,fixedChartImageSpec} from './koboChartSpec';
import {chartLabel,resolveAppearance} from './koboAppearance';
import {bulkQuestionSettings} from './koboBulkSettings';
import {calculationKey} from './koboCustomizeOptions';
import {questionDefaults,type KoboResult,type KoboSettings,type KoboQuestion} from './koboTypes';
const result={id:'q',name:'q',label:'Needs',kind:'multiple',denominator:2,missing:0,total:2,rows:[{id:'a',label:'Refugee registered with UNHCR or authorities',count:2,percent:100,series:[{id:'f',count:1,percent:50}]},{id:'b',label:'IDP',count:1,percent:50,series:[{id:'f',count:2,percent:100}]}],breakdowns:[{id:'f',label:'Female',denominator:2}],breakdownFields:[{id:'sex',label:'Sex'}],statistics:{},colors:{},chart:'column'} as KoboResult;
describe('Kobo reporting appearance',()=>{
 it('reserves room for large whole-word labels and keeps the numeric scale readable',()=>{
  const labels=['Urban/residential area','Hosted by relatives/friends','Collective shelter','Camp'];
  const source:KoboResult={...result,breakdowns:[],rows:labels.map((label,index)=>({...result.rows[0],id:String(index),label})),appearance:{fontSize:27}};
  const auto=chartSpec(source,'en',false,'glass-light',760);
  expect(Number(auto.layout.width)).toBeGreaterThan(760);
  expect(auto.layout.yaxis?.tickfont?.size).toBe(12);
  expect(auto.layout.xaxis?.tickfont?.size).toBe(27);
  const fixed={...source,appearance:{...source.appearance,chartWidthMode:'narrow' as const}};
  const png=fixedChartImageSpec(fixed,'en')!;
  expect(png.layout.xaxis?.ticktext).toHaveLength(labels.length);
  expect(png.layout.xaxis?.categoryarray).toHaveLength(labels.length);
 });
 it.each(['left','right'] as const)('wraps fixed-width %s legend text at whole words in the preview and PNG',legend=>{
  const label='2. Sex of the respondent:';
  const source:KoboResult={...result,label,breakdowns:[],appearance:{legend,chartWidthMode:'custom',chartWidth:360}};
  const live=chartSpec(source,'en');
  const png=fixedChartImageSpec(source,'en')!;
  for(const spec of [live,png]){
   const trace=spec.data[0] as {name:string};
   const lines=trace.name.split('<br>');
   expect(lines).toContain('respondent:');
   expect(lines.join(' ')).toBe(label);
  }
  expect(png.data[0]).toEqual(live.data[0]);
 });
 it('uses a manual height and side legend alignment in the preview and PNG',()=>{
  const source:KoboResult={...result,appearance:{customHeight:517,legend:'right',legendVerticalAlign:'middle'}};
  for(const spec of [chartSpec(source,'en',false,'glass-light',640),chartImageSpec(source,'en',{width:640,page:0},'glass-light')]){
   expect(spec.layout.height).toBe(517);
   expect(spec.layout.legend).toMatchObject({orientation:'v',y:.5,yanchor:'middle'});
  }
 });
 it.each([false,true])('wraps column captions only between words in PNGs (calculated: %s)',calculated=>{
  const labels=['Iraqi','Turkish','Other, please specify','Iranian','Palestinian'];
  const chart:KoboResult={...result,breakdowns:[],rows:labels.map((label,index)=>({...result.rows[0],id:String(index),label,value:1})),
   appearance:{barWidth:'narrow',chartWidthMode:'custom',chartWidth:360},
   ...(calculated?{measure:{operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false}}:{})};
  const live=chartSpec(chart,'en').layout.xaxis?.ticktext;
  expect(live?.[2].replace(/^(?:<br>)+/,'')).toContain('<br>');
  expect(live?.map(label=>label.replace(/<br>/g,' ').trim())).toEqual(labels);
  expect(fixedChartImageSpec(chart,'en')!.layout.xaxis?.ticktext).toEqual(live);
 });
 it('brings two columns closer together in the preview and PNG as the bars get thinner',()=>{
  const dimensions=(['narrow','medium','standard'] as const).map(barWidth=>{
   const chart:KoboResult={...result,breakdowns:[],appearance:{barWidth}};
   const live=chartSpec(chart,'en',false,'glass-light',640);
   const image=chartImageSpec(chart,'en',{width:640,page:0},'glass-light');
   expect(image.layout.xaxis?.domain).toEqual(live.layout.xaxis?.domain);
   expect(image.layout.bargap).toBe(live.layout.bargap);
   const [left,right]=live.layout.xaxis!.domain!;
   const pitch=(right-left)/chart.rows.length;
   return {width:pitch*(1-live.layout.bargap!),gap:pitch*live.layout.bargap!};
  });
  for(const metric of ['width','gap'] as const){
   expect(dimensions[0][metric]).toBeLessThan(dimensions[1][metric]);
   expect(dimensions[1][metric]).toBeLessThan(dimensions[2][metric]);
  }
 });
 it.each([false,true])('tightens bar rows and preserves their layout in PNGs (calculated: %s)',calculated=>{
  const rows=Array.from({length:12},(_,index)=>({...result.rows[0],id:String(index),label:'Answer '+index,value:index+1}));
  const source:KoboResult={...result,chart:'bar',breakdowns:[],rows,
   ...(calculated?{measure:{operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false}}:{})};
  const dimensions=(['narrow','medium','standard'] as const).map(barWidth=>{
   const chart={...source,appearance:{barWidth}};
   const live=chartSpec(chart,'en',false,'glass-light',640);
   const image=chartImageSpec(chart,'en',{width:640,page:0},'glass-light');
   const fixed=fixedChartImageSpec({...chart,appearance:{barWidth,chartWidthMode:'narrow'}},'en','glass-light')!;
   for(const png of [image,fixed])expect(png.layout).toMatchObject({bargap:live.layout.bargap,height:live.layout.height});
   const pitch=(Number(live.layout.height)-(live.layout.margin?.t??0)-(live.layout.margin?.b??0))/rows.length;
   const gap=live.layout.bargap!;
   return {bar:pitch*(1-gap),space:pitch*gap};
  });
  for(const metric of ['bar','space'] as const){
   expect(dimensions[0][metric]).toBeLessThan(dimensions[1][metric]);
   expect(dimensions[1][metric]).toBeLessThan(dimensions[2][metric]);
  }
 });
 it.each(['single','grouped','calculated'] as const)('changes %s bar row spacing with the same width preset',mode=>{
  const count=15;
  const source:KoboResult={...result,chart:'bar',
   breakdowns:mode==='single'?[]:result.breakdowns,
   rows:Array.from({length:count},(_,i)=>({...result.rows[0],id:String(i),label:'Answer '+i,value:i,
    series:result.rows[0].series?.map(cell=>({...cell,value:i}))})),
   ...(mode==='calculated'?{measure:{operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false}}:{})};
  const specs=(['compact','standard','spacious'] as const).map(answerSpacing=>chartSpec({...source,appearance:{answerSpacing}},'en'));
  const heights=specs.map(spec=>Number(spec.layout.height));
  expect(heights[0]).toBeLessThan(heights[1]);
  expect(heights[1]).toBeLessThan(heights[2]);
  expect(new Set(specs.map(spec=>spec.layout.bargap)).size).toBe(1);
 });
 it.each([['left',0],['center',.5],['right',1]] as const)('aligns horizontal legends to the %s in charts and images',(legendAlign,x)=>{
  const appearance={legend:'top' as const,legendAlign,title:'Results'};
  for(const exporting of [false,true]){
   const pie={...result,chart:'pie' as const,breakdowns:[],appearance};
   const measure={operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false} as const;
   const trend={dateField:'date',unit:'month' as const,periods:[],denominators:[],excluded:0,series:[]};
   for(const chart of [pie,{...result,appearance},{...result,appearance,measure},{...result,appearance,chart:'line' as const,trend}]){
    expect(chartSpec(chart,'en',exporting).layout.legend).toMatchObject({orientation:'h',x,xanchor:legendAlign,yanchor:'top'});
   }
  }
 });
 it.each([['narrow',.24,.28],['medium',.23,.23],['standard',.2,.2]] as const)('renders %s bar and column widths without changing values',(barWidth,barGap,columnGap)=>{
  for(const chart of ['bar','column'] as const)for(const exporting of [false,true]){
   const measure={operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false} as const;
   for(const source of [{...result,chart},{...result,chart,measure}]){
    const spec=chartSpec({...source,appearance:{barWidth}},'en',exporting);
    expect(spec.layout.bargap).toBe(chart==='bar'?barGap:columnGap);
    expect(spec.data).toEqual(chartSpec(source,'en',exporting).data);
   }
  }
  expect(chartSpec({...result,chart:'histogram',appearance:{barWidth}},'en').layout.bargap).toBe(0);
 });
 it('keeps titles optional and adds wrapped plain-text titles to screen and exported charts',()=>{
  for(const chart of ['bar','column','line','histogram','pie','donut','heatmap'] as const)for(const exporting of [false,true]){
   const source={...result,chart,breakdowns:chart==='pie'||chart==='donut'?[]:result.breakdowns};
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

describe('value axis visibility',()=>{
 it.each(['bar','column'] as const)('sets horizontal and vertical lines independently of scale on %s charts',chart=>{
  const measure={operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false} as const;
  for(const source of [{...result,chart},{...result,chart,measure}]){
   const metricAxis=chart==='bar'?'xaxis':'yaxis',categoryAxis=chart==='bar'?'yaxis':'xaxis';
   const lineOnly=chartSpec({...source,appearance:{valueAxis:'hide',horizontalAxisLine:'show',verticalAxisLine:'hide'}},'en');
   expect(lineOnly.layout.xaxis?.showline).toBe(true);
   expect(lineOnly.layout.yaxis?.showline).toBe(false);
   expect(lineOnly.layout[metricAxis]).toMatchObject({showticklabels:false,zeroline:chart==='column'});
   expect(lineOnly.layout[categoryAxis]?.showticklabels).not.toBe(false);
   const verticalLine=chartSpec({...source,appearance:{valueAxis:'show',horizontalAxisLine:'hide',verticalAxisLine:'show'}},'en');
   expect(verticalLine.layout.xaxis?.showline).toBe(false);
   expect(verticalLine.layout.yaxis?.showline).toBe(true);
   expect(verticalLine.layout[metricAxis]?.zeroline).toBe(chart==='bar');
   expect(verticalLine.layout[metricAxis]?.showticklabels).not.toBe(false);
   expect(verticalLine.data).toEqual(lineOnly.data);
   const legacy=chartSpec({...source,appearance:{valueAxis:'hide'}},'en');
   expect(legacy.layout[metricAxis]).toMatchObject({showticklabels:false,showline:false,zeroline:false});
  }
 });
});

it.each(['bar','column'] as const)('uses custom %s thickness in the preview and fixed-width PNG',chart=>{
 const measure={operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false} as const;
 for(const source of [{...result,chart},{...result,chart,measure}]){
  const appearance={barWidth:'custom' as const,chartWidthMode:'custom' as const,chartWidth:400};
  const thin={...source,appearance:{...appearance,customBarWidth:25}};
  const thick={...source,appearance:{...appearance,customBarWidth:95}};
  expect(chartSpec(thin,'en').layout.bargap).toBe(.75);
  expect(fixedChartImageSpec(thick,'en')!.layout.bargap).toBe(.05);
  expect(chartSpec(thin,'en').data).toEqual(chartSpec(thick,'en').data);
 }
});

describe('grouped breakdown alignment',()=>{
 it.each(['bar','column'] as const)('centers %s categories with zero or missing breakdown values',chart=>{
  const breakdowns=['first','second','third'].map(id=>({id,label:id,denominator:5}));
  const values=[[0,3,2],[2,0,3],[2,3,0],[0,3,0],[1,2,3]];
  const source:KoboResult={...result,chart,breakdowns,rows:values.map((row,index)=>({
   id:String(index),label:'Answer '+index,count:5,percent:100,
   series:row.map((value,i)=>({id:breakdowns[i].id,count:value,percent:value*20,value:value||null})),
  }))};
  const measure={operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false} as const;
  for(const current of [source,{...source,measure}]){
   for(const exporting of [false,true]){
    const {data,layout}=chartSpec(current,'en',exporting);
    const traces=data as {width:number;offset:number[]}[];
    const axis=chart==='bar'?layout.yaxis:layout.xaxis;
    expect(axis?.tickvals).toEqual(source.rows.map(row=>row.id));
    values.forEach((row,rowIndex)=>{
     const centers=traces.flatMap((trace,i)=>row[i]?[trace.offset[rowIndex]+trace.width/2]:[]);
     expect(centers[0]+centers.at(-1)!).toBeCloseTo(0);
     expect(centers).toEqual([...centers].sort((a,b)=>a-b));
    });
   }
  }
  expect(chartSpec({...source,appearance:{bars:'stack'}},'en').data.every(trace=>!('offset' in trace))).toBe(true);
 });
});


it('uses Helvetica Neue at 32 px for new titles',()=>{
 const title=chartSpec({...result,appearance:{title:'Chart title'}},'en').layout.title;
 expect(title?.font).toMatchObject({family:'Helvetica Neue, Arial, sans-serif',size:32});
});

it('wraps, truncates, or rotates the category captions without changing the answers',()=>{
 const wrapped=chartSpec(result,'en',false,undefined,320);
 const truncated=chartSpec({...result,appearance:{categoryLabels:'truncate'}},'en',false,undefined,320);
 const rotated=chartSpec({...result,appearance:{categoryLabels:'rotate'}},'en',false,undefined,320);
 expect(wrapped.layout.xaxis?.ticktext?.[0]).toContain('<br>');
 expect(truncated.layout.xaxis?.ticktext?.[0]).toMatch(/^[^<]*…$/);
 expect(rotated.layout.xaxis?.tickangle).toBe(-45);
 expect(rotated.layout.margin!.b!).toBeGreaterThan(truncated.layout.margin!.b!);
 expect(rotated.layout.xaxis?.tickvals).toEqual(wrapped.layout.xaxis?.tickvals);
 expect(rotated.data[0]).toMatchObject({customdata:Reflect.get(wrapped.data[0],'customdata')});
});

it('ignores a value axis maximum saved by an older version',()=>{
 const appearance={title:'Old chart',valueAxisMaximum:100};
 const restored=chartSpec({...result,appearance},'en');
 expect(restored.layout.yaxis?.range).toEqual(chartSpec({...result,appearance:{title:'Old chart'}},'en').layout.yaxis?.range);
});

it('shares the chosen font while sizing answer labels independently from the title',()=>{
 const source={...result,chart:'bar',appearance:{title:'Needs',fontFamily:'Georgia',fontSize:24,titleSize:18}} as KoboResult;
 for(const exporting of [false,true]){
  const spec=chartSpec(source,'en',exporting);
  expect(spec.layout.title?.font).toMatchObject({family:'Georgia, Arial, sans-serif',size:exporting?36:18});
  expect(spec.layout.font).toMatchObject({family:'Georgia, Arial, sans-serif',size:24*(exporting?2.3:1)});
  expect(spec.data[0]).toMatchObject({outsidetextfont:{size:24*(exporting?2.3:1)}});
 }
});

it('keeps the title aligned to the chart canvas and adjusts the gap in preview and export',()=>{
 for(const exporting of [false,true])for(const [titleSpacing,gap] of [['compact',6],['standard',12],['roomy',24],[10,40/3],[0,0]] as const){
  const spec=chartSpec({...result,appearance:{title:'Chart title',titleSpacing,legend:'hidden'}},'en',exporting);
  const {height,margin,title}=spec.layout;
  const inset=exporting?32:16;
  expect(title).toMatchObject({xref:'container',yref:'container',yanchor:'bottom',pad:{l:inset,r:inset}});
  const fontDescent=Math.ceil(title!.font!.size!*.25);
  expect(margin!.t!-(1-title!.y!)*height!-fontDescent).toBeCloseTo(gap*(exporting?2:1));
  expect(spec.layout.font?.family).toBe('Helvetica Neue, Arial, sans-serif');
 }
});

it('keeps a wrapped title above a top legend',()=>{
 const appearance={title:'Needs',legend:'top',titleSize:24} as const;
 const short=chartSpec({...result,chart:'bar',appearance},'en',false,undefined,320).layout;
 const long=chartSpec({...result,chart:'bar',appearance:{...appearance,title:'A long title that wraps onto several lines on a narrow screen'}},'en',false,undefined,320).layout;
 expect(long.title?.text).toContain('<br>');
 expect((1-long.title!.y!)*long.height!).toBeCloseTo((1-short.title!.y!)*short.height!);
 expect(long.margin!.t!).toBeGreaterThan(short.margin!.t!);
});

it('sizes bar chart gutters to the displayed category captions',()=>{
 for(const exporting of [false,true])for(const calculated of [false,true]){
  const measure=calculated?{operation:'sum',field:'amount',label:'Amount',unit:'',parentValuesRepeated:false}:undefined;
  const source={...result,chart:'bar',measure} as KoboResult;
  const short={...source,rows:source.rows.map((row,index)=>({...row,label:index?'IDP':'Refugee'}))};
  const spec=chartSpec(source,'en',exporting,undefined,320);
  expect(spec.layout.margin!.l!).toBeGreaterThan(chartSpec(short,'en',exporting,undefined,320).layout.margin!.l!);
  expect(spec.layout.yaxis?.ticktext?.[0]).toContain('<br>');
 }
});

it('formats escaped titles consistently in preview and export',()=>{
 for(const exporting of [false,true])for(const align of ['left','center','right'] as const){
  const spec=chartSpec({...result,appearance:{title:'Title <safe>',titleBold:true,titleItalic:true,titleUnderline:true,titleAlign:align,titleFont:'Georgia',titleSize:24,titleColor:'#123456'}},'en',exporting);
  expect(spec.layout.title).toMatchObject({text:'<u><i><b>Title &lt;safe&gt;</b></i></u>',xanchor:align,x:align==='left'?0:align==='right'?1:.5,font:{family:'Georgia',size:exporting?48:24,color:'#123456'}});
 }
});
