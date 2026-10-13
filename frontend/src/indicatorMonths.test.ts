import {describe,expect,it} from 'vitest';
import {excludeValue} from './filterSelection';
import {monthsInQuarters} from './indicatorMonths';

describe('Indicator Reporting quarter/month linkage',()=>{
  const months=['2026-12','2026-10','2026-09','2026-07','2026-06','2026-04','2026-03','2026-01','2025-12'];
  it('limits months to the selected quarter and year, preserving option order',()=>{
    expect(monthsInQuarters(months,['2026-Q1'])).toEqual(['2026-03','2026-01']);
    expect(monthsInQuarters(months,['2026-Q2'])).toEqual(['2026-06','2026-04']);
    expect(monthsInQuarters(months,['2026-Q3'])).toEqual(['2026-09','2026-07']);
    expect(monthsInQuarters(months,['2026-Q4'])).toEqual(['2026-12','2026-10']);
  });
  it('combines multiple quarters and restores all options when quarters are cleared',()=>{
    expect(monthsInQuarters(months,['2026-Q1','2025-Q4'])).toEqual(['2026-03','2026-01','2025-12']);
    expect(monthsInQuarters(months,[])).toEqual(months);
  });
  it('honors excluded quarters and clears conflicting selected month tokens',()=>{
    expect(monthsInQuarters(months,[excludeValue('2026-Q4')])).toEqual(months.slice(2));
    expect(monthsInQuarters(['2026-01',excludeValue('2026-04')],['2026-Q2'])).toEqual([excludeValue('2026-04')]);
    expect(monthsInQuarters(['Invalid month'],['2026-Q1'])).toEqual([]);
  });
});
