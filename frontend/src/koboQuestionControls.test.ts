import {describe,it,expect} from 'vitest';
import {replacePercentageBasis,sharedPercentageBasis} from './koboPercentageSettings';
import {buildKoboBulkCopy} from './koboBulkCopy';
import {projectKoboChart,koboPdfChartPanels,koboScreenChartRows} from './koboChartDensity';
import {questionDefaults,type KoboAnalysis,type KoboResult,type KoboSettings} from './koboTypes';
import {questionExclusionCandidate} from './koboReviewConfig';
import {allQuestionValueDisplay} from './koboValueDisplay';
import {questionSettingsFor} from './koboTypes';
const settings:KoboSettings={version:1,language:'en',filters:[],filterFields:[],hidden:['hidden'],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',questions:{}};
const result:KoboResult={id:'a',name:'a',label:'First <field>',group:'',kind:'category',repeat:'',denominator:3,missing:0,total:3,rows:[{id:'a',label:'Answer A',count:1,percent:100/3},{id:'b',label:'Answer B',count:2,percent:200/3}],breakdowns:[],statistics:{},chart:'bar',colors:{},percentageBasis:'Respondents'};
describe('shared question controls',()=>{
 it('future fields retain the analysis default when changing metric display or opening controls',()=>{
  const inherited={...settings,percentageDefault:'column-total' as const};
  expect(allQuestionValueDisplay(inherited,['future'],'percent').questions.future.percentageMode).toBe('column-total');
  expect(questionSettingsFor({kind:'category'},undefined,inherited.percentageDefault).percentageMode).toBe('column-total');
  expect(questionSettingsFor({kind:'category'},{percentageMode:'row-total'},inherited.percentageDefault).percentageMode).toBe('row-total');
 });
 it('ignoring a question clears its mappings across sheets as one immutable candidate',()=>{
  const config={addedQuestions:[],choiceOverrides:{},excludedQuestionIds:[]};
  const mappings=[{sheet:0,column:0,header:'Answer',question:'q',option:'a',status:'matched'},{sheet:1,column:0,header:'Answer',question:'q',option:'b',status:'matched'},{sheet:1,column:1,header:'Other',question:'other',option:'',status:'matched'}];
  const candidate=questionExclusionCandidate(config,mappings,'q',true);
  expect(candidate.config.excludedQuestionIds).toEqual(['q']);
  expect(candidate.mappings.slice(0,2).every(m=>m.question===''&&m.status==='excluded')).toBe(true);
  expect(candidate.mappings[2]).toBe(mappings[2]);
  expect(mappings[0].question).toBe('q');expect(config.excludedQuestionIds).toEqual([]);
  expect(questionExclusionCandidate(candidate.config,candidate.mappings,'q',false).config.excludedQuestionIds).toEqual([]);
 });
 it('explicit bulk percentages replace hidden compatible fields and preserve measured fields',()=>{
  const original={...settings,questions:{hidden:{...questionDefaults,percentageMode:'row-total' as const},sum:{...questionDefaults,calculation:{operation:'sum' as const,field:'value',decimals:2}},average:{...questionDefaults,calculation:{operation:'average' as const,field:'value',decimals:2}}}};
  const changed=replacePercentageBasis(original,['hidden','sum','average','future'],'breakdown-group');
  expect(changed.percentageDefault).toBe('breakdown-group');
  expect(changed.questions.hidden.percentageMode).toBe('breakdown-group');
  expect(changed.questions.sum.percentageMode).toBe('breakdown-group');
  expect(changed.questions.average).toBe(original.questions.average);
  expect(sharedPercentageBasis(changed,['hidden','sum','future'])).toBe('breakdown-group');
  changed.questions.hidden={...changed.questions.hidden,percentageMode:'row-total'};
  expect(sharedPercentageBasis(changed,['hidden','sum'])).toBe('mixed');
  expect(original.questions.hidden.percentageMode).toBe('row-total');
 });
 it('bulk copy includes complete results and retained manual order without card mounting',async()=>{
  const analysis:KoboAnalysis={questions:[{...result,filterMode:'own',filterSummary:['Region: South'],cohortCount:3},{...result,id:'other',label:'Collapsed field'}],settings,total:3,filtered:1,filterSummary:['Region: North'],groups:[]};
  const store=new Map([['a',new Map<string,unknown>([['pivotSort',{id:'answer',metric:'answer',direction:'desc'}]])]]);
  const output=await buildKoboBulkCopy(analysis,store);
  expect(output.count).toBe(2);
  expect(output.html.match(/<html/g)).toHaveLength(1);
  expect(output.html).toContain('First &lt;field&gt;');expect(output.html).toContain('Collapsed field');
  expect(output.text).toContain('Uses own filters; page filters do not apply.');
  expect(output.text.indexOf('Answer B')).toBeLessThan(output.text.indexOf('Answer A'));
  expect(output.text).toContain('Region: South');
 });
 it('all chart consumers use a projection while pivots retain full rows',()=>{
  const source={...result,chartTopN:1,chartProjection:{rows:[result.rows[1]],topNShown:1,topNTotal:2,topNOther:false}};
  expect(projectKoboChart(source).rows).toHaveLength(1);
  expect(koboScreenChartRows(source)).toHaveLength(1);
  expect(koboPdfChartPanels(source)[0].rows).toHaveLength(1);
  expect(source.rows).toHaveLength(2);
 });
});
