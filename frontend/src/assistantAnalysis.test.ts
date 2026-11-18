import {describe,expect,it,vi} from 'vitest';
import {answerFromPivot,chatAnalysisEvidence,comparisonChecks,diagnoseOption,loadChatAnalysis,protectChatResult,resolveChatAnalysis} from './assistantAnalysis';
import {questionDefaults} from './koboTypes';
import {checkReportClaims,draftChatIndicator,proposeChatFilters} from './assistantProjectReview';
import {assistantChart} from './assistantChart';
import {surveyInterpretationCatalog} from './assistantDictionary';
import {isProjectTotal,projectTotalAnswer,validatedInterpretation} from './assistantUnderstanding';
import type {KoboAnalysis,KoboProject,KoboResult,KoboSettings} from './koboTypes';

const field=(id:string,label:string)=>({id,name:id,kind:'category',labels:{en:label},choices:[]});
const female={name:'f',labels:{en:'Female'}},male={name:'m',labels:{en:'Male'}};
const project={form:{questions:[{...field('sex','2. Sex of the respondent'),choices:[male,female]},field('area','Governorate'),field('area_other','Governorate'),
 {...field('contact','Phone number'),identifying:true}]}} as unknown as KoboProject;
const analysis={filtered:40,filterSummary:['Latest period'],questions:[],
 settings:{hidden:[],filters:[{field:'area',kind:'category',values:['north']}],questions:{}}} as unknown as KoboAnalysis;
const pivot={
 id:'sex',label:'Sex of the respondent',kind:'category',total:40,denominator:40,missing:0,
 breakdowns:[{id:'north',label:'North',denominator:20},{id:'south',label:'South',denominator:20}],
 breakdownFields:[{id:'area',label:'Governorate'}],
 rows:[{id:'yes',label:'Answer 1',count:20,percent:50,series:[{id:'north',count:10,percent:50},{id:'south',count:10,percent:50}]},
  {id:'no',label:'Answer 2',count:20,percent:50,series:[{id:'north',count:10,percent:50},{id:'south',count:10,percent:50}]}],
} as KoboResult;

describe('chat analysis',()=>{
 it('finds late questions and late answer choices in a large form without exposing hidden choices',()=>{
  const original=project.form.questions[0];
  const field={...original,id:'late',name:'late',labels:{en:'82. Civil documentation'},
   choices:[...Array.from({length:15},(_,i)=>({name:`option-${i}`,labels:{en:`Option ${i}`}})),
    {name:'certificate',labels:{en:'Birth certificate'}},{name:'withheld',labels:{en:'Private option'}}]};
  const fields=[...Array.from({length:80},(_,i)=>({...original,id:`field-${i}`,name:`field-${i}`,labels:{en:`Household item ${i}`}})),field];
  const scope={...analysis,settings:{...analysis.settings,questions:{late:{...questionDefaults,hiddenAnswers:['withheld']}}}};
  const catalog=surveyInterpretationCatalog(fields,scope,'Show Q82 for Birth certificate',[],false);
  expect(catalog[0].id).toBe('late');
  expect(catalog[0].answers[0].code).toBe('certificate');
  expect(JSON.stringify(catalog)).not.toContain('Private option');
  expect(surveyInterpretationCatalog(fields,scope,'Show Q82 for Birth certificate',[],true)[0].answers).toEqual([]);
 });
 it('recognizes a misspelled breakdown and asks when two fields are equally close',()=>{
  const single={...project,form:{...project.form,questions:project.form.questions.filter(field=>field.id!=='area_other')}};
  expect(resolveChatAnalysis(single,analysis,'give me sex breakdown by governeate'))
   .toMatchObject({fields:['sex'],breakdown:'area',intent:'distribution'});
  expect(resolveChatAnalysis(project,analysis,'give me sex breakdown by governeate').clarification?.target).toBe('breakdown');
 });
 it('refreshes an unhide request without removing saved project visibility settings',async()=>{
  const configured={...analysis,settings:{...analysis.settings,questions:{sex:{...questionDefaults,hiddenAnswers:['f']}}}};
  const request=resolveChatAnalysis(project,configured,'Unhide the answer',{fields:['sex'],hiddenAnswers:['m']});
  expect(request).toMatchObject({fields:['sex'],intent:'distribution',hiddenAnswers:[],refreshVisibility:true});
  const preview=vi.fn(async(_settings:KoboSettings)=>({...pivot,breakdowns:[],rows:[{id:'m',label:'Male',count:40,percent:100}]}));
  const cards=await loadChatAnalysis(project,configured,request,5,preview,new AbortController().signal);
  expect(preview.mock.calls[0][0].questions.sex.hiddenAnswers).toEqual(['f']);
  expect(answerFromPivot(request,cards)).toMatch(/Male: 40 \(100%\).*Some answer rows are still hidden/);
  const evidence=chatAnalysisEvidence(cards)[0];
  expect(evidence).not.toHaveProperty('hiddenRows');
  expect(evidence).toHaveProperty('visibilityNote',expect.stringContaining('listed rows and columns are visible'));
 });
 it('answers project totals directly without releasing a small complement',()=>{
  expect(isProjectTotal('give me total submission')).toBe(true);
  expect(isProjectTotal('how many records do we have?')).toBe(true);
  expect(isProjectTotal('total submissions by governorate')).toBe(false);
  expect(projectTotalAnswer({...analysis,total:42},5)).toBe('40 submissions match the current filters.');
  expect(projectTotalAnswer({...analysis,total:50},5)).toContain('50 submissions in total');
  expect(projectTotalAnswer({...analysis,total:50,filtered:2},5)).toMatch(/withheld/);
 });
 it('validates model routing without allowing invented fields or extra actions',()=>{
  const fields=new Set(['sex']);
  expect(validatedInterpretation('{"fields":["sex"],"intent":"distribution"}',fields)).toEqual({fields:['sex'],intent:'distribution'});
  expect(validatedInterpretation('{"fields":["phone"],"intent":"distribution"}',fields)).toBeUndefined();
  expect(validatedInterpretation('{"fields":["sex"],"intent":"distribution","edit":true}',fields)).toBeUndefined();
 });
 it('charts a single visible answer and handles chart types that require a breakdown',()=>{
  const male={id:'m',label:'Male',count:180,percent:100};
  const blank={id:'__blank__',label:'Blank',count:50,percent:null};
  const result={...pivot,denominator:180,chart:'heatmap' as const,breakdowns:[],rows:[male,blank]};
  expect(assistantChart(result)).toMatchObject({single:{label:'Male',count:180,percent:100},result:{chart:'bar',rows:[male]}});
  expect(assistantChart({...result,rows:[blank]})).toBeNull();
  expect(assistantChart({...result,pivotHasHiddenColumns:true})).toBeNull();
  const multi=assistantChart({...result,rows:[male,{...male,id:'f',label:'Female'}]});
  expect(multi?.result.chart).toBe('bar');
  expect(multi?.single).toBeUndefined();
 });
 it('proposes an explicit filter and leaves uncertain round and indicator rules for review',()=>{
  expect(proposeChatFilters(project,analysis,'Show results where Sex is Female')).toMatchObject({question:'Show results',filters:[{field:'sex',values:['f']}]});
  expect(proposeChatFilters(project,analysis,'Show results from the latest round')).toHaveProperty('message');
  const proposal=draftChatIndicator(project,analysis,'Build an indicator for Sex Female');
  expect(proposal.draft.questions[0]).toMatchObject({question:'sex',selectedCodes:['f']});
 });
 it('flags a stale report denominator separately from interpretation and unmatched claims',()=>{
  const source={label:'Survey pivot',result:{...pivot,breakdowns:[],percentageMode:'legacy-respondents' as const}};
  expect(checkReportClaims('Answer 1: 20 respondents out of 80 respondents (50%). This proves a trend.',[source]))
   .toEqual(expect.arrayContaining([expect.objectContaining({note:expect.stringContaining('Current source shows')}),
    expect.objectContaining({note:expect.stringContaining('interpretation needs evidence')})]));
  expect(checkReportClaims('No label here: 32%.',[source])[0].note).toMatch(/could not be tied/);
 });
 it('resolves numbered fields and asks the user to resolve an ambiguous breakdown',()=>{
  expect(resolveChatAnalysis(project,analysis,'Show question 2')).toEqual({fields:['sex'],intent:'distribution'});
  expect(resolveChatAnalysis(project,analysis,'Show question 2 by governorate').clarification?.target).toBe('breakdown');
  expect(resolveChatAnalysis(project,analysis,'Show question 2 grouped by governorate',[],[],{breakdown:'area'})).toEqual({fields:['sex'],breakdown:'area',intent:'distribution'});
 });
 it('rejects identifying breakdown fields and leaves general chat without analysis',()=>{
  expect(resolveChatAnalysis(project,analysis,'Show question 2 by phone number').message).toMatch(/eligible breakdown/);
  expect(resolveChatAnalysis(project,analysis,'Hello').fields).toEqual([]);
  expect(resolveChatAnalysis(project,analysis,'How can I share a report by email?')).toEqual({fields:[]});
 });
 it('previews breakdowns with the original filters and leaves saved settings untouched',async()=>{
  const preview=vi.fn(async(_settings:KoboSettings,_id:string,_signal:AbortSignal)=>pivot);
  const [card]=await loadChatAnalysis(project,analysis,{fields:['sex'],breakdown:'area'},5,preview,new AbortController().signal);
  expect(preview.mock.calls[0][0].questions.sex.breakdowns).toEqual(['area']);
  expect(preview.mock.calls[0][0].filters).toEqual(analysis.settings.filters);
  expect(analysis.settings.questions).toEqual({});
  expect(card.result?.rows).toEqual(pivot.rows);
  expect(card.filters).toEqual(['Latest period']);
 });
 it('does not publish a small cell or its complementary count',()=>{
  for(const count of [3,17]){
   const result={...pivot,rows:[{...pivot.rows[0],series:[{id:'north',count,percent:count*5}]}]};
   const card=protectChatResult(result,5,40);
   expect(card.result).toBeUndefined();
   expect(card.message).toMatch(/withheld/);
   expect(chatAnalysisEvidence([card])[0]).not.toHaveProperty('rows');
  }
 });
 it('rechecks an overall result without reusing a withheld or saved breakdown',async()=>{
  const configured={...analysis,settings:{...analysis.settings,questions:{sex:{...questionDefaults,breakdowns:['area']}}}};
  const context={fields:['sex'],breakdown:'area'};
  const request=resolveChatAnalysis(project,configured,'Show the overall result for question 2',context,[],
   {field:'sex',overall:true,intent:'distribution'});
  const preview=vi.fn(async(settings:KoboSettings)=>settings.questions.sex.breakdowns?.length?
   {...pivot,breakdowns:[{...pivot.breakdowns[0],denominator:2}]}:
   {...pivot,breakdowns:[],breakdownFields:[],rows:pivot.rows.map(row=>({...row,series:undefined}))});
  const signal=new AbortController().signal;
  const blocked=await loadChatAnalysis(project,configured,{fields:['sex'],breakdown:'area',intent:'distribution'},5,preview,signal);
  expect(blocked[0]).toMatchObject({privacyWithheld:true,grouped:true});
  expect(answerFromPivot({fields:['sex'],intent:'distribution'},blocked)).toMatch(/Try the overall result/);
  const overall=await loadChatAnalysis(project,configured,request,5,preview,signal);
  expect(preview.mock.calls[1][0].questions.sex.breakdowns).toEqual([]);
  expect(overall[0].result?.rows).toHaveLength(2);
 });
 it('shares published counts, percentages, and denominators with the model',()=>{
  const [evidence]=chatAnalysisEvidence([protectChatResult(pivot,5,40)]);
  expect(evidence).toMatchObject({answered:40,breakdowns:[{id:'north',answered:20},{id:'south',answered:20}]});
  expect(evidence).toHaveProperty('rows.0.breakdowns.0.count',10);
 });
 it('resolves natural follow-ups without assuming an unrelated general question is about the pivot',()=>{
  const first=resolveChatAnalysis(project,analysis,'give me the sex');
  expect(first).toMatchObject({fields:['sex'],intent:'distribution'});
  const second=resolveChatAnalysis(project,analysis,'do I have female?',first);
  expect(second).toMatchObject({fields:['sex'],answers:['female'],intent:'count'});
  expect(resolveChatAnalysis(project,analysis,'What percentage?',second)).toMatchObject({answers:['female'],intent:'percent'});
  expect(resolveChatAnalysis(project,analysis,'What about males?',second)).toMatchObject({answers:['male'],intent:'count'});
  expect(resolveChatAnalysis(project,analysis,'How many are missing?',second)).toMatchObject({fields:['sex'],intent:'missing'});
  expect(resolveChatAnalysis(project,analysis,'Chart',second)).toMatchObject({fields:['sex'],intent:'distribution'});
  expect(resolveChatAnalysis(project,analysis,'How many days are in a week?',second)).toEqual({fields:[]});
 });
 it('verifies a zero hidden by display settings without adding a row back to the pivot',async()=>{
  const scoped={...analysis,settings:{...analysis.settings,hideZero:true}};
  const request=resolveChatAnalysis(project,scoped,'Do I have female?',{fields:['sex']});
  const preview=vi.fn(async(_settings:KoboSettings)=>({...pivot,breakdowns:[],rows:[
   {id:'m',label:'Male',count:40,percent:100},{id:'f',label:'Female',count:0,percent:0},
  ]}));
  const cards=await loadChatAnalysis(project,scoped,request,5,preview,new AbortController().signal);
  expect(preview.mock.calls[0][0].hideZero).toBe(false);
  expect(answerFromPivot(request,cards)).toBe('No Female responses were recorded under the current filters.');
  expect(cards[0].result?.rows.map(row=>row.id)).toEqual(['m']);
 });
 it('uses the last pivot for breakdown and comparison follow-ups',()=>{
  const context={fields:['sex']};
  const choice={breakdown:'area'};
  expect(resolveChatAnalysis(project,analysis,'Break it down by Governorate',context,[],choice))
   .toEqual({fields:['sex'],breakdown:'area',intent:'distribution'});
  expect(resolveChatAnalysis(project,analysis,'Compare by Governorate',context,[],choice))
   .toEqual({fields:['sex'],breakdown:'area',intent:'compare'});
  expect(answerFromPivot({fields:['sex'],breakdown:'area',intent:'compare'},[protectChatResult(pivot,5,40)]))
   .toContain('Answer 1: North: 10 (50%), South: 10 (50%)');
 });
 it('applies chat-only hiding to a fresh preview and restores the saved visibility settings on request',async()=>{
  const settings={...analysis.settings,questions:{sex:{...questionDefaults,hiddenAnswers:['saved']}}};
  const context={fields:['sex'],hiddenAnswers:['yes']};
  const restored=resolveChatAnalysis(project,{...analysis,settings},'Restore results',context,[],{field:'sex',hiddenAnswers:[],intent:'distribution'});
  const preview=vi.fn(async(_settings:KoboSettings)=>pivot);
  const signal=new AbortController().signal;
  await loadChatAnalysis(project,{...analysis,settings},{fields:['sex'],hiddenAnswers:['yes']},5,preview,signal);
  await loadChatAnalysis(project,{...analysis,settings},restored,5,preview,signal);
  expect(preview.mock.calls.map(([config])=>config.questions.sex.hiddenAnswers)).toEqual([['saved','yes'],['saved']]);
  expect(settings.questions.sex.hiddenAnswers).toEqual(['saved']);
 });
 it('distinguishes a defined but unseen option from an undefined or hidden option',()=>{
  const card={...protectChatResult(pivot,5,40),diagnosticChoices:[
   {id:'f',label:'Female',hidden:false},{id:'m',label:'Male',hidden:true},
  ]};
  expect(diagnoseOption(card,'Female')).toMatch(/defined in the form but absent/);
  expect(diagnoseOption(card,'m')).toMatch(/hidden in this pivot/);
  expect(diagnoseOption(card,'Other')).toMatch(/not listed/);
  expect(diagnoseOption({...card,result:undefined},'m')).toBe('');
  expect(comparisonChecks({...card,result:{...pivot,breakdowns:[pivot.breakdowns[0],{...pivot.breakdowns[1],denominator:30}]}}))
   .toContain('Group sample sizes differ. Check the group bases and percentage definition when comparing.');
 });
 it('distinguishes hidden, absent and withheld choices and strips underlying percentage rows',async()=>{
  const request=resolveChatAnalysis(project,analysis,'Do I have female?',{fields:['sex']});
  const hidden={...analysis,settings:{...analysis.settings,questions:{sex:{...questionDefaults,hiddenAnswers:['f'],hiddenPivotColumns:['south']}}}};
  const result={...pivot,percentageRows:[{id:'f',label:'Female',count:20,percent:50}]};
  const load=(scope:KoboAnalysis,preview:KoboResult,form=project)=>loadChatAnalysis(form,scope,request,5,async()=>preview,new AbortController().signal);
  const cards=await load(hidden,result);
  expect(answerFromPivot(request,cards)).toMatch(/Female is hidden/);
  expect(cards[0]).toMatchObject({hiddenRows:true,hiddenColumns:true});
  expect(JSON.stringify(chatAnalysisEvidence(cards))).not.toMatch(/Female|South/);
  expect(cards[0].result?.percentageRows).toBeUndefined();
  const withoutFemale={...project,form:{...project.form,questions:project.form.questions.map(field=>field.id==='sex'?{...field,choices:[male]}:field)}};
  expect(answerFromPivot(request,await load(analysis,pivot,withoutFemale))).toMatch(/Female is not listed/i);
  expect(answerFromPivot(request,await load(hidden,{...result,percentageRows:[{id:'f',label:'Female',count:2,percent:5}]}))).toMatch(/withheld/);
 });
});
