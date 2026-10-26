import KoboBulkSettingHeading from './KoboBulkSettingHeading';
import {appearanceDefaults,resolveAppearance,type KoboAppearance} from './koboAppearance';
import KoboAppearanceControls from './KoboAppearanceControls';
import {lazy,Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {BarChart3,ChartColumn,ChartLine,ChevronDown,Palette,PieChart,RotateCcw,SlidersHorizontal,X} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {ColorControl} from './KoboCustomize';
import {koboApi} from './koboApi';
import {koboLabel,type KoboAnalysis,type KoboProject,type KoboQuestionSettings,type KoboResult,type KoboSettings} from './koboTypes';
import {bulkQuestionSettings,enabledKoboQuestions,sharedBreakdownFields,sharedBulkValue,type KoboBulkDraft} from './koboBulkSettings';
import {calculationKey,colorEntries,defaultKoboColor,koboPalettes,resolveKoboColors} from './koboCustomizeOptions';
import {KoboRendering} from './KoboRendering';
import KoboPivotTable from './KoboPivotTable';
import './koboCustomize.css';
import './koboBulkCustomize.css';
const Chart=lazy(()=>import('./KoboChart'));
const chartTypes=[{id:'auto',label:'Automatic',Icon:SlidersHorizontal},{id:'bar',label:'Bar',Icon:BarChart3},{id:'column',label:'Column',Icon:ChartColumn},{id:'line',label:'Line',Icon:ChartLine},{id:'histogram',label:'Histogram',Icon:ChartColumn},{id:'heatmap',label:'Heatmap',Icon:SlidersHorizontal},{id:'pie',label:'Pie',Icon:PieChart},{id:'donut',label:'Donut',Icon:PieChart}];
export default function KoboBulkCustomize({project,settings,analysis,onApply,onClose}:{project:KoboProject;settings:KoboSettings;analysis:KoboAnalysis;onApply:(draft:KoboBulkDraft)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),base=useRef(settings),original=useRef(analysis);
 const targets=useMemo(()=>enabledKoboQuestions(project,base.current),[project]),fields=useMemo(()=>sharedBreakdownFields(project,targets),[project,targets]);
 const[draft,setDraft]=useState<KoboBulkDraft>({}),[section,setSection]=useState<'chart'|'appearance'|'breakdowns'|'colors'>('chart'),[pane,setPane]=useState<'settings'|'preview'>('settings'),[questionId,setQuestionId]=useState(targets.find(question=>analysis.questions.some(result=>result.id===question.id&&result.denominator>0))?.id||targets[0]?.id||'');
 const[preview,setPreview]=useState<{key:string;result:KoboResult}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[invalid,setInvalid]=useState(new Set<string>()),[colorLimit,setColorLimit]=useState(20),[colorRevision,setColorRevision]=useState(0);
 const target=targets.find(question=>question.id===questionId)||targets[0];
 const cfg=useMemo(()=>target?bulkQuestionSettings(target,base.current,draft):null,[target,draft]);
 const key=target&&cfg?JSON.stringify([target.id,calculationKey(cfg)]):'';
 const pending=!!target&&(busy||preview?.key!==key),dirty=Object.values(draft).some(value=>value!==undefined);
 const originals=useMemo(()=>targets.map(question=>({question,cfg:bulkQuestionSettings(question,base.current,{})})),[targets]);
 const shared=(key:keyof KoboBulkDraft)=>sharedBulkValue(originals.filter(({question})=>key==='numericMode'||key==='bins'?question.kind==='number':key==='dateUnit'?question.kind==='date':true).map(({cfg})=>key==='breakdowns'?(cfg.breakdowns?.length?cfg.breakdowns:cfg.breakdown?[cfg.breakdown]:[]):cfg[key]??(key==='chart'||key==='palette'?null:undefined)));
 const sharedAppearance=Object.fromEntries(Object.keys(appearanceDefaults).map(key=>[key,sharedBulkValue(originals.map(({cfg})=>resolveAppearance(cfg.appearance)[key as keyof KoboAppearance]))]));
 const commonBreakdowns=shared('breakdowns'),levels=draft.breakdowns??(commonBreakdowns.value as string[]|undefined)??[];
 const dateFields=project.form.questions.filter(field=>field.kind==='date'&&!field.identifying&&targets.filter(q=>['category','multiple','number'].includes(q.kind)).every(q=>!field.repeat||field.repeat===q.repeat||q.repeat.startsWith(field.repeat+'/')));
 const chartReason=(id:string)=>id==='histogram'&&!targets.some(q=>q.kind==='number')?'Requires a numeric question.':id==='heatmap'&&!targets.some(q=>(draft.breakdowns??settings.questions[q.id]?.breakdowns??(settings.questions[q.id]?.breakdown?[settings.questions[q.id].breakdown]:[])).some(field=>field!==q.id))?'Add a breakdown first.':'';
 const undo=(keys:(keyof KoboBulkDraft)[])=>{setDraft(current=>{const next={...current};keys.forEach(key=>delete next[key]);return next});if(keys.includes('palette')||keys.includes('colors')){setInvalid(new Set());setColorRevision(value=>value+1)}};
 const heading=(label:string,key:keyof KoboBulkDraft,keys:(keyof KoboBulkDraft)[]=[key])=><KoboBulkSettingHeading label={label} changed={keys.some(key=>draft[key]!==undefined)} mixed={keys.some(key=>shared(key).mixed)} onUndo={()=>undo(keys)}/>;
 const selected=(key:keyof KoboBulkDraft)=>draft[key]!==undefined?String(draft[key]??'auto'):shared(key).mixed?'__mixed__':String(shared(key).value??'auto');
 const options=(key:keyof KoboBulkDraft,items:[string,string][]):[string,string][]=>selected(key)==='__mixed__'?[['__mixed__','Mixed values'],...items]:items;
 const patch=(change:KoboBulkDraft)=>setDraft(current=>({...current,...change}));
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[]);
 useEffect(()=>{
  if(!target||!cfg)return;
  const initial=original.current.questions.find(question=>question.id===target.id);
  if(initial&&calculationKey(bulkQuestionSettings(target,base.current,{}))===calculationKey(cfg)){setPreview({key,result:initial});setBusy(false);setError('');return}
  const controller=new AbortController();setBusy(true);setError('');
  const timer=setTimeout(()=>void koboApi.previewQuestion(project.id,{...base.current,questions:{...base.current.questions,[target.id]:cfg}},target.id,controller.signal).then(result=>{if(!controller.signal.aborted)setPreview({key,result})}).catch(issue=>{if(!controller.signal.aborted)setError(issue instanceof Error?issue.message:String(issue))}).finally(()=>{if(!controller.signal.aborted)setBusy(false)}),250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[key,retry]);
 const shown=useMemo(()=>preview&&cfg?{...preview.result,chart:cfg.chart||(['date'].includes(preview.result.kind)?'line':preview.result.kind==='number'?'column':'bar') as KoboResult['chart'],colors:resolveKoboColors(preview.result,cfg.palette,cfg.colors),pointColors:cfg.pointColors||{},breakdownDisplay:cfg.breakdownDisplay,appearance:cfg.appearance}:null,[preview,cfg]);
 const entries=shown?colorEntries(shown):[],entryKey=JSON.stringify(entries.map(entry=>entry.id));
 useEffect(()=>{setInvalid(new Set());setColorLimit(20)},[entryKey]);
 const validity=(id:string,valid:boolean)=>setInvalid(current=>{if(current.has(id)===!valid)return current;const next=new Set(current);if(valid)next.delete(id);else next.add(id);return next});
 const changeLevel=(index:number,value:string)=>{const next=[...levels];if(value)next[index]=value;else next.splice(index,1);patch({breakdowns:next.filter(Boolean)})};
 const settingsTab=(next:typeof pane)=>{setPane(next);document.getElementById(`kobo-bulk-${next}-tab`)?.focus()};
 return <dialog ref={dialog} className="kobo-dialog glass kobo-customize kobo-bulk-customize" aria-label="Customize all questions" dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header><div><span className="eyebrow">SHARED QUESTION SETTINGS</span><h2>Customize all questions</h2><p><strong>{targets.length} enabled questions</strong>, including collapsed groups. Search does not limit these changes.</p></div><button type="button" className="soft" aria-label="Close shared customization" onClick={onClose}><X/></button></header>
  <div className="kobo-customize-mobile-tabs" role="tablist" aria-label="Shared customization view">{(['settings','preview'] as const).map(tab=><button key={tab} id={`kobo-bulk-${tab}-tab`} type="button" role="tab" aria-selected={pane===tab} aria-controls={`kobo-customize-${tab}`} tabIndex={pane===tab?0:-1} onClick={()=>setPane(tab)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();settingsTab(event.key==='Home'?'settings':event.key==='End'?'preview':pane==='settings'?'preview':'settings')}}}>{tab==='settings'?'Settings':'Preview'}</button>)}</div>
  <div className={`kobo-customize-body pane-${pane}`}>
   <section id="kobo-customize-settings" className="kobo-customize-settings" aria-label="Shared settings">
    <nav className="kobo-customize-tabs" aria-label="Shared customize sections">{([{id:'chart',label:'Chart',Icon:BarChart3},{id:'appearance',label:'Appearance',Icon:SlidersHorizontal},{id:'breakdowns',label:'Breakdowns',Icon:SlidersHorizontal},{id:'colors',label:'Colors',Icon:Palette}] as const).map(tab=><button key={tab.id} type="button" aria-pressed={section===tab.id} onClick={()=>setSection(tab.id)}><tab.Icon/>{tab.label}</button>)}</nav>
    <div hidden={section!=='chart'} className="kobo-customize-section">
     <h3>Chart appearance</h3><p>Edit any setting directly. Only changed settings will apply to enabled questions.</p>
     {heading('Chart type','chart')}
     <div className="kobo-chart-types" role="group" aria-label="Shared chart type">{chartTypes.map(type=><button key={type.id} type="button" aria-pressed={selected('chart')===type.id} disabled={!!chartReason(type.id)} title={chartReason(type.id)||type.label} onClick={()=>patch({chart:(type.id==='auto'?null:type.id) as KoboQuestionSettings['chart']})}><type.Icon/><span>{type.label}</span>{chartReason(type.id)&&<small>{chartReason(type.id)}</small>}</button>)}</div><p className="kobo-bulk-hint">Histogram applies to numeric questions; Heatmap requires breakdowns. Choose a date field for answer trends. Incompatible questions use Bar. Pie and Donut apply to categorical answers without breakdowns.</p>
     {selected('chart')==='line'&&<>{heading('Date field','trendDateField')}<AppSelect label="Shared date field" searchable value={selected('trendDateField')==='auto'?'':selected('trendDateField')} options={options('trendDateField',[["","No shared date field"],...dateFields.map(field=>[field.id,koboLabel(field,settings.language)] as [string,string])])} onChange={value=>{if(value!=='__mixed__')patch({trendDateField:value})}}/>{heading('Trend grouping','trendUnit')}<AppSelect label="Shared trend grouping" value={selected('trendUnit')==='auto'?'month':selected('trendUnit')} options={options('trendUnit',[["day","Day"],["month","Month"],["year","Year"]])} onChange={value=>{if(value!=='__mixed__')patch({trendUnit:value as KoboQuestionSettings['trendUnit']})}}/><p>Answer trends use dates from these fields, including hidden date metadata. Pivot breakdowns stay in the tables and are not added to trend charts.</p></>}
     {heading('Answer order','answerSort')}
     <AppSelect label="Shared answer order" value={selected('answerSort')} options={options('answerSort',[["form","Form order"],["count-desc","Count high to low"],["count-asc","Count low to high"],["label-asc","Label A-Z"],["label-desc","Label Z-A"]])} onChange={value=>{if(value!=='__mixed__')patch({answerSort:value as KoboQuestionSettings['answerSort']})}}/>
     {targets.some(question=>question.kind==='number')&&<>{heading('Numeric distribution','numericMode')}<AppSelect label="Shared distribution" disabled={selected('chart')==='histogram'} value={selected('chart')==='histogram'?'bins':selected('numericMode')} options={options('numericMode',[["auto","Automatic"],["values","Exact values"],["bins","Equal-width bins"]])} onChange={value=>{if(value!=='__mixed__')patch({numericMode:value as KoboQuestionSettings['numericMode']})}}/>{heading('Number of bins','bins')}<label className="kobo-field">Number of bins<input type="number" min={1} max={100} disabled={selected('chart')!=='histogram'&&selected('numericMode')!=='bins'} placeholder={shared('bins').mixed?'Mixed values':''} value={draft.bins??(shared('bins').value as number|undefined)??''} onChange={event=>{const value=event.target.valueAsNumber;if(Number.isFinite(value))patch({bins:Math.max(1,Math.min(100,value))})}}/></label></>}
     {targets.some(question=>question.kind==='date')&&<>{heading('Date grouping','dateUnit')}<AppSelect label="Shared time grouping" value={selected('dateUnit')} options={options('dateUnit',[["day","Day"],["month","Month"],["year","Year"]])} onChange={value=>{if(value!=='__mixed__')patch({dateUnit:value as KoboQuestionSettings['dateUnit']})}}/></>}
    </div>
    <div hidden={section!=='appearance'} className="kobo-customize-section"><KoboAppearanceControls bulk sharedValues={Object.fromEntries(Object.entries(sharedAppearance).map(([key,shared])=>[key,shared.value])) as KoboAppearance} mixedKeys={Object.entries(sharedAppearance).filter(([,shared])=>shared.mixed).map(([key])=>key as keyof KoboAppearance)} value={draft.appearance} onChange={appearance=>patch({appearance:Object.keys(appearance).length?appearance:undefined})} chart={shown?.chart||'bar'} breakdowns={!!shown?.breakdowns.length}/></div>
    <div hidden={section!=='breakdowns'} className="kobo-customize-section"><h3>Shared breakdowns</h3><p>Use up to three fields across enabled questions. A field is omitted from its own question’s breakdowns.</p>
     {heading('Breakdown fields','breakdowns')}
     <div className="kobo-customize-breakdowns">{[0,1,2].map(index=><div key={index}><span>{index+1}</span><AppSelect label={`Shared breakdown ${index+1}`} searchable disabled={index>levels.length} value={levels[index]||''} options={[["",index===0&&commonBreakdowns.mixed&&draft.breakdowns===undefined?'Mixed values':index===0?'No breakdown':'None'],...fields.filter(field=>field.id===levels[index]||!levels.includes(field.id)).map(field=>[field.id,koboLabel(field,settings.language)] as [string,string])]} onChange={value=>changeLevel(index,value)}/><button type="button" className="soft" disabled={!levels[index]} aria-label={`Remove shared breakdown ${index+1}`} onClick={()=>changeLevel(index,'')}><X/></button></div>)}</div>
     <button className="soft" type="button" onClick={()=>patch({breakdowns:[]})}>Clear breakdowns</button>
     {!fields.length&&<p>No category or text fields are compatible with every enabled section. Customize these questions individually.</p>}
     {heading('Table values','breakdownDisplay')}
     <AppSelect label="Shared table values" value={selected('breakdownDisplay')} options={options('breakdownDisplay',[["count","# only"],["percent","% only"],["both","# and %"]])} onChange={value=>{if(value!=='__mixed__')patch({breakdownDisplay:value as KoboQuestionSettings['breakdownDisplay']})}}/><p>Choose which values appear in each pivot table.</p>
    </div>
    <div hidden={section!=='colors'} className="kobo-customize-section"><h3>Shared chart colors</h3><p>Choose a palette or edit a color. Only your changes will apply.</p>
     {heading('Chart colors','palette',['palette','colors'])}
     <div className="kobo-palette-cards">{koboPalettes.map(palette=><button key={palette.name} type="button" aria-label={`${palette.label||palette.name} shared palette`} aria-pressed={selected('palette')===palette.name} onClick={()=>{patch({palette:palette.name as KoboQuestionSettings['palette'],colors:{}});setInvalid(new Set());setColorRevision(value=>value+1)}}><span>{palette.label||palette.name}</span><small>{palette.description}</small><span className="kobo-palette-swatches">{palette.colors.slice(0,6).map(color=><i key={color} style={{background:color}}/>)}</span></button>)}</div>
     <button className="soft" type="button" aria-pressed={selected('palette')==='auto'} onClick={()=>{patch({palette:null,colors:{}});setInvalid(new Set());setColorRevision(value=>value+1)}}><RotateCcw/>Automatic colors</button>
     <div className="kobo-color-section-heading"><h4>Preview question colors</h4></div><p>Custom colors apply wherever the same option ID is used. Other colors keep their current values.</p>
     {shown&&<div className="kobo-customize-colors">{entries.slice(0,colorLimit).map(entry=><ColorControl key={`${questionId}:${entry.id}:${colorRevision}`} entry={entry} value={shown.colors[entry.id]||defaultKoboColor(shown,entry.id)} suggestions={koboPalettes.find(palette=>palette.name===draft.palette)?.colors||koboPalettes[0].colors} disabled={pending} onChange={value=>setDraft(current=>({...current,colors:{...current.colors,[entry.id]:value}}))} onValidity={validity}/>)}</div>}{entries.length>colorLimit&&<button className="soft" type="button" onClick={()=>setColorLimit(value=>value+20)}>Show more colors</button>}
    </div>
   </section>
   <section id="kobo-customize-preview" className="kobo-customize-preview" aria-label="Shared draft preview" aria-busy={pending&&!error}>
    <AppSelect label="Preview question" searchable value={questionId} options={targets.map(question=>[question.id,koboLabel(question,settings.language)])} onChange={setQuestionId}/>
    <div className="kobo-preview-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3 dir="auto">{shown?.label||(target?'Preparing question preview':'No enabled questions')}</h3>{shown&&<small>Answered: {shown.denominator} · Missing: {shown.missing}</small>}</div><span role="status">{error?'Preview unavailable':pending?'Updating preview…':'Preview only'}</span></div>
    {!target&&<p>Use Manage questions to enable the questions you want to customize.</p>}
    {error&&<div className="kobo-preview-error" role="alert"><p>{error}</p><button type="button" className="soft" onClick={()=>setRetry(value=>value+1)}>Retry preview</button></div>}
    {shown?.chart==='line'&&shown.trend?.periods.length===1&&shown.trend.unit!=='day'&&!pending&&!error&&<button type="button" className="soft" onClick={()=>patch({trendUnit:'day'})}>{settings.language==='ar'?'التجميع حسب اليوم':'Group by day'}</button>}
    {shown&&<><KoboRendering enabled={false}><div className="kobo-customize-preview-chart"><Suspense fallback={<p>Loading preview…</p>}><Chart result={shown} language={settings.language} colorSettings={cfg||undefined}/></Suspense></div></KoboRendering><details className="kobo-customize-table"><summary>Table preview<ChevronDown/></summary><KoboPivotTable result={shown} language={settings.language} limit={100} display={cfg?.breakdownDisplay||'both'}/></details></>}
   </section>
  </div>
  <footer className="kobo-dialog-actions"><p>{dirty?`Only changed settings will replace existing values for ${targets.length} enabled questions.`:'Edit a setting to begin. Untouched settings keep their current values.'}</p><div className="kobo-dialog-action-buttons"><button type="button" className="soft" disabled={!dirty&&invalid.size===0} onClick={()=>{setDraft({});setInvalid(new Set());setColorRevision(value=>value+1)}}><RotateCcw/>Reset changes</button><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!dirty||!targets.length||pending||!!error||invalid.size>0} onClick={()=>onApply(draft)}>Apply to {targets.length} questions</button></div></footer>
 </dialog>;
}
