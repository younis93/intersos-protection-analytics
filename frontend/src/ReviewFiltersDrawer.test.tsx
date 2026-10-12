import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import ReviewFiltersDrawer from './ReviewFiltersDrawer';
import {legalReviewExportUrl} from './api';

describe('Hotline Review field filters',()=>{
  it('includes all source fields as checkbox groups instead of dropdowns',()=>{
    const markup=renderToStaticMarkup(<ReviewFiltersDrawer dataset="legalhotlines" filters={{}} onChange={()=>{}} onClose={()=>{}}
      fieldOptions={{Projects:['Project A'],Gender:['Female','Male'],'Custom field':['Not recorded','Custom value']}}
      fieldFilters={{Gender:['Female','Male']}} onFieldChange={()=>{}}/>);
    expect(markup).toContain('Custom field');
    expect(markup).toContain('Custom value');
    expect(markup).toContain('Not recorded');
    expect(markup).toContain('type="checkbox"');
    expect(markup).not.toContain('app-select-trigger');
    expect(markup).toContain('Apply filters (2)');
    expect(markup).toContain('Search hotline filter fields');
  });
  it('keeps the Beneficiaries Review single-value dropdowns',()=>{
    const markup=renderToStaticMarkup(<ReviewFiltersDrawer dataset="beneficiaries" options={{project:['A'],location:['B'],date:['2026-01']}} filters={{}} onChange={()=>{}} onClose={()=>{}}/>);
    expect(markup).toContain('Date of identification');
    expect(markup).toContain('Project location');
    expect(markup).toContain('app-select-trigger');
  });
  it('preserves multi-value source selections in the export URL',()=>{
    const filters={Gender:['Female','Male'],'Custom field':['Not recorded']};
    const url=legalReviewExportUrl('legalhotlines','',15,true,false,[],{},'',[],filters);
    expect(JSON.parse(new URL(url,'http://localhost').searchParams.get('filters')!)).toEqual(filters);
  });
  it('shows month checkboxes newest first and sends month values to exports',()=>{
    const field='Contact Date تاريخ الاتصال';
    const filters={[field]:['2026-01']};
    const markup=renderToStaticMarkup(<ReviewFiltersDrawer dataset="legalhotlines" filters={{}} onChange={()=>{}} onClose={()=>{}}
      fieldOptions={{[field]:['Not recorded','2025-12','2026-01','2026-02']}} fieldFilters={filters}/>);
    expect(markup.indexOf('aria-label="2026-02"')).toBeLessThan(markup.indexOf('aria-label="2026-01"'));
    expect(markup.indexOf('aria-label="2026-01"')).toBeLessThan(markup.indexOf('aria-label="2025-12"'));
    expect(markup).toContain('aria-label="Not recorded"');
    const url=legalReviewExportUrl('legalhotlines','',15,true,false,[],{},'',[],filters);
    expect(JSON.parse(new URL(url,'http://localhost').searchParams.get('filters')!)).toEqual(filters);
  });
});
