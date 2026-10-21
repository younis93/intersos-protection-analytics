import {describe,it,expect} from 'vitest';
import {verifySavedIndicators} from './koboIndicatorPersistence';
import type {KoboIndicatorDefinition} from './koboIndicatorTypes';
const item:KoboIndicatorDefinition={id:'id',name:'Example',description:'',higherMeaning:'More',scope:'',reviewIssues:[],questions:[{question:'q',kind:'category',weight:1,points:{a:0,b:1},ranges:[],multipleMethod:null}]};
describe('indicator save verification',()=>{
 it('accepts backend defaults and different object key order',()=>{
  expect(()=>verifySavedIndicators([item],[{...item,mode:'score',conditionMatch:'all',questions:[{...item.questions[0],points:{b:1,a:0},selectedCodes:[]}]}])).not.toThrow();
 });
 it('rejects successful requests that silently discard or alter definitions',()=>{
  expect(()=>verifySavedIndicators([item],undefined)).toThrow('did not retain');
  expect(()=>verifySavedIndicators([item],[{...item,name:'Lost edit'}])).toThrow('did not retain');
  expect(()=>verifySavedIndicators([],[item])).toThrow('did not retain');
 });
 it('verifies both new calculations and deletion',()=>{
  const percentage={...item,mode:'percentage' as const,conditionMatch:'any' as const,questions:[{...item.questions[0],selectedCodes:['a']}]};
  expect(()=>verifySavedIndicators([percentage],[structuredClone(percentage)])).not.toThrow();
  expect(()=>verifySavedIndicators([],[])).not.toThrow();
 });
});
