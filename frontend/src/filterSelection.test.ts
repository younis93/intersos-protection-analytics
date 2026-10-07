import {describe,it,expect} from 'vitest';
import {checkedFilterValues,selectAllExcept,toggleFilterValue,excludeValue,excludeSelection,matchesSelection,toggleSelection} from './filterSelection';
import {filterIssueFindings} from './sendIssuesFilters';
import type {IssueFinding} from './sendIssuesApi';

describe('filter quick actions',()=>{
  it('excludes a value while retaining future and blank values',()=>{
    const selected=excludeSelection(['Baghdad'],'Baghdad');
    expect(selected).toEqual([excludeValue('Baghdad')]);
    expect(['Baghdad','Erbil','New governorate',''].filter(value=>matchesSelection(value,selected))).toEqual(['Erbil','New governorate','']);
  });
  it('supports several exclusions and restores all when the last is removed',()=>{
    const selected=excludeSelection(excludeSelection([],'Baghdad'),'Erbil');
    expect(matchesSelection('Erbil',selected)).toBe(false);
    expect(excludeSelection(excludeSelection(selected,'Erbil'),'Baghdad')).toEqual([]);
  });
  it('normal selection removes an exclusion before selecting that value',()=>{
    expect(toggleSelection([excludeValue('Baghdad')],'Baghdad')).toEqual([]);
    expect(toggleSelection([],'Baghdad')).toEqual(['Baghdad']);
    expect(toggleSelection([excludeValue('Baghdad')],'Erbil')).toEqual(['Erbil']);
    expect(['Baghdad','Erbil'].filter(value=>matchesSelection(value,['Baghdad']))).toEqual(['Baghdad']);
  });
  it('applies exclusions to assigned issue owners',()=>{
    const rows=[{id:'1',lawyer:'Unassigned'},{id:'2',lawyer:'Other'}] as IssueFinding[];
    expect(filterIssueFindings(rows,{lawyer:[excludeValue('Assigned')]},{'1':'Assigned'}).map(row=>row.id)).toEqual(['2']);
  });
});

describe('ordinary checkbox exclusions',()=>{
  const values=['Hiwa Wiso',...Array.from({length:9},(_,i)=>'Person '+i)];
  it('selects all other available values',()=>{
    const selected=selectAllExcept(values,'Hiwa Wiso');
    expect(selected).toEqual(values.slice(1));
    expect(values.filter(value=>matchesSelection(value,selected))).toEqual(values.slice(1));
    expect(toggleFilterValue(selected,'Hiwa Wiso',values)).toEqual([...values.slice(1),'Hiwa Wiso']);
    expect(toggleFilterValue(selected,'Person 0',values)).toEqual(values.slice(2));
  });
  it('presents and edits legacy exclusions as checked included values',()=>{
    const old=[excludeValue('Hiwa Wiso')];
    expect(checkedFilterValues(old,values)).toEqual(values.slice(1));
    expect(toggleFilterValue(old,'Person 0',values)).toEqual(values.slice(2));
    expect(toggleFilterValue(old,'Hiwa Wiso',values)).toEqual([...values.slice(1),'Hiwa Wiso']);
    expect(checkedFilterValues([],values)).toEqual([]);
  });
  it('keeps the explicit exclude action working for a sole option',()=>{
    const selected=selectAllExcept(['Hiwa Wiso'],'Hiwa Wiso');
    expect(matchesSelection('Hiwa Wiso',selected)).toBe(false);
    expect(checkedFilterValues(selected,['Hiwa Wiso'])).toEqual([]);
    expect(toggleFilterValue(selected,'Hiwa Wiso',['Hiwa Wiso'])).toEqual(['Hiwa Wiso']);

  });
});

describe('clearing checkbox filters',()=>{
  it('checking then unchecking the last option restores all records',()=>{
    const values=['P1','P2'];
    const selected=toggleFilterValue([],'P1',values);
    expect(selected).toEqual(['P1']);
    const cleared=toggleFilterValue(selected,'P1',values);
    expect(cleared).toEqual([]);
    expect(values.filter(value=>matchesSelection(value,cleared))).toEqual(values);
  });
  it('preserves remaining checked options and clears after the final uncheck',()=>{
    expect(toggleFilterValue(['P1','P2'],'P1',['P1','P2'])).toEqual(['P2']);
    expect(toggleFilterValue(['P2'],'P2',['P1','P2'])).toEqual([]);
    expect(toggleFilterValue([excludeValue('P1')],'P2',['P1','P2'])).toEqual([]);
    expect(toggleFilterValue(['P1'],'P1',[])).toEqual([]);
  });
  it('clears only this field while other filters still constrain results',()=>{
    const rows=[{project:'P1',location:'L1'},{project:'P2',location:'L1'},{project:'P2',location:'L2'}];
    const projects=toggleFilterValue(['P1'],'P1',['P1','P2']);
    expect(rows.filter(row=>matchesSelection(row.project,projects)&&matchesSelection(row.location,['L1']))).toEqual(rows.slice(0,2));
  });
});
