import {describe,it,expect} from 'vitest';
import {defaultReportOptions,normalizeReportOptions,normalizeReportPreset,readReportPresets,writeReportPresets,restoreReportPreset,reportPresetStorageKey,type ReportPreset} from './koboReportOptions';

const preset=():ReportPreset=>({id:'monthly',name:'Monthly report',mainFields:['needs','services'],mode:'custom',fields:['sex','district'],overrides:{needs:['district'],services:[]},options:{...defaultReportOptions(),audience:'Programme team',context:{period:'October 2026',location:'North',population:'Households',sampling:'Convenience',objectives:'Understand needs'}}});
describe('optional report preferences and presets',()=>{
 it('keeps optional features off by default and gives each report its own options',()=>{
  const options=defaultReportOptions();expect(options.quality.enabled).toBe(false);expect(options.language).toBe('en');expect(options.length).toBe('standard');expect(Object.values(options.context).every(value=>value==='')).toBe(true);
  options.context.location='Changed';expect(defaultReportOptions().context.location).toBe('');
 });
 it('normalizes invalid stored options and constrains review thresholds',()=>{
  const options=normalizeReportOptions({purpose:'constructor',length:'invalid',language:'other',context:{sampling:12,location:'x'.repeat(3000)},quality:{enabled:'true',missingPercent:-2,smallBase:Infinity}});
  expect(options.purpose).toBe('general');expect(options.length).toBe('standard');expect(options.language).toBe('en');expect(options.context.sampling).toBe('');expect(options.context.location.length).toBe(2000);
  expect(options.quality).toEqual({enabled:false,missingPercent:1,smallBase:30});
  expect(normalizeReportOptions({quality:{enabled:true,missingPercent:500,smallBase:100000}}).quality).toEqual({enabled:true,missingPercent:100,smallBase:10000});
 });
 it('round-trips presets with context and empty per-field overrides without evidence or filters',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},key=reportPresetStorageKey('kobo','p');
  writeReportPresets(storage,key,[preset()]);expect(readReportPresets(storage,key)).toEqual([preset()]);
  expect(values.get(key)).not.toContain('filters');expect(values.get(key)).not.toContain('reportEvidence');
  expect(readReportPresets(storage,reportPresetStorageKey('custom','p'))).toEqual([]);expect(readReportPresets(storage,reportPresetStorageKey('kobo','other'))).toEqual([]);
 });
 it('ignores invalid presets, duplicate identifiers and unsupported storage versions',()=>{
  const storage={getItem:()=>JSON.stringify({version:1,presets:[null,{},preset(),preset(),{...preset(),id:'bad',name:'   '}]})};
  expect(readReportPresets(storage,'key')).toEqual([preset()]);
  expect(readReportPresets({getItem:()=>'{"version":9,"presets":[]}'},'key')).toEqual([]);
  expect(normalizeReportPreset({...preset(),fields:['sex','sex','district','other','extra']} )?.fields).toEqual(['sex','district','other']);
 });
 it('surfaces corrupted or unavailable storage so the UI can report failures',()=>{
  expect(()=>readReportPresets({getItem:()=>'{bad'},'key')).toThrow();
  expect(()=>writeReportPresets({setItem:()=>{throw new Error('Quota exceeded')}},'key',[preset()])).toThrow('Quota exceeded');
 });
 it('removes stale or identifying references when restoring without widening overrides',()=>{
  const saved={...preset(),mainFields:['needs','name','removed'],fields:['sex','private'],overrides:{needs:['private'],name:['sex'],removed:['sex']}};
  const restored=restoreReportPreset(saved,new Set(['needs']),new Set(['sex']));
  expect(restored.mainFields).toEqual(['needs']);expect(restored.fields).toEqual(['sex']);expect(restored.overrides).toEqual({needs:[]});expect(restored.omitted).toBe(true);
  expect(restoreReportPreset(preset(),new Set(['needs','services']),new Set(['sex','district'])).omitted).toBe(false);
 });
});
