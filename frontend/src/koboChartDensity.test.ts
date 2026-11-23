import {describe,it,expect} from 'vitest';
import {koboChartRows,koboScreenChartRows,koboScreenChartPage,isDenseKoboChart,koboPdfChartKey,koboPdfChartPanels,readableKoboChartType} from './koboChartDensity';
import {chartImageSpec,chartSpec,fixedChartImageSpec} from './koboChartSpec';
import type {KoboResult} from './koboTypes';
const fixture=(count=24,series=2):KoboResult=>({id:'q',name:'q',label:'District',group:'',repeat:'',kind:'category',denominator:268,missing:0,total:268,statistics:{},percentageBasis:'Answered',colors:{},chart:'column',breakdowns:Array.from({length:series},(_,i)=>({id:`s${i}`,label:`Series ${i}`,denominator:134})),rows:Array.from({length:count},(_,i)=>({id:`r${i}`,label:`District ${i} - a long category name that must remain separate from its bars`,count:i+1,percent:50,series:Array.from({length:series},(_,j)=>({id:`s${j}`,count:i+j+1,percent:(i+j+1)/134*100}))}))});
describe('fixed chart widths',()=>{
 it('uses the rendered text, font and dimensions for a single chart image',()=>{
  const source=fixture(4,0);
  const live=chartSpec(source,'en',false,'glass-light',640);
  const rendered={...live,width:613,height:407,layout:{...live.layout,
   xaxis:{...live.layout.xaxis,ticktext:['One<br>line','Two','Three','Four']},
   font:{...live.layout.font,size:17}}};
  const image=chartImageSpec(source,'en',{width:640,page:0,rendered},'glass-light');
  expect(image.data).toEqual(rendered.data);
  expect(image.layout).toMatchObject({width:613,height:407,font:{size:17},xaxis:{ticktext:['One<br>line','Two','Three','Four']}});
 });
 it.each([['compact',480],['medium',800],['wide',1000],['extra-wide',1280]] as const)('uses the %s preset for one chart and one image', (chartWidthMode,width)=>{
  const source:KoboResult={...fixture(125,1),appearance:{chartWidthMode,chartWidth:517}};
  const page=koboScreenChartPage(source,koboScreenChartRows(source));
  expect(page.pages).toBe(1);
  expect(chartSpec(page.result,'en').layout.width).toBe(width);
  const image=fixedChartImageSpec(source,'en')!;
  expect(image.layout.width).toBe(width);
  expect(image.layout.xaxis?.categoryarray).toHaveLength(125);
  expect(chartSpec({...source,appearance:{...source.appearance,chartWidthMode:'custom'}},'en').layout.width).toBe(517);
 });
 it('fits every column into one chart and one fixed-width image',()=>{
  const result:KoboResult={...fixture(125,1),appearance:{chartWidthMode:'narrow',title:'Districts by reporting group'}};
  const page=koboScreenChartPage(result,koboScreenChartRows(result),1);
  expect(page.pages).toBe(1);
  expect(page.result.rows).toEqual(result.rows);
  const image=fixedChartImageSpec(result,'en')!;
  expect(image.layout).toMatchObject({width:640,autosize:false});
  expect(image.layout.xaxis?.categoryarray).toEqual(result.rows.map(row=>row.id));
  expect(image.layout.xaxis?.tickvals).toEqual(result.rows.map(row=>row.id));
  expect(image.data[0]).toMatchObject({x:result.rows.map(row=>row.id)});
 });
 it('fits all measured heatmap cells into a single fixed-width image',()=>{
  const result:KoboResult={...fixture(4,13),chart:'heatmap',appearance:{chartWidthMode:'custom',chartWidth:420},
   measure:{operation:'sum',field:'amount',label:'Amount',unit:'',decimals:0,parentValuesRepeated:false}};
  result.rows=result.rows.map(row=>({...row,series:row.series?.map((cell,index)=>({...cell,value:index-6}))}));
  const image=fixedChartImageSpec(result,'en')!;
  expect(image.layout.width).toBe(420);
  expect(image.data[0]).toMatchObject({type:'heatmap',x:result.breakdowns.map(column=>column.id),y:result.rows.map(row=>row.id)});
 });
 it('uses automatic width by default and remembers an inactive custom width',()=>{
  const source=fixture(4,0);
  expect(fixedChartImageSpec({...source,appearance:{chartWidthMode:'auto',chartWidth:420}},'en')).toBeUndefined();
  expect(chartSpec({...source,appearance:{chartWidthMode:'custom',chartWidth:420}},'en',false,undefined,1000).layout.width).toBe(420);
 });
});
describe('crowded chart presentation',()=>{
 it('bounds a 25,000-answer field without dropping answers or changing the source',()=>{
  const source=fixture(25000,0),ordered=koboScreenChartRows(source),ids:string[]=[];
  for(let index=0;index<250;index++){
   const view=koboScreenChartPage(source,ordered,index);expect(view.result.rows).toHaveLength(100);ids.push(...view.result.rows.map(row=>row.id));
  }
  expect(ids).toEqual(ordered.map(row=>row.id));expect(new Set(ids).size).toBe(25000);expect(source.rows[0].id).toBe('r0');
  const spec=chartSpec(koboScreenChartPage(source,ordered).result,'en');expect((spec.data[0] as any).y).toHaveLength(100);expect(spec.layout.height).toBeLessThan(20000);
 });
 it('bounds grouped marks, clamps a last page, and leaves chronological trends intact',()=>{
  const source=fixture(251,20),ordered=koboScreenChartRows(source),view=koboScreenChartPage(source,ordered,999);
  expect(view.result.rows.length*20).toBeLessThanOrEqual(1000);expect(view.end).toBe(251);expect(view.page).toBe(view.pages-1);
  const trend={...source,trend:{dateField:'d',unit:'month' as const,excluded:0,periods:[],denominators:[],series:[]}};
  expect(koboScreenChartPage(trend,ordered).result).toBe(trend);
 });
 it('shows every nonzero grouped value in screen and image output',()=>{const result=fixture();for(const exporting of [false,true]){const spec=chartSpec(result,'en',exporting);expect(readableKoboChartType(result)).toBe('column');expect(spec.data).toHaveLength(2);for(const trace of spec.data)expect((trace as {text:string[]}).text.filter(Boolean)).toHaveLength(24);expect(spec.layout.xaxis?.tickvals).toEqual(result.rows.map(row=>row.id))}});
 it('reserves a full category-label gutter and grows height even if a small height was selected',()=>{const spec=chartSpec({...fixture(),chart:'bar',appearance:{height:320}},'en',true);expect(spec.layout.margin?.l).toBeGreaterThan(350);expect(spec.layout.height).toBeGreaterThan(1500);const band=(Number(spec.layout.height)-Number(spec.layout.margin?.t)-Number(spec.layout.margin?.b))/24;expect(band).toBeGreaterThan(2*32.2*1.3)});
 it('splits PDF comparisons without dropping, repeating, or changing categories or values',()=>{const result=fixture(25,2),panels=koboPdfChartPanels(result);expect(panels.map(panel=>panel.rows.length)).toEqual([7,6,6,6]);expect(panels.flatMap(panel=>panel.rows)).toEqual(result.rows);expect(panels.every(panel=>panel.chart==='column')).toBe(true);expect(new Set(panels.map(koboPdfChartKey)).size).toBe(panels.length);expect(result.chart).toBe('column')});
 it('keeps the same value scale across every PDF panel',()=>{const panels=koboPdfChartPanels(fixture(25,2)),ranges=panels.map(panel=>chartSpec(panel,'en',true).layout.yaxis?.range);expect(ranges.every(range=>JSON.stringify(range)===JSON.stringify(ranges[0]))).toBe(true);expect(Number(ranges[0]?.[1])).toBeGreaterThan(26)});
 it('limits groups per printed panel when there are many breakdown series',()=>{const panels=koboPdfChartPanels(fixture(7,8));expect(panels.map(panel=>panel.rows.length)).toEqual([2,2,2,1]);expect(panels.every(panel=>panel.breakdowns.length===8)).toBe(true)});
 it('retains simple columns, trend lines, and small pie charts; replaces overcrowded pies',()=>{expect(readableKoboChartType(fixture(3,2))).toBe('column');expect(readableKoboChartType({...fixture(),chart:'line'})).toBe('line');expect(readableKoboChartType({...fixture(3,0),chart:'donut'})).toBe('donut');expect(readableKoboChartType({...fixture(12,0),chart:'donut'})).toBe('bar')});
 it('preserves hidden values and exports every answer shown on dense text charts',()=>{expect(chartSpec({...fixture(),appearance:{labels:'hidden'}},'en').data[0]).toMatchObject({text:undefined});const text={...fixture(30,0),kind:'text' as const};expect(koboChartRows(text)).toHaveLength(20);expect(koboPdfChartPanels(text).flatMap(panel=>panel.rows)).toEqual(koboScreenChartRows(text))});
});


const barFixture=fixture;
describe('dense screen views',()=>{
 const fixture=(count=24,series=2):KoboResult=>({...barFixture(count,series),chart:'bar'});
 it.each([15,45,200,1000])('keeps all %s categories in the shared answer order without mutating it',count=>{
  const source=fixture(count,0),before=source.rows.map(row=>row.id),screen=koboScreenChartRows(source);
  expect(isDenseKoboChart(source)).toBe(true);expect(screen).toHaveLength(count);expect(screen.map(row=>row.id)).toEqual(before);
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


describe('shared chart ordering',()=>{
 it('exports only the selected category page when requested by the preview',()=>{
  const source=fixture(105,0);
  const view={width:640,page:1,pageOnly:true};
  const labels=source.rows.slice(100).map(row=>row.id);
  const image=chartImageSpec(source,'en',view,'glass-light');
  expect(image.layout.xaxis?.tickvals).toEqual(labels);
  const rendered={data:image.data,layout:image.layout,width:672,height:430};
  expect(chartImageSpec(source,'en',{...view,rendered},'glass-light')).toMatchObject({
   data:rendered.data,layout:{width:672,height:430,xaxis:{tickvals:labels}},
  });
 });
 it('keeps rendered captions, font size and title in a full chart image across pages',()=>{
  const source=fixture(101,0);
  source.appearance={title:'A chart title with the same line breaks in the image',categoryLabelSize:16,categoryLabelLines:2};
  source.rows=source.rows.map((row,index)=>({...row,label:index===100?'Particular nationalities or language groups':'Other groups with long captions'}));
  const view={width:740,page:1};
  const rows=koboScreenChartRows(source);
  const live=chartSpec(koboScreenChartPage(source,rows,view.page).result,'en',false,'glass-light',view.width);
  const image=chartImageSpec(source,'en',view,'glass-light');
  expect(image.layout.xaxis?.tickvals).toEqual(rows.map(row=>row.id));
  expect(image.layout.xaxis?.ticktext?.at(-1)).toBe(live.layout.xaxis?.ticktext?.[0]);
  expect(image.layout.xaxis?.tickfont).toEqual(live.layout.xaxis?.tickfont);
  expect(image.layout.title).toMatchObject({text:Reflect.get(live.layout.title!,'text')});
  expect((image.data[0] as {x?:unknown[]}).x).toHaveLength(rows.length);
 });
 it('uses the same single-line Arabic caption in the live chart and image',()=>{
  const source=fixture(9,0);
  source.rows[0].label='الأسر التي تحتاج إلى خدمات إضافية';
  source.appearance={categoryLabels:'truncate',categoryLabelSize:18};
  const view={width:520,page:0};
  const live=chartSpec(source,'ar',false,'glass-dark',view.width);
  const image=chartImageSpec(source,'ar',view,'glass-dark');
  expect(image.layout.xaxis?.ticktext).toEqual(live.layout.xaxis?.ticktext);
  expect(image.layout.xaxis?.ticktext?.[0]).toContain('…');
  expect(image.layout.xaxis?.ticktext?.[0]).not.toContain('<br>');
 });
 it('labels every column in a narrow district chart, including answers reached by scrolling',()=>{
  const source=fixture(43,0);
  const names=['Other, please specify','Erbil City','Al-Kaim','Markas Kalar','Al-Karkh','Baquba','Kasnazan'];
  source.rows=source.rows.map((row,index)=>({...row,label:names[index]??`District ${index}`}));
  const spec=chartSpec(source,'en',false,'glass-light',700);
  expect(spec.layout.width).toBeGreaterThan(700);
  expect(spec.layout.xaxis?.tickvals).toEqual(source.rows.map(row=>row.id));
  expect(spec.layout.xaxis?.ticktext?.map(label=>label.replace(/<br>/g,' '))).toEqual(source.rows.map(row=>row.label));
 });
 it('exports all eight governorate captions alongside their columns',()=>{
  const names=['Erbil','Baghdad','Anbar','Diyala','Sulaymaniyah','Salah Al-Din','Kirkuk','Ninewa'];
  const counts=[59,33,28,12,9,6,3,2];
  const source=fixture(8,1);
  source.rows=source.rows.map((row,index)=>({...row,label:names[index],count:counts[index],series:[{id:'s0',count:counts[index],percent:50}]}));
  const spec=chartSpec(source,'en',true);
  const ids=source.rows.map(row=>row.id);
  expect(spec.data[0]).toMatchObject({x:ids,y:counts});
  expect(spec.layout.xaxis?.tickvals).toEqual(ids);
  expect(spec.layout.xaxis?.ticktext?.map(text=>text.replace(/<br>/g,'').replace(/\s/g,''))).toEqual(names.map(name=>name.replace(/\s/g,'')));
 });
 it('exports full long captions and keeps duplicate captions on separate bars',()=>{
  const label='A long district name with enough words to wrap across more than five lines when exported '.repeat(4).trim();
  const source=fixture(2,0);
  source.rows=source.rows.map(row=>({...row,label}));
  const spec=chartSpec({...source,chart:'bar'},'en',true);
  expect(spec.layout.yaxis?.tickvals).toEqual(source.rows.map(row=>row.id));
  expect(spec.layout.yaxis?.ticktext?.map(text=>text.replace(/<br>/g,' '))).toEqual([label,label]);
 });
 it.each([3,24])('shows largest counts at the top of horizontal charts with %s answers',count=>{
  const source=fixture(count,0);source.chart='bar';source.rows.reverse();
  for(const exporting of [false,true]){
   const spec=chartSpec(source,'en',exporting);
   expect((spec.data[0] as any).x).toEqual(source.rows.map(row=>row.count));
   expect(spec.layout.yaxis?.autorange).toBe('reversed');
  }
 });
 it('preserves a saved ascending order for text charts as well as dense charts',()=>{
  const source={...fixture(30,0),kind:'text' as const};
  expect(koboChartRows(source)).toEqual(source.rows.slice(0,20));
  expect(koboScreenChartRows(source)).toEqual(source.rows);
 });
});

describe('explicit column selection',()=>{it.each([43,200])('keeps %s answers vertical and scrollable',count=>{const result=fixture(count,0),spec=chartSpec(result,'en',false,'glass-light',700);expect(isDenseKoboChart(result)).toBe(false);expect(readableKoboChartType(result)).toBe('column');expect(spec.data[0]).not.toMatchObject({orientation:'h'});expect((spec.data[0] as any).x).toHaveLength(count);expect(spec.layout.width).toBeGreaterThan(700);const page=koboScreenChartPage(result,koboScreenChartRows(result));expect(page.result.chart).toBe('column');expect(chartSpec({...result,chart:'bar'},'en').data[0]).toMatchObject({orientation:'h'})})});
