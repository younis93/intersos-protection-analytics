import {describe,expect,it} from 'vitest';
import {buildKoboReportPrompt,reportPivotTables,prepareReportAnalysis,reportDisaggregationFields,reportQuestions} from './koboReportPrompt';
import type {KoboAnalysis,KoboProject,KoboResult,KoboQuestion} from './koboTypes';

const question=(id:string,kind:KoboQuestion['kind']='category',identifying=false):KoboQuestion=>({id,name:id,kind,identifying,type:'select_one',labels:{en:id},group:'g',repeat:'',metadata:false,choices:[]});
const result=(id:string,kind:KoboQuestion['kind']='category'):KoboResult=>({id,name:id,label:id,kind,group:'g',repeat:'',denominator:2,missing:1,total:3,rows:[{id:'a',label:'Private narrative',count:2,percent:100}],statistics:{mean:4},breakdowns:[],percentageBasis:'Respondents who answered this question',chart:'bar',colors:{}});
const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:false,hideEmpty:false,questionSort:'form',questions:{}} as const;
function fixture(){
 const project={id:'p',name:'Survey',form:{questions:[question('needs','multiple'),question('comments','text'),question('name','text',true)],groups:[],language:'ar',warnings:[]},settings:structuredClone(settings),warnings:[],issues:[]} as unknown as KoboProject;
 const analysis={total:3,filtered:3,questions:[{...result('needs','multiple'),rows:[{id:'a',label:'Water',count:2,percent:100}]},result('comments','text'),result('name','text')],filterSummary:[],groups:[],settings:project.settings} as KoboAnalysis;
 return {project,analysis};
}
describe('general survey report prompts',()=>{
 it('uses readable Markdown tables and preserves every category and row across narrow panels',()=>{
  const pivot={...result('needs'),breakdownFields:[{id:'area',label:'Area'}],breakdowns:Array.from({length:7},(_,index)=>({id:String(index),label:`Region ${index}`,denominator:index})),rows:[{id:'a',label:'A | B\nالعربية',count:2,percent:100,series:Array.from({length:7},(_,index)=>({id:String(index),count:index,percent:index?100:null}))},{id:'b',label:'<b>_literal_</b> \\ text',count:0,percent:0}]};
  const tables=reportPivotTables(pivot);
  expect(tables.match(/#### Pivot table - panel/g)).toHaveLength(3);
  expect(tables.match(/\| Total \|/g)).toHaveLength(3);
  expect(tables.match(/A &#124; B العربية/g)).toHaveLength(3);
  expect(tables).toContain('&lt;b&gt;&#95;literal&#95;&lt;/b&gt; &#92; text');
  expect(tables).toContain('| Area: Region 6 | 6 |');
  expect(tables).toContain('| :--- | ---: |');
  expect(tables).toContain('0 | - |');
  expect(tables).not.toContain('\t');
  expect(Math.max(...tables.split('\n').map(line=>line.split('|').length-2))).toBe(7);
  const percentOnly=reportPivotTables(pivot,'percent');
  expect(percentOnly).toContain('Region 0 - Percent');expect(percentOnly).not.toContain(' - Count');
 });
 it('includes only selected questions, aggregate evidence, and reporting constraints',()=>{
  const {project,analysis}=fixture(),prompt=buildKoboReportPrompt(project,analysis,['needs']);
  expect(prompt).toContain('general survey report in English');
  expect(prompt).toContain('Filtered submissions: 3');
  expect(prompt).toContain('| Water | 2 | 100% |');
  expect(prompt).toContain('Percentages can exceed 100%');
  expect(prompt).toContain('Do not infer respondent-level');
  expect(prompt).not.toContain('Question: comments');
 });
 it('excludes identifying questions and all free-text answers',()=>{
  const {project,analysis}=fixture(),prompt=buildKoboReportPrompt(project,analysis,['needs','comments','name']);
  expect(reportQuestions(project,analysis).map(question=>question.id)).toEqual(['needs','comments']);
  expect(prompt).toContain('Question: comments');
  expect(prompt).toContain('Response totals only');
  expect(prompt).not.toContain('Private narrative');
  expect(prompt).not.toContain('Question: name');
  expect(buildKoboReportPrompt(project,analysis,[])).toBe('');
  expect(buildKoboReportPrompt(project,analysis,['missing','name'])).toBe('');
 });
 it('redacts free-text filters and identifying breakdown labels',()=>{
  const {project,analysis}=fixture();
  analysis.settings.filters=[{field:'comments',kind:'category',values:['Secret filter']}];analysis.filterSummary=['Comments: Secret filter'];
  analysis.questions[0].breakdownFields=[{id:'name',label:'Name'}];analysis.questions[0].breakdowns=[{id:'person',label:'Secret person',denominator:2}];
  const prompt=buildKoboReportPrompt(project,analysis,['needs']);
  expect(prompt).not.toContain('Secret filter');expect(prompt).not.toContain('Secret person');expect(prompt).toContain('Breakdowns omitted');
 });
 it('includes safe breakdown denominators, filters and numeric statistics',()=>{
  const {project,analysis}=fixture();
  project.form.questions.push(question('area'));analysis.settings.filters=[{field:'area',kind:'category',values:['north']}];analysis.filterSummary=['Area: North'];
  analysis.questions[0].breakdownFields=[{id:'area',label:'Area'}];analysis.questions[0].breakdowns=[{id:'north',label:'North',denominator:2}];
  const prompt=buildKoboReportPrompt(project,analysis,['needs']);
  expect(prompt).toContain('Area: North');expect(prompt).toContain('| Area: North | 2 |');expect(prompt).toContain('| Mean | 4 |');
 });
 it('offers only non-identifying single-choice fields on main responses',()=>{
  const {project}=fixture();project.form.questions.push(question('area'),question('age','number'),{...question('repeat'),repeat:'visits'},question('private','category',true));
  expect(reportDisaggregationFields(project).map(field=>field.id)).toEqual(['area']);
 });
 it('can omit existing breakdowns without changing the analysis',()=>{
  const {project,analysis}=fixture();project.form.questions.push(question('area'));
  analysis.questions[0].breakdownFields=[{id:'area',label:'Area'}];analysis.questions[0].breakdowns=[{id:'north',label:'North',denominator:2}];
  const prompt=buildKoboReportPrompt(project,analysis,['needs'],'none');
  expect(prompt).toContain('Disaggregation: Overall results only');expect(prompt).not.toContain('North');expect(prompt).not.toContain('Breakdown denominator');
  expect(analysis.questions[0].breakdowns).toHaveLength(1);
 });
 it('prepares report-only breakdowns and skips free text and self comparisons',async()=>{
  const {project,analysis}=fixture();project.form.questions.push(question('area'));analysis.questions.push({...result('area'),rows:[{id:'north',label:'North',count:2,percent:100}]});
  const before=structuredClone(analysis),calls:string[]=[];
  const prepared=await prepareReportAnalysis(analysis,['needs','comments','area'],['area'],async(settings,id)=>{
   calls.push(id);expect(settings.questions[id].breakdowns).toEqual(['area']);expect(settings.questions[id].breakdownDisplay).toBe('both');expect(settings.filters).toEqual(analysis.settings.filters);
   return {...analysis.questions.find(question=>question.id===id)!,breakdownFields:[{id:'area',label:'Area'}],breakdowns:[{id:'north',label:'North',denominator:2}]};
  },new AbortController().signal);
  expect(calls).toEqual(['needs']);expect(analysis).toEqual(before);
  const prompt=buildKoboReportPrompt(project,prepared,['needs','comments','area'],'custom');
  expect(prompt).toContain('Custom report-only demographic breakdowns');expect(prompt).toContain('Disaggregation fields: Area');expect(prompt).toContain('| Area: North | 2 |');expect(prompt).not.toContain('Private narrative');
 });
 it('limits concurrent analyses and propagates aborts and request failures',async()=>{
  const {analysis}=fixture();analysis.questions=Array.from({length:8},(_,index)=>result(`q${index}`));let active=0,peak=0;
  await prepareReportAnalysis(analysis,analysis.questions.map(q=>q.id),['area'],async(_,id)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return result(id)},new AbortController().signal);
  expect(peak).toBe(3);
  const controller=new AbortController();controller.abort();
  await expect(prepareReportAnalysis(analysis,['q0'],['area'],async()=>result('q0'),controller.signal)).rejects.toThrow();
  await expect(prepareReportAnalysis(analysis,['q0'],['area'],async()=>{throw new Error('Analysis unavailable')},new AbortController().signal)).rejects.toThrow('Analysis unavailable');
 });
});
