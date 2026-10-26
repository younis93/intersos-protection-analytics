import KoboAppearanceControls from './KoboAppearanceControls';
import {lazy,Suspense,useEffect,useId,useMemo,useRef,useState} from 'react';
import {BarChart3,ChartColumn,ChartLine,Check,ChevronDown,Palette,PieChart,RotateCcw,SlidersHorizontal,X} from 'lucide-react';
import {AppSelect,useDropdownPosition} from './SelectionControls';
import {koboApi} from './koboApi';
import {koboLabel,type KoboProject,type KoboQuestionSettings,type KoboResult,type KoboSettings} from './koboTypes';
import {calculationKey,colorEntries,customizeDraft,defaultKoboColor,koboPalettes,normalizeHex,resolveKoboColors} from './koboCustomizeOptions';
import {KoboRendering} from './KoboRendering';
import KoboPivotTable from './KoboPivotTable';
import './koboCustomize.css';

const Chart=lazy(()=>import('./KoboChart'));
type Section='chart'|'appearance'|'breakdowns'|'colors';
type ColorEntry={id:string;label:string};

export function ColorControl({entry,value,suggestions,disabled,onChange,onValidity}:{entry:ColorEntry;value:string;suggestions:string[];disabled:boolean;onChange:(value:string)=>void;onValidity:(id:string,valid:boolean)=>void}){
 const[open,setOpen]=useState(false),[hex,setHex]=useState(value),id=useId(),emitted=useRef(value);
 const{root,menu}=useDropdownPosition(open,()=>setOpen(false));
 const valid=normalizeHex(hex);
 useEffect(()=>{if(value!==emitted.current){setHex(value);onValidity(entry.id,true)}emitted.current=value},[value]);
 const setColor=(text:string,normalize=false)=>{const color=normalizeHex(text);setHex(normalize&&color?color:text);onValidity(entry.id,!!color);if(color){emitted.current=color;onChange(color)}};
 return <div className={`kobo-color-row${valid?'':' has-error'}`}>
  <span dir="auto">{entry.label}</span>
  <div ref={root} className="kobo-color-control">
   <button type="button" className="app-select-trigger" disabled={disabled} aria-label={`Color for ${entry.label}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(current=>!current)}><i style={{background:value}}/><span>{valid?value.toUpperCase():'Invalid HEX'}</span><ChevronDown aria-hidden="true"/></button>
   {open&&<div ref={menu} id={id} className="kobo-color-popup" popover="auto" onToggle={event=>{if(event.newState==='closed')setOpen(false)}}>
    <strong dir="auto">{entry.label}</strong><label className="kobo-field">HEX color<input aria-label={`HEX color for ${entry.label}`} aria-invalid={!valid} value={hex} spellCheck={false} onChange={event=>setColor(event.target.value)} onBlur={()=>setColor(hex,true)} onKeyDown={event=>{if(event.key==='Enter')setColor(hex,true)}}/></label>
    {!valid&&<p className="kobo-color-error" role="alert">Enter 3 or 6 hexadecimal digits, for example #1683D8.</p>}
    <span className="kobo-custom-label">Suggested colors</span><div className="kobo-suggested-colors">{suggestions.map(color=><button type="button" key={color} title={color} aria-label={`Use ${color} for ${entry.label}`} aria-pressed={value.toUpperCase()===color.toUpperCase()} style={{background:color}} onClick={()=>setColor(color,true)}>{value.toUpperCase()===color.toUpperCase()&&<Check aria-hidden="true"/>}</button>)}</div>
    <label className="kobo-native-color">Custom color<input type="color" aria-label={`Custom color for ${entry.label}`} value={value} onChange={event=>setColor(event.target.value,true)}/></label>
   </div>}
  </div>
 </div>;
}

export default function KoboCustomize({result,project,settings,onApply,onClose}:{result:KoboResult;project:KoboProject;settings:KoboSettings;onApply:(draft:KoboQuestionSettings)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),base=useRef(settings),initial=useRef(customizeDraft(result,settings)),original=useRef(result);
 const[draft,setDraft]=useState(()=>initial.current),[section,setSection]=useState<Section>('chart'),[mobilePane,setMobilePane]=useState<'settings'|'preview'>('settings');
 const[preview,setPreview]=useState(()=>({key:calculationKey(initial.current),result})),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const[invalidColors,setInvalidColors]=useState<Set<string>>(new Set()),[colorRevision,setColorRevision]=useState(0),[colorLimit,setColorLimit]=useState(20),[selectedPalette,setSelectedPalette]=useState(initial.current.palette||'');
 const key=calculationKey(draft),initialKey=calculationKey(initial.current),pending=busy||preview.key!==key;
 const patch=(change:Partial<KoboQuestionSettings>)=>setDraft(current=>({...current,...change,...(change.breakdowns!==undefined?{pointColors:{}}:{})}));
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close()},[]);
 useEffect(()=>{
  if(key===initialKey){setPreview({key,result:original.current});setBusy(false);setError('');return}
  const controller=new AbortController();setBusy(true);setError('');
  const timer=setTimeout(()=>{
   const next={...base.current,questions:{...base.current.questions,[result.id]:draft}};
   void koboApi.previewQuestion(project.id,next,result.id,controller.signal).then(value=>{if(!controller.signal.aborted)setPreview({key,result:value})}).catch(issue=>{if(!controller.signal.aborted)setError(issue instanceof Error?issue.message:String(issue))}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
  },250);
  return()=>{clearTimeout(timer);controller.abort()};
 },[key,initialKey,project.id,result.id,retry]);
 const shown=useMemo(()=>({...preview.result,chart:draft.chart||preview.result.chart,colors:resolveKoboColors(preview.result,draft.palette,draft.colors),pointColors:draft.pointColors||{},breakdownDisplay:draft.breakdownDisplay,appearance:draft.appearance}),[preview.result,draft.chart,draft.palette,draft.colors,draft.pointColors,draft.breakdownDisplay,draft.appearance]);
 const breakdowns=draft.breakdowns||[];
 const fields=useMemo(()=>project.form.questions.filter(question=>['category','text'].includes(question.kind)&&(!question.repeat||question.repeat===result.repeat)),[project.form.questions,result.repeat]);
 const dateFields=project.form.questions.filter(field=>field.kind==='date'&&!field.identifying&&(!field.repeat||field.repeat===result.repeat||result.repeat.startsWith(field.repeat+'/')));
 const types=[{id:'bar',label:'Bar',Icon:BarChart3,reason:''},{id:'column',label:'Column',Icon:ChartColumn,reason:''},{id:'line',label:'Line',Icon:ChartLine,reason:result.kind==='text'?'Use a category, multiple-choice, number or date question.':''},{id:'histogram',label:'Histogram',Icon:ChartColumn,reason:result.kind!=='number'?'Requires a numeric question.':''},{id:'heatmap',label:'Heatmap',Icon:SlidersHorizontal,reason:!breakdowns.length?'Add at least one breakdown.':''},{id:'pie',label:'Pie',Icon:PieChart,reason:breakdowns.length||['number','date'].includes(result.kind)?'Requires categorical answers without breakdowns.':''},{id:'donut',label:'Donut',Icon:PieChart,reason:breakdowns.length||['number','date'].includes(result.kind)?'Requires categorical answers without breakdowns.':''}];
 const entries=colorEntries(shown),palette=koboPalettes.find(value=>value.name===selectedPalette);
 const entryKey=JSON.stringify(entries.map(entry=>entry.id));
 useEffect(()=>{const ids=new Set(entries.map(entry=>entry.id));setInvalidColors(current=>[...current].some(id=>!ids.has(id))?new Set([...current].filter(id=>ids.has(id))):current)},[entryKey]);
 const suggestions=useMemo(()=>[...new Set([...(palette?.colors||[]),...koboPalettes[0].colors])],[palette]);
 const validity=(id:string,valid:boolean)=>setInvalidColors(current=>{if(current.has(id)===!valid)return current;const next=new Set(current);if(valid)next.delete(id);else next.add(id);return next});
 const changeBreakdown=(index:number,value:string)=>{
  const next=[...breakdowns];if(value)next[index]=value;else next.splice(index,1);
  patch({breakdown:'',breakdowns:next.filter(Boolean),...((next.some(Boolean)&&['pie','donut'].includes(draft.chart||''))||(!next.some(Boolean)&&draft.chart==='heatmap')?{chart:'bar' as const}:{})});
 };
 const dirty=JSON.stringify(draft)!==JSON.stringify(initial.current);
 const apply=()=>{if(!pending&&!error&&!invalidColors.size&&dirty)onApply(draft)};
 return <dialog ref={dialog} className="kobo-dialog glass kobo-customize" aria-label={`Customize ${result.name}`} dir="ltr" onCancel={event=>{event.preventDefault();onClose()}}>
  <header><div><span className="eyebrow">CUSTOMIZE QUESTION · {result.name}</span><h2 dir="auto">{result.label}</h2><p>Answered: <strong>{shown.denominator}</strong> · Missing: {shown.missing} · Changes stay in preview until applied.</p></div><button type="button" className="soft" aria-label="Close customization" onClick={onClose}><X/></button></header>
  <div className="kobo-customize-mobile-tabs" role="tablist" aria-label="Customization view">{(['settings','preview'] as const).map(pane=><button type="button" role="tab" id={`kobo-customize-${pane}-tab`} aria-controls={`kobo-customize-${pane}`} aria-selected={mobilePane===pane} tabIndex={mobilePane===pane?0:-1} key={pane} onClick={()=>setMobilePane(pane)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'settings':event.key==='End'?'preview':pane==='settings'?'preview':'settings';setMobilePane(next);document.getElementById(`kobo-customize-${next}-tab`)?.focus()}}}>{pane==='settings'?'Settings':'Preview'}</button>)}</div>
  <div className={`kobo-customize-body pane-${mobilePane}`}>
   <section id="kobo-customize-settings" className="kobo-customize-settings" aria-label="Question settings">
    <nav className="kobo-customize-tabs" aria-label="Customize sections">{([{id:'chart',label:'Chart',Icon:BarChart3},{id:'appearance',label:'Appearance',Icon:SlidersHorizontal},{id:'breakdowns',label:'Breakdowns',Icon:SlidersHorizontal},{id:'colors',label:'Colors',Icon:Palette}] as const).map(tab=><button type="button" key={tab.id} aria-pressed={section===tab.id} onClick={()=>setSection(tab.id)}><tab.Icon aria-hidden="true"/>{tab.label}</button>)}</nav>
    <div hidden={section!=='chart'} className="kobo-customize-section"><h3>Chart appearance</h3><p>Choose the clearest way to present this question.</p><div className="kobo-chart-types" role="group" aria-label="Chart type">{types.map(type=><button type="button" key={type.id} aria-pressed={draft.chart===type.id} disabled={!!type.reason} title={type.reason||type.label} onClick={()=>patch({chart:type.id as KoboQuestionSettings['chart'],...(type.id==='histogram'?{numericMode:'bins' as const}:{})})}><type.Icon aria-hidden="true"/><span>{type.label}</span>{type.reason&&<small>{type.reason}</small>}</button>)}</div>
     <AppSelect label="Answer order" value={draft.answerSort} options={[["form","Form order"],["count-desc","Count high to low"],["count-asc","Count low to high"],["label-asc","Label A-Z"],["label-desc","Label Z-A"]]} onChange={value=>patch({answerSort:value as KoboQuestionSettings['answerSort']})}/>
     {result.kind==='number'&&<><AppSelect label="Distribution" disabled={draft.chart==='histogram'} value={draft.chart==='histogram'?'bins':draft.numericMode} options={[["auto","Automatic"],["values","Exact values"],["bins","Equal-width bins"]]} onChange={value=>patch({numericMode:value as KoboQuestionSettings['numericMode']})}/><label className="kobo-field">Number of bins<input aria-label="Number of bins" type="number" min={1} max={100} value={draft.bins} disabled={draft.chart!=='histogram'&&draft.numericMode==='values'} onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))patch({bins:Math.max(1,Math.min(100,event.target.valueAsNumber))})}}/></label></>}
     {draft.chart==='line'&&['category','multiple','number'].includes(result.kind)&&<><AppSelect label="Date field" searchable value={draft.trendDateField||''} options={[["",result.kind==='number'?'No date field - numeric distribution':'Choose a date field'],...dateFields.map(field=>[field.id,koboLabel(field,settings.language)] as [string,string])]} onChange={value=>patch({trendDateField:value})}/>{draft.trendDateField&&<AppSelect label="Time grouping" value={draft.trendUnit||'month'} options={[["day","Day"],["month","Month"],["year","Year"]]} onChange={value=>patch({trendUnit:value as KoboQuestionSettings['trendUnit']})}/>}<p>Date trends show answers over time. Pivot breakdowns remain in the table and are not added to the trend chart.</p>{!dateFields.length&&<p>No compatible non-identifying date fields are available.</p>}</>}
     {result.kind==='date'&&<AppSelect label="Time grouping" value={draft.dateUnit} options={[["day","Day"],["month","Month"],["year","Year"]]} onChange={value=>patch({dateUnit:value as KoboQuestionSettings['dateUnit']})}/>}
    </div>
    <div hidden={section!=='appearance'} className="kobo-customize-section"><KoboAppearanceControls value={draft.appearance} onChange={appearance=>patch({appearance})} chart={shown.chart} breakdowns={breakdowns.length>0}/></div>
    <div hidden={section!=='breakdowns'} className="kobo-customize-section"><h3>Pivot breakdowns</h3><p>Choose up to three levels. Each level groups columns within the previous one.</p><div className="kobo-customize-breakdowns">{[0,1,2].map(index=><div key={index}><span>{index+1}</span><AppSelect label={`Breakdown ${index+1}`} searchable disabled={index>breakdowns.length} value={breakdowns[index]||''} options={[["",index===0?'No breakdown':'None'],...fields.filter(question=>question.id===breakdowns[index]||!breakdowns.includes(question.id)).map(question=>[question.id,koboLabel(question,settings.language)] as [string,string])]} onChange={value=>changeBreakdown(index,value)}/><button type="button" className="soft" disabled={!breakdowns[index]} aria-label={`Remove breakdown ${index+1}`} onClick={()=>changeBreakdown(index,'')}><X/></button></div>)}</div>
     <AppSelect label="Table values" value={draft.breakdownDisplay||'both'} options={[["count","# only"],["percent","% only"],["both","# and %"]]} onChange={value=>patch({breakdownDisplay:value as KoboQuestionSettings['breakdownDisplay']})}/>
    </div>
    <div hidden={section!=='colors'} className="kobo-customize-section"><h3>Suggested palettes</h3><p>Apply a coordinated palette, or select a color for each answer.</p><div className="kobo-palette-cards">{koboPalettes.map(option=><button type="button" key={option.name} disabled={pending} aria-label={`${option.label||option.name} palette`} aria-pressed={selectedPalette===option.name} onClick={()=>{setSelectedPalette(option.name);patch({palette:option.name as KoboQuestionSettings['palette'],colors:{},pointColors:{}});setInvalidColors(new Set());setColorRevision(value=>value+1)}}><span>{option.label||option.name}</span><small>{option.description}</small><span className="kobo-palette-swatches">{option.colors.slice(0,6).map(color=><i key={color} style={{background:color}}/>)}</span></button>)}</div>
     {palette&&entries.length>palette.colors.length&&<p>{palette.colors.length===1?'All categories use the same blue; labels identify each category.':`Colors repeat across ${entries.length} categories; labels identify each category.`}</p>}
     <div className="kobo-color-section-heading"><h4>Individual colors</h4><button type="button" className="soft" disabled={pending} onClick={()=>{patch({palette:null,colors:{},pointColors:{}});setSelectedPalette('');setInvalidColors(new Set());setColorRevision(value=>value+1)}}><RotateCcw/> Reset colors</button></div>
     <div className="kobo-customize-colors">{entries.slice(0,colorLimit).map(entry=><ColorControl key={`${entry.id}:${colorRevision}`} entry={entry} value={shown.colors[entry.id]||defaultKoboColor(shown,entry.id)} suggestions={suggestions} disabled={pending} onChange={value=>{setDraft(current=>({...current,colors:{...current.colors,[entry.id]:value}}))}} onValidity={validity}/>)}</div>{entries.length>colorLimit&&<button type="button" className="soft" onClick={()=>setColorLimit(current=>current+20)}>Show more colors ({entries.length-colorLimit} remaining)</button>}{!entries.length&&<p>No answered categories are available for colors.</p>}
    </div>
   </section>
   <section id="kobo-customize-preview" className="kobo-customize-preview" aria-label="Draft preview" aria-busy={pending&&!error}>
    <div className="kobo-preview-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3 dir="auto">{result.label}</h3></div><span role="status">{error?'Preview unavailable':pending?'Updating preview…':'Preview only'}</span></div>
    {error&&<div className="kobo-preview-error" role="alert"><p>{error}</p><button type="button" className="soft" onClick={()=>setRetry(current=>current+1)}>Retry preview</button></div>}
    {shown?.chart==='line'&&shown.trend?.periods.length===1&&shown.trend.unit!=='day'&&!pending&&!error&&<button type="button" className="soft" onClick={()=>patch({trendUnit:'day'})}>{settings.language==='ar'?'التجميع حسب اليوم':'Group by day'}</button>}
    <KoboRendering enabled={false}><div className="kobo-customize-preview-chart"><Suspense fallback={<p role="status">Loading preview…</p>}><Chart result={shown} language={settings.language} colorSettings={draft}/></Suspense></div></KoboRendering>
    <details className="kobo-customize-table"><summary>Table preview <ChevronDown aria-hidden="true"/></summary><KoboPivotTable result={shown} language={settings.language} limit={30} display={draft.breakdownDisplay||'both'}/>{shown.rows.length>30&&<p>First 30 answers shown. Totals include every answer.</p>}</details>
   </section>
  </div>
  <footer className="kobo-dialog-actions"><p role="status">{invalidColors.size?'Correct the invalid HEX color in Colors.':error?'Resolve the preview error before applying.':pending?'Updating question preview…':dirty?'Changes have not been applied.':'Your current question settings.'}</p><div className="kobo-dialog-action-buttons"><button type="button" className="soft" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!dirty||pending||!!error||!!invalidColors.size} onClick={apply}>Apply changes</button></div></footer>
 </dialog>;
}
