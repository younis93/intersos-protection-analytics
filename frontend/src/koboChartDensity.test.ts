import {describe,it,expect} from 'vitest';
import {koboChartRows,koboScreenChartRows,isDenseKoboChart,koboPdfChartKey,koboPdfChartPanels,readableKoboChartType} from './koboChartDensity';
import {chartSpec} from './koboChartSpec';
import type {KoboResult} from './koboTypes';
const fixture=(count=24,series=2):KoboResult=>({id:'q',name:'q',label:'District',group:'',repeat:'',kind:'category',denominator:268,missing:0,total:268,statistics:{},percentageBasis:'Answered',colors:{},chart:'column',breakdowns:Array.from({length:series},(_,i)=>({id:`s${i}`,label:`Series ${i}`,denominator:134})),rows:Array.from({length:count},(_,i)=>({id:`r${i}`,label:`District ${i} - a long category name that must remain separate from its bars`,count:i+1,percent:50,series:Array.from({length:series},(_,j)=>({id:`s${j}`,count:i+j+1,percent:(i+j+1)/134*100}))}))});
describe('crowded chart presentation',()=>{
 it('shows every nonzero grouped value in screen and image output',()=>{const result=fixture();for(const exporting of [false,true]){const spec=chartSpec(result,'en',exporting);expect(readableKoboChartType(result,exporting)).toBe('bar');expect(spec.data).toHaveLength(2);for(const trace of spec.data)expect((trace as {text:string[]}).text.filter(Boolean)).toHaveLength(24);expect(spec.layout.yaxis?.tickvals).toHaveLength(24)}});
 it('reserves a full category-label gutter and grows height even if a small height was selected',()=>{const spec=chartSpec({...fixture(),appearance:{height:320}},'en',true);expect(spec.layout.margin?.l).toBeGreaterThan(350);expect(spec.layout.height).toBeGreaterThan(1500);const band=(Number(spec.layout.height)-Number(spec.layout.margin?.t)-Number(spec.layout.margin?.b))/24;expect(band).toBeGreaterThan(2*32.2*1.3)});
 it('splits PDF comparisons without dropping, repeating, or changing categories or values',()=>{const result=fixture(25,2),panels=koboPdfChartPanels(result);expect(panels.map(panel=>panel.rows.length)).toEqual([7,6,6,6]);expect(panels.flatMap(panel=>panel.rows)).toEqual(result.rows);expect(panels.every(panel=>panel.chart==='bar')).toBe(true);expect(new Set(panels.map(koboPdfChartKey)).size).toBe(panels.length);expect(result.chart).toBe('column')});
 it('keeps the same value scale across every PDF panel',()=>{const panels=koboPdfChartPanels(fixture(25,2)),ranges=panels.map(panel=>chartSpec(panel,'en',true).layout.xaxis?.range);expect(ranges.every(range=>JSON.stringify(range)===JSON.stringify(ranges[0]))).toBe(true);expect(Number(ranges[0]?.[1])).toBeGreaterThan(26)});
 it('limits groups per printed panel when there are many breakdown series',()=>{const panels=koboPdfChartPanels(fixture(7,8));expect(panels.map(panel=>panel.rows.length)).toEqual([2,2,2,1]);expect(panels.every(panel=>panel.breakdowns.length===8)).toBe(true)});
 it('retains simple columns, trend lines, and small pie charts; replaces overcrowded pies',()=>{expect(readableKoboChartType(fixture(3,2),true)).toBe('column');expect(readableKoboChartType({...fixture(),chart:'line'},true)).toBe('line');expect(readableKoboChartType({...fixture(3,0),chart:'donut'},true)).toBe('donut');expect(readableKoboChartType({...fixture(12,0),chart:'donut'},true)).toBe('bar')});
 it('preserves hidden-label choices and existing text-chart top-20 behavior',()=>{expect(chartSpec({...fixture(),appearance:{labels:'hidden'}},'en').data[0]).toMatchObject({text:undefined});const text={...fixture(30,0),kind:'text' as const};expect(koboChartRows(text)).toHaveLength(20);expect(koboPdfChartPanels(text).flatMap(panel=>panel.rows)).toEqual(koboChartRows(text))});
});


describe('dense screen views',()=>{
 it.each([15,45,200,1000])('keeps all %s categories, ranks counts, and never mutates pivot/export order',count=>{
  const source=fixture(count,0),before=source.rows.map(row=>row.id),screen=koboScreenChartRows(source);
  expect(isDenseKoboChart(source)).toBe(true);expect(screen).toHaveLength(count);expect(screen[0].id).toBe(`r${count-1}`);
  expect(source.rows.map(row=>row.id)).toEqual(before);expect(koboChartRows(source).map(row=>row.id)).toEqual(before);
  expect(koboPdfChartPanels(source).flatMap(panel=>panel.rows).map(row=>row.id)).toEqual(before);
  const spec=chartSpec(source,'en');expect(spec.data[0]).toMatchObject({orientation:'h'});expect(spec.layout.height).toBeGreaterThanOrEqual(count*40);
 });
 it('uses identifiers for duplicate captions and stable ties, without combining answers',()=>{
  const source=fixture(15,0);source.rows=source.rows.map((row,i)=>({...row,id:`id${String(i).padStart(2,'0')}`,label:'Repeated caption',count:1}));
  const spec=chartSpec(source,'en'),trace=spec.data[0] as any;
  expect(new Set(trace.y).size).toBe(15);expect(trace.y).toEqual(source.rows.map(row=>row.id));expect(new Set(spec.layout.yaxis?.ticktext).size).toBe(1);
 });
 it('keeps small columns and chronological date lines unchanged, and expands text lists only on screen',()=>{
  expect(isDenseKoboChart(fixture(3,0))).toBe(false);
  expect(isDenseKoboChart({...fixture(45,0),kind:'date',chart:'line'})).toBe(false);
  const text={...fixture(45,0),kind:'text' as const};expect(koboScreenChartRows(text)).toHaveLength(45);expect(koboChartRows(text)).toHaveLength(20);
 });
 it('respects hidden values, grows grouped rows and never changes count/percentage/color data',()=>{
  const source=fixture(10,4),before=JSON.stringify(source);expect(isDenseKoboChart(source)).toBe(true);
  const spec=chartSpec({...source,appearance:{labels:'hidden',height:320}},'ar');expect(spec.data[0]).toMatchObject({text:undefined});expect(spec.layout.height).toBeGreaterThan(720);expect(JSON.stringify(source)).toBe(before);
 });
});
