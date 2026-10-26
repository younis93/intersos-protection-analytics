import {Eye,SlidersHorizontal,Search,LoaderCircle} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import type {CustomColumn,CustomConfig,CustomPreview} from './CustomColumnSetup';
import {preparationControls,preparationDefaults,type Preparation} from './customPreparationState';
import {customKindLabel} from './customImportReviewState';
import {ColumnTypeBadge,columnTypes,ColumnInterpretationControls,ColumnValueLabels,ColumnInvalidPolicy,ColumnIssues,InterpretedValue,showValue} from './CustomColumnControls';

export default function CustomColumnPreparation({config,preview,onChange,busy,selected,onSelect,query,onQuery}:{config:CustomConfig;preview:CustomPreview;onChange:(config:CustomConfig)=>void;busy:boolean;selected:string;onSelect:(id:string)=>void;query:string;onQuery:(value:string)=>void}){
 const column=config.columns.find(c=>c.id===selected)||config.columns[0];
 if(!column)return null;
 const profile=preview.profiles.find(p=>p.id===column.id),prep={...preparationDefaults,...column.preparation},controls=preparationControls(column.kind);
 const matchesType=preview.config.columns.find(c=>c.id===column.id)?.kind===column.kind;
 const pending=!!preview.loading||JSON.stringify(config)!==JSON.stringify(preview.config);
 const change=(patch:Partial<CustomColumn>)=>onChange({...config,columns:config.columns.map(c=>c.id===column.id?{...c,...patch}:c)});
 const changePrep=(patch:Partial<Preparation>)=>change({preparation:{...prep,...patch}});
 const paused=Object.entries(prep).filter(([key,value])=>!controls.includes(key as keyof Preparation)&&JSON.stringify(value)!==JSON.stringify(preparationDefaults[key as keyof Preparation])).length;
 return <div className="custom-editor-grid custom-type-editor">
  <aside className="custom-columns glass" aria-label="Preparation columns"><label className="custom-search"><Search size={17}/><input aria-label="Search preparation columns" placeholder="Search columns or types..." value={query} onChange={e=>onQuery(e.target.value)}/></label>
   <div className="custom-column-list">{config.columns.filter(c=>(c.label+' '+c.header+' '+customKindLabel(c.kind)).toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(c=>{
    const issues=preview.issues.filter(issue=>issue.question===c.id).reduce((sum,issue)=>sum+issue.count,0);
    return <button type="button" key={c.id} aria-pressed={column.id===c.id} className={column.id===c.id?'selected':''} onClick={()=>onSelect(c.id)}><span className="custom-column-number">{c.index+1}</span><span className="custom-column-list-label"><strong dir="auto">{c.label||'Untitled'}</strong><ColumnTypeBadge kind={c.kind}/>{!c.included&&<small>Excluded from analysis</small>}</span>{issues>0&&<b className="custom-warning" aria-label={`${issues} issues`}>{issues}</b>}</button>;
   })}</div>
  </aside>
  <div className="custom-column-details">
   <section className="custom-settings-panel" aria-label="Column preparation settings">
    <header className="custom-panel-heading"><SlidersHorizontal/><div><small>Source column {column.index+1}{!column.included?' · Excluded':''}</small><h3 dir="auto">{column.header||'Blank header'}</h3><p>Prepare this column for analysis.</p></div><ColumnTypeBadge kind={column.kind}/></header>
    <label className="custom-check custom-column-included"><input disabled={busy} type="checkbox" checked={column.included} onChange={e=>change({included:e.target.checked})}/>Include in analysis</label>
    <div className="custom-field-grid"><label className="kobo-field">Display label<input disabled={busy} aria-label="Column display label" value={column.label} maxLength={1000} onChange={e=>change({label:e.target.value})}/></label><AppSelect label="Column type" value={column.kind} options={columnTypes} disabled={busy} onChange={value=>change({kind:value as CustomColumn['kind'],invalidAsMissing:false})}/><label className="kobo-field">Group<input disabled={busy} aria-label="Column group" value={column.group} maxLength={200} placeholder="Optional group" onChange={e=>change({group:e.target.value})}/></label></div>
    {profile&&profile.detected!==column.kind&&!pending&&<p className="custom-control-hint">Detected type: <strong>{customKindLabel(profile.detected)}</strong>. Your selected type controls preparation and analysis.</p>}
    {paused>0&&<p className="custom-control-hint">Settings for other types are remembered and paused. Switching back restores them.</p>}
    <div className="custom-type-controls" key={column.id+'_'+column.kind}>
     <h4>{column.kind==='number'?'Number interpretation':column.kind==='date'?'Date & time':column.kind==='multiple'?'Answers & cleanup':column.kind==='category'?'Values & cleanup':'Text cleanup'}</h4>
     <ColumnInterpretationControls column={column} change={change} busy={busy} fileConvention={config.dateFormat}/>
     {controls.includes('trim')&&<><div className="custom-cleaning-checks"><label className="custom-check"><input disabled={busy} type="checkbox" checked={prep.trim} onChange={e=>changePrep({trim:e.target.checked})}/>Trim leading and trailing spaces</label><label className="custom-check"><input disabled={busy} type="checkbox" checked={prep.collapseSpaces} onChange={e=>changePrep({collapseSpaces:e.target.checked})}/>Collapse repeated spaces (keep line breaks)</label></div><AppSelect label="Letter case" value={prep.letterCase} options={[["none","Keep original"],["lower","lowercase"],["upper","UPPERCASE"],["title","Title Case"]]} onChange={value=>changePrep({letterCase:value as Preparation['letterCase']})} disabled={busy}/></>}
     {controls.includes('numberFormat')&&<><div className="custom-field-grid"><AppSelect label="Number format" value={prep.numberFormat} options={[["plain","Plain number - 1234.56"],["dot","Comma thousands, dot decimal - 1,234.56"],["comma","Dot thousands, comma decimal - 1.234,56"]]} onChange={value=>changePrep({numberFormat:value as Preparation['numberFormat']})} disabled={busy}/><label className="kobo-field">Currency symbol or code to remove<input disabled={busy} aria-label="Currency token" maxLength={20} value={prep.currency} placeholder="e.g. IQD, USD, $" onChange={e=>changePrep({currency:e.target.value})}/></label></div><label className="custom-check custom-preparation-percent"><input disabled={busy} type="checkbox" checked={prep.percent} onChange={e=>changePrep({percent:e.target.checked})}/>Interpret a trailing % as a percentage (25% → 0.25)</label><p className="custom-control-hint">Bare numeric cells keep their value. Currency removal applies only at the start or end.</p></>}
     <label className="kobo-field custom-missing-tokens">Treat as missing (one token per line)<textarea disabled={busy} aria-label="Missing value tokens" rows={3} value={prep.missingTokens.join('\n')} placeholder={'N/A\n-\nUnknown'} onChange={e=>changePrep({missingTokens:e.target.value.split('\n')})}/></label>
     <ColumnValueLabels column={column} profile={matchesType?profile:undefined} change={change} busy={busy}/>
     <ColumnInvalidPolicy column={column} profile={matchesType?profile:undefined} change={change} busy={busy||pending}/>
    </div>
   </section>
   <section className="custom-preview-panel" aria-label="Preparation preview" aria-busy={pending}>
    <header className="custom-panel-heading"><Eye/><div><h3>Preparation preview</h3><p>Original values alongside the result of your active settings.</p></div><span>Read only</span></header>
    {pending?<p className="custom-preview-updating" role="status"><LoaderCircle size={16} className="kobo-restore-spinner"/>Updating preview...</p>:profile&&<><div className="custom-profile">{[['Detected type',customKindLabel(profile.detected)],['Distinct values',profile.distinct],['Missing',profile.missing],['Changed by cleanup',profile.changed||0],['Invalid',profile.invalid]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><div className="custom-table-wrap"><table><thead><tr><th>Original value</th>{controls.includes('trim')&&<th>After cleanup</th>}<th>{column.kind==='date'?'Prepared date':column.kind==='multiple'?'Split answers':'Prepared value'}</th>{column.kind==='date'&&column.includeTime&&<th>Separate time column</th>}</tr></thead><tbody>{profile.preview.map((value,i)=><tr key={i}><td dir="auto">{value.original}</td>{controls.includes('trim')&&<td dir="auto">{showValue(value.prepared)}</td>}<td dir="auto"><InterpretedValue column={column} value={value.value}/></td>{column.kind==='date'&&column.includeTime&&<td>{showValue(value.time)}</td>}</tr>)}</tbody></table></div><ColumnIssues profile={profile}/></>}
   </section>
  </div>
 </div>;
}
