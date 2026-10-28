import {useState} from 'react';
import {AppSelect} from './SelectionControls';
import {koboLabel,type KoboQuestion} from './koboTypes';
import type {ReportQuestionOption} from './koboReportPrompt';
import {readReportPresets,writeReportPresets,reportPurposes,reportLanguages,reportLengths,type ReportOptions,type ReportOverrides,type ReportPreset} from './koboReportOptions';

export function ReportPreferences({options,onChange,disabled}:{options:ReportOptions;onChange:(options:ReportOptions)=>void;disabled:boolean}){
 const update=<K extends keyof ReportOptions,>(key:K,value:ReportOptions[K])=>onChange({...options,[key]:value});
 return <>
  <details className="kobo-report-optional"><summary>Report purpose, audience & format <small>Optional</small></summary><fieldset disabled={disabled}>
   <AppSelect label="Report purpose" value={options.purpose} options={Object.entries(reportPurposes)} disabled={disabled} onChange={value=>update('purpose',value as ReportOptions['purpose'])}/>
   <label>Intended audience<input value={options.audience} maxLength={300} placeholder="Programme managers and decision-makers" onChange={e=>update('audience',e.target.value)}/></label>
   <AppSelect label="Report language" value={options.language} options={Object.entries(reportLanguages)} disabled={disabled} onChange={value=>update('language',value as ReportOptions['language'])}/>
   <AppSelect label="Report length" value={options.length} options={Object.entries(reportLengths)} disabled={disabled} onChange={value=>update('length',value as ReportOptions['length'])}/>
  </fieldset></details>
  <details className="kobo-report-optional"><summary>Context & methodology <small>Optional</small></summary><fieldset disabled={disabled}>
   <p>Supply assessment context if available. Avoid names or identifying details. This context is included when you copy the prompt.</p>
   {([{key:'period',label:'Reporting period',placeholder:'For example, October 2026'},{key:'location',label:'Location',placeholder:'Assessment area'},{key:'population',label:'Target population',placeholder:'Population covered by the assessment'},{key:'sampling',label:'Sampling method',placeholder:'How respondents were selected'},{key:'objectives',label:'Assessment objectives',placeholder:'What the assessment aims to understand'}] as const).map(field=><label key={field.key}>{field.label}<textarea aria-label={field.label} rows={2} maxLength={2000} value={options.context[field.key]} placeholder={field.placeholder} onChange={e=>update('context',{...options.context,[field.key]:e.target.value})}/></label>)}
  </fieldset></details>
  <details className="kobo-report-optional"><summary>Evidence quality checks <small>Optional</small></summary><fieldset disabled={disabled}>
   <label className="kobo-report-option-check"><input type="checkbox" checked={options.quality.enabled} onChange={e=>update('quality',{...options.quality,enabled:e.target.checked})}/>Enable evidence quality warnings</label>
   {options.quality.enabled&&<><label>Missing responses threshold (%)<input type="number" min={1} max={100} step={1} value={options.quality.missingPercent} onChange={e=>update('quality',{...options.quality,missingPercent:Math.max(1,Math.min(100,Number(e.target.value)||20))})}/></label>
    <label>Small answered base threshold<input type="number" min={1} max={10000} step={1} value={options.quality.smallBase} onChange={e=>update('quality',{...options.quality,smallBase:Math.max(1,Math.min(10000,Math.round(Number(e.target.value)||30)))})}/></label>
    <p>Flags appear in the preview and copied prompt. These adjustable thresholds are review aids, not significance tests. They never block copying.</p></>}
  </fieldset></details>
 </>;
}

export function ReportOverrideSettings({questions,fields,language,overrides,onChange,disabled}:{questions:ReportQuestionOption[];fields:KoboQuestion[];language:string;overrides:ReportOverrides;onChange:(overrides:ReportOverrides)=>void;disabled:boolean}){
 const[target,setTarget]=useState(''),[search,setSearch]=useState('');
 const eligible=questions.filter(q=>q.kind!=='text'),question=eligible.find(q=>q.id===target)||eligible[0],id=question?.id||'';
 const custom=Object.hasOwn(overrides,id),selected=custom?overrides[id]:[],query=search.trim().toLocaleLowerCase();
 const candidates=fields.filter(field=>field.id!==id&&`${koboLabel(field,language)} ${field.name}`.toLocaleLowerCase().includes(query));
 return <details className="kobo-report-optional"><summary>Disaggregation for individual fields <small>Optional</small></summary><fieldset disabled={disabled}>
  <p>Main fields use the shared fields unless customised here. An empty custom selection gives overall results only.</p>
  {!question?<p>Select a main field with aggregate results to customise it. Free-text fields show response totals only.</p>:<>
   <AppSelect label="Main field to customise" value={id} options={eligible.map(q=>[q.id,q.label])} disabled={disabled} searchable onChange={value=>{setTarget(value);setSearch('')}}/>
   <label className="kobo-report-option-check"><input type="checkbox" checked={custom} onChange={e=>onChange(e.target.checked?{...overrides,[id]:[]}:Object.fromEntries(Object.entries(overrides).filter(([key])=>key!==id)))}/>Use custom disaggregation for this field</label>
   {custom&&<><label>Find custom disaggregation fields<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search fields..."/></label><div className="kobo-report-field-options" role="group" aria-label="Custom disaggregation fields">{candidates.map(field=><label key={field.id}><input type="checkbox" checked={selected.includes(field.id)} disabled={!selected.includes(field.id)&&selected.length>=3} onChange={()=>onChange({...overrides,[id]:selected.includes(field.id)?selected.filter(value=>value!==field.id):[...selected,field.id]})}/><span dir="auto">{koboLabel(field,language)}</span></label>)}{!candidates.length&&<p>No eligible matching fields.</p>}</div><p>{selected.length}/3 fields. Each comparison is separate.</p></>}
  </>}
  <p>{questions.filter(q=>Object.hasOwn(overrides,q.id)).length} main fields customised. Uncheck the custom option to use shared fields again.</p>
 </fieldset></details>;
}

export function ReportPresets({storageKey,snapshot,onLoad,disabled}:{storageKey:string;snapshot:Omit<ReportPreset,'id'|'name'>;onLoad:(preset:ReportPreset)=>string;disabled:boolean}){
 const[initial]=useState(()=>{try{return {presets:readReportPresets(localStorage,storageKey),error:''}}catch{return {presets:[],error:'Saved presets could not be read on this device.'}}});
 const[presets,setPresets]=useState<ReportPreset[]>(initial.presets),[selected,setSelected]=useState(''),[name,setName]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(initial.error);
 const current=presets.find(preset=>preset.id===selected);
 const persist=(next:ReportPreset[],message:string)=>{try{writeReportPresets(localStorage,storageKey,next);setPresets(next);setError('');setNotice(message);return true}catch{setError('Could not save presets on this device. Check browser storage space and permissions.');setNotice('');return false}};
 const save=(update:boolean)=>{
  const trimmed=name.trim();if(!trimmed)return;
  if(presets.some(p=>p.name.toLocaleLowerCase()===trimmed.toLocaleLowerCase()&&(!update||p.id!==selected))){setError('Use a different preset name or update the selected preset.');return}
  const preset:ReportPreset={...structuredClone(snapshot),id:update?selected:crypto.randomUUID(),name:trimmed};
  if(persist(update?presets.map(p=>p.id===selected?preset:p):[...presets,preset],update?'Preset updated.':'Preset saved.'))setSelected(preset.id);
 };
 return <details className="kobo-report-optional"><summary>Saved report presets <small>Optional</small></summary><fieldset disabled={disabled}>
  <p>Saved on this device for this project. Presets store field choices and report preferences, including entered context. Current data and filters are used when loaded; prompt edits are not saved.</p>
  <AppSelect label="Saved report preset" value={selected} options={[["","Choose a preset..."],...presets.map(preset=>[preset.id,preset.name] as [string,string])]} disabled={disabled} searchable onChange={value=>{setSelected(value);setName(presets.find(p=>p.id===value)?.name||'');setNotice('');setError('')}}/>
  <div className="kobo-report-option-actions"><button type="button" className="soft" disabled={!current} onClick={()=>{if(current){setNotice(onLoad(current));setError('')}}}>Load preset</button><button type="button" className="soft" disabled={!current} onClick={()=>{if(persist(presets.filter(p=>p.id!==selected),'Preset deleted.')){setSelected('');setName('')}}}>Delete preset</button></div>
  <label>Preset name<input value={name} maxLength={160} placeholder="For example, Monthly protection report" onChange={e=>setName(e.target.value)}/></label>
  <div className="kobo-report-option-actions"><button type="button" className="soft" disabled={!name.trim()||!snapshot.mainFields.length||presets.length>=50} onClick={()=>save(false)}>Save new preset</button><button type="button" className="soft" disabled={!current||!name.trim()||!snapshot.mainFields.length} onClick={()=>save(true)}>Update preset</button></div>
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </fieldset></details>;
}
