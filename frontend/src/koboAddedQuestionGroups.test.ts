import {describe,it,expect} from 'vitest';
import {addedGroupOptions,groupPath,normalizeQuestionHeader,questionNameSimilarity,suggestQuestionGroup} from './koboAddedQuestionGroups';
import {reviewForm} from './koboReviewConfig';
import type {KoboForm,KoboQuestion,KoboGroup} from './koboTypes';
const group=(id:string,parent='',repeat=false):KoboGroup=>({id,name:id,labels:{en:id==='assessment'?'Assessment':id==='a'?'Section A':id},parent,repeat});
const question=(id:string,label:string,group='a',repeat=''):KoboQuestion=>({id,name:id,labels:{en:label},group,repeat,type:'text',kind:'text',metadata:false,identifying:false,choices:[]});
const form=(questions:KoboQuestion[]):KoboForm=>({questions,groups:[group('assessment'),group('a','assessment'),group('b','assessment'),group('members','',true),group('details','members'),group('visits','members',true)],language:'en',warnings:[]});
describe('added question group suggestions',()=>{
 it('normalizes the supplied example and Arabic numbering without dropping meaningful suffixes',()=>{
  const original='4. What is   your current status in Iraq?';
  expect(normalizeQuestionHeader(original)).toBe(normalizeQuestionHeader('4.   What is your current status in Iraq? (Combined)'));
  expect(normalizeQuestionHeader('٤. ما هو وضعك الحالي؟ (COMBINED)')).toBe(normalizeQuestionHeader('ما هو وضعك الحالي'));
  expect(normalizeQuestionHeader('Status (Other)')).not.toBe(normalizeQuestionHeader('Status'));
  expect(questionNameSimilarity('Status','')).toBe(0);
 });
 it('suggests full group paths using labels or mapped source headers',()=>{
  const f=form([question('q4','4. What is your current status in Iraq?')]);
  const result=suggestQuestionGroup('4. What is your current status in Iraq? (Combined)',f,[],'');
  expect(result.suggested?.group).toBe('a');expect(result.suggested?.path).toBe('Assessment / Section A');
  expect(suggestQuestionGroup('Legacy source header',f,[{sheet:0,column:0,header:'Legacy source header',question:'q4',option:'',status:'matched'}],'').suggested?.group).toBe('a');
  expect(groupPath(f.groups,'')).toBe('General');
 });
 it('accepts strong fuzzy matches and rejects unrelated text',()=>{
  const f=form([question('q','What is your current status in Iraq?')]);
  expect(suggestQuestionGroup('What is your current status in Irag?',f,[],'').suggested?.group).toBe('a');
  expect(suggestQuestionGroup('Household income',f,[],'').candidates).toEqual([]);
 });
 it('requires a margin across groups and avoids ambiguous exact matches',()=>{
  const f=form([question('q1','Current status in Iraq','a'),question('q2','Current status in Iraq','b')]);
  expect(suggestQuestionGroup('Current status in Iraq (Combined)',f,[],'').suggested).toBeUndefined();
  expect(suggestQuestionGroup('Current status in Iraq (Combined)',f,[],'').candidates).toHaveLength(2);
  f.questions[1].group='a';expect(suggestQuestionGroup('Current status in Iraq',f,[],'').suggested?.group).toBe('a');
 });
 it('does not preselect a fuzzy group without the required lead',()=>{
  const header='a'.repeat(100),f=form([question('q1','a'.repeat(90)+'b'.repeat(10),'a'),question('q2','a'.repeat(84)+'c'.repeat(16),'b')]);
  expect(suggestQuestionGroup(header,f,[],'').suggested).toBeUndefined();
  expect(suggestQuestionGroup(header,f,[],'').candidates).toHaveLength(1);
 });
 it('matches translated labels and limits candidate suggestions',()=>{
  const f=form([question('q1','Current status')]);f.questions[0].labels.ar='ما هو وضعك الحالي';
  expect(suggestQuestionGroup('٤. ما هو وضعك الحالي؟ (Combined)',f,[],'').suggested?.group).toBe('a');
  f.questions=Array.from({length:5},(_,i)=>question('q'+i,'Same label','a'));
  expect(suggestQuestionGroup('Same label',f,[],'').candidates).toHaveLength(3);
 });
 it('restricts repeat options and suggestions to the nearest repeat scope',()=>{
  const f=form([question('main','Status'),question('repeat','Status','details','members')]);
  expect(addedGroupOptions(f,'').map(([id])=>id)).toEqual(['','assessment','a','b']);
  expect(addedGroupOptions(f,'members').map(([id])=>id)).toEqual(['members','details']);
  expect(suggestQuestionGroup('Status',f,[],'members').suggested?.group).toBe('details');
 });
 it('preserves legacy placement and renders selected groups in the effective form',()=>{
  const f=form([]),added={id:'added_q',label:'Added',kind:'text' as const,sheet:0,column:0,repeat:'',choices:[],separator:''};
  expect(reviewForm(f,{addedQuestions:[added],choiceOverrides:{}}).questions[0].group).toBe('');
  expect(reviewForm(f,{addedQuestions:[{...added,group:'a'}],choiceOverrides:{}}).questions[0].group).toBe('a');
  expect(reviewForm(f,{addedQuestions:[{...added,repeat:'members'}],choiceOverrides:{}}).questions[0].group).toBe('members');
 });
});
