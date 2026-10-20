import './koboValueSelector.css';

/** Shared native-button group for question and report display settings. */
export default function KoboSegmentedControl<T extends string|number>({label,value,options,onChange,disabled=false}:{label:string;value:T|null;options:readonly (readonly [T,string,string])[];onChange:(value:T)=>void;disabled?:boolean}){
 return <div className="kobo-value-selector" role="group" aria-label={label}>{options.map(([option,text,title])=><button type="button" key={option} disabled={disabled} aria-label={title} aria-pressed={value===option} title={title} onClick={()=>onChange(option)}>{text}</button>)}</div>;
}
