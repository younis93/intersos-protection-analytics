import {describe,expect,it} from 'vitest';
import {excludeValue} from './filterSelection';
import {durableSolutionsKey,indicatorVisibilityOptions,visibleIndicatorReport} from './indicatorVisibility';
import type {IndicatorReport,IndicatorReportItem} from './types';

const item=(id:string,children:IndicatorReportItem[]=[]):IndicatorReportItem=>({id,title:id,source:'Test',dateField:'Date',rule:'Test',population:'All',total:10,sections:[],children,contributions:{}});
const report={groups:[{id:'all',label:'All populations',indicators:[item('parent',[item('child')]),item('other')]},{id:'idp',label:'IDP',indicators:[item('parent')]}]} as IndicatorReport;

describe('indicator visibility',()=>{
  it('shows the original report by default and distinguishes population groups',()=>{
    expect(visibleIndicatorReport(report,null)).toBe(report);
    expect(indicatorVisibilityOptions(report).map(option=>option.value)).toEqual(['all/parent','all/child','all/other','idp/parent',durableSolutionsKey]);
  });
  it('keeps a selected child accessible without showing its hidden parent',()=>{
    const filtered=visibleIndicatorReport(report,['all/child']);
    expect(filtered.groups.map(group=>group.id)).toEqual(['all']);
    expect(filtered.groups[0].indicators.map(item=>item.id)).toEqual(['child']);
    expect(report.groups[0].indicators[0].children).toHaveLength(1);
  });
  it('can hide children independently, remove empty groups, and hide every indicator',()=>{
    expect(visibleIndicatorReport(report,['all/parent']).groups[0].indicators[0].children).toEqual([]);
    expect(visibleIndicatorReport(report,[]).groups).toEqual([]);
  });
  it('honors exclusions from the existing filter controls',()=>{
    const filtered=visibleIndicatorReport(report,[excludeValue('all/child')]);
    expect(filtered.groups[0].indicators[0].children).toEqual([]);
    expect(filtered.groups[1].indicators).toHaveLength(1);
  });
});
