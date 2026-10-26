import {afterEach,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {IndicatorReporting} from './LegalIndicatorsPage';
import {indicatorReportGeneration,retainDefaultIndicatorReport} from './indicatorReportCache';
import {invalidateLegalQueries} from './legalQueryCache';
import type {IndicatorReport} from './types';

afterEach(()=>invalidateLegalQueries());

it('renders an already prepared default report on the first render',()=>{
  const report:IndicatorReport={fromDate:'',toDate:'',ageGroups:[],
    filterOptions:{projects:[],locations:[],locationsByProject:{},years:[],quarters:[],months:[],communityTypes:[]},
    activeFilters:{projects:[],locations:[],years:[],quarters:[],months:[],communityTypes:[]},
    groups:[{id:'refugee',label:'Cached figures',indicators:[]}]};
  retainDefaultIndicatorReport(report,indicatorReportGeneration());
  const markup=renderToStaticMarkup(<IndicatorReporting revision={1}/>);
  expect(markup).toContain('Cached figures');
  expect(markup).not.toContain('skeleton-table');
});

it('rejects a late parsed report after a source change',()=>{
  const generation=indicatorReportGeneration();
  invalidateLegalQueries();
  retainDefaultIndicatorReport({groups:[]} as unknown as IndicatorReport,generation);
  const markup=renderToStaticMarkup(<IndicatorReporting revision={2}/>);
  expect(markup).toContain('skeleton-table');
});
