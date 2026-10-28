import {AnimatedActionIcon} from './AnimatedActionIcon';
import {useState} from 'react';

import {ExcelDownloadButton} from './SelectionControls';
import {exportTableWorkbook} from './api';
export function TableResetButton({onReset,disabled=false,iconOnly=false,combined=true}:{onReset:()=>void;disabled?:boolean;iconOnly?:boolean;combined?:boolean}){
  const label=combined?'Clear filters and selection':'Clear selected records';
  return <button type="button" className={`soft table-reset-button${iconOnly?" is-icon-only":""}`} disabled={disabled} onClick={onReset} aria-label={label} title={label}>{iconOnly?<AnimatedActionIcon type="reset" size={15}/>:combined?'Clear':'Clear selection'}</button>;
}

export function TableSelectionActions({selected,filename,onClear,onResetFilters,hasActiveFilters=false,showActions=true,iconOnly=false,onDownloadAll,onDownloadSelected}:{selected:Map<string,Record<string,unknown>>;filename:string;onClear:()=>void;onResetFilters?:()=>void;hasActiveFilters?:boolean;showActions?:boolean;iconOnly?:boolean;onDownloadAll?:()=>Promise<void>;onDownloadSelected?:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const rows=Array.from(selected.values()).map((row)=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith("__")))),columns=Array.from(new Set(rows.flatMap((row)=>Object.keys(row)))),hasSelection=rows.length>0,downloadLabel=hasSelection?"Download selected records":"Download all filtered records";
  const download=async()=>{setBusy(true);try{if(hasSelection){if(onDownloadSelected)await onDownloadSelected();else await exportTableWorkbook(filename,columns,rows)}else await onDownloadAll?.()}finally{setBusy(false)}};
  return <div className={`table-selection-actions${onResetFilters?" has-table-reset":""}${iconOnly?" icon-only":""}`}><span>{rows.length} selected</span>{showActions&&<><TableResetButton iconOnly={iconOnly} combined={Boolean(onResetFilters)} disabled={!hasSelection&&!(onResetFilters&&hasActiveFilters)} onReset={()=>{onClear();onResetFilters?.()}}/><ExcelDownloadButton onClick={download} busy={busy} disabled={!hasSelection&&!onDownloadAll} title={downloadLabel}>{iconOnly?null:(hasSelection?"Download selected":"Download all")}</ExcelDownloadButton></>}</div>;
}
