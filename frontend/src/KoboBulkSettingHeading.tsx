import {RotateCcw} from 'lucide-react';
export default function KoboBulkSettingHeading({label,changed,mixed=false,onUndo}:{label:string;changed:boolean;mixed?:boolean;onUndo:()=>void}){
 return <div className="kobo-bulk-setting-heading"><h4>{label}</h4><div>{changed?<><span className="kobo-bulk-changed">Changed</span><button type="button" className="soft" aria-label={`Undo ${label.toLowerCase()}`} onClick={onUndo}><RotateCcw aria-hidden="true"/>Undo</button></>:mixed?<span className="kobo-bulk-mixed">Mixed values</span>:null}</div></div>;
}
