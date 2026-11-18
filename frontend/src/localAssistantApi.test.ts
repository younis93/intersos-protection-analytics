import {describe,expect,it} from 'vitest';
import {chatFieldIds} from './localAssistantApi';
import type {KoboAnalysis,KoboProject} from './koboTypes';

const project={form:{questions:[
 {id:'sex',name:'sex',labels:{en:'2. Sex of the respondent'}},
 {id:'age',name:'age',labels:{en:'Age of the respondent'}},
 {id:'name',name:'name',identifying:true,labels:{en:'Respondent name'}},
 {id:'location',name:'location',labels:{en:'Location'}},
]}} as unknown as KoboProject;
const analysis={settings:{hidden:['location']},questions:[{id:'sex',label:'Sex of the respondent'},{id:'age',label:'Age of the respondent'}]} as unknown as KoboAnalysis;

describe('assistant field selection',()=>{
 it('matches a pasted question label and a common alias',()=>{
  expect(chatFieldIds(project,analysis,'2. Sex of the respondent: give me the result')).toEqual(['sex']);
  expect(chatFieldIds(project,analysis,'Show me the gender breakdown')).toEqual(['sex']);
 });
 it('excludes identifying and hidden fields',()=>{
  expect(chatFieldIds(project,analysis,'What is the respondent name and location?')).toEqual([]);
 });
 it('carries eligible context across follow-ups without selecting fields for greetings',()=>{
  expect(chatFieldIds(project,analysis,'What was the denominator?',['sex','name'])).toEqual(['sex']);
  expect(chatFieldIds(project,analysis,'Hello',['sex'])).toEqual([]);
 });
});
