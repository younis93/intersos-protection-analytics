import {describe,it,expect} from 'vitest';
import {indicatorQuestion,indicatorScopes,indicatorDraftError,indicatorResultText} from './koboIndicatorDraft';
import type {KoboForm,KoboQuestion} from './koboTypes';
import type {KoboIndicatorDefinition} from './koboIndicatorTypes';

const question:KoboQuestion={id:'q',name:'q',labels:{en:'Question'},kind:'multiple',type:'select_multiple',group:'',repeat:'',metadata:false,identifying:false,choices:[{name:'a',labels:{en:'A'}},{name:'b',labels:{en:'B'}}]};
const valid=():KoboIndicatorDefinition=>({id:'one',name:'Indicator',description:'',higherMeaning:'More of the attribute',scope:'',reviewIssues:[],questions:[{...indicatorQuestion(question),points:{a:0,b:2},multipleMethod:'sum'}]});
describe('indicator builder drafts',()=>{
 it('supports condition percentages and raw numeric calculations without point mappings',()=>{
  const draft=valid();draft.mode='percentage';draft.higherMeaning='';draft.questions=[indicatorQuestion(question)];
  expect(indicatorDraftError(draft)).toContain('Select the answers');draft.questions[0].selectedCodes=['a'];expect(indicatorDraftError(draft)).toBe('');
  draft.mode='numeric_sum';expect(indicatorDraftError(draft)).toContain('numeric questions');draft.questions=[indicatorQuestion({...question,kind:'number'})];expect(indicatorDraftError(draft)).toBe('');
  draft.mode='numeric_average';expect(indicatorDraftError(draft)).toBe('');
 });
 it('formats each result on its actual scale',()=>{
  const result={value:1234.5,average:1234.5} as import('./koboIndicatorTypes').KoboIndicatorResult;
  expect(indicatorResultText({...result,mode:'numeric_sum'},'en')).toBe('1,234.5');
  expect(indicatorResultText({...result,value:25,mode:'percentage'},'en')).toBe('25.0%');
  expect(indicatorResultText({...result,value:25,mode:'score'},'en')).toBe('25.0 / 100');
 });
 it('requires explicit points and an explicit multiple-choice method',()=>{
  const draft=valid();draft.questions=[indicatorQuestion(question)];expect(draft.questions[0].weight).toBe(1);expect(draft.questions[0].points).toEqual({a:null,b:null});expect(indicatorDraftError(draft)).toContain('Assign points');
  draft.questions[0].points={a:0,b:2};expect(indicatorDraftError(draft)).toContain('scoring method');draft.questions[0].multipleMethod='highest';expect(indicatorDraftError(draft)).toBe('');
 });
 it('accepts zero-point answers and fractional weights, and rejects missing range points',()=>{
  const draft=valid();draft.questions[0].weight=.25;expect(indicatorDraftError(draft)).toBe('');draft.questions[0].weight=0;expect(indicatorDraftError(draft)).toContain('positive weight');
  draft.questions=[{...indicatorQuestion({...question,kind:'number'}),ranges:[{minimum:0,maximum:10,includeMaximum:false,points:NaN}]}];expect(indicatorDraftError(draft)).toContain('every numeric range');draft.questions[0].ranges[0].points=0;expect(indicatorDraftError(draft)).toBe('');
 });
 it('allows only the chosen repeat table and its actual ancestors',()=>{
  const form={groups:[{id:'outer',parent:'',repeat:true},{id:'section',parent:'outer',repeat:false},{id:'inner',parent:'section',repeat:true},{id:'other',parent:'',repeat:true}]} as KoboForm;
  expect([...indicatorScopes(form,'inner')].sort()).toEqual(['','inner','outer']);expect([...indicatorScopes(form,'')]).toEqual(['']);
 });
 it('requires a meaningful definition before preview',()=>{
  const draft=valid();draft.name=' ';expect(indicatorDraftError(draft)).toContain('name');draft.name='Score';draft.higherMeaning='';expect(indicatorDraftError(draft)).toContain('higher score');
 });
});
