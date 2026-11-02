import './reuploadSettings.css';

export type ImportReuse={eligible:boolean;reasons:string[]};

export default function ReuploadSettingsChoice({reuse,onChange,disabled=false}:{reuse:boolean;onChange:(reuse:boolean)=>void;disabled?:boolean}){
 return <fieldset className="reupload-settings" disabled={disabled}><label><input type="checkbox" checked={reuse} onChange={event=>onChange(event.target.checked)}/><span><strong>Keep my settings</strong><small>Use the saved setup for this update.</small></span></label></fieldset>;
}

export function ReuploadReviewNotice({reasons}:{reasons:string[]}){
 return <section className="reupload-review-notice" role="status" tabIndex={-1}><strong>Check these items</strong><ul>{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></section>;
}
