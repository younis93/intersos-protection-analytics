import KoboProjectHeader from './KoboProjectHeader';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {importNoteKey,reviewedNotes,importNoteDescription} from './koboImportNoteState';
import {KoboImportNoteList} from './KoboImportNotes';
import type {KoboForm,KoboImportNote,KoboProject} from './koboTypes';

const form:KoboForm={questions:[],groups:[],language:'en',warnings:[]};
const note:KoboImportNote={id:'district-warning',fingerprint:'source-v1',question:'district',kind:'warning',message:'District uses the full choice list.',reviewed:false};

describe('persistent import note review',()=>{
 it('only hides an accepted note while its exact context matches',()=>{
  const keys=[importNoteKey(note)];
  expect(reviewedNotes([note],keys)[0].reviewed).toBe(true);
  expect(reviewedNotes([{...note,fingerprint:'source-v2'}],keys)[0].reviewed).toBe(false);
  expect(reviewedNotes([{...note,reviewed:true}])[0].reviewed).toBe(true);
 });
 it('counts pending notes and offers reviewed notes without showing them by default',()=>{
  const html=renderToStaticMarkup(<KoboImportNoteList form={form} notes={[note,{...note,id:'accepted',message:'Previously accepted',reviewed:true}]} onMark={()=>{}}/>);
  expect(html).toContain('Import notes <span class="kobo-note-count">1</span>');
  expect(html).toContain('Mark all reviewed');
  expect(html).toContain('Mark reviewed');
  expect(html).toContain('Show reviewed notes (1)');
  expect(html).not.toContain('Previously accepted');
 });
 it('uses one Review entry point with an explicit pending-note badge',()=>{
  const header=(notes:KoboImportNote[])=>renderToStaticMarkup(<KoboProjectHeader project={{id:'p',name:'Project',settings:{language:'en'},importNotes:notes} as KoboProject} counts={null} exportDisabled onReupload={()=>{}} onReview={()=>{}} onQualityReview={()=>{}} onPdf={()=>{}} onExcel={async()=>{}} onRename={()=>{}} onIndicators={()=>{}} onBinaryExcel={async()=>{}} onBackup={()=>{}} backupBusy={false}/>);
  const pending=header([note]);expect(pending).toContain('aria-label="Review"');expect(pending).toContain('1 note');expect(pending).toContain('1 unreviewed import note');expect(pending).not.toContain('Important notes');
  expect(header([{...note,reviewed:true}])).not.toContain('kobo-review-note-badge');
 });
 it('localizes note descriptions, actions and reviewed states in Arabic',()=>{
  const html=renderToStaticMarkup(<KoboImportNoteList form={form} notes={[note]} language="ar" onMark={()=>{}}/>);
  for(const text of ['ملاحظات الاستيراد','تحديد كمراجَع','تحديد الكل كمراجَع','تفاصيل تقنية'])expect(html).toContain(text);
  expect(html).not.toContain('Mark reviewed');
  expect(importNoteDescription('invalid numeric answer','ar')).toContain('لا يمكن قراءة');
  expect(importNoteDescription('original source message','ar')).toBe('original source message');
  expect(renderToStaticMarkup(<KoboImportNoteList form={form} notes={[{...note,reviewed:true}]} language="ar" onMark={()=>{}}/>)).toContain('تمت مراجعة جميع ملاحظات الاستيراد.');
 });
 it('keeps a clear all-reviewed state in import review and has no empty note panel',()=>{
  const reviewed=renderToStaticMarkup(<KoboImportNoteList form={form} notes={[{...note,reviewed:true}]} onMark={()=>{}}/>);
  expect(reviewed).toContain('All import notes have been reviewed.');
  expect(reviewed).not.toContain('Mark all reviewed');
  expect(renderToStaticMarkup(<KoboImportNoteList form={form} notes={[]} onMark={()=>{}}/>)).toBe('');
 });
});
