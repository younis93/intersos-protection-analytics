import {useState} from 'react';
import {RotateCcw} from 'lucide-react';
import {ExcelDownloadButton} from './SelectionControls';
import {exportTableWorkbook} from './api';
export function TableSelectionActions({selected,filename,onClear,showActions=true,iconOnly=false,onDownloadAll,onDownloadSelected}:{selected:Map<string,Record<string,unknown>>;filename:string;onClear:()=>void;showActions?:boolean;iconOnly?:boolean;onDownloadAll?:()=>Promise<void>;onDownloadSelected?:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const rows=Array.from(selected.values()).map((row)=>Object.fromEntries(Object.entries(row).filter(([key])=>!key.startsWith("__")))),columns=Array.from(new Set(rows.flatMap((row)=>Object.keys(row)))),hasSelection=rows.length>0,downloadLabel=hasSelection?"Download selected records":"Download all filtered records";
  const download=async()=>{setBusy(true);try{if(hasSelection){if(onDownloadSelected)await onDownloadSelected();else await exportTableWorkbook(filename,columns,rows)}else await onDownloadAll?.()}finally{setBusy(false)}};
  return <div className={`table-selection-actions${iconOnly?" icon-only":""}`}><span>{rows.length} selected</span>{showActions&&<><button className="soft" disabled={!rows.length} onClick={onClear} aria-label="Clear selected records" title="Clear selected records">{iconOnly?<RotateCcw/>:"Clear selection"}</button><ExcelDownloadButton onClick={download} busy={busy} disabled={!hasSelection&&!onDownloadAll} title={downloadLabel}>{iconOnly?null:(hasSelection?"Download selected":"Download all")}</ExcelDownloadButton></>}</div>;
}
