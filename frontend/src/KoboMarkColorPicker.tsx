import {useKoboUnsavedChanges} from './useKoboUnsavedChanges';
import {markColorKey,usesPointColor} from './koboMarkColors';
import {useRef} from 'react';
import KoboColorPickerDialog,{type ColorPickerAnchor} from './KoboColorPickerDialog';
import {rememberChartColor} from './koboRecentColors';
import {AppSelect} from './SelectionControls';
import {normalizeHex} from './koboCustomizeOptions';
import {koboScreenChartRows} from './koboChartDensity';
import type {KoboMarkTarget} from './koboMarkColors';
import type {KoboQuestionSettings,KoboResult} from './koboTypes';

export type KoboMarkEdit={target:KoboMarkTarget;hex:string;value?:string|null;anchor:ColorPickerAnchor};
export default function KoboMarkColorPicker({result,settings,edit,onTarget,onColor,onReset,onApply,onClose}:{result:KoboResult;settings:KoboQuestionSettings;edit:KoboMarkEdit;onTarget:(target:KoboMarkTarget)=>void;onColor:(value:string)=>void;onReset:()=>void;onApply:()=>void;onClose:()=>void}){
 const valid=normalizeHex(edit.hex),rows=koboScreenChartRows(result);
 const apply=()=>{if(valid&&edit.value!=null)rememberChartColor(valid);onApply()};
 const initial=useRef({target:JSON.stringify(edit.target),hex:edit.hex});
 if(initial.current.target!==JSON.stringify(edit.target))initial.current={target:JSON.stringify(edit.target),hex:edit.hex};
 const dirty=!valid||edit.value===null&&!!(usesPointColor(result)?settings.pointColors?.[markColorKey(result,edit.target)]:settings.colors[edit.target.answer])||edit.value!==undefined&&edit.value!==null&&valid!==normalizeHex(initial.current.hex);
 const {requestClose,confirmation}=useKoboUnsavedChanges({dirty,canSave:!!valid&&edit.value!==undefined,onSave:apply,onClose,reason:!valid?'Correct the invalid HEX color before saving.':''});
 return <><KoboColorPickerDialog label={result.label} anchor={edit.anchor} hex={edit.hex} hexLabel="Chart color HEX" colorLabel="Choose chart color" palette={settings.palette} canApply={edit.value!==undefined} note={`Preview only until you apply. Changes affect this mark only.${result.chart==='line'?' The connecting line keeps its color.':''}`} onColor={onColor} onReset={onReset} onApply={apply} onClose={requestClose}>
  <AppSelect label="Answer" ariaLabel="Chart color answer" searchable value={edit.target.answer} options={rows.map(row=>[row.id,row.label])} onChange={answer=>onTarget({...edit.target,answer})}/>
  {result.breakdowns.length>0&&<AppSelect label="Breakdown" ariaLabel="Chart color breakdown" searchable value={edit.target.breakdown||''} options={result.breakdowns.map(column=>[column.id,column.label])} onChange={breakdown=>onTarget({...edit.target,breakdown})}/>}
 </KoboColorPickerDialog>{confirmation}</>;
}
