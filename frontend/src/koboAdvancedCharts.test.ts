import {singlePeriodTrendNotice} from './koboAdvancedChartSpec';
import {describe,it,expect} from 'vitest';
import {chartSpec,withoutKoboChartGrid} from './koboChartSpec';
import {isDenseKoboChart,koboPdfChartPanels,koboPdfChartKey,readableKoboChartType} from './koboChartDensity';
import type {KoboResult} from './koboTypes';

const base:KoboResult={id:'q',name:'q',label:'Household size',group:'',repeat:'',kind:'number',chart:'histogram',denominator:2,missing:0,total:2,statistics:{},percentageBasis:'Answered',breakdowns:[],colors:{},rows:[{id:'bin:0',label:'0 - 5',count:1,percent:50},{id:'bin:1',label:'5 - 10',count:0,percent:0},{id:'bin:2',label:'10 - 15',count:1,percent:50}]};
describe('household assessment charts',()=>{
 it('keeps histogram bins adjacent and preserves type in screen and export',()=>{
  const histogram={...base,rows:Array.from({length:20},(_,i)=>({...base.rows[i%3],id:String(i)}))};
  expect(isDenseKoboChart(histogram)).toBe(false);
  expect(readableKoboChartType(histogram,true)).toBe('histogram');
  for(const exporting of [true,false]){const spec=chartSpec(histogram,'en',exporting);expect(spec.layout.bargap).toBe(0);expect(spec.data[0].type).toBe('bar')}
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
 it.each(['histogram','heatmap','line'] as const)('removes all exported gridlines for %s without changing screen settings',chart=>{
  const spec=chartSpec({...base,chart,appearance:{grid:'show'}},'ar',true),clean=withoutKoboChartGrid(spec);
  for(const key of ['xaxis','yaxis'] as const){expect(clean.layout[key]).toMatchObject({showgrid:false,zeroline:false,minor:{showgrid:false}});expect(spec.layout[key]?.showgrid).toBe(true)}
 });
});
