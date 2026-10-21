import {describe,it,expect} from 'vitest';
import {matchingViewAnalysis,previewFilters,sampleViewResults,settingsForViewPreview,viewQuestionSetup} from './koboViewPreviewModel';
import {viewSnapshot} from './koboSavedViewState';
import type {KoboAnalysis,KoboProject,KoboQuestion,KoboResult,KoboSettings} from './koboTypes';
const settings=():KoboSettings=>({version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',questions:{}});
const question=(id:string,changes:Partial<KoboQuestion>={}):KoboQuestion=>({id,name:id,labels:{en:id,ar:'سؤال '+id},kind:'category',type:'select_one',group:'g',repeat:'',metadata:false,identifying:false,choices:[{name:'a',labels:{en:'Answer A',ar:'الجواب أ'}}],...changes});
const project:KoboProject={id:'p',name:'Project',settings:settings(),warnings:[],issues:[],form:{language:'en',warnings:[],groups:[{id:'g',name:'g',labels:{en:'Household'},repeat:false,parent:''}],questions:[question('q'),question('hidden'),question('metadata',{metadata:true}),question('private',{identifying:true}),question('text',{kind:'text'}),question('number',{kind:'number'}),question('date',{kind:'date'}),question('multiple',{kind:'multiple'})]}};
const analysis=(current:KoboSettings):KoboAnalysis=>({settings:current,total:100,filtered:20,filterSummary:[],groups:[],questions:['private','hidden','metadata','text','date','number','q','multiple'].map(id=>({id}) as KoboResult)});
describe('saved view preview semantics',()=>{
 it('groups and labels hidden, metadata, breakdown, trend and percentage settings',()=>{
  const current=settings();current.hidden=['hidden'];current.questions.q={colors:{},bins:10,numericMode:'auto',dateUnit:'month',breakdown:'number',answerSort:'form',chart:'heatmap',breakdownDisplay:'percent',trendDateField:'date',trendUnit:'year',appearance:{metric:'percent'}};
  const rows=viewQuestionSetup(project,viewSnapshot(current));expect(rows.find(q=>q.question.id==='hidden')?.enabled).toBe(false);expect(rows.find(q=>q.question.id==='metadata')?.enabled).toBe(false);
  expect(rows[0]).toMatchObject({group:'Household',chart:'Heatmap',breakdowns:['number'],trend:'date · Year',display:'%',metric:'Percentages'});
  expect(rows.find(q=>q.question.id==='date')?.chart).toBe('Line (automatic)');
 });
 it('shows readable answer captions and range boundaries, including Arabic',()=>{
  const current=settings();current.language='ar';current.filters=[{field:'q',kind:'category',values:['a','__blank__']},{field:'number',kind:'number',minimum:0,maximum:10,values:[]},{field:'date',kind:'date',minimum:'2026-09-01',values:[]}];
  const rows=previewFilters(project,viewSnapshot(current));expect(rows[0].values).toEqual(['الجواب أ','Blank / unanswered']);expect(rows[1].values).toEqual(['From 0 to 10']);expect(rows[2].values[0]).toContain('2026-09-01');
 });
 it('reuses only matching analysis and selects three permitted questions in analysis order',()=>{
  const current=settings();current.hidden=['hidden'];const snapshot=viewSnapshot(current),data=analysis(current);
  expect(matchingViewAnalysis(data,snapshot)).toBe(data);expect(sampleViewResults(project,snapshot,data).map(q=>q.id)).toEqual(['date','number','q']);
  const changed={...snapshot,filters:[{field:'q',kind:'category' as const,values:['a']}]};expect(matchingViewAnalysis(data,changed)).toBeUndefined();
 });
 it('builds read-only preview settings without copying saved views or shared indicators',()=>{
  const current=settings();current.savedViews=[];current.activeViewId='some-view';current.indicators=[];const snapshot=viewSnapshot({...current,language:'ar'});
  const preview=settingsForViewPreview(current,snapshot);expect(preview.language).toBe('ar');expect(preview.activeViewId).toBe('');expect(preview.savedViews).toEqual([]);expect(current.activeViewId).toBe('some-view');
 });
});
