import {describe,expect,it} from 'vitest';
import {retainAnswerVisibilityOrder} from './koboAnswerVisibility';
import {questionDefaults,type KoboAnalysis,type KoboResult,type KoboSettings} from './koboTypes';

const settings:KoboSettings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questions:{a:{...questionDefaults},b:{...questionDefaults}},questionSort:'answered-desc'};
const question=(id:string,count:number)=>({id,denominator:count,rows:count?[{id:'visible',count}]:[]}) as KoboResult;
const analysis=(questions:KoboResult[],config:KoboSettings=settings):KoboAnalysis=>({total:10,filtered:10,filterSummary:[],groups:[],questions,settings:config});
const hidden=(answers:string[])=>({...settings,questions:{...settings.questions,a:{...questionDefaults,hiddenAnswers:answers}}});

describe('answer visibility keeps the edited question in place',()=>{
 it('updates counts and rows without moving a question sorted by answered count',()=>{
  const previous=analysis([question('a',10),question('b',8)]),next=analysis([question('b',8),question('a',2)],hidden(['removed']));
  const result=retainAnswerVisibilityOrder(previous,next);
  expect(result.questions.map(q=>q.id)).toEqual(['a','b']);
  expect(result.questions[0].denominator).toBe(2);
  expect(result.settings).toBe(next.settings);
 });
 it('keeps an empty question and its restore control in the same position',()=>{
  const previous=analysis([question('a',10),question('b',8)]),next=analysis([question('b',8),question('a',0)],hidden(['all']));
  expect(retainAnswerVisibilityOrder(previous,next).questions.map(q=>[q.id,q.rows.length])).toEqual([['a',0],['b',1]]);
 });
 it('keeps positions when restoring answers',()=>{
  const previous=analysis([question('b',8),question('a',0)],hidden(['all'])),next=analysis([question('a',10),question('b',8)],hidden([]));
  expect(retainAnswerVisibilityOrder(previous,next).questions.map(q=>q.id)).toEqual(['b','a']);
 });
 it('honors sorting and filter changes and leaves initial loads alone',()=>{
  const previous=analysis([question('a',10),question('b',8)]),next=analysis([question('b',8),question('a',2)],{...hidden(['removed']),questionSort:'name-desc'});
  expect(retainAnswerVisibilityOrder(previous,next)).toBe(next);
  expect(retainAnswerVisibilityOrder(null,next)).toBe(next);
  expect(retainAnswerVisibilityOrder(previous,{...next,settings:{...hidden(['removed']),filters:[{field:'a',kind:'category',values:['x']}]}}).questions.map(q=>q.id)).toEqual(['b','a']);
 });
});
