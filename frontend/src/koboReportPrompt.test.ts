import {describe,expect,it} from 'vitest';
import {buildKoboReportPrompt,reportPivotTables,prepareReportAnalysis,prepareReportQuestions,reportQuestionOptions,reportDisaggregationFields,reportQuestions,reportQualityWarnings} from './koboReportPrompt';
import {defaultReportOptions} from './koboReportOptions';
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
 it('offers added and hidden questions even when the analysis page has no result for them',()=>{
  const {project,analysis}=fixture();project.form.questions.push({...question('combined'),addedFromData:true,labels:{en:'4. What is your current status in Iraq? (Combined)'}},question('empty'));
  analysis.settings.hidden=['combined'];const options=reportQuestionOptions(project,analysis);
  expect(options.map(q=>q.id)).toEqual(['needs','comments','combined','empty']);expect(options.find(q=>q.id==='combined')).toMatchObject({label:'4. What is your current status in Iraq? (Combined)',addedFromData:true});expect(options.find(q=>q.id==='combined')?.denominator).toBeUndefined();
  expect(options.some(q=>q.id==='name')).toBe(false);
 });
 it('loads selected added questions for overall reports with real counts and current filters',async()=>{
  const {project,analysis}=fixture();project.form.questions.push({...question('combined'),addedFromData:true},question('unselected'));analysis.settings.hidden=['combined'];analysis.settings.questions.combined={colors:{},bins:10,numericMode:'auto',dateUnit:'month',breakdown:'area',breakdowns:['area'],answerSort:'form'};
  const before=structuredClone(analysis),calls:string[]=[];
  const source=await prepareReportQuestions(project,analysis,['needs','combined','name'],async(settings,id)=>{
   calls.push(id);expect(settings.hidden).toEqual(['combined']);expect(settings.filters).toEqual(analysis.settings.filters);expect(settings.questions[id].breakdowns).toEqual([]);return {...result(id),rows:[{id:'refugee',label:'Refugee',count:2,percent:100}]};
  },new AbortController().signal,'none');
  expect(calls).toEqual(['combined']);expect(analysis).toEqual(before);
  const prompt=buildKoboReportPrompt(project,source,['combined'],'none');expect(prompt).toContain('Question: combined');expect(prompt).toContain('| Refugee | 2 | 100% |');expect(prompt).not.toContain('Question: needs');
 });
 it('keeps existing breakdowns in current mode and loads added fields before custom comparisons',async()=>{
  const {project,analysis}=fixture();project.form.questions.push(question('combined'),question('area'));
  const source=await prepareReportQuestions(project,analysis,['combined'],async(settings,id)=>{expect(settings).toBe(analysis.settings);return result(id)},new AbortController().signal,'current');
  const prepared=await prepareReportAnalysis(source,['combined'],['area'],async(settings,id)=>{expect(settings.questions[id].breakdowns).toEqual(['area']);return {...result(id),breakdownFields:[{id:'area',label:'Area'}],breakdowns:[{id:'north',label:'North',denominator:2}]}},new AbortController().signal);
  const prompt=buildKoboReportPrompt(project,prepared,['combined'],'custom');expect(prompt).toContain('Question: combined');expect(prompt).toContain('Separate comparison by Area');
 });
 it('limits added-question requests and cancels or reports failures without partial evidence',async()=>{
  const {project,analysis}=fixture();project.form.questions.push(...Array.from({length:6},(_,index)=>question(`added${index}`)));const ids=project.form.questions.map(q=>q.id);let active=0,peak=0;
  await prepareReportQuestions(project,analysis,ids,async(_,id)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return result(id)},new AbortController().signal,'none');expect(peak).toBe(3);
  const controller=new AbortController();controller.abort();await expect(prepareReportQuestions(project,analysis,ids,async(_,id)=>result(id),controller.signal,'none')).rejects.toThrow();
  await expect(prepareReportQuestions(project,analysis,['added0'],async()=>{throw new Error('Unavailable')},new AbortController().signal,'none')).rejects.toThrow('Unavailable');
 });
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
  expect(prompt).toContain('Shared report-only disaggregation fields, compared separately');expect(prompt).toContain('Disaggregation fields: Area');expect(prompt).toContain('| Area: North | 2 |');expect(prompt).not.toContain('Private narrative');
  expect(prepared.reportEvidence.map(evidence=>[evidence.overall.id,evidence.comparisons.length])).toEqual([['needs',1],['comments',0],['area',0]]);
 });
 it('prepares two main fields by sex and district separately with one overall table per field',async()=>{
  const {project,analysis}=fixture();
  project.form.questions.push(question('services','number'),question('sex'),question('district'));
  analysis.questions.push({...result('services','number'),statistics:{mean:4},rows:[{id:'n',label:'Service visits',count:2,percent:100}]},result('sex'),result('district'));
  analysis.settings.filters=[{field:'district',kind:'category',values:['north']}];analysis.filterSummary=['District: North'];
  const before=structuredClone(analysis),calls:{id:string;fields:string[]}[]=[];
  const prepared=await prepareReportAnalysis(analysis,['needs','services'],['sex','district'],async(settings,id)=>{
   const fields=settings.questions[id].breakdowns!;calls.push({id,fields});
   expect(settings.filters).toEqual(analysis.settings.filters);
   // Finish out of order to check evidence retains the selected field order.
   await new Promise(resolve=>setTimeout(resolve,fields[0]==='sex'?5:0));
   const field=fields[0],denominator=field==='sex'?2:1;
   return {...analysis.questions.find(q=>q.id===id)!,breakdownFields:[{id:field,label:field}],
    breakdowns:[{id:field,label:field==='sex'?'Female':'North',denominator}],
    rows:[{id:'a',label:id==='needs'?'Water':'Service visits',count:2,percent:100,series:[{id:field,count:1,percent:field==='sex'?50:100}]}]};
  },new AbortController().signal);
  expect(calls).toEqual([{id:'needs',fields:['sex']},{id:'needs',fields:['district']},{id:'services',fields:['sex']},{id:'services',fields:['district']}]);
  expect(analysis).toEqual(before);
  expect(prepared.questions.every(q=>!q.breakdowns.length)).toBe(true);
  expect(prepared.reportEvidence.map(e=>e.comparisons.map(q=>q.breakdownFields![0].id))).toEqual([['sex','district'],['sex','district']]);
  const prompt=buildKoboReportPrompt(project,prepared,['needs','services'],'custom');
  expect(prompt.match(/#### Overall results/g)).toHaveLength(2);
  expect(prompt.match(/#### Separate comparison by sex/g)).toHaveLength(2);
  expect(prompt.match(/#### Separate comparison by district/g)).toHaveLength(2);
  expect(prompt).toContain('| sex: Female | 2 |');expect(prompt).toContain('| district: North | 1 |');
  expect(prompt).toContain('| Water | 1 | 50% |');expect(prompt).toContain('| Water | 1 | 100% |');
  expect(prompt).toContain('Answered: 2; Missing: 1; Total: 3');expect(prompt).toContain('| Mean | 4 |');
  expect(prompt).toContain('District: North');expect(prompt).toContain('Selected main fields: 2');
  expect(prompt).not.toContain('Question: sex');expect(prompt).not.toContain('Question: district');expect(prompt).not.toContain('Female /');
 });
 it('redacts unsafe separate comparisons and omits tables when no categories are available',async()=>{
  const {project,analysis}=fixture();project.form.questions.push(question('area'));
  const prepared=await prepareReportAnalysis(analysis,['needs'],['area'],async()=>({...analysis.questions[0],breakdownFields:[{id:'name',label:'Secret label'}],breakdowns:[{id:'secret',label:'Secret person',denominator:2}]}),new AbortController().signal);
  let prompt=buildKoboReportPrompt(project,prepared,['needs'],'custom');
  expect(prompt).toContain('Comparison omitted');expect(prompt).not.toContain('Secret label');expect(prompt).not.toContain('Secret person');
  prepared.reportEvidence[0].comparisons=[{...analysis.questions[0],breakdownFields:[{id:'area',label:'Area'}],breakdowns:[]}];
  prompt=buildKoboReportPrompt(project,prepared,['needs'],'custom');
  expect(prompt).toContain('No breakdown categories are available');expect(prompt.match(/\| Water \| 2 \| 100% \|/g)).toHaveLength(1);
 });
 it('limits concurrent analyses and propagates aborts and request failures',async()=>{
  const {analysis}=fixture();analysis.questions=Array.from({length:8},(_,index)=>result(`q${index}`));let active=0,peak=0;
  await prepareReportAnalysis(analysis,analysis.questions.map(q=>q.id),['area','sex'],async(_,id)=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return result(id)},new AbortController().signal);
  expect(peak).toBe(3);
  const controller=new AbortController();controller.abort();
  await expect(prepareReportAnalysis(analysis,['q0'],['area'],async()=>result('q0'),controller.signal)).rejects.toThrow();
  await expect(prepareReportAnalysis(analysis,['q0'],['area'],async()=>{throw new Error('Analysis unavailable')},new AbortController().signal)).rejects.toThrow('Analysis unavailable');
 });
 it('stops queued comparisons when aborted during a request',async()=>{
  const {analysis}=fixture(),controller=new AbortController();let calls=0;
  analysis.questions=Array.from({length:4},(_,index)=>result(`q${index}`));
  await expect(prepareReportAnalysis(analysis,analysis.questions.map(q=>q.id),['area','sex'],async(_,id)=>{
   calls++;await Promise.resolve();controller.abort();return result(id);
  },controller.signal)).rejects.toThrow();
  expect(calls).toBe(3);
 });
 it('keeps all optional report settings inactive unless selected',()=>{
  const {project,analysis}=fixture(),prompt=buildKoboReportPrompt(project,analysis,['needs'],'none');
  expect(prompt).toContain('general survey report in English');expect(prompt).not.toContain('User-provided context');expect(prompt).not.toContain('Evidence quality checks');expect(prompt).not.toContain('Intended audience');expect(prompt).not.toContain('400-600');
 });
 it('supports purpose, audience, Arabic output, length and context without treating objectives as results',()=>{
  const {project,analysis}=fixture(),options=defaultReportOptions();
  options.purpose='protection';options.audience='Protection team <HQ>';options.language='ar';options.length='short';
  options.context={period:'October 2026',location:'North',population:'Displaced households',sampling:'Convenience sample',objectives:'Understand service barriers'};
  const prompt=buildKoboReportPrompt(project,analysis,['needs'],'none',options);
  expect(prompt).toContain('protection analysis in Arabic');expect(prompt).toContain('Write the narrative and report headings in Arabic');expect(prompt).toContain('400-600');
  expect(prompt).toContain('Protection team &lt;HQ&gt;');expect(prompt).toContain('Sampling method: Convenience sample');expect(prompt).toContain('Reporting period: October 2026');expect(prompt).toContain('Location: North');expect(prompt).toContain('Target population: Displaced households');expect(prompt).toContain('Assessment objectives: Understand service barriers');expect(prompt).toContain('Do not treat assessment objectives as achieved results');
  options.purpose='donor';options.length='detailed';expect(buildKoboReportPrompt(project,analysis,['needs'],'none',options)).toContain('Do not claim programme impact');expect(buildKoboReportPrompt(project,analysis,['needs'],'none',options)).toContain('subsection for each main field');
  options.purpose='planning';expect(buildKoboReportPrompt(project,analysis,['needs'],'none',options)).toContain('do not invent budgets');
 });
 it('uses individual overrides, shared defaults and explicit overall-only selections',async()=>{
  const {analysis}=fixture();analysis.questions=[result('needs'),result('services'),result('risks'),result('comments','text')];
  const calls:{id:string;fields:string[]}[]=[];
  const prepared=await prepareReportAnalysis(analysis,analysis.questions.map(q=>q.id),['sex','district'],async(settings,id)=>{calls.push({id,fields:settings.questions[id].breakdowns!});return result(id)},new AbortController().signal,{needs:['population'],services:[],comments:['sex']});
  expect(calls).toEqual([{id:'needs',fields:['population']},{id:'risks',fields:['sex']},{id:'risks',fields:['district']}]);expect(prepared.reportEvidence.map(e=>e.comparisons.length)).toEqual([1,0,2,0]);
 });
 it('flags high missingness and small overall and comparison bases only when enabled',async()=>{
  const {project,analysis}=fixture();project.form.questions.push(question('sex'));const options=defaultReportOptions();options.quality={enabled:true,missingPercent:30,smallBase:2};
  const prepared=await prepareReportAnalysis(analysis,['needs'],['sex'],async()=>({...analysis.questions[0],breakdownFields:[{id:'sex',label:'Sex'}],breakdowns:[{id:'female',label:'Female',denominator:1},{id:'male',label:'Male',denominator:0}]}),new AbortController().signal);
  const warnings=reportQualityWarnings(project,prepared,['needs'],'custom',options.quality);
  expect(warnings).toHaveLength(2);expect(warnings[0]).toContain('1 of 3 responses missing (33.3%');expect(warnings[1]).toContain('2 comparison groups');expect(warnings[1]).toContain('smallest n=0');
  let prompt=buildKoboReportPrompt(project,prepared,['needs'],'custom',options);expect(prompt).toContain('## Evidence quality checks');expect(prompt).toContain('not statistical significance tests');
  options.quality={enabled:true,missingPercent:100,smallBase:1};expect(reportQualityWarnings(project,analysis,['needs'],'none',options.quality)).toEqual([]);expect(buildKoboReportPrompt(project,analysis,['needs'],'none',options)).toContain('This does not establish data quality');
  options.quality.enabled=false;expect(reportQualityWarnings(project,prepared,['needs'],'custom',options.quality)).toEqual([]);prompt=buildKoboReportPrompt(project,prepared,['needs'],'custom',options);expect(prompt).not.toContain('## Evidence quality checks');
 });
 it('does not inspect unsafe breakdowns or free-text values in quality checks',()=>{
  const {project,analysis}=fixture();analysis.questions[0].breakdownFields=[{id:'name',label:'Secret person'}];analysis.questions[0].breakdowns=[{id:'x',label:'Private answer',denominator:1}];
  const warnings=reportQualityWarnings(project,analysis,['needs','comments','name'],'current',{enabled:true,missingPercent:100,smallBase:30});
  expect(warnings).toHaveLength(2);expect(warnings.join()).not.toContain('Secret person');expect(warnings.join()).not.toContain('Private answer');expect(warnings.join()).not.toContain('Private narrative');
 });
});
