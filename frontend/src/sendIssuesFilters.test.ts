import {describe,it,expect} from 'vitest';
import {issueFilterOptions,filterIssueFindings,activeIssueLawyer,issueOwner} from './sendIssuesFilters';
import {toggleIssueSelection} from './SendIssues';
import {excludeValue} from './filterSelection';
import type {IssueFinding} from './sendIssuesApi';

const rows=[
  {id:'a',lawyer:'Alice',project:'North',dataset:'beneficiaries',rule:'Duplicate name'},
  {id:'b',lawyer:'Bob',project:'South',dataset:'assessments',rule:'Closure requested'},
  {id:'c',lawyer:'Alice',project:'South',dataset:'assessments',rule:'Closure not requested'},
  {id:'d',lawyer:'Unassigned',project:'North',dataset:'beneficiaries',rule:'Duplicate name'},
] as IssueFinding[];

describe('Send Issues top filters',()=>{
  it('select all and exclusions work for every top filter',()=>{
    for(const field of ['project','lawyer','dataset','rule'] as const){
      const options=[...new Set(rows.map(row=>String(row[field])))];
      expect(filterIssueFindings(rows,{[field]:options})).toEqual(rows);
      expect(filterIssueFindings(rows,{[field]:[excludeValue(options[0])]})).toEqual(rows.filter(row=>row[field]!==options[0]));
      expect(filterIssueFindings(rows,{[field]:[options[0]]})).toEqual(rows.filter(row=>row[field]===options[0]));
    }
  });
  it('matches any selection within each field and combines fields',()=>{
    expect(filterIssueFindings(rows,{project:['North','South'],lawyer:['Alice','Bob'],dataset:['assessments'],rule:['Closure requested','Closure not requested']}).map(row=>row.id)).toEqual(['b','c']);
    expect(filterIssueFindings(rows,{project:['North'],lawyer:['Bob']})).toEqual([]);
  });
  it('uses current assignment ownership in the lawyer filter',()=>{
    expect(filterIssueFindings(rows,{lawyer:['Bob']},{d:'Bob'}).map(row=>row.id)).toEqual(['b','d']);
    expect(issueOwner(rows[3])).toBe('Unassigned');
  });
  it('keeps the active lawyer when possible and falls back after filtering',()=>{
    expect(activeIssueLawyer('Bob',['Alice','Bob'])).toBe('Bob');
    expect(activeIssueLawyer('Bob',['Alice'])).toBe('Alice');
    expect(activeIssueLawyer('Alice',[])).toBe('');
  });
  it('clearing filters restores findings without clearing selections',()=>{
    const selected=toggleIssueSelection(new Set(),['a','b'],true);
    expect(filterIssueFindings(rows,{project:['North']}).map(row=>row.id)).toEqual(['a','d']);
    expect(filterIssueFindings(rows,{})).toEqual(rows);
    expect(selected).toEqual(new Set(['a','b']));
    expect(rows.filter(row=>issueOwner(row)==='Alice'&&selected.has(row.id)).map(row=>row.id)).toEqual(['a']);
  });
});

describe('linked finding options',()=>{
  it('ignores its own selection while applying every other field',()=>{
    expect(issueFilterOptions(rows,{project:['North'],lawyer:['Alice']},'project')).toEqual(['North','South']);
    expect(issueFilterOptions(rows,{project:['North']},'lawyer')).toEqual(['Alice','Unassigned']);
    expect(issueFilterOptions(rows,{project:[excludeValue('North')]},'rule')).toEqual(['Closure not requested','Closure requested']);
  });
  it('uses updated assignments and returns no options for conflicts',()=>{
    expect(issueFilterOptions(rows,{project:['North']},'lawyer',{d:'Bob'})).toEqual(['Alice','Bob']);
    expect(issueFilterOptions(rows,{project:['North'],lawyer:['Bob']},'dataset')).toEqual([]);
  });
});
