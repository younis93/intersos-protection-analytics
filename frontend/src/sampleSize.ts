export type GenderDraft={name:string;value:string};
export type LocationDraft={name:string;population:string;gender:boolean;genderMode:'counts'|'percent';groups:GenderDraft[]};
export type SampleDraft={confidence:'90'|'95'|'99';error:string;population:string;unknown:boolean;proportion:string;designEffect:string;nonresponse:string;breakdown:boolean;mode:'overall'|'groups';locations:LocationDraft[]};
export type SampleRow={location:string;gender:string;population:number;assumed:boolean;completed:number;approach:number};
export type SampleResult={population:number|null;completed:number;approach:number;rows:SampleRow[];warnings:string[]};
export const SAMPLE_STORAGE_KEY='kobo-sample-size-v1';
export const newLocation=():LocationDraft=>({name:'',population:'',gender:false,genderMode:'counts',groups:[{name:'Female',value:''},{name:'Male',value:''}]});
export const defaultSampleDraft=():SampleDraft=>({confidence:'95',error:'7',population:'',unknown:false,proportion:'50',designEffect:'1',nonresponse:'0',breakdown:false,mode:'overall',locations:[newLocation()]});
const zValues={'90':1.6448536269514722,'95':1.959963984540054,'99':2.5758293035489004};
function number(value:string,label:string,min:number,max:number,integer=false){
 const n=value.trim()===''?NaN:Number(value);
 if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isSafeInteger(n)))throw new Error(`${label}: enter ${integer?'a whole number':'a number'} from ${min} to ${max}.`);
 return n;
}
export function sampleSize(population:number|null,z:number,p:number,error:number,designEffect:number){
 if(population===0)return 0;
 const a=designEffect*z*z*p*(1-p)/(error*error);
 const n=population===null?a:a/(1+(a-1)/population);
 return Math.min(population??Infinity,Math.ceil(n));
}
/** Hamilton allocation: stable ties, no fractional interviews, known capacities respected. */
export function allocateSample(total:number,weights:number[],capacities:number[]=weights.map(()=>Infinity)):number[]{
 const sum=weights.reduce((a,b)=>a+b,0);
 if(!sum)return weights.map(()=>0);
 const ideals=weights.map(w=>total*w/sum);
 const counts=ideals.map((n,i)=>Math.min(Math.floor(n),capacities[i]));
 let remaining=total-counts.reduce((a,b)=>a+b,0);
 const order=weights.map((_,i)=>i).filter(i=>weights[i]>0).sort((a,b)=>(ideals[b]-Math.floor(ideals[b]))-(ideals[a]-Math.floor(ideals[a]))||a-b);
 while(remaining>0){let changed=false;for(const i of order){if(!remaining)break;if(counts[i]<capacities[i]){counts[i]++;remaining--;changed=true;}}if(!changed)throw new Error('The sample exceeds available group populations.');}
 return counts;
}
export function calculateSample(d:SampleDraft):SampleResult{
 const z=zValues[d.confidence];if(!z)throw new Error('Choose a supported confidence level.');
 const error=number(d.error,'Margin of error',0.01,99.99)/100;
 const p=number(d.proportion,'Expected proportion',0.01,99.99)/100;
 const effect=number(d.designEffect,'Design effect',1,100);
 const nonresponse=number(d.nonresponse,'Non-response allowance',0,99)/100;
 const calc=(n:number|null)=>sampleSize(n,z,p,error,effect);
 const approach=(n:number)=>Math.ceil(n/(1-nonresponse));
 if(!d.breakdown){
  const population=d.unknown?null:number(d.population,'Population size',1,Number.MAX_SAFE_INTEGER,true);
  const completed=calc(population),contacts=approach(completed);
  if(!Number.isSafeInteger(contacts))throw new Error('The contact target is too large. Adjust the settings.');
  return {population,completed,approach:contacts,rows:[],warnings:population!==null&&contacts>population?['People to approach exceeds the available population. Reduce non-response or review the sampling plan.']:[]};
 }
 if(!d.locations.length)throw new Error('Add at least one location.');
 const names=new Set<string>();
 const locations=d.locations.map((l,i)=>{
  const label=l.name.trim();if(!label)throw new Error(`Location ${i+1}: enter a name.`);
  if(names.has(label.toLocaleLowerCase()))throw new Error(`Location names must be unique: ${label}.`);names.add(label.toLocaleLowerCase());
  const population=number(l.population,`${label} population`,0,Number.MAX_SAFE_INTEGER,true);
  if(!l.gender)return {label,population,groups:[{name:'',weight:population,assumed:false}]};
  if(!l.groups.length)throw new Error(`${label}: add at least one gender category.`);
  if(l.genderMode==='percent'&&d.mode==='groups')throw new Error(`${label}: precision for each group requires known gender population counts.`);
  const groupNames=new Set<string>();
  const groups=l.groups.map(g=>{
   const name=g.name.trim();if(!name)throw new Error(`${label}: enter every gender category name.`);
   if(groupNames.has(name.toLocaleLowerCase()))throw new Error(`${label}: gender category names must be unique.`);groupNames.add(name.toLocaleLowerCase());
   const value=number(g.value,`${label} / ${name}`,0,l.genderMode==='percent'?100:Number.MAX_SAFE_INTEGER,l.genderMode==='counts');
   return {name,value,weight:l.genderMode==='percent'?population*value/100:value,assumed:l.genderMode==='percent'};
  });
  const sum=groups.reduce((a,g)=>a+g.value,0),expected=l.genderMode==='percent'?100:population;
  if(Math.abs(sum-expected)>1e-7)throw new Error(`${label}: gender ${l.genderMode==='percent'?'percentages must total 100%':'counts must match the location population'}.`);
  return {label,population,groups};
 });
 const population=locations.reduce((a,l)=>a+l.population,0);
 if(!Number.isSafeInteger(population)||population<1)throw new Error('The total population must be a positive safe whole number.');
 const targets=d.mode==='overall'?allocateSample(calc(population),locations.map(l=>l.population),locations.map(l=>l.population)):[];
 const rows:SampleRow[]=locations.flatMap((l,i)=>{
  const counts=d.mode==='overall'?allocateSample(targets[i],l.groups.map(g=>g.weight),l.groups.map(g=>g.assumed?Infinity:g.weight)):l.groups.map(g=>calc(g.weight));
  return l.groups.map((g,j)=>({location:l.label,gender:g.name,population:g.weight,assumed:g.assumed,completed:counts[j],approach:approach(counts[j])}));
 });
 const completed=rows.reduce((a,r)=>a+r.completed,0),contacts=rows.reduce((a,r)=>a+r.approach,0);
 if(!Number.isSafeInteger(contacts))throw new Error('The contact target is too large. Adjust the settings.');
 const warnings=rows.filter(r=>!r.assumed&&r.approach>r.population).map(r=>`${r.location}${r.gender?' / '+r.gender:''}: people to approach exceeds the known population.`);
 for(const location of locations){const contacts=rows.filter(r=>r.location===location.label).reduce((sum,r)=>sum+r.approach,0);if(location.groups.some(g=>g.assumed)&&contacts>location.population)warnings.push(`${location.label}: people to approach exceeds the known location population.`);}
 if(contacts>population&&!warnings.length)warnings.push('People to approach exceeds the available population.');
 if(rows.some(r=>r.assumed))warnings.push('Assumed planning quotas: gender shares are user assumptions, not known population proportions.');
 return {population,completed,approach:contacts,rows,warnings};
}
export function sampleCsv(d:SampleDraft,r:SampleResult){
 const cell=(v:string|number)=>{let s=String(v);if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const records:(string|number)[][]=[['Sample size calculation'],['Unit','Eligible individual people'],['Confidence level (%)',d.confidence],['Margin of error (percentage points)',d.error],['Expected proportion (%)',d.proportion],['Design effect',d.designEffect],['Non-response allowance (%)',d.nonresponse],['Population',r.population??'Unknown'],['Allocation mode',d.breakdown?(d.mode==='overall'?'Distribute overall sample':'Precision for each group'):'No breakdown'],['Assumptions','Probability sampling; the calculator does not establish representativeness. Precision for groups is not power for comparisons.'],['Method','a = designEffect * z^2 * p * (1-p) / error^2; n = ceil(a / (1 + (a-1)/N)); unknown N: ceil(a).'],['Location','Gender','Population / assumed share','Completed interviews','People to approach']];
 for(const location of d.breakdown?d.locations:[]){
  const rows=r.rows.filter(row=>row.location===location.name.trim());
  for(const row of rows){const group=location.groups.find(g=>g.name.trim()===row.gender);records.push([row.location,row.gender,row.assumed?`${group?.value}% (assumed planning quota)`:row.population,row.completed,row.approach]);}
  if(location.gender)records.push([location.name.trim(),'Location subtotal',location.population,rows.reduce((a,v)=>a+v.completed,0),rows.reduce((a,v)=>a+v.approach,0)]);
 }
 records.push(['Grand total','',r.population??'Unknown',r.completed,r.approach]);
 if(r.population!==null)records.push(['Sampling fraction (%)',(100*r.completed/r.population).toFixed(2)]);
 for(const warning of r.warnings)records.push(['Note',warning]);
 return '\uFEFF'+records.map(row=>row.map(cell).join(',')).join('\r\n');
}
type DraftStorage=Pick<Storage,'getItem'|'setItem'>;
export function readSampleDraft(storage:DraftStorage):SampleDraft{
 try{const saved=JSON.parse(storage.getItem(SAMPLE_STORAGE_KEY)||'null');if(saved?.version!==1)return defaultSampleDraft();const d=saved.draft;
  if(!d||!['90','95','99'].includes(d.confidence)||!['overall','groups'].includes(d.mode)||!['error','population','proportion','designEffect','nonresponse'].every(k=>typeof d[k]==='string')||!['unknown','breakdown'].every(k=>typeof d[k]==='boolean')||!Array.isArray(d.locations)||!d.locations.every((l:LocationDraft)=>l&&typeof l.name==='string'&&typeof l.population==='string'&&typeof l.gender==='boolean'&&['counts','percent'].includes(l.genderMode)&&Array.isArray(l.groups)&&l.groups.every(g=>g&&typeof g.name==='string'&&typeof g.value==='string')))return defaultSampleDraft();
  return d as SampleDraft;
 }catch{return defaultSampleDraft();}
}
export function saveSampleDraft(storage:DraftStorage,draft:SampleDraft){try{storage.setItem(SAMPLE_STORAGE_KEY,JSON.stringify({version:1,draft}));return true;}catch{return false;}}
