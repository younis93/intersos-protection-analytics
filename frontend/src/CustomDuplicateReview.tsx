import {ValueTable} from './ValueTable';
import {localValueLoader} from './ColumnFilterControls';
import {filterRecords,recordColumnType,type ColumnFilter,type FilterColumn} from './columnFilters';
import {ArrowLeft,ArrowRight,ListX,ListPlus} from 'lucide-react';
import {ColumnTypeBadge} from './CustomColumnControls';
import {useState} from 'react';
import {AppSelect} from './SelectionControls';
import type {CustomConfig,CustomPreview} from './CustomColumnSetup';
import {analysisColumns,type DuplicateDecision} from './customPreparationState';

const show=(value:unknown):string=>value===null||value===undefined?'Missing':Array.isArray(value)?value.map(show).join(', '):String(value);
export default function CustomDuplicateReview({config,preview,onChange,busy}:{config:CustomConfig;preview:CustomPreview;onChange:(config:CustomConfig)=>void;busy:boolean}){
 const [filters,setFilters]=useState<Record<string,ColumnFilter[]>>({});
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[limits,setLimits]=useState<Record<string,number>>({});
 const settings=config.duplicateReview||{fields:[],decisions:{}},result=preview.duplicateResult;
 const columns=analysisColumns(config).filter(c=>c.included);
 const pending=!!preview.loading||JSON.stringify(config)!==JSON.stringify(preview.config);
 const groups=result?.groups||[],currentPage=Math.min(page,Math.max(0,Math.ceil(groups.length/10)-1));
 const displayGroups=groups.map(group=>{const decision=settings.decisions[group.signature];if(!decision)return group;const rows=group.records.map(record=>record.row);return {...group,mode:decision.mode,keptRows:decision.mode==='all'?rows:decision.mode==='first'?rows.slice(0,1):decision.mode==='last'?rows.slice(-1):decision.rows}});
 const decide=(signature:string,decision:DuplicateDecision)=>onChange({...config,duplicateReview:{...settings,decisions:{...settings.decisions,[signature]:decision}}});
 return <section className="custom-preparation-workspace custom-duplicates">
  <header className="custom-review-heading"><div><h3>Duplicate review</h3><p>Select one or more columns, such as Case ID or Name + Date. Matches use cleaned, converted values and are case-sensitive unless you standardize capitalization.</p></div></header>
  <section className="custom-settings-panel"><h4>Match records using</h4><label className="custom-search"><input aria-label="Search duplicate matching columns" placeholder="Search columns..." value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <div className="custom-duplicate-fields">{columns.filter(c=>c.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(c=><label className="custom-check" key={c.id}><input type="checkbox" disabled={busy} checked={settings.fields.includes(c.id)} aria-label={`Match duplicates by ${c.label}`} onChange={e=>{setPage(0);onChange({...config,duplicateReview:{fields:e.target.checked?[...settings.fields,c.id]:settings.fields.filter(id=>id!==c.id),decisions:{}}})}}/><span dir="auto">{c.label}<ColumnTypeBadge kind={c.kind}/></span></label>)}</div>
   {!!settings.fields.length&&<button type="button" className="soft" disabled={busy} onClick={()=>onChange({...config,duplicateReview:{fields:[],decisions:{}}})}><ListX aria-hidden="true"/>Clear duplicate matching</button>}
   <p>Records with any missing matching value remain included and are skipped. Original rows stay in the source file. Conversions must still be valid, including in excluded records.</p>
  </section>
  {!settings.fields.length?<p className="custom-preparation-empty">Duplicate review is optional. No records are excluded by default.</p>:<>
   <p role="status" aria-live="polite">{pending?'Updating duplicate review...':result?.error||`${groups.length} duplicate ${groups.length===1?'group':'groups'} · ${result?.unresolved||0} ${result?.unresolved===1?'needs':'need'} review · ${result?.excluded||0} ${result?.excluded===1?'record':'records'} excluded · ${result?.included||0} ${result?.included===1?'record':'records'} included · ${result?.skipped||0} incomplete keys skipped`}</p>
   {displayGroups.slice(currentPage*10,currentPage*10+10).map((group,i)=>{
    const rules=filters[group.signature]||[];
    const getValue=(record:typeof group.records[number],key:string)=>key==="__row__"?record.row:record.values[key];
    const visibleRecords=filterRecords(group.records,rules,getValue);
    const filterColumns:FilterColumn[]=[{key:"",label:""},{key:"__row__",label:"Source row",type:"number"},...columns.map(c=>({key:c.id,label:c.label,type:recordColumnType(c.label,c.kind==="number"?"number":c.kind==="date"?"date":"text")}))];
    const control={filters:rules,onChange:(next:ColumnFilter[])=>{setFilters(current=>({...current,[group.signature]:next}));setLimits(current=>({...current,[group.signature]:20}))},columns:filterColumns,loadValues:localValueLoader(group.records,rules,getValue)};
    return <article className="custom-settings-panel custom-recipe-card" key={group.signature} data-duplicate-group={group.signature}>
    <header className="custom-review-heading"><h3>Group {currentPage*10+i+1}: {group.values.map(show).join(' / ')}</h3><span className={`custom-review-status ${group.mode?'ready':'attention'}`}>{group.mode?'Reviewed':'Needs attention'}</span></header>
    <AppSelect label={`Records to include for group ${currentPage*10+i+1}`} disabled={busy||pending} value={group.mode} options={[["","Choose how to handle this group"],["all","Keep all records"],["first","Keep first source row"],["last","Keep last source row"],["custom","Choose records individually"]]} onChange={mode=>{if(mode)decide(group.signature,{mode:mode as DuplicateDecision['mode'],rows:group.keptRows});else{const decisions={...settings.decisions};delete decisions[group.signature];onChange({...config,duplicateReview:{...settings,decisions}})}}}/>
    <div className="custom-table-wrap" tabIndex={0} role="region" aria-label={`Records in duplicate group ${currentPage*10+i+1}`}><ValueTable recordFilters={control} filterColumns={filterColumns}><thead><tr><th>Include</th><th>Source row</th>{columns.map(c=><th dir="auto" key={c.id}>{c.label}</th>)}</tr></thead><tbody>{visibleRecords.slice(0,limits[group.signature]||20).map(record=><tr key={record.row}><td><input type="checkbox" disabled={busy||pending} aria-label={`Include source row ${record.row}`} checked={group.keptRows.includes(record.row)} onChange={e=>decide(group.signature,{mode:'custom',rows:e.target.checked?[...group.keptRows,record.row]:group.keptRows.filter(row=>row!==record.row)})}/></td><th scope="row">{record.row}</th>{columns.map(c=><td key={c.id} dir="auto"><span className="custom-duplicate-value" title={show(record.values[c.id])}>{show(record.values[c.id])}</span>{!c.calculated&&<small title={show(record.original[c.index])}>Original: {show(record.original[c.index])}</small>}</td>)}</tr>)}</tbody></ValueTable></div>
    {visibleRecords.length>(limits[group.signature]||20)&&<button type="button" className="soft" onClick={()=>setLimits({...limits,[group.signature]:(limits[group.signature]||20)+20})}><ListPlus aria-hidden="true"/>Show more records ({visibleRecords.length} matching)</button>}
   </article>})}
   {groups.length>10&&<nav className="custom-duplicate-pagination" aria-label="Duplicate groups"><button type="button" className="soft" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}><ArrowLeft aria-hidden="true"/>Previous groups</button><span>Page {currentPage+1} of {Math.ceil(groups.length/10)}</span><button type="button" className="soft" disabled={(currentPage+1)*10>=groups.length} onClick={()=>setPage(currentPage+1)}><ArrowRight aria-hidden="true"/>Next groups</button></nav>}
  </>}
 </section>;
}
