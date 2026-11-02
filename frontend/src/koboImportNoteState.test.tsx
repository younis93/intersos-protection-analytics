import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {importNoteKey,reviewedNotes} from './koboImportNoteState';
import KoboImportNotes,{KoboImportNoteList} from './KoboImportNotes';
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
 it('removes the Important notes trigger when all notes are reviewed',()=>{
  const project={id:'project',form,settings:{language:'en'},importNotes:[{...note,reviewed:true}]} as KoboProject;
  expect(renderToStaticMarkup(<KoboImportNotes project={project} onReview={()=>{}}/>)).toBe('');
  expect(renderToStaticMarkup(<KoboImportNotes project={{...project,importNotes:[note]}} onReview={()=>{}}/>)).toContain('Important notes');
 });
 it('keeps a clear all-reviewed state in import review and has no empty note panel',()=>{
  const reviewed=renderToStaticMarkup(<KoboImportNoteList form={form} notes={[{...note,reviewed:true}]} onMark={()=>{}}/>);
  expect(reviewed).toContain('All import notes have been reviewed.');
  expect(reviewed).not.toContain('Mark all reviewed');
  expect(renderToStaticMarkup(<KoboImportNoteList form={form} notes={[]} onMark={()=>{}}/>)).toBe('');
 });
});
