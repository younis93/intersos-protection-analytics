import {afterEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ConditionalBadge,openConditionalReview,ConflictExplanation,ConditionTechnicalDetails,conditionIssueText} from './KoboConditionalReview';

afterEach(()=>vi.unstubAllGlobals());
describe('conditional warning entry points',()=>{
 it('labels connection setup as a question-level check independent of answer warnings',()=>{
  const html=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={1} category="checks" findingType="connection-setup-needed"/>);
  expect(html).toContain('aria-label="Connection setup needed: 1 question"');
  expect(html).toContain('is-condition-check');expect(html).not.toContain('Required answer missing');
  const ar=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={1} category="checks" findingType="connection-setup-needed" language="ar"/>);
  expect(ar).toContain('يلزم إعداد الارتباط: 1 سؤال');
 });
 it('gives the count and status an accessible name independent of color',()=>{
  const html=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={3}/>);
  expect(html).toContain('aria-label="Conditional warnings: 3"');
  expect(html).toContain('is-open');
  expect(html).toContain('type="button"');
 });
 it('distinguishes ignored and excluded warnings, including Arabic labels',()=>{
  expect(renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={1} status="ignored"/>)).toContain('aria-label="Ignored warnings: 1"');
  const html=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={1} status="excluded" language="ar"/>);
  expect(html).toContain('إجابات مستبعدة: 1');
  expect(html).toContain('is-excluded');
 });
 it('opens the correct project, question, and status from a table badge',()=>{
  const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});
  openConditionalReview('project-1','group/other','ignored');
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(dispatchEvent.mock.calls[0][0].type).toBe('kobo-conditional-review');
  expect(dispatchEvent.mock.calls[0][0].detail).toEqual({project:'project-1',question:'group/other',status:'ignored',category:'conflicts'});
 });
 it('uses a separate neutral entry point for unchecked conditions',()=>{
  const html=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={12} category="checks"/>);
  expect(html).toContain('aria-label="Condition check: 12 answers"');
  expect(html).toContain('is-condition-check');
  expect(html).not.toContain('Conditional warnings');
  const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});
  openConditionalReview('p','q','open','checks');
  expect(dispatchEvent.mock.calls[0][0].detail.category).toBe('checks');
 });
 it('explains why the stored answer needs review with labels and current answers',()=>{
  const html=renderToStaticMarkup(<ConflictExplanation condition="Question A = No" controls={[{question:'a',label:'Question A',answer:'Yes',record:'r',row:2,value:'yes'}]} language="en"/>);
  expect(html).toContain('This answer should be blank.');
  expect(html).toContain('Question A: Yes');
  expect(html).toContain('Only answer this question when:');
  expect(html).toContain('Question A = No');
 });
 it('puts raw expressions in an expandable technical details section',()=>{
  const html=renderToStaticMarkup(<ConditionTechnicalDetails item={{question:'q',label:'Question',condition:'',source:'automatic',issues:['unsupported-condition'],rawConditions:["regex(${a}, 'no')"],manualRules:null}} language="en"/>);
  expect(html).toContain('<details');expect(html).toContain('<summary>Technical details</summary>');
  expect(html).not.toContain('<details open');
  expect(html).toContain('regex(${a}');
  expect(conditionIssueText(['unsupported-condition'],'en')).toBe('The app does not yet support this form expression.');
  expect(conditionIssueText(['missing-parent-link'],'ar')).toContain('الاستجابة الأصلية');
 });
 it('distinguishes required blanks from optional connected blanks and opens missing-answer review',()=>{
  const required=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={1} category="missing" findingType="required-missing"/>);
  expect(required).toContain('aria-label="Required answer missing: 1"');
  const optional=renderToStaticMarkup(<ConditionalBadge project="p" question="q" count={1} category="missing" findingType="connected-blank" language="ar"/>);
  expect(optional).toContain('إجابة مرتبطة اختيارية فارغة');expect(optional).toContain('is-connected-blank');
  const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});openConditionalReview('p','q','open','missing');
  expect(dispatchEvent.mock.calls[0][0].detail.category).toBe('missing');
  expect(conditionIssueText(['required-metadata-unavailable'],'en')).toContain('required status is unavailable');
 });
});
