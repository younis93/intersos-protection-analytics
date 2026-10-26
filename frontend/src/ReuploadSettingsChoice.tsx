import './reuploadSettings.css';

export type ImportReuse={eligible:boolean;reasons:string[]};

export default function ReuploadSettingsChoice({reuse,onChange,disabled=false}:{reuse:boolean;onChange:(reuse:boolean)=>void;disabled?:boolean}){
 return <fieldset className="reupload-settings" disabled={disabled}><legend>Settings for this update</legend>
  <label><input type="radio" name="reupload-settings" checked={reuse} onChange={()=>onChange(true)}/><span><strong>Keep previous settings and update data</strong><small>Compatible files update directly. Changes or issues open review.</small></span></label>
  <label><input type="radio" name="reupload-settings" checked={!reuse} onChange={()=>onChange(false)}/><span><strong>Review and adjust settings</strong><small>Review the saved setup before applying the new data.</small></span></label>
 </fieldset>;
}

export function ReuploadReviewNotice({reasons}:{reasons:string[]}){
 return <section className="reupload-review-notice" role="status" tabIndex={-1}><strong>Review needed before updating data</strong><p>Your previous settings and uploaded file are ready below. Review the details before applying the update.</p><ul>{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></section>;
}
