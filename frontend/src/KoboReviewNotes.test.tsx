import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboReview from './KoboReview';
import type {KoboImportNote,KoboProject,KoboSettings} from './koboTypes';

const note:KoboImportNote={id:'note',fingerprint:'source',kind:'issue',question:'amount',message:'invalid numeric answer',count:1,reviewed:false};
function review(notes:KoboImportNote[],language:'en'|'ar'='en'){
 const settings={language,filters:[],questions:{},indicators:[]} as unknown as KoboSettings;
 const project={id:'p',name:'Project',form:{questions:[],groups:[],language,warnings:[]},settings,importNotes:notes} as unknown as KoboProject;
 return renderToStaticMarkup(<KoboReview project={project} settings={settings} onClose={()=>{}} onImport={()=>{}} onIndicators={()=>{}} onConditionSetup={async()=>{}} onNotesReviewed={()=>{}}/>);
}
describe('import notes inside Review',()=>{
 it('keeps the zero-count tab and an explicit empty state with Data quality as the default',()=>{
  const html=review([]);
  expect(html).toContain('Import notes · 0');
  expect(html).toContain('No import notes for this project.');
  expect(html).toMatch(/aria-pressed="true"[^>]*>Data quality/);
  expect(html).not.toContain('Important notes');
 });
 it('counts only pending import notes and explains that acknowledging does not correct data',()=>{
  const html=review([note,{...note,id:'reviewed',reviewed:true}]);
  expect(html).toContain('Import notes · 1');
  expect(html).toContain('Import notes cover the whole import.');
  expect(html).toContain('it does not correct data.');
  expect(html).toContain('Show reviewed notes');
 });
 it('localizes the notes panel and empty state while preserving RTL',()=>{
  const html=review([],'ar');
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('ملاحظات الاستيراد');
  expect(html).toContain('لا توجد ملاحظات استيراد لهذا المشروع.');
  expect(html).toContain('ولا تصحّح البيانات.');
 });
});
