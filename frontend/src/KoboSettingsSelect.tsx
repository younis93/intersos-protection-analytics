import {useId,type ComponentProps} from 'react';
import {AppSelect} from './SelectionControls';

export default function KoboSettingsSelect(props:ComponentProps<typeof AppSelect>){
 const name=useId();
 const choices=props.options.filter(([id])=>id!=='__mixed__');
 if(choices.length!==2)return <AppSelect {...props} preserveOrder/>;
 return <fieldset className="kobo-appearance-radios" disabled={props.disabled}>
  <legend>{props.ariaLabel||props.label}</legend>
  {props.value==='__mixed__'&&<small className="kobo-appearance-mixed">Mixed values - choose an option to apply</small>}
  <div>{choices.map(([id,label])=><label key={id} className={props.value===id?'is-selected':''}>
   <input type="radio" name={name} value={id} checked={props.value===id} onChange={()=>props.onChange(id)}/>
   <span>{label}</span>
  </label>)}</div>
 </fieldset>;
}
