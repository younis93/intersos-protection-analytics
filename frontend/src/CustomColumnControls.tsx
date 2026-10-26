import {useState} from 'react';
import {CalendarDays,Hash,ListChecks,List,Type,Clock} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import type {CustomColumn,CustomConfig,CustomProfile} from './CustomColumnSetup';
import {delimiterOptions,delimiterPreset,delimiterPresets,customKindLabel} from './customImportReviewState';

export const columnTypes:[CustomColumn['kind'],string][]=[['text','Text'],['number','Number'],['date','Date'],['category','Category'],['multiple','Multiple choice']];
export const dateConventions:[CustomConfig['dateFormat'],string][]=[['auto','Detect automatically'],['uk','UK - day/month/year'],['us','US - month/day/year'],['iso','ISO - year-month-day']];
const typeIcons={text:Type,number:Hash,date:CalendarDays,category:List,multiple:ListChecks};
export function ColumnTypeBadge({kind}:{kind:CustomColumn['kind']}){const Icon=typeIcons[kind];return <span className="custom-type-badge"><Icon aria-hidden="true"/>{customKindLabel(kind)}</span>}
export const columnOptionLabel=(column:Pick<CustomColumn,'label'|'kind'>)=>`${column.label} · ${customKindLabel(column.kind)}`;
export const showValue=(value:unknown)=>value===null||value===undefined?'Missing':Array.isArray(value)?value.join(', '):String(value);
export function showDate(value:unknown){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):showValue(value)}

type Props={column:CustomColumn;change:(patch:Partial<CustomColumn>)=>void;busy?:boolean};
export function ColumnInterpretationControls({column,change,busy=false,fileConvention='auto'}:Props&{fileConvention?:CustomConfig['dateFormat']}){
 const [custom,setCustom]=useState(false);
 if(column.kind==='date')return <div className="custom-date-controls"><AppSelect label="Column date convention" value={column.dateFormat} options={[["auto","Use file convention / detect"],...dateConventions.slice(1)]} onChange={value=>change({dateFormat:value as CustomColumn['dateFormat'],invalidAsMissing:false})} disabled={busy}/><p className="custom-control-hint">File convention: {dateConventions.find(([id])=>id===fileConvention)?.[1]}. {column.dateFormat==='auto'?'This column uses the file convention.':'This column overrides the file convention.'}</p><div className="custom-time-option"><label className="custom-check"><input type="checkbox" disabled={busy} checked={column.includeTime} onChange={e=>change({includeTime:e.target.checked})}/><Clock size={17}/>Include time in a separate column</label><p>Extract the source clock time. Dates without a time leave the new column blank. No timezone conversion is applied.</p>{column.includeTime&&<label className="kobo-field">Time column label<input disabled={busy} aria-label="Time column label" maxLength={1000} value={column.timeLabel} placeholder={column.label+' - Time'} onChange={e=>change({timeLabel:e.target.value})}/></label>}</div></div>;
 if(column.kind==='multiple')return <div className="custom-delimiter-controls"><AppSelect label="Answer delimiter" value={custom?'custom':delimiterPreset(column.separator)} options={delimiterOptions} disabled={busy} onChange={value=>{setCustom(value==='custom');change({separator:value==='custom'?(delimiterPreset(column.separator)==='custom'?column.separator:''):delimiterPresets.find(p=>p.id===value)?.value||''})}}/>{(custom||delimiterPreset(column.separator)==='custom')&&<label className="kobo-field">Custom delimiter<input disabled={busy} aria-label="Custom answer delimiter" value={column.separator} maxLength={20} placeholder="Enter the exact separator" onChange={e=>change({separator:e.target.value})}/></label>}<p className="custom-control-hint">Choose the exact separator between answers. Empty parts and repeated answers are removed.</p></div>;
 return null;
}
export function ColumnValueLabels({column,profile,change,busy=false}:Props&{profile?:CustomProfile}){
 if(!profile||!['category','multiple'].includes(column.kind))return null;
 return <details className="custom-categories"><summary>Edit value labels {profile.valuesTruncated?'(first 200 shown)':''}</summary><p>Use the same label to combine values. Clear a label to exclude that value.</p>{profile.values.map(value=><label key={value}><span dir="auto">{value}</span><input disabled={busy} aria-label={`Label for ${value}`} value={column.categories[value]??value} onChange={e=>change({categories:{...column.categories,[value]:e.target.value}})}/></label>)}</details>;
}
export function ColumnInvalidPolicy({column,profile,change,busy=false}:Props&{profile?:CustomProfile}){
 if(!column.included||!profile?.invalid||profile.ambiguous)return null;
 return <div className="custom-invalid-policy"><label className="custom-check"><input disabled={busy} type="checkbox" checked={column.invalidAsMissing} onChange={e=>change({invalidAsMissing:e.target.checked})}/>Treat invalid values as missing in calculations</label><p>Review the affected source values in the preview before accepting this policy.</p></div>;
}
export function ColumnIssues({profile}:{profile:CustomProfile}){return profile.invalid>0?<section className="custom-conversion-issues" role="status"><h4>{profile.invalid} values need review</h4>{profile.ambiguous&&<p>These dates could use UK or US format. Select a convention before saving.</p>}<ul>{profile.examples.map((value,i)=><li key={i}>Row {value.row}: <strong dir="auto">{value.value}</strong> - {value.reason}</li>)}</ul></section>:null}
export function InterpretedValue({column,value}:{column:CustomColumn;value:unknown}){return column.kind==='date'?showDate(value):column.kind==='multiple'?!column.separator?<span className="custom-split-pending">Choose a delimiter to preview answers</span>:Array.isArray(value)?<div className="custom-split-answers">{value.map((answer,i)=><span key={i} dir="auto">{showValue(answer)}</span>)}</div>:showValue(value):showValue(value)}
