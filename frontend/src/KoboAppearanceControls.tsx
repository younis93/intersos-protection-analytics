import KoboBulkSettingHeading from './KoboBulkSettingHeading';
import {RotateCcw} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {appearanceDefaults,resolveAppearance,type KoboAppearance} from './koboAppearance';
const controls:{key:keyof KoboAppearance;label:string;options:[string,string][]}[]=[
 {key:'metric',label:'Chart values',options:[['auto','Automatic'],['count','Count (#)'],['percent','Percentage (%)']]},
 {key:'labels',label:'Data labels',options:[['auto','Automatic'],['hidden','Hidden'],['count','Count'],['percent','Percentage'],['both','Both']]},
 {key:'legend',label:'Legend',options:[['auto','Automatic'],['hidden','Hidden'],['top','Top'],['bottom','Bottom'],['left','Left'],['right','Right']]},
 {key:'fontSize',label:'Font size',options:[['0','Automatic'],...['10','12','14','16'].map(n=>[n,n] as [string,string])]},
 {key:'height',label:'Chart height',options:[['0','Automatic'],...['320','420','560','720'].map(n=>[n,`${n} px`] as [string,string])]},
 {key:'grid',label:'Gridlines',options:[['auto','Automatic'],['show','Show'],['hide','Hide']]},
 {key:'bars',label:'Breakdown bars',options:[['group','Grouped'],['stack','Stacked']]},
];
export default function KoboAppearanceControls({value,onChange,chart,breakdowns,bulk=false,sharedValues,mixedKeys=[]}:{value?:KoboAppearance;onChange:(value:KoboAppearance)=>void;chart:string;breakdowns:boolean;bulk?:boolean;sharedValues?:KoboAppearance;mixedKeys?:(keyof KoboAppearance)[]}){
 const resolved=resolveAppearance(value);
 return <><h3>Reporting appearance</h3><p>{bulk?'Edit any appearance setting. Only changed settings will apply.':'Style this chart without changing pivot values or response totals.'}</p>
  {controls.filter(control=>bulk||control.key!=='bars'||['bar','column'].includes(chart)&&breakdowns).map(control=>{
   const changed=value?.[control.key]!==undefined,mixed=bulk&&!changed&&mixedKeys.includes(control.key),unsupported=control.key==='grid'&&['pie','donut'].includes(chart);
   const selection=mixed?'__mixed__':String(changed?value![control.key]:bulk?sharedValues?.[control.key]??appearanceDefaults[control.key]:resolved[control.key]);
   return <div className="kobo-appearance-control" key={control.key}>{bulk&&<KoboBulkSettingHeading label={control.label} changed={changed} mixed={mixed} onUndo={()=>{const next={...value};delete next[control.key];onChange(next)}}/>}<AppSelect label={control.label} disabled={!bulk&&unsupported} value={selection} options={mixed?[['__mixed__','Mixed values'],...control.options]:control.options} onChange={selection=>{if(selection!=='__mixed__')onChange({...value,[control.key]:['fontSize','height'].includes(control.key)?Number(selection):selection})}}/></div>;
  })}
  <p className="kobo-appearance-hint">Gridlines apply to charts with axes. Stacked bars apply to bar and column charts with breakdowns. Percentages use answered respondents; multi-select and stacked totals can exceed 100%.</p>
  <button type="button" className="soft" onClick={()=>onChange({})}><RotateCcw aria-hidden="true"/>{bulk?'Undo appearance changes':'Reset appearance'}</button>
 </>;
}
