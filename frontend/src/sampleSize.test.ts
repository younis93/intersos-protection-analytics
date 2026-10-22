import {describe,expect,it} from 'vitest';
import {allocateSample,calculateSample,defaultSampleDraft,newLocation,readSampleDraft,SAMPLE_STORAGE_KEY,sampleCsv,saveSampleDraft,type SampleDraft} from './sampleSize';

const draft=(patch:Partial<SampleDraft>={}):SampleDraft=>({...defaultSampleDraft(),error:'10',unknown:true,...patch});
const location=(name:string,population:string)=>({...newLocation(),name,population});
describe('sample size calculations',()=>{
 it('matches reference values and confidence levels',()=>{
  expect(calculateSample(draft()).completed).toBe(97);
  expect(calculateSample(draft({unknown:false,population:'1000'})).completed).toBe(88);
  expect(calculateSample(draft({confidence:'90'})).completed).toBe(68);
  expect(calculateSample(draft({confidence:'99'})).completed).toBe(166);
 });
 it('handles design effect, expected proportion, precision and non-response',()=>{
  expect(calculateSample(draft({designEffect:'2'})).completed).toBe(193);
  expect(calculateSample(draft({proportion:'10'})).completed).toBe(35);
  expect(calculateSample(draft({error:'5'})).completed).toBe(385);
  const result=calculateSample(draft({nonresponse:'10'}));expect(result.completed).toBe(97);expect(result.approach).toBe(108);
 });
 it('caps at population and flags infeasible contact targets',()=>{
  const r=calculateSample(draft({unknown:false,population:'1',nonresponse:'20'}));expect(r.completed).toBe(1);expect(r.approach).toBe(2);expect(r.warnings).toHaveLength(1);
  expect(calculateSample(draft({unknown:false,population:'10',error:'.01',designEffect:'100'})).completed).toBe(10);
 });
 it.each([{error:''},{error:'0'},{error:'100'},{proportion:'100'},{proportion:'0'},{designEffect:'.5'},{nonresponse:'100'},{population:'0',unknown:false},{population:'1.5',unknown:false},{population:'Infinity',unknown:false}])('rejects invalid inputs %j',patch=>expect(()=>calculateSample(draft(patch))).toThrow());
 it('allocates stable whole numbers, including zeros, ties and capacities',()=>{
  expect(allocateSample(5,[1,1,1])).toEqual([2,2,1]);
  expect(allocateSample(7,[0,1,99],[0,1,99])).toEqual([0,0,7]);
  expect(allocateSample(4,[2,2],[1,3])).toEqual([1,3]);
 });
 it('keeps nested allocation totals exact and sums contact rounding per group',()=>{
  const locations=[{...location('A','600'),gender:true,groups:[{name:'Female',value:'300'},{name:'Male',value:'300'}]},location('B','400'),location('Zero','0')];
  const r=calculateSample(draft({breakdown:true,locations,nonresponse:'10'}));
  expect(r.population).toBe(1000);expect(r.completed).toBe(88);
  expect(r.rows.map(v=>v.completed)).toEqual([27,26,35,0]);
  expect(r.approach).toBe(r.rows.reduce((sum,v)=>sum+v.approach,0));
  expect(r.rows.every(v=>v.completed<=v.population)).toBe(true);
 });
 it('calculates each known group independently and permits zero-population groups',()=>{
  const r=calculateSample(draft({breakdown:true,mode:'groups',locations:[{...location('A','1000'),gender:true,groups:[{name:'Female',value:'500'},{name:'Male',value:'500'},{name:'Other',value:'0'}]}]}));
  expect(r.rows.map(v=>v.completed)).toEqual([81,81,0]);expect(r.completed).toBe(162);
 });
 it('labels quotas and does not treat assumed fractional populations as capacities',()=>{
  const d=draft({breakdown:true,locations:[{...location('A','3'),gender:true,genderMode:'percent',groups:[{name:'Female',value:'50'},{name:'Male',value:'50'}]}]});
  const r=calculateSample(d);expect(r.completed).toBe(3);expect(r.rows.map(v=>v.completed)).toEqual([2,1]);expect(r.rows.every(v=>v.assumed)).toBe(true);expect(r.warnings.join(' ')).toContain('Assumed planning quotas');
  expect(()=>calculateSample({...d,mode:'groups'})).toThrow('requires known');
 });
 it('rejects incomplete breakdowns, mismatched counts, duplicate labels and invalid shares',()=>{
  for(const locations of [[],[location('','10')],[location('A','0')],[location('A','10'),location('a','10')],[{...location('A','10'),gender:true}],[{...location('A','10'),gender:true,genderMode:'percent' as const,groups:[{name:'Female',value:'40'},{name:'Male',value:'40'}]}],[{...location('A','10'),gender:true,groups:[{name:'F',value:'5'},{name:'f',value:'5'}]}]])expect(()=>calculateSample(draft({breakdown:true,locations}))).toThrow();
 });
 it('preserves totals over many population distributions',()=>{
  for(let i=1;i<=100;i++){const populations=[0,i,3*i,1000-i];const total=Math.min(88,populations.reduce((a,b)=>a+b,0));const counts=allocateSample(total,populations,populations);expect(counts.reduce((a,b)=>a+b,0)).toBe(total);expect(counts.every((n,j)=>Number.isInteger(n)&&n>=0&&n<=populations[j])).toBe(true);}
 });
});
describe('sampling draft and export',()=>{
 it('defaults to a 7% margin of error',()=>{
  const d=defaultSampleDraft();expect(d.error).toBe('7');
  expect(calculateSample({...d,unknown:true}).completed).toBe(196);
 });
 it('round-trips a versioned draft and resets to defaults',()=>{
  let stored='';const storage={getItem:()=>stored,setItem:(_key:string,v:string)=>{stored=v;}};
  const d=draft({population:'1000'});expect(saveSampleDraft(storage,d)).toBe(true);expect(readSampleDraft(storage)).toEqual(d);
  saveSampleDraft(storage,defaultSampleDraft());expect(readSampleDraft(storage)).toEqual(defaultSampleDraft());
  expect(SAMPLE_STORAGE_KEY).toContain('v1');
 });
 it('handles corrupt, unsupported and inaccessible storage',()=>{
  for(const value of ['{bad','null','{"version":2}','{"version":1,"draft":{"confidence":"95"}}'])expect(readSampleDraft({getItem:()=>value,setItem:()=>{}})).toEqual(defaultSampleDraft());
  const storage={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('full');}};expect(readSampleDraft(storage)).toEqual(defaultSampleDraft());expect(saveSampleDraft(storage,draft())).toBe(false);
 });
 it('exports settings, rows, subtotals, quotas and formula-safe escaped labels',()=>{
  const d=draft({breakdown:true,locations:[{...location('=SUM(A1)','1000'),gender:true,genderMode:'percent',groups:[{name:'Female "F"',value:'50'},{name:' @Male',value:'50'}]}]});
  const csv=sampleCsv(d,calculateSample(d));
  for(const text of ['Confidence level (%)','Margin of error','Non-response','Location subtotal','Grand total','50% (assumed planning quota)','"\'=SUM(A1)"','"\'@Male"','Female ""F""','Probability sampling'])expect(csv).toContain(text);
  expect(csv.charCodeAt(0)).toBe(0xFEFF);
 });
});
