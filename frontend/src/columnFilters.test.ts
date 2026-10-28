import {describe,expect,it} from 'vitest';
import {conditionError,filterRecords,matchesColumn,recordColumnType,type ColumnFilter} from './columnFilters';
const rule=(overrides:Partial<ColumnFilter>):ColumnFilter=>({column:'value',type:'text',...overrides});
describe('record column filters',()=>{
 it('distinguishes an empty selection, blanks, and leading-zero identifiers',()=>{
  expect(matchesColumn('001',rule({values:['001']}))).toBe(true);
  expect(matchesColumn('1',rule({values:['001']}))).toBe(false);
  expect(matchesColumn('001',rule({values:[]}))).toBe(false);
  expect(matchesColumn(null,rule({values:['']}))).toBe(true);
  expect(recordColumnType('beneficiary_id','number')).toBe('text');
  expect(recordColumnType('Age','number')).toBe('number');
 });
 it('combines value selections, typed conditions, and multiple columns',()=>{
  const rows=[{name:'علي',age:20},{name:'Ali',age:30},{name:'Alice',age:40}];
  expect(filterRecords(rows,[{column:'name',type:'text',condition:{operator:'starts_with',value:'ali'}},{column:'age',type:'number',condition:{operator:'between',value:'20',value2:'30'}}])).toEqual([rows[1]]);
  expect(matchesColumn('علي',rule({condition:{operator:'equals',value:'علي'}}))).toBe(true);
 });
 it('uses strict before/after and inclusive date ranges',()=>{
  expect(matchesColumn('2026-01-02T18:00:00',rule({type:'date',condition:{operator:'date_between',value:'2026-01-01',value2:'2026-01-02'}}))).toBe(true);
  expect(matchesColumn('2026-01-02',rule({type:'date',condition:{operator:'date_before',value:'2026-01-02'}}))).toBe(false);
  expect(matchesColumn('15/01/2026',rule({type:'date',values:['2026-01']}))).toBe(true);
 });
 it('selects matching values beyond a loaded page',()=>{
  expect(matchesColumn('value-1200',rule({valueSearch:'value-',excluded:['value-2']}))).toBe(true);
  expect(matchesColumn('value-2',rule({valueSearch:'value-',excluded:['value-2']}))).toBe(false);
 });
 it('rejects invalid and reversed conditions',()=>{
  expect(conditionError({operator:'between',value:'30',value2:'20'},'number')).not.toBe('');
  expect(conditionError({operator:'gte',value:'abc'},'number')).not.toBe('');
  expect(conditionError({operator:'date_on',value:''},'date')).not.toBe('');
 });
});
