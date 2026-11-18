import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import KoboColorPickerDialog,{type ColorPickerAnchor} from './KoboColorPickerDialog';
import {normalizeHex} from './koboCustomizeOptions';
import {rememberChartColor} from './koboRecentColors';
import type {KoboQuestionSettings} from './koboTypes';

type Props={
 entry:{id:string;label:string};
 value:string;
 palette?:KoboQuestionSettings['palette'];
 disabled:boolean;
 onChange:(value:string)=>void;
 paletteCard?:{selected:boolean};
};

export default function ColorControl({entry,value,palette,disabled,onChange,paletteCard}:Props){
 const[anchor,setAnchor]=useState<ColorPickerAnchor|null>(null),[hex,setHex]=useState(value);
 const valid=normalizeHex(hex),displayHex=value.toUpperCase();
 const close=()=>setAnchor(null);
 const apply=()=>{
  if(disabled||!valid)return;
  rememberChartColor(valid);
  onChange(valid);
  close();
 };
 return <div className={paletteCard?'kobo-palette-picker':'kobo-color-row'}>
  {!paletteCard&&<span dir="auto">{entry.label}</span>}
  <div className="kobo-color-control">
   <button type="button" className={paletteCard?'kobo-palette-card':'app-select-trigger'} disabled={disabled} aria-label={`Color for ${entry.label}`} aria-pressed={paletteCard?.selected} aria-haspopup="dialog" aria-expanded={!!anchor} onClick={event=>{
    const box=event.currentTarget.getBoundingClientRect();
    setHex(value);
    setAnchor({x:box.left-12,y:box.bottom+8});
   }}>
    {paletteCard?<><span className="kobo-palette-picker-label"><span>{entry.label}</span><ChevronDown aria-hidden="true"/></span><small>{displayHex}</small><span className="kobo-palette-swatches"><i style={{background:value}}/></span></>:<><i style={{background:value}}/><span>{displayHex}</span><ChevronDown aria-hidden="true"/></>}
   </button>
  </div>
  {anchor&&<KoboColorPickerDialog label={entry.label} anchor={anchor} hex={hex} hexLabel={`HEX color for ${entry.label}`} colorLabel={`Choose color for ${entry.label}`} palette={palette} canApply={!disabled&&(valid!==normalizeHex(value)||paletteCard?.selected===false)} note="Apply to update the customization preview." resetLabel="Reset preview" onColor={setHex} onReset={()=>setHex(value)} onApply={apply} onClose={close}/>}
 </div>;
}
