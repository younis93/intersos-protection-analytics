import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {questionFilterSettings} from './koboQuestionFilterState';
import KoboQuestionFiltersBar from './KoboQuestionFiltersBar';
import {questionDefaults,type KoboQuestion,type KoboResult} from './koboTypes';
import {koboTableText,koboTableHtml} from './koboTableData';

const q:KoboQuestion={id:'region',name:'region',labels:{en:'Region'},kind:'category',type:'select_one regions',group:'',repeat:'',metadata:false,identifying:false,choices:[{name:'north',labels:{en:'North'}}]};
describe('additional question filters',()=>{
 it('automatically combines active local filters with page filters and returns to page filtering when cleared',()=>{
  const cfg=questionFilterSettings({...questionDefaults,palette:'Blue'},[{field:'region',kind:'category',values:['north']}]);
  expect(cfg.filterMode).toBe('additional');expect(cfg.palette).toBe('Blue');
  expect(questionFilterSettings(cfg,[])).toMatchObject({filterMode:'page',ownFilters:[]});
  expect(questionFilterSettings(cfg,[{field:'region',kind:'category',values:[]}])).toMatchObject({filterMode:'page',ownFilters:[{field:'region',kind:'category',values:[]}]});
 });
 it('treats numeric zero as an active question condition',()=>{
  expect(questionFilterSettings(questionDefaults,[{field:'number',kind:'number',values:[],minimum:0}]).filterMode).toBe('additional');
 });
 it('shows selected controls above the question while keeping legacy disabled rules inactive',()=>{
  const rules=[{field:'region',kind:'category' as const,values:['north']}];
  const project={id:'p',name:'Project',form:{questions:[q],groups:[],language:'en' as const,warnings:[]},settings:{version:1 as const,language:'en' as const,filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form' as const,questions:{}},warnings:[],issues:[]};
  const props={settings:{...questionDefaults,filterMode:'additional' as const,ownFilters:rules},project,language:'en' as const,onEdit:()=>{},onChange:()=>{},onError:()=>{}};
  const html=renderToStaticMarkup(<KoboQuestionFiltersBar {...props}/>);
  expect(html).toContain('Filters for this question');expect(html).toContain('Remove question filter: Region');expect(html).toContain('Choose fields');
  expect(renderToStaticMarkup(<KoboQuestionFiltersBar {...props} settings={{...props.settings,filterMode:'page'}}/>)).toBe('');
  expect(renderToStaticMarkup(<KoboQuestionFiltersBar {...props} settings={{...props.settings,filterMode:'page',ownFilters:[{field:'region',kind:'category',values:[]}]}}/>)).toContain('Remove question filter: Region');
 });
 it('carries combined-filter provenance into copied tables',()=>{
  const result:KoboResult={id:'q',name:'q',label:'Question',kind:'category',group:'',repeat:'',denominator:1,missing:0,total:1,rows:[{id:'a',label:'A',count:1,percent:100}],statistics:{},breakdowns:[],percentageBasis:'Respondents',chart:'bar',colors:{},filterMode:'additional',filterSummary:['Region: North','Age: 18 - Any']};
  for(const output of [koboTableText(result,'both'),koboTableHtml(result,'both')]){
   expect(output).toContain('Question filters applied with page filters.');expect(output).toContain('Region: North');expect(output).toContain('Age: 18 - Any');
  }
 });
});
