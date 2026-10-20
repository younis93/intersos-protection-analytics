import {describe,expect,it} from 'vitest';
import {allQuestionValueDisplay,sharedValueDisplay,selectedValueDisplay,withValueDisplay} from './koboValueDisplay';
import {questionDefaults,type KoboSettings} from './koboTypes';
describe('question value display',()=>{
 it.each(['count','percent','both'] as const)('sets table, axis and labels together for %s',mode=>{
  const original={...questionDefaults,colors:{a:'#123456'},appearance:{height:560 as const,grid:'hide' as const}};
  const next=withValueDisplay(original,mode);
  expect(selectedValueDisplay(next)).toBe(mode);
  expect(next.appearance).toMatchObject({metric:mode==='percent'?'percent':'count',labels:mode,height:560,grid:'hide'});
  expect(next.colors).toEqual(original.colors);
  expect(original.breakdownDisplay).toBe('both');
 });
 it('preserves mismatched settings as custom until a selection is made',()=>{
  expect(selectedValueDisplay(questionDefaults)).toBeNull();
  expect(selectedValueDisplay({...questionDefaults,breakdownDisplay:'percent',appearance:{metric:'count',labels:'percent'}})).toBeNull();
  expect(selectedValueDisplay({...questionDefaults,breakdownDisplay:'count'})).toBe('count');
 });
 it('applies to all project fields, including hidden fields, preserving unrelated settings',()=>{
  const settings:KoboSettings={version:1,filters:[],filterFields:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',language:'ar',hidden:['hidden'],percentageDecimals:1,questions:{visible:{...questionDefaults,chart:'donut',colors:{a:'#123456'},appearance:{height:560}},orphan:{...questionDefaults}}};
  const next=allQuestionValueDisplay(settings,['visible','hidden','metadata'],'percent');
  expect(sharedValueDisplay(settings,['visible','hidden'])).toBeNull();
  expect(sharedValueDisplay(next,['visible','hidden','metadata'])).toBe('percent');
  expect(next.questions.visible).toMatchObject({chart:'donut',colors:{a:'#123456'},appearance:{height:560,metric:'percent',labels:'percent'}});
  expect(next.hidden).toEqual(['hidden']);expect(next.percentageDecimals).toBe(1);expect(next.language).toBe('ar');
  expect(next.questions.orphan).toBe(settings.questions.orphan);expect(settings.questions.hidden).toBeUndefined();
  const individual={...next,questions:{...next.questions,visible:withValueDisplay(next.questions.visible,'both')}};
  expect(sharedValueDisplay(individual,['visible','hidden'])).toBeNull();
  expect(sharedValueDisplay(next,[])).toBeNull();
 });
});
