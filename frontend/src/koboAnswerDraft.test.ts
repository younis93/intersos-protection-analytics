import {describe,expect,it} from 'vitest';
import {normalizedAnswerLabel,renameAnswerError} from './koboAnswerDraft';

const options=[{id:'yes',label:'Yes',count:67},{id:'no',label:'No',count:277},{id:'refuse',label:'Prefer not to answer',count:0},{id:'accent',label:'Café',count:1}];
describe('direct answer rename validation',()=>{
 it('rejects empty and unchanged labels using the same normalization as the backend',()=>{
  expect(renameAnswerError(options,'yes','  ')).toBe('Enter an answer label.');
  expect(renameAnswerError(options,'yes',' Yes ')).toBe('Enter a different label.');
  expect(normalizedAnswerLabel(' Cafe\u0301 ')).toBe('Café');
 });
 it('requires an explicit merge instead of renaming onto another choice',()=>{
  expect(renameAnswerError(options,'yes','No')).toContain('Use Merge');
  expect(renameAnswerError(options,'yes','Cafe\u0301')).toContain('Use Merge');
 });
 it('supports zero-count and Arabic answers without inventing an answer code',()=>{
  expect(renameAnswerError(options,'refuse','أفضل عدم الإجابة')).toBe('');
  expect(options[2].id).toBe('refuse');
  expect(renameAnswerError(options,'missing','New label')).toBe('Choose an answer to rename.');
 });
 it('validates label length before sending a preview',()=>{
  expect(renameAnswerError(options,'yes','a'.repeat(1001))).toContain('1,000');
  expect(renameAnswerError(options,'yes','a'.repeat(1000))).toBe('');
 });
});
