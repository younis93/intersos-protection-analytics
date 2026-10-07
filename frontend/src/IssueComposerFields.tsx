import type {SenderDetails} from './issueComposerSettings';

export function SenderFields({value,onChange,onSave,showSave=true}:{value:SenderDetails;onChange:(value:SenderDetails)=>void;onSave:()=>void;showSave?:boolean}){
  return <fieldset className="si-sender-fields"><legend>Sender details</legend>{(['name','role','organization'] as const).map(key=><label key={key}>{({name:'Name',role:'Role',organization:'Organization'})[key]}<input value={value[key]} onChange={event=>onChange({...value,[key]:event.target.value})}/></label>)}<label>Additional signature<textarea rows={2} value={value.signature} onChange={event=>onChange({...value,signature:event.target.value})}/></label>{showSave&&<button type="button" className="soft" onClick={onSave}>Save sender details</button>}<small>Saved on this computer. Changes apply to this message until saved.</small></fieldset>;
}
