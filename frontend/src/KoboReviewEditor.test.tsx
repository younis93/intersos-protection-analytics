import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {KoboCellEditor} from './KoboDataEditing';
import type {KoboProject,KoboQuestion} from './koboTypes';

const question:KoboQuestion={id:'detail',name:'detail',labels:{en:'Other details',ar:'تفاصيل أخرى'},type:'text',kind:'text',group:'',repeat:'',metadata:false,identifying:false,choices:[]};
function editor(value:unknown,language='en',field=question,withScope=false){
 const project={id:'p',settings:{language},dataRevision:0} as KoboProject;
 return renderToStaticMarkup(<KoboCellEditor project={project} question={field} record="stable-record" row={30} value={value} embedded bulkScope={withScope?{settings:project.settings,group:'required-missing:detail',category:'missing',status:'open',search:'',groupSearch:'',columnFilters:[]}:undefined} onClose={()=>{}} onSaved={()=>{}}/>);
}
describe('embedded review field controls',()=>{
 it('allows long text to be inspected and edited without another dialog',()=>{
  const answer='A long description of the household situation. '.repeat(20);
  const html=editor(answer);
  expect(html).toContain('<textarea');expect(html).toContain(answer);
  expect(html).toContain('aria-label="Response value"');
  expect(html).toContain('Save &amp; next');expect(html).toContain('Cancel changes');
  expect(html).not.toContain('Apply to blank rows');expect(html).not.toContain('<dialog');expect(html).not.toContain('Apply to all responses');
 });
 it('preserves a valid numeric zero and the existing numeric control',()=>{
  const html=editor(0,'en',{...question,kind:'number',type:'integer'});
  expect(html).toContain('inputMode="decimal"');expect(html).toContain('value="0"');
  expect(html).not.toContain('<textarea');
 });
 it('offers blank filling for an unchanged saved answer only in a review scope',()=>{
  const html=editor('Already saved','en',question,true);
  expect(html).toMatch(/<button[^>]*class="soft"[^>]*>Apply to blank rows…<\/button>/);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save<\/button>/);
  expect(editor('   ','en',question,true)).toMatch(/<button[^>]*disabled=""[^>]*>Apply to blank rows…<\/button>/);
 });
 it('localizes the answer field and all primary review actions in Arabic',()=>{
  const html=editor('إجابة طويلة','ar');
  expect(html).toContain('aria-label="قيمة الإجابة"');
  expect(html).toContain('حفظ والتالي');expect(html).toContain('إلغاء التغييرات');
  expect(html).not.toContain('Save &amp; next');
 });
});
