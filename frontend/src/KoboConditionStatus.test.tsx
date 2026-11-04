import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {KoboConditionStatus,KoboConditionStateDetails,KoboConnectionStateSummary} from './KoboConditionStatus';
import type {KoboProject} from './koboTypes';
describe('connection condition state presentation',()=>{
 it('distinguishes project and question ignores with text and an icon',()=>{
  const shared=renderToStaticMarkup(<KoboConditionStatus condition={{status:'ignored',ignoredScope:'project'}} language="en"/>);
  const local=renderToStaticMarkup(<KoboConditionStatus condition={{status:'ignored',ignoredScope:'question'}} language="en"/>);
  expect(shared).toContain('Ignored - whole project');expect(local).toContain('Ignored - this question');expect(shared).toContain('data-condition-state="ignored"');expect(shared).toContain('<svg');
 });
 it('explains an ignored part and a missing remaining reference together',()=>{
  const html=renderToStaticMarkup(<KoboConditionStateDetails condition={{status:'missing',ignoredParts:['Consent is Yes'],missingReferences:['q4']}} language="en"/>);
  expect(html).toContain('Ignored across this project');expect(html).toContain('Consent is Yes');expect(html).toContain('Missing reference:');expect(html).toContain('q4');expect(html).toContain('does not resolve it');
 });
 it('summarizes the effective question state in Review',()=>{
  const project={form:{questions:[{id:'q',ignoredConnectionRules:[{type:'rule',field:'consent',operator:'eq',value:'yes'}],conditionReview:[{status:'missing',missingReferences:['q4']}]}]}} as unknown as KoboProject;
  const html=renderToStaticMarkup(<KoboConnectionStateSummary project={project} question="q" language="en"/>);
  expect(html).toContain('1 ignored - whole project');expect(html).toContain('1 missing reference');
 });
 it('localizes missing and ignored state labels in Arabic',()=>{
  expect(renderToStaticMarkup(<KoboConditionStatus condition={{status:'missing'}} language="ar"/>)).toContain('مرجع مفقود');
  expect(renderToStaticMarkup(<KoboConditionStatus condition={{status:'ignored',ignoredScope:'project'}} language="ar"/>)).toContain('متجاهل - المشروع بالكامل');
 });
});
