import {describe,expect,it} from 'vitest';
import {questionDefaults,questionSettingsFor} from './koboTypes';
import {bulkQuestionSettings} from './koboBulkSettings';
import type {KoboQuestion,KoboSettings} from './koboTypes';

describe('shared answer order defaults',()=>{
 it('uses descending counts and contextual date defaults',()=>{
  expect(questionDefaults.answerSort).toBe('count-desc');
  expect(questionSettingsFor({kind:'category'}).answerSort).toBe('count-desc');
  expect(questionSettingsFor({kind:'date'}).answerSort).toBe('form');
 });
 it.each(['form','count-desc','count-asc','label-asc','label-desc'] as const)('preserves saved %s for every kind',answerSort=>{
  for(const kind of ['category','date','text'])expect(questionSettingsFor({kind},{answerSort}).answerSort).toBe(answerSort);
 });
 it('does not change date order when bulk editing an unrelated setting',()=>{
  const question={id:'date',kind:'date'} as KoboQuestion,settings={questions:{}} as KoboSettings;
  expect(bulkQuestionSettings(question,settings,{palette:'Blue'}).answerSort).toBe('form');
 });
});
