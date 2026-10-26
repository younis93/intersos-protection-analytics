import {describe,it,expect} from 'vitest';
import {dateMonths,applyDateFilterModes,dateFilterSummary} from './dateFilters';
import {prunePreparationFilters} from './customPreparationState';
import {viewSnapshot,viewSignature} from './koboSavedViewState';
import type {KoboSettings} from './koboTypes';
import type {CustomConfig} from './CustomColumnSetup';

const settings=()=>({...viewSnapshot({} as KoboSettings),version:1,filters:[{field:'date',kind:'date' as const,values:[],months:['2026-02','2026-04'],minimum:'2026-02-15',maximum:'2026-04-20'}]}) as KoboSettings;
describe('date filter controls',()=>{
 it('groups valid dates across leap days and years, newest first',()=>{
  expect(dateMonths(['2026-02-01','2026-02-25','2024-02-29','2025-02-29','2026-13-01','2026-04-31','2025-12-31','2026-01-01T10:30:00','__blank__',''])).toEqual(['2026-02','2026-01','2025-12','2024-02']);
 });
 it('clears only constraints that become hidden',()=>{
  const original=settings();
  expect(applyDateFilterModes(original,{date:'range'}).filters[0]).toMatchObject({months:[],minimum:'2026-02-15',maximum:'2026-04-20'});
  expect(applyDateFilterModes(original,{date:'month'}).filters[0]).toMatchObject({months:['2026-02','2026-04'],minimum:null,maximum:null});
  expect(applyDateFilterModes(original,{date:'both'}).filters).toEqual(original.filters);
  expect(original.filters[0].months).toHaveLength(2);
 });
 it('removes a rule when changing modes leaves no active constraint',()=>{
  const original=settings();original.filters[0].minimum=null;original.filters[0].maximum=null;
  expect(applyDateFilterModes(original,{date:'range'}).filters).toEqual([]);
 });
 it('describes month-only and combined selections',()=>{
  expect(dateFilterSummary(settings().filters[0])).toBe('Months: 2026-02, 2026-04; 2026-02-15 - 2026-04-20');
 });
 it('preserves modes and months in snapshots and normalizes old filters',()=>{
  const original={...settings(),dateFilterModes:{date:'both' as const}};
  expect(viewSnapshot(original).dateFilterModes).toEqual({date:'both'});
  const old=settings();delete old.filters[0].months;
  expect(viewSignature(old)).toBe(viewSignature({...old,filters:old.filters.map(f=>({...f,months:[]}))}));
 });
 it('prunes modes for excluded, deselected, and changed columns',()=>{
  const config={columns:[{id:'date',included:true,kind:'date'},{id:'excluded',included:false,kind:'date'},{id:'text',included:true,kind:'text'},{id:'off',included:true,kind:'date'}],filterFields:['date','excluded','text'],dateFilterModes:{date:'month',excluded:'both',text:'both',off:'month'}} as unknown as CustomConfig;
  expect(prunePreparationFilters(config).dateFilterModes).toEqual({date:'month'});
 });
});
