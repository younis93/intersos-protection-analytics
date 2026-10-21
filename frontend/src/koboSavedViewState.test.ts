import {describe,it,expect} from 'vitest';
import type {KoboProject,KoboSettings} from './koboTypes';
import {activeSavedView,defaultViewSnapshot,isDefaultView,copyViewName,createSavedView,savedViewNameError,verifySavedViews,viewModified,viewSignature,viewSnapshot} from './koboSavedViewState';
const settings=():KoboSettings=>({version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',questions:{}});
const project={form:{questions:[{id:'q',kind:'category'}]}} as KoboProject;
describe('saved analysis view state',()=>{
 it('recognizes original defaults, preserves privacy and distinguishes named and custom views',()=>{
  const form={form:{questions:[{id:'q',kind:'category',identifying:false},{id:'private',kind:'text',identifying:true}]}} as KoboProject;
  const snapshot=defaultViewSnapshot(form);
  expect(snapshot).toMatchObject({language:'en',filters:[],filterFields:[],hidden:['private'],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,percentageDecimals:0,questionSort:'form',viewMode:'charts'});
  expect(Object.values(snapshot.questions).every(q=>q.palette==='Blue')).toBe(true);
  const current={...settings(),...structuredClone(snapshot),excelGroups:['group'],indicators:[]} as KoboSettings;
  expect(isDefaultView(form,current)).toBe(true);
  current.viewMode='table';expect(isDefaultView(form,current)).toBe(false);
  current.viewMode='charts';
  const saved=createSavedView(form,current,'Same setup');current.savedViews=[saved];current.activeViewId=saved.id;
  expect(isDefaultView(form,current)).toBe(false);
  current.activeViewId='';expect(isDefaultView(form,current)).toBe(true);
  current.questions.q.chart='heatmap';expect(isDefaultView(form,current)).toBe(false);
  expect(snapshot.questions.q.chart).toBeNull();
  const changed={form:{questions:[...form.form.questions,{id:'new',kind:'number'}]}} as KoboProject;
  expect(defaultViewSnapshot(changed).questions).toHaveProperty('new');
 });
 it('captures only analysis setup and clones nested values',()=>{
  const current=settings();current.excelGroups=['group'];current.indicators=[];current.filters=[{field:'q',kind:'category',values:['a']}];
  const snapshot=viewSnapshot(current);expect(snapshot).not.toHaveProperty('indicators');expect(snapshot).not.toHaveProperty('savedViews');expect(snapshot).not.toHaveProperty('excelGroups');
  snapshot.filters[0].values.push('b');expect(current.filters[0].values).toEqual(['a']);
 });
 it('keeps stable IDs and question references and tracks the active view',()=>{
  const current=settings(),view=createSavedView(project,current,' Example ',' Description ');current.savedViews=[view];current.activeViewId=view.id;
  expect(view.name).toBe('Example');expect(view.description).toBe('Description');expect(view.questionKinds).toEqual({q:'category'});expect(activeSavedView(current)?.id).toBe(view.id);expect(viewModified(current)).toBe(false);
  current.viewMode='table';expect(viewModified(current)).toBe(true);current.viewMode='charts';expect(viewModified(current)).toBe(false);
  current.filters=[{field:'q',kind:'category',values:['a']}];expect(viewModified(current)).toBe(true);
 });
 it('compares server defaults and unordered filter values without false changes',()=>{
  const current=settings();current.filters=[{field:'q',kind:'category',values:['a','b']}];current.hidden=['b','a'];
  const other=viewSnapshot(current);other.filters[0]={...other.filters[0],minimum:null,maximum:null,values:['b','a']};other.hidden=['a','b'];other.questions.q={colors:{},bins:10,numericMode:'auto',dateUnit:'month',breakdown:'',answerSort:'form'};
  expect(viewSignature(current)).toBe(viewSignature(other));
 });
 it('ignores shared indicator and export changes when checking modifications',()=>{
  const current=settings(),view=createSavedView(project,current,'View');current.savedViews=[view];current.activeViewId=view.id;current.excelGroups=['changed'];current.indicators=[];
  expect(viewModified(current)).toBe(false);current.language='ar';expect(viewModified(current)).toBe(true);
 });
 it('validates names and creates readable unique duplicate names',()=>{
  const current=settings(),view=createSavedView(project,current,'Example');expect(savedViewNameError(' ',[])).toContain('name');expect(savedViewNameError(' example ',[view])).toContain('already');expect(savedViewNameError('Example',[view],view.id)).toBe('');
  const name=copyViewName(view,[view]);expect(name).toBe('Example (copy)');expect(copyViewName(view,[view,{...view,id:'other',name}])).toBe('Example (copy 2)');
 });
 it('verifies read-back persistence including definitions and deletes',()=>{
  const view=createSavedView(project,settings(),'Persisted');expect(()=>verifySavedViews([view],[structuredClone(view)])).not.toThrow();
  expect(()=>verifySavedViews([view],[])).toThrow('did not retain');expect(()=>verifySavedViews([],[view])).toThrow('did not retain');
  expect(()=>verifySavedViews([view],[{...view,snapshot:{...view.snapshot,language:'ar'}}])).toThrow('did not retain');
 });
});
