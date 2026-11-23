import {singlePeriodTrendNotice} from './koboAdvancedChartSpec';
import {describe,it,expect} from 'vitest';
import {chartSpec} from './koboChartSpec';
import {isDenseKoboChart,koboPdfChartPanels,koboPdfChartKey,readableKoboChartType} from './koboChartDensity';
import {questionDefaults,type KoboResult} from './koboTypes';

const base:KoboResult={id:'q',name:'q',label:'Household size',group:'',repeat:'',kind:'number',chart:'histogram',denominator:2,missing:0,total:2,statistics:{},percentageBasis:'Answered',breakdowns:[],colors:{},rows:[{id:'bin:0',label:'0 - 5',count:1,percent:50},{id:'bin:1',label:'5 - 10',count:0,percent:0},{id:'bin:2',label:'10 - 15',count:1,percent:50}]};
describe('household assessment charts',()=>{
 it.each(['count','percent'] as const)('stacks answers for each breakdown using %s geometry',mode=>{
  const result:KoboResult={...base,chart:'bar',answerStack:{
   mode,questionId:'safety',questionLabel:'Safety',highlightedAnswer:'unsafe',multiple:false,
   answers:[{id:'safe',label:'Safe'},{id:'unsafe',label:'Unsafe'}],
   groups:[{id:'n',label:'North',counts:{safe:2,unsafe:1}},{id:'s',label:'South',counts:{unsafe:4}}],
  }};
  const spec=chartSpec(result,'en',false,undefined,900,{...questionDefaults,colors:{'["stack answer","safety","unsafe"]':'#D65040'}});
  expect(spec.layout.barmode).toBe('stack');
  expect(spec.data[0]).toMatchObject({name:'Safe',x:mode==='count'?[2,0]:[200/3,0],y:['n','s']});
  expect(spec.data[1]).toMatchObject({name:'Unsafe',x:mode==='count'?[1,4]:[100/3,100],y:['n','s'],opacity:1,marker:{color:'#D65040'}});
  if(mode==='percent')expect(spec.layout.xaxis?.range).toEqual([0,100]);
 });
 it.each([['column','y'],['bar','x'],['histogram','y'],['line','y'],['pie','values'],['donut','values']] as const)('plots the percentage displayed in %s charts', (chart, axis)=>{
  const rows=[3.18,2.55,1.27,0.64].map((percent,index)=>({id:String(index),label:String(index),count:index+1,percent}));
  const result={...base,chart,rows,appearance:{metric:'percent' as const, labels:'percent' as const}};
  for(const exporting of [false,true]){
   const spec=chartSpec(result,'en',exporting);
   expect(Reflect.get(spec.data[0],axis)).toEqual([3,3,1,1]);
   expect(spec.data[0]).toMatchObject({text:['3%','3%','1%','1%']});
   const precise=chartSpec({...result,percentageDecimals:2},'en',exporting);
   expect(Reflect.get(precise.data[0],axis)).toEqual([3.18,2.55,1.27,0.64]);
  }
 });
 it('uses the same display values for trend points and heatmap colors',()=>{
  const points=[{count:5,percent:3.18,displayPercent:3},{count:4,percent:2.55,displayPercent:3},{count:0,percent:null}];
  const appearance={metric:'percent' as const};
  const trend:KoboResult={...base,chart:'line',appearance,trend:{dateField:'day',unit:'month',excluded:0,periods:['2026-01','2026-02','2026-03'],denominators:[157,157,0],series:[{id:'a',label:'A',points}]}};
  expect(chartSpec(trend,'en').data[0]).toMatchObject({y:[3,3,null],text:['3%','3%','']});
  const breakdowns=points.map((_,index)=>({id:String(index),label:String(index),denominator:index===2?0:157}));
  const heatmap:KoboResult={...base,chart:'heatmap',appearance,breakdowns,rows:[{...base.rows[0],series:points.map((point,index)=>({...point,id:String(index)}))}]};
  expect(chartSpec(heatmap,'en').data[0]).toMatchObject({z:[[3,3,null]]});
 });
 it('keeps histogram bins adjacent and preserves type in screen and export',()=>{
  const histogram={...base,rows:Array.from({length:20},(_,i)=>({...base.rows[i%3],id:String(i)}))};
  expect(isDenseKoboChart(histogram)).toBe(false);
  expect(readableKoboChartType(histogram)).toBe('histogram');
  for(const exporting of [true,false]){const spec=chartSpec(histogram,'en',exporting);expect(spec.layout.bargap).toBe(0);expect(spec.data[0].type).toBe('bar')}
 });
 it('keeps numeric-looking and repeated line labels in the selected answer order',()=>{
  const rows=['10','2','10'].map((label,index)=>({...base.rows[index],id:String(index+10),label}));
  for(const exporting of [false,true]){
   const spec=chartSpec({...base,chart:'line',rows},'en',exporting);
   const ids=rows.map(row=>row.id);
   expect(spec.layout.xaxis).toMatchObject({type:'category',categoryorder:'array',categoryarray:ids,ticktext:['10','2','10']});
   expect(spec.data[0]).toMatchObject({x:ids});
  }
 });
 it.each(['pie','donut'] as const)('keeps distinct answers with repeated captions in a requested %s chart',chart=>{
  const rows=base.rows.map((row,index)=>({...row,label:index===2?'Same caption [bin:0]':'Same caption',count:index+1}));
  const result={...base,kind:'category' as const,chart,rows};
  for(const exporting of [false,true]){
   expect(chartSpec(result,'en',exporting).data[0]).toMatchObject({
    type:'pie',sort:false,labels:['Same caption [bin:0] (2)','Same caption [bin:1]','Same caption [bin:0]'],values:[1,2,3],
   });
  }
 });
 it('renders heatmap cells from breakdown values with correct percentages',()=>{
  const heatmap:KoboResult={...base,chart:'heatmap',appearance:{metric:'percent'},breakdowns:[{id:'n',label:'North',denominator:2},{id:'s',label:'South',denominator:1}],rows:[{...base.rows[0],series:[{id:'n',count:1,percent:50},{id:'s',count:1,percent:100}]}]};
  const trace=chartSpec(heatmap,'en').data[0] as any;
  expect(trace.type).toBe('heatmap');expect(trace.z).toEqual([[50,100]]);expect(trace.text).toEqual([['50%','100%']]);
  expect(isDenseKoboChart(heatmap)).toBe(false);expect(koboPdfChartPanels(heatmap)[0].chart).toBe('heatmap');
 });
 it('splits wide heatmaps into distinct readable PDF panels without losing cells',()=>{
  const columns=Array.from({length:12},(_,index)=>({id:String(index),label:'Region '+index,denominator:2}));
  const heatmap:KoboResult={...base,chart:'heatmap',breakdowns:columns,rows:Array.from({length:10},(_,index)=>({...base.rows[0],id:'a'+index,series:columns.map(column=>({id:column.id,count:1,percent:50}))}))};
  const panels=koboPdfChartPanels(heatmap);expect(new Set(panels.map(koboPdfChartKey)).size).toBe(panels.length);
  expect(panels.reduce((sum,panel)=>sum+panel.rows.length*panel.breakdowns.length,0)).toBe(120);expect(panels.every(panel=>panel.breakdowns.length<=5&&panel.rows.length<=8)).toBe(true);
 });
 it('explains single-period trends without inventing another point',()=>{
  const trend:KoboResult={...base,chart:'line',trend:{dateField:'day',unit:'month',excluded:0,periods:['2026-10'],denominators:[344],series:[{id:'yes',label:'Yes',points:[{count:343,percent:343/344*100}]}]}};
  expect(singlePeriodTrendNotice(trend,'en')).toContain('Choose Day grouping');
  expect(singlePeriodTrendNotice(trend,'ar')).toContain('اليوم');
  const trace=chartSpec(trend,'en').data[0] as any;
  expect(trace.x).toEqual(['2026-10']);expect(trace.y).toEqual([343]);expect(trace.mode).toContain('markers');
  expect(singlePeriodTrendNotice({...trend,trend:{...trend.trend!,unit:'day'}},'en')).toContain('at least two time periods');
  for(const periods of [[],['2026-09','2026-10']])expect(singlePeriodTrendNotice({...trend,trend:{...trend.trend!,periods}},'en')).toBe('');
  expect(singlePeriodTrendNotice({...trend,chart:'bar'},'en')).toBe('');
 });
 it('uses ordered date periods and preserves empty-period gaps for percentages',()=>{
  const trend:KoboResult={...base,chart:'line',appearance:{metric:'percent'},trend:{dateField:'day',unit:'month',excluded:1,periods:['2026-01','2026-02','2026-03'],denominators:[1,0,1],series:[{id:'a',label:'Water',points:[{count:1,percent:100},{count:0,percent:null},{count:1,percent:100}]}]}};
  const trace=chartSpec(trend,'en').data[0] as any;
  expect(trace.x).toEqual(trend.trend!.periods);expect(trace.y).toEqual([100,null,100]);expect(trace.connectgaps).toBe(false);
  expect(koboPdfChartPanels(trend)).toHaveLength(1);expect(trend.rows).toEqual(base.rows);
 });
 it.each(['histogram','heatmap','line'] as const)('keeps configured gridlines and font in exported %s charts',chart=>{
  for(const grid of ['show','hide'] as const){
   const spec=chartSpec({...base,chart,appearance:{grid,fontFamily:'Georgia'}},'ar',true);
   expect(spec.layout.font?.family).toBe('Georgia, Noto Naskh Arabic, Arial, sans-serif');
   expect(spec.layout.xaxis?.showgrid).toBe(grid==='show');
   expect(spec.layout.yaxis?.showgrid).toBe(grid==='show');
  }
 });
});
