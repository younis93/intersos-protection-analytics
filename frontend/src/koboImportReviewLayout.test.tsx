import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboImportSourceSummary from './KoboImportSourceSummary';
import KoboImportFooter,{importReviewStatus,type ImportReviewStatusInput} from './KoboImportFooter';
import KoboAnswerReview from './KoboAnswerReview';
import {importNoteDescription} from './koboImportNoteState';
import type {KoboPreview} from './koboTypes';

const preview:KoboPreview={token:'test',source:{filename:'Responses.xlsx',formFilename:'Form.xlsx'},form:{questions:[],groups:[],language:'en',warnings:[]},mappings:[],sheets:[{name:'Main',rows:344,columns:356},{name:'Members',rows:23,columns:4}],issues:[],warnings:[]};
const ready:ImportReviewStatusInput={editorOpen:false,checking:false,checkError:false,pending:0,conflicts:0,issues:0,missing:0,editing:true,confirmDisabled:false,busy:false};

describe('import review hierarchy',()=>{
 it('groups files and counts without counting repeat rows as responses',()=>{
  const html=renderToStaticMarkup(<KoboImportSourceSummary preview={preview} mode="saved" replaceForm={<button>Choose form</button>}/>);
  for(const text of ['Using saved files','Form.xlsx','Responses.xlsx','344','responses','File details','Replace form'])expect(html).toContain(text);
  expect(html).not.toContain('367');
  expect(renderToStaticMarkup(<KoboImportSourceSummary preview={preview}/>)).toContain('Uploaded files ready');
 });
 it('gives checks and blocking decisions a useful singular status and review target',()=>{
  expect(importReviewStatus({...ready,issues:1})).toMatchObject({message:'1 answer issue needs review',action:'answers'});
  expect(importReviewStatus({...ready,issues:2})).toMatchObject({message:'2 answer issues need review'});
  expect(importReviewStatus({...ready,pending:1,issues:1}).action).toBe('columns');
  expect(importReviewStatus({...ready,missing:1}).action).toBe('questions');
  expect(importReviewStatus({...ready,conflicts:1}).action).toBe('answers');
  expect(importReviewStatus({...ready,checking:true,pending:2}).tone).toBe('checking');
  expect(importReviewStatus({...ready,checkError:true,checking:true}).message).toBe('Answer checks could not finish');
  expect(importReviewStatus({...ready,confirmDisabled:true}).tone).toBe('warning');
 });
 it('keeps blocking Apply disabled and puts review navigation in the status area',()=>{
  const html=renderToStaticMarkup(<KoboImportFooter status={importReviewStatus({...ready,issues:1})} readyColumns={356} totalColumns={356} missing={0} editing busy={false} disabled reviewDisabled={false} confirmLabel="Apply corrections" busyLabel="Applying..." onReview={()=>{}} onCancel={()=>{}} onConfirm={()=>{}}/>);
  expect(html).toContain('kobo-import-review-link');expect(html).toContain('Review issues');expect(html).toContain('disabled=""');
  expect(html).toContain('Changes are saved when you apply corrections.');
  expect(html.match(/kobo-import-footer-actions/g)).toHaveLength(1);
 });
 it('explains conditional choice warnings in plain language',()=>{
  expect(importNoteDescription('District: choice filter depends on an ignored question. Answers are checked against the full choice list.')).toBe('Answers will be checked against all available choices because the related filter question is ignored.');
 });
 it('offers Ignore question only for a known question and leaves invalid-answer acceptance separate',()=>{
  const q={id:'district',name:'district',labels:{en:'District'},type:'text',kind:'text' as const,group:'',repeat:'',metadata:false,identifying:false,choices:[]};
  const render=(known:boolean)=>renderToStaticMarkup(<KoboAnswerReview preview={{...preview,form:{...preview.form,questions:known?[q]:[]},issues:[{question:'district',message:'ambiguous choice label',count:1}]}} search="" busy={false} checking={false} checkError="" acceptInvalid={false} onAccept={()=>{}} onRetry={()=>{}} onChoices={()=>{}} onSources={()=>{}} onIgnoreQuestion={()=>{}}/>);
  expect(render(true)).toContain('Ignore question');
  expect(render(false)).not.toContain('Ignore question');
  expect(render(true)).toContain('Accept unresolved or invalid answers as blank');
 });
});
