import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Calculator,Copy,Download,Plus,RotateCcw,Trash2,X} from 'lucide-react';
import {calculateSample,defaultSampleDraft,newLocation,readSampleDraft,saveSampleDraft,sampleCsv,type LocationDraft,type SampleDraft} from './sampleSize';
import './sampleSize.css';

export function SampleCalculatorIcon(){
 const ref=useRef<SVGSVGElement>(null);
 useEffect(()=>{const icon=ref.current,button=icon?.closest('button');if(!icon||!button)return;const preference=window.matchMedia('(prefers-reduced-motion: reduce)');let animation:Animation|undefined;
  const play=()=>{animation?.cancel();if(preference.matches||button.disabled)return;animation=icon.animate([{transform:'rotate(0deg) scale(1)'},{transform:'rotate(-12deg) scale(1.08)',offset:.25},{transform:'rotate(9deg) scale(1.08)',offset:.6},{transform:'rotate(0deg) scale(1)'}],{duration:650,easing:'ease'});};
  const stop=()=>{if(preference.matches)animation?.cancel();};button.addEventListener('pointerenter',play);button.addEventListener('focus',play);button.addEventListener('click',play);preference.addEventListener('change',stop);
  return()=>{animation?.cancel();button.removeEventListener('pointerenter',play);button.removeEventListener('focus',play);button.removeEventListener('click',play);preference.removeEventListener('change',stop);};
 },[]);
 return <Calculator ref={ref} className="sample-calculator-icon" aria-hidden="true"/>;
}

export default function SampleSizeCalculator({onClose}:{onClose:()=>void}){
 const [draft,setDraft]=useState<SampleDraft>(()=>{try{return readSampleDraft(window.localStorage);}catch{return defaultSampleDraft();}});
 const [message,setMessage]=useState(''),[storageFailed,setStorageFailed]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null),id=useId();
 useEffect(()=>{const node=dialog.current,opener=document.activeElement;node?.showModal();title.current?.focus();return()=>{node?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus({preventScroll:true});};},[]);
 useEffect(()=>{setMessage('');try{setStorageFailed(!saveSampleDraft(window.localStorage,draft));}catch{setStorageFailed(true);}},[draft]);
 const {result,error}=useMemo(()=>{try{return {result:calculateSample(draft),error:''};}catch(reason){return {result:null,error:reason instanceof Error?reason.message:'Review your inputs.'};}},[draft]);
 const update=<K extends keyof SampleDraft>(key:K,value:SampleDraft[K])=>setDraft(current=>({...current,[key]:value}));
 const updateLocation=(index:number,patch:Partial<LocationDraft>)=>setDraft(current=>({...current,locations:current.locations.map((location,i)=>i===index?{...location,...patch}:location)}));
 const field=(label:string,value:string,onChange:(v:string)=>void,options:{min?:number;max?:number;step?:string;disabled?:boolean;hint?:string;integer?:boolean}={})=><label className="sample-field"><span>{label}</span><input type="number" aria-label={label} inputMode={options.integer?'numeric':'decimal'} value={value} min={options.min??0} max={options.max} step={options.step??(options.integer?'1':'any')} disabled={options.disabled} onChange={e=>onChange(e.target.value)} aria-describedby={error?`${id}-error`:undefined}/>{options.hint&&<small>{options.hint}</small>}</label>;
 const exportCsv=()=>{if(!result)return;try{const url=URL.createObjectURL(new Blob([sampleCsv(draft,result)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='sample-size-plan.csv';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);setMessage('CSV exported.');}catch{setMessage('Export failed. Try copying the results instead.');}};
 const copy=async()=>{if(!result)return;try{const lines=[`Sample size plan: ${result.completed.toLocaleString()} completed interviews; ${result.approach.toLocaleString()} people to approach.`,`Population: ${result.population??'Unknown'} eligible individuals. Confidence: ${draft.confidence}%; margin of error: ±${draft.error} percentage points.`,`Expected proportion: ${draft.proportion}%; design effect: ${draft.designEffect}; non-response: ${draft.nonresponse}%.`,`Mode: ${draft.breakdown?(draft.mode==='overall'?'Distribute overall sample':'Precision for each group'):'No breakdown'}.`,'Assumes probability sampling; this calculator does not establish representativeness.',...result.rows.map(r=>`${r.location}${r.gender?' / '+r.gender:''}: ${r.completed} completed; ${r.approach} to approach${r.assumed?' (assumed planning quota)':''}.`),...result.warnings];await navigator.clipboard.writeText(lines.join('\n'));setMessage('Results copied.');}catch{setMessage('Clipboard unavailable. Export CSV instead.');}};
 return createPortal(<dialog ref={dialog} className="kobo-dialog glass sample-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={e=>{e.preventDefault();onClose();}}>
  <header className="sample-header"><div><span className="eyebrow">SURVEY PLANNING</span><h2 ref={title} tabIndex={-1} id={`${id}-title`}><SampleCalculatorIcon/> Sample size calculator</h2></div><button type="button" className="soft sample-close" onClick={onClose} aria-label="Close sample size calculator"><X aria-hidden="true"/></button></header>
  <p id={`${id}-description`}>Plan interviews with eligible individual people. Add locations and gender groups when you need a fieldwork breakdown.</p>
  {result&&<div className="sample-metrics" aria-live="polite"><div><strong>{result.approach.toLocaleString()}</strong><span>People to approach</span></div>{result.population!==null&&<div><strong>{(100*result.completed/result.population).toLocaleString(undefined,{maximumFractionDigits:2})}%</strong><span>Sampling fraction</span></div>}</div>}
  <div className="sample-fields">
   <label className="sample-field"><span>Confidence level</span><select aria-label="Confidence level" value={draft.confidence} onChange={e=>update('confidence',e.target.value as SampleDraft['confidence'])}>{['90','95','99'].map(n=><option key={n} value={n}>{n}%</option>)}</select></label>
   {field('Margin of error (%)',draft.error,v=>update('error',v),{min:0.01,max:99.99,hint:'± percentage points'})}
   {field('Population size',draft.breakdown?String(draft.locations.reduce((sum,l)=>sum+(Number(l.population)||0),0)):draft.population,v=>update('population',v),{min:1,integer:true,disabled:draft.unknown||draft.breakdown,hint:draft.breakdown?'Derived from location totals':'Number of eligible individuals'})}
  </div>
  <label className="sample-check"><input type="checkbox" checked={draft.unknown&&!draft.breakdown} disabled={draft.breakdown} onChange={e=>update('unknown',e.target.checked)}/>Unknown population{draft.breakdown?' (enter location totals for a breakdown)':''}</label>
  <details className="sample-section"><summary>Advanced settings</summary><div className="sample-fields">
   {field('Expected proportion (%)',draft.proportion,v=>update('proportion',v),{min:0.01,max:99.99,hint:'50% is the conservative default.'})}
   {field('Design effect',draft.designEffect,v=>update('designEffect',v),{min:1,max:100,hint:'1 for simple random sampling; use a justified value for clustered designs.'})}
   {field('Non-response allowance (%)',draft.nonresponse,v=>update('nonresponse',v),{max:99,hint:'Inflates people to approach, not completed interviews.'})}
  </div>
  <section className="sample-section" aria-label="Population breakdown">
   <label className="sample-check"><input type="checkbox" checked={draft.breakdown} onChange={e=>update('breakdown',e.target.checked)}/><strong>Breakdown by location and gender</strong></label>
   {draft.breakdown&&<>
    <label className="sample-field"><span>Allocation mode</span><select aria-label="Allocation mode" value={draft.mode} onChange={e=>update('mode',e.target.value as SampleDraft['mode'])}><option value="overall">Distribute overall sample</option><option value="groups">Precision for each group</option></select></label>
    <p>{draft.mode==='overall'?'The selected margin of error applies to the overall estimate, not to each group. Interviews are distributed proportionally.':'Each location, or each location/gender group, gets its own sample size. This increases the total and does not establish statistical power for comparisons. Known group population counts are required.'}</p>
    {draft.locations.map((location,index)=><fieldset className="sample-location" key={index}><legend>Location {index+1}</legend>
     <div className="sample-location-heading"><label className="sample-field"><span>Location name</span><input value={location.name} maxLength={200} onChange={e=>updateLocation(index,{name:e.target.value})} dir="auto"/></label>{field('Location population',location.population,v=>updateLocation(index,{population:v}),{integer:true})}<button type="button" className="soft" aria-label={`Remove location ${index+1}`} onClick={()=>update('locations',draft.locations.filter((_,i)=>i!==index))}><Trash2 aria-hidden="true"/></button></div>
     <label className="sample-check"><input type="checkbox" checked={location.gender} onChange={e=>updateLocation(index,{gender:e.target.checked})}/>Add gender categories</label>
     {location.gender&&<details className="sample-genders" open><summary>Gender categories</summary>
      <label className="sample-field"><span>Gender population entry</span><select aria-label="Gender population entry" value={location.genderMode} onChange={e=>updateLocation(index,{genderMode:e.target.value as LocationDraft['genderMode'],groups:location.groups.map(g=>({...g,value:''}))})}><option value="counts">Known population counts</option><option value="percent">Assumed planning percentages</option></select></label>
      {location.genderMode==='percent'&&<p>Assumed planning quotas. Enter percentages totaling 100%. These are not known population proportions.</p>}
      {location.groups.map((group,groupIndex)=><div className="sample-gender-row" key={groupIndex}><label className="sample-field"><span>Gender category {groupIndex+1}</span><input value={group.name} maxLength={100} dir="auto" onChange={e=>updateLocation(index,{groups:location.groups.map((g,i)=>i===groupIndex?{...g,name:e.target.value}:g)})}/></label>{field(location.genderMode==='counts'?'Population count':'Planning share (%)',group.value,value=>updateLocation(index,{groups:location.groups.map((g,i)=>i===groupIndex?{...g,value}:g)}),{integer:location.genderMode==='counts',max:location.genderMode==='percent'?100:undefined})}<button type="button" className="soft" aria-label={`Remove gender category ${groupIndex+1} in location ${index+1}`} onClick={()=>updateLocation(index,{groups:location.groups.filter((_,i)=>i!==groupIndex)})}><Trash2 aria-hidden="true"/></button></div>)}
      <button type="button" className="soft" onClick={()=>updateLocation(index,{groups:[...location.groups,{name:'',value:''}]})}><Plus aria-hidden="true"/>Add gender category</button>
     </details>}
    </fieldset>)}
    <button type="button" className="soft" onClick={()=>update('locations',[...draft.locations,newLocation()])}><Plus aria-hidden="true"/>Add location</button>
   </>}
  </section></details>
  {error&&<p className="sample-error" id={`${id}-error`} role="status">{error}</p>}
  {result&&<section className="sample-results" aria-label="Calculation results">
   {!!result.rows.length&&<div className="sample-table-scroll" tabIndex={0} role="region" aria-label="Sample allocation table"><table><caption>Interview allocation by location and gender</caption><thead><tr><th scope="col">Location</th><th scope="col">Gender</th><th scope="col">Population / share</th><th scope="col">Completed interviews</th><th scope="col">People to approach</th></tr></thead><tbody>{draft.locations.map(location=>{const rows=result.rows.filter(r=>r.location===location.name.trim());return rows.length?<LocationResults key={location.name} location={location} rows={rows}/>:null;})}</tbody><tfoot><tr><th scope="row" colSpan={2}>Grand total</th><td>{result.population?.toLocaleString()}</td><td>{result.completed.toLocaleString()}</td><td>{result.approach.toLocaleString()}</td></tr></tfoot></table></div>}
   {result.warnings.map(w=><p className="sample-warning" key={w}>{w}</p>)}
  </section>}
  <details className="sample-section"><summary>Calculation assumptions and method</summary><p>These calculations estimate a proportion and assume probability sampling. The calculator does not establish representativeness by itself. Use the same eligible population definition throughout.</p><p>With z from the selected confidence level, p as the expected proportion, and e as the margin of error: a = design effect × z² × p × (1 − p) / e². For known population N: n = ceil(a / (1 + (a − 1) / N)), capped at N. For unknown population: n = ceil(a).</p><p>People to approach = ceil(completed interviews / expected response rate). In breakdowns, calculate this for each final group and sum the results. A quota is a planning allocation, not a guarantee of precision for that group.</p></details>
  {storageFailed&&<p className="sample-warning">Local storage is unavailable. Your draft will last only while this calculator remains open.</p>}
  <footer className="sample-footer"><button type="button" className="soft" onClick={()=>setDraft(defaultSampleDraft())}><RotateCcw aria-hidden="true"/>Reset</button><div><button type="button" className="soft" disabled={!result} onClick={()=>void copy()}><Copy aria-hidden="true"/>Copy results</button><button type="button" className="primary" disabled={!result} onClick={exportCsv}><Download aria-hidden="true"/>Export CSV</button></div></footer><p role="status" className="sample-message">{message}</p>
 </dialog>,document.body);
}

function LocationResults({location,rows}:{location:LocationDraft;rows:import('./sampleSize').SampleRow[]}){
 return <>{rows.map((row,i)=><tr key={row.gender}><th scope="row" dir="auto">{i===0?row.location:''}</th><td dir="auto">{row.gender||'All individuals'}</td><td>{row.assumed?`${location.groups.find(g=>g.name.trim()===row.gender)?.value}% (assumed quota)`:row.population.toLocaleString()}</td><td>{row.completed.toLocaleString()}</td><td>{row.approach.toLocaleString()}</td></tr>)}{location.gender&&<tr className="sample-subtotal"><th scope="row" colSpan={2}>{location.name} subtotal</th><td>{Number(location.population).toLocaleString()}</td><td>{rows.reduce((sum,r)=>sum+r.completed,0).toLocaleString()}</td><td>{rows.reduce((sum,r)=>sum+r.approach,0).toLocaleString()}</td></tr>}</>;
}
