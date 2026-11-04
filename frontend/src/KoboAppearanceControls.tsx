import {useId} from 'react';
import './koboAppearanceControls.css';
import KoboBulkSettingHeading from './KoboBulkSettingHeading';
import {RotateCcw} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {appearanceDefaults,resolveAppearance,type KoboAppearance} from './koboAppearance';
const controls:{key:keyof KoboAppearance;label:string;options:[string,string][]}[]=[
 {key:'metric',label:'Chart values',options:[['auto','Automatic'],['count','Count (#)'],['percent','Percentage (%)']]},
 {key:'labels',label:'Data labels',options:[['auto','Automatic'],['hidden','Hide count and percentage text'],['count','Count'],['percent','Percentage'],['both','Both']]},
 {key:'legend',label:'Legend',options:[['auto','Automatic'],['hidden','Hidden'],['top','Top'],['bottom','Bottom'],['left','Left'],['right','Right']]},
 {key:'fontSize',label:'Font size',options:[['0','Automatic'],...['10','12','14','16'].map(n=>[n,n] as [string,string])]},
 {key:'height',label:'Chart height',options:[['0','Automatic'],...['320','420','560','720'].map(n=>[n,`${n} px`] as [string,string])]},
 {key:'valueAxis',label:'Value axis scale',options:[['show','Show'],['hide','Hide']]},
 {key:'grid',label:'Gridlines',options:[['auto','Automatic'],['show','Show'],['hide','Hide']]},
 {key:'bars',label:'Breakdown bars',options:[['group','Grouped'],['stack','Stacked']]},
];
export default function KoboAppearanceControls({value,onChange,chart,breakdowns,measured=false,bulk=false,sharedValues,mixedKeys=[],showTitle=true}:{value?:KoboAppearance;onChange:(value:KoboAppearance)=>void;chart:string;breakdowns:boolean;measured?:boolean;bulk?:boolean;sharedValues?:KoboAppearance;mixedKeys?:(keyof KoboAppearance)[];showTitle?:boolean}){
 const resolved=resolveAppearance(value),radioId=useId();
 return <><h3>Reporting appearance</h3><p>{bulk?'Edit any appearance setting. Only changed settings will apply.':'Style this chart without changing pivot values or response totals.'}</p>
  {showTitle&&<div className="kobo-appearance-control">{bulk&&<KoboBulkSettingHeading label="Chart title" changed={value?.title!==undefined} mixed={value?.title===undefined&&mixedKeys.includes('title')} onUndo={()=>{const next={...value};delete next.title;onChange(next)}}/>}<label><span className="kobo-chart-title-label">Chart title <small>Optional</small></span><input type="text" dir="auto" aria-label="Chart title (optional)" maxLength={200} value={value?.title??(bulk?sharedValues?.title:resolved.title)??''} placeholder={bulk&&value?.title===undefined&&mixedKeys.includes('title')?'Mixed titles':'Enter a chart title'} onChange={event=>onChange({...value,title:event.target.value})}/></label><small>Leave blank to show the chart without a title.</small></div>}
  {controls.filter(control=>!(measured&&['metric','bars'].includes(control.key))).map(control=>measured&&control.key==='labels'?{...control,options:[['auto','Show value'],['hidden','Hide count and percentage text']] as [string,string][]}:control).filter(control=>bulk||control.key!=='bars'||['bar','column'].includes(chart)&&breakdowns).map(control=>{
   const changed=value?.[control.key]!==undefined,mixed=bulk&&!changed&&mixedKeys.includes(control.key),unsupported=['grid','valueAxis'].includes(control.key)&&['pie','donut'].includes(chart);
   const selection=mixed?'__mixed__':String(changed?value![control.key]:bulk?sharedValues?.[control.key]??appearanceDefaults[control.key]:resolved[control.key]);
   return <div className="kobo-appearance-control" key={control.key}>{bulk&&<KoboBulkSettingHeading label={control.label} changed={changed} mixed={mixed} onUndo={()=>{const next={...value};delete next[control.key];onChange(next)}}/>}{control.options.length===2?<fieldset className="kobo-appearance-radios" disabled={!bulk&&unsupported}><legend>{control.label}</legend>{mixed&&<small className="kobo-appearance-mixed">Mixed values - choose an option to apply</small>}<div>{control.options.map(([id,label])=><label key={id} className={selection===id?'is-selected':''}><input type="radio" name={`${radioId}-${control.key}`} value={id} checked={selection===id} onChange={()=>onChange({...value,[control.key]:id})}/><span>{label}</span></label>)}</div></fieldset>:<AppSelect label={control.label} disabled={!bulk&&unsupported} value={selection} options={mixed?[['__mixed__','Mixed values'],...control.options]:control.options} onChange={selection=>{if(selection!=='__mixed__')onChange({...value,[control.key]:['fontSize','height'].includes(control.key)?Number(selection):selection})}}/>}{control.key==='labels'&&<small>Hide count and percentage text on the chart. Axis labels, hover details, and table values remain available.</small>}</div>;
  })}
  <p className="kobo-appearance-hint">Gridlines apply to charts with axes. Stacked bars apply to bar and column charts with breakdowns. {measured?'Calculated values use the selected measure and decimal precision.':'Percentages use answered respondents; multi-select and stacked totals can exceed 100%.'}</p>
  <button type="button" className="soft" onClick={()=>onChange({})}><RotateCcw aria-hidden="true"/>{bulk?'Undo appearance changes':'Reset appearance'}</button>
 </>;
}
