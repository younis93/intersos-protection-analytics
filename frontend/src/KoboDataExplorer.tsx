import {ConditionalBadge} from './KoboConditionalReview';
import {KoboCellEditor,editableField,undoDataEdit} from './KoboDataEditing';
import {useColumnFilters} from './ColumnFilterControls';
import {recordColumnType,type ValuePage,type FilterColumn} from './columnFilters';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Columns3,RotateCcw,Search,Pencil} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {Pager,RowSelectionCheckbox,SearchField,SortableHeader} from './TableControls';
import {ValueTable} from './ValueTable';
import {useQueryPage} from './useQueryPage';
import {koboApi,koboRequest} from './koboApi';
import {koboLabel,type KoboProject,type KoboQuestion,type KoboSettings,type KoboPivotDrilldown} from './koboTypes';
import {visibilityGroups} from './koboVisibility';
import KoboActionMenu from './KoboActionMenu';
import {koboCopyCell,useKoboCopy} from './koboClipboard';
import {TableSelectionActions} from './TableSelectionActions';
import './koboDataExplorer.css';

type DataPage={total:number;matched:number;rows:{id:string;row:number;values:Record<string,string>;rawValues?:Record<string,unknown>;conditionalWarnings?:Record<string,{status:'open'|'ignored'|'excluded';outcome:string;condition:string}>}[]};
export default function KoboDataExplorer({project,settings,groupId,questionSearch,drilldown,initialScope='',recordFocus}:{recordFocus?:{id:string;row:number;question:string;wholeRow?:boolean};project:KoboProject;settings:KoboSettings;groupId:string;questionSearch:string;drilldown?:KoboPivotDrilldown;initialScope?:string}){
 const[editing,setEditing]=useState(Boolean(recordFocus)),[cell,setCell]=useState<{question:KoboQuestion;record:string;row:number;value:unknown}|null>(null);
 const focusTable=useRef<HTMLElement>(null);
 const recordIds=recordFocus?[recordFocus.id]:undefined;
 const[scope,setScope]=useState(initialScope),[searchInput,setSearchInput]=useState(''),[search,setSearch]=useState(''),[columnSearch,setColumnSearch]=useState('');
 const[columns,setColumns]=useState<Record<string,boolean>>({}),[sort,setSort]=useState({column:'',direction:'asc' as 'asc'|'desc'}),[data,setData]=useState<DataPage|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const[selectedState,setSelectedState]=useState<{key:string;rows:Map<string,Record<string,unknown>>}>({key:'',rows:new Map()});
 const [columnFilters,setColumnFilters]=useColumnFilters(JSON.stringify([project.id,scope,drilldown,settings.language]));
 const schemaKey=JSON.stringify(project.form.questions.map(q=>[q.id,q.kind]));
 useEffect(()=>{const known=new Map(project.form.questions.map(q=>[q.id,recordColumnType(q.name,q.kind==='number'?'number':q.kind==='date'?'date':'text')]));const valid=columnFilters.filter(f=>f.column==='__row__'||known.get(f.column)===f.type);if(valid.length!==columnFilters.length)setColumnFilters(valid)},[schemaKey]);
 const cellText=(row:DataPage['rows'][number],qid:string)=>row.conditionalWarnings?.[qid]&&!String(row.values[qid]||'').trim()?(settings.language==='ar'?'فارغة':'Blank'):row.values[qid]||'';
 const copy=useKoboCopy();
 const showAllFields=Boolean(drilldown||recordFocus);
 const eligible=useMemo(()=>project.form.questions.filter(q=>showAllFields||!settings.hidden.includes(q.id)&&(!q.metadata||settings.metadata)),[project.form,settings.hidden,settings.metadata,showAllFields]);
 const scopes=useMemo(()=>[...new Set(['',...eligible.map(q=>q.repeat)])],[eligible]);
 useEffect(()=>{if(!drilldown&&!recordFocus&&!scopes.includes(scope))setScope('')},[scopes,scope,drilldown]);
 const groups=useMemo(()=>visibilityGroups(project,settings.language),[project.form,settings.language]);
 const candidates=useMemo(()=>{const ids=groupId==='@all'?null:new Set(groups.find(g=>g.id===groupId)?.questionIds||[]);return eligible.filter(q=>(q.repeat===scope||!!drilldown&&q.id===settings.questions[drilldown.question]?.calculation?.field)&&(!ids||ids.has(q.id)))},[eligible,scope,groupId,groups,drilldown,settings.questions]);
 const query=questionSearch.trim().normalize('NFC').toLocaleLowerCase();
 const visible=useMemo(()=>candidates.filter(q=>query?`${q.name} ${q.id} ${koboLabel(q,settings.language)}`.normalize('NFC').toLocaleLowerCase().includes(query):(columns[q.id]??true)),[candidates,columns,query,settings.language]);
 const columnMatches=candidates.filter(q=>`${q.name} ${koboLabel(q,settings.language)}`.toLocaleLowerCase().includes(columnSearch.toLocaleLowerCase()));
 const ids=visible.map(q=>q.id),sortColumn=ids.includes(sort.column)||sort.column==='__row__'?sort.column:'';
 const selectionKey=JSON.stringify([project.id,drilldown,scope,ids,searchInput,search,settings.filters,settings.language,columnFilters]);
 if(selectedState.key!==selectionKey)setSelectedState({key:selectionKey,rows:new Map()});
 const selected=selectedState.key===selectionKey?selectedState.rows:new Map<string,Record<string,unknown>>();
 const setSelected=(update:(current:Map<string,Record<string,unknown>>)=>Map<string,Record<string,unknown>>)=>setSelectedState(current=>({key:selectionKey,rows:update(current.key===selectionKey?current.rows:new Map())}));
 const[page,setPage]=useQueryPage(JSON.stringify([project.id,drilldown,scope,ids,search,sortColumn,sort.direction,settings.filters,settings.language,columnFilters]));
 useEffect(()=>{const timer=setTimeout(()=>setSearch(searchInput),250);return()=>clearTimeout(timer)},[searchInput]);
 const requestKey=JSON.stringify({recordIds,updated:project.updated,conditions:settings.questions,revision:project.dataRevision||0,drilldown,scope,columns:ids,search,sortColumn,sortDirection:sort.direction,columnFilters,page,pageSize:50,filters:settings.filters,language:settings.language});
 useEffect(()=>{
  if(!ids.length){setBusy(false);setData(null);setError('');return}
  const controller=new AbortController();setBusy(true);setError('');setData(null);
  koboRequest<DataPage>(`/projects/${project.id}/data`,{recordIds,settings,drilldown,scope,columns:ids,search,sortColumn,sortDirection:sort.direction,columnFilters,page,pageSize:50},'POST',controller.signal).then(result=>{if(!controller.signal.aborted)setData(result)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
  return()=>controller.abort();
 },[project.id,requestKey]);
 const filterColumns:FilterColumn[]=[{key:"",label:""},{key:"__row__",label:"Source row",type:"number"},...visible.map(q=>({key:q.id,label:koboLabel(q,settings.language),type:recordColumnType(q.name,q.kind==="number"?"number":q.kind==="date"?"date":"text")}))];
 const filterControl={showClearAll:false,filters:columnFilters,onChange:(next:typeof columnFilters)=>{setColumnFilters(next);setPage(1)},columns:filterColumns,loadValues:(column:string,valueSearch:string,offset:number,signal:AbortSignal)=>koboRequest<ValuePage>(`/projects/${project.id}/data/values`,{recordIds,settings,drilldown,scope,columns:ids,search,columnFilters,column,valueSearch,offset},"POST",signal)};
 const reset=()=>{setColumnFilters([]);setSearchInput('');setSearch('');setSort({column:'',direction:'asc'});setColumns({});setColumnSearch('')};
 const order=(column:string)=>setSort(current=>({column,direction:current.column===column&&current.direction==='asc'?'desc':'asc'}));
 const exportData=async(selectedOnly=false)=>{
  setError('');
  try{await koboApi.exportData(project.id,{recordIds,settings,drilldown,scope,columns:ids,search,sortColumn,sortDirection:sort.direction,columnFilters,...(selectedOnly?{selectedIds:[...selected.keys()]}:{})})}
  catch(reason){setError(reason instanceof Error?reason.message:String(reason))}
 };
 useEffect(()=>{if(recordFocus&&data?.rows.length)focusTable.current?.querySelector('[data-warning-cell="true"], [data-warning-row="true"]')?.scrollIntoView({block:'nearest',inline:'center'})},[data,recordFocus?.question]);
 return <section ref={focusTable} className="explorer-page kobo-data-explorer" aria-label="Response data explorer" dir="ltr" {...copy.events}>
  <div className="legal-table-card records-table-card kobo-response-table glass">
   <div className="legal-card-heading">
   {!drilldown&&!recordFocus&&scopes.length>1&&<AppSelect label="Response table" value={scope} onChange={value=>{setScope(value);setColumns({});setSort({column:'',direction:'asc'})}} options={scopes.map(id=>[id,id?`${koboLabel(project.form.groups.find(g=>g.id===id)||{name:id,labels:{}},settings.language)} · Repeat entries`:'Main responses'])}/>}
   <button type="button" className="soft kobo-data-edit-action" aria-pressed={editing} onClick={()=>setEditing(value=>!value)}><Pencil aria-hidden="true"/>{editing?'Finish editing':'Edit data'}</button>
   {project.canUndoEdit&&<button type="button" className="soft" onClick={()=>void undoDataEdit(project).catch(e=>setError(e.message))}><RotateCcw/>Undo last edit</button>}
   <button type="button" className="soft" disabled={!searchInput&&!sort.column&&!Object.keys(columns).length&&!columnFilters.length} onClick={reset}><RotateCcw aria-hidden="true"/>{'Reset table'}</button>
   <KoboActionMenu className="kobo-data-columns-menu" label="Columns" icon={<Columns3 aria-hidden="true"/>} closeOnSelect={false}><div className="kobo-data-column-picker"><label className="kobo-navigator-search"><Search aria-hidden="true"/><input aria-label="Find table columns" placeholder="Find a column…" value={columnSearch} onChange={event=>setColumnSearch(event.target.value)}/></label><div className="kobo-data-column-actions"><button type="button" className="soft" onClick={()=>setColumns(current=>({...current,...Object.fromEntries(candidates.map(q=>[q.id,true]))}))}>Show all</button><button type="button" className="soft" onClick={()=>setColumns({})}>Reset columns</button></div><div className="kobo-data-column-options">{columnMatches.map(q=><label key={q.id}><input type="checkbox" aria-label={`Show column ${q.name}`} checked={ids.includes(q.id)} disabled={Boolean(query)||ids.length===1&&ids[0]===q.id} onChange={event=>setColumns(current=>({...current,[q.id]:event.target.checked}))}/><span dir="auto">{koboLabel(q,settings.language)}<small>{q.name}</small></span></label>)}{!columnMatches.length&&<p className="kobo-data-column-empty" role="status">No matching columns.</p>}</div></div></KoboActionMenu>

    <SearchField label="Search responses" placeholder={'Search responses'} value={searchInput} onChange={setSearchInput}/>
    <div className="indicator-total-block detention-table-total"><strong>{(data?.matched??0).toLocaleString()}</strong><span>{'Total'}</span></div>
    <span className="kobo-data-status" role="status">{busy?'Loading responses…':`${visible.length} of ${candidates.length} columns${search?` · ${data?.matched??0} of ${data?.total??0} rows`:""}`}</span>
    <TableSelectionActions selected={selected} onResetFilters={()=>filterControl.onChange([])} hasActiveFilters={columnFilters.length>0} filename="kobo-response-data.xlsx" onClear={()=>setSelected(()=>new Map())} onDownloadAll={!busy&&ids.length&&data?.matched&&search===searchInput?()=>exportData():undefined} onDownloadSelected={()=>exportData(true)} iconOnly/>
    <Pager compact page={page} total={data?.matched||0} pageSize={50} onChange={setPage}/>
   </div>
   {error&&<p className="error" role="alert">{error}</p>}
   {!visible.length?<p className="kobo-data-empty" role="status">No question columns in this group or search. Choose All groups, another response table, or clear question search.</p>:<div className="legal-table-wrap" aria-busy={busy}><ValueTable key={JSON.stringify([project.id,scope,settings.language])} recordFilters={filterControl} filterColumns={filterColumns}><thead><tr>
    <th className="kobo-row-selection"><RowSelectionCheckbox label="Select visible responses" total={data?.rows.length??0} selectedCount={data?.rows.filter(row=>selected.has(row.id)).length??0} disabled={busy||searchInput!==search||!data?.rows.length} onChange={checked=>setSelected(current=>{const next=new Map(current);data?.rows.forEach(row=>{if(checked)next.set(row.id,{__rowKey:row.id});else next.delete(row.id)});return next})}/></th>
    <SortableHeader direction={sortColumn==='__row__'?sort.direction:undefined} onSort={()=>order('__row__')} buttonProps={{'aria-label':'Sort by source row',className:sortColumn==='__row__'?'active':''}}><span>Source row</span><b>{sortColumn==='__row__'?(sort.direction==='asc'?'▲':'▼'):'↕'}</b></SortableHeader>
    {visible.map(q=><SortableHeader key={q.id} direction={sortColumn===q.id?sort.direction:undefined} onSort={()=>order(q.id)} buttonProps={{'aria-label':`Sort by ${q.name}`,title:`${koboLabel(q,settings.language)} (${q.name})`,className:sortColumn===q.id?'active':''}}><span dir="auto">{koboLabel(q,settings.language)}</span><b>{sortColumn===q.id?(sort.direction==='asc'?'▲':'▼'):'↕'}</b></SortableHeader>)}
   </tr></thead><tbody>{data?.rows.map(row=><tr key={row.id} data-warning-row={recordFocus?.wholeRow&&recordFocus.id===row.id?true:undefined} className={recordFocus?.wholeRow&&recordFocus.id===row.id?'kobo-warning-source-row':selected.has(row.id)?'case-row-selected':''}>
    <td className="kobo-row-selection"><input type="checkbox" disabled={busy||searchInput!==search} aria-label={`Select response ${row.row}`} checked={selected.has(row.id)} onChange={()=>setSelected(current=>{const next=new Map(current);if(next.has(row.id))next.delete(row.id);else next.set(row.id,{__rowKey:row.id});return next})}/></td>
    <td {...koboCopyCell(String(row.row),settings.language)}>{row.row}</td>{visible.map(q=><td key={q.id} data-warning-cell={recordFocus?.question===q.id&&recordFocus.id===row.id&&!recordFocus.wholeRow?true:undefined} className={[recordFocus?.question===q.id&&recordFocus.id===row.id&&!recordFocus.wholeRow?'kobo-warning-source-cell':'',row.conditionalWarnings?.[q.id]?.outcome==='required-missing'?'is-required-blank':row.conditionalWarnings?.[q.id]?.outcome==='connected-blank'?'is-connected-blank':''].filter(Boolean).join(' ')||undefined} {...koboCopyCell(row.values[q.id]||'',settings.language)}>{editing&&editableField(q)&&q.repeat===scope?<button type="button" className="kobo-data-edit-cell" disabled={busy||searchInput!==search} aria-label={`Edit ${koboLabel(q,settings.language)}, source row ${row.row}`} onClick={()=>setCell({question:q,record:row.id,row:row.row,value:row.rawValues?.[q.id]})}>{cellText(row,q.id)||'Add value'}</button>:cellText(row,q.id)}{!recordFocus&&row.conditionalWarnings?.[q.id]&&<ConditionalBadge project={project.id} question={q.id} count={1} findingType={row.conditionalWarnings[q.id].outcome} category={['uncheckable','connection-setup-needed'].includes(row.conditionalWarnings[q.id].outcome)?'checks':['required-missing','connected-blank'].includes(row.conditionalWarnings[q.id].outcome)?'missing':'conflicts'} status={row.conditionalWarnings[q.id].status} language={settings.language}/>}</td>)}
   </tr>)}</tbody></ValueTable>{!busy&&!data?.rows.length&&<p className="kobo-data-empty" role="status">No responses match the current search and filters.</p>}</div>}
  </div>{cell&&<KoboCellEditor project={project} {...cell} onClose={()=>setCell(null)} onSaved={()=>{}}/>}{copy.notification}
 </section>;
}
