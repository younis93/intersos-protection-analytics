import {useId,type ReactNode} from 'react';
import './koboAppearanceControls.css';
import KoboBulkSettingHeading from './KoboBulkSettingHeading';
import {RotateCcw} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import KoboSettingsSelect from './KoboSettingsSelect';
import {supportsBarLabelPosition} from './koboDataLabels';
import {appearanceDefaults,koboAnswerSizeOptions,koboChartFonts,resolveAppearance,type KoboAppearance} from './koboAppearance';
const controls:{key:keyof KoboAppearance;label:string;options:[string,string][]}[]=[
 {key:'labelPosition',label:'Value label position',options:[['outside','Outside'],['inside','Inside']]},
 {key:'zeroPercentLabels',label:'0% labels',options:[['show','Show'],['hide','Hide']]},
 {key:'legend',label:'Legend',options:[['auto','Automatic'],['top','Top'],['bottom','Bottom'],['left','Left'],['right','Right'],['hidden','Hidden']]},
 {key:'fontFamily',label:'Chart font',options:[...koboChartFonts].sort().map(font=>[font,font])},
 {key:'fontSize',label:'Answer size',options:koboAnswerSizeOptions('Automatic')},
 {key:'height',label:'Chart height',options:[['0','Automatic'],...['320','420','560','720'].map(n=>[n,`${n} px`] as [string,string])]},
 {key:'valueAxis',label:'Value axis scale',options:[['show','Show'],['hide','Hide']]},
 {key:'categoryLabels',label:'Category label wrapping',options:[['wrap','Wrap'],['truncate','Truncate'],['rotate','Rotate']]},
 {key:'grid',label:'Gridlines',options:[['show','Show'],['hide','Hide']]},
 {key:'bars',label:'Breakdown bars',options:[['group','Grouped'],['stack','Stacked']]},
];
export type AppearanceContext={
 chart:string;
 breakdowns:boolean;
 appearance?:KoboAppearance;
 measured?:boolean;
 calculated?:boolean;
 legacyMeasure?:boolean;
 trend?:boolean;
};

type AppearanceKey=keyof KoboAppearance;
const groups:{title:string;keys:AppearanceKey[]}[]=[
 {title:'Typography',keys:['fontFamily','fontSize']},
 {title:'Values & labels',keys:['labelPosition','zeroPercentLabels']},
 {title:'Chart layout',keys:['valueAxis','grid','legend','height','categoryLabels','bars']},
];

export function gridlineChoice(grid:KoboAppearance['grid'],chart:string){
 return grid==='show'||grid==='hide'?grid:chart==='heatmap'?'hide':'show';
}

export function appearanceSettingApplies(key:AppearanceKey,context:AppearanceContext){
 const {chart,breakdowns,measured,calculated,legacyMeasure,trend}=context;
 const {labels,metric}=resolveAppearance(context.appearance);
 const slices=chart==='pie'||chart==='donut';
 switch(key){
  case 'metric':return !measured&&!legacyMeasure;
  case 'labelPosition':return labels!=='hidden'&&supportsBarLabelPosition(chart);
  case 'zeroPercentLabels':
   return labels!=='hidden'&&!measured&&!legacyMeasure&&(calculated
    ?metric==='percent'||labels==='both'
    :labels==='percent'||labels==='both'||labels==='auto'&&metric==='percent');
  case 'valueAxis':return !slices&&chart!=='heatmap'&&(!trend||!!calculated);
  case 'categoryLabels':return !slices&&!trend;
  case 'grid':return !slices;
  case 'legend':return chart!=='heatmap'&&(!calculated||breakdowns&&!trend);
  case 'bars':return !calculated&&!measured&&breakdowns&&(chart==='bar'||chart==='column');
  default:return true;
 }
}

type ChartValueChoice='count'|'percent'|'both'|'count-hidden'|'percent-hidden'|'value'|'value-hidden';
const chartValueSettings:Record<ChartValueChoice,Pick<KoboAppearance,'metric'|'labels'>>={
 count:{metric:'count',labels:'count'},
 percent:{metric:'percent',labels:'percent'},
 both:{metric:'count',labels:'both'},
 'count-hidden':{metric:'count',labels:'hidden'},
 'percent-hidden':{metric:'percent',labels:'hidden'},
 value:{metric:'count',labels:'auto'},
 'value-hidden':{metric:'count',labels:'hidden'},
};

function chartValueChoice(context:AppearanceContext):ChartValueChoice|'custom'{
 const {metric,labels}=resolveAppearance(context.appearance);
 if(context.measured||context.legacyMeasure)return labels==='hidden'?'value-hidden':'value';
 const percent=metric==='percent';
 if(labels==='hidden')return percent?'percent-hidden':'count-hidden';
 if(labels==='both')return percent?'custom':'both';
 if(context.calculated||labels==='auto'||labels===(percent?'percent':'count'))return percent?'percent':'count';
 return 'custom';
}

export default function KoboAppearanceControls({
 value,onChange,chart,breakdowns,measured=false,calculated=false,legacyMeasure=false,trend=false,
 bulk=false,sharedValues,mixedKeys=[],showTitle=true,typography,targets,
}:AppearanceContext&{
 value?:KoboAppearance;onChange:(value:KoboAppearance)=>void;bulk?:boolean;sharedValues?:KoboAppearance;
 mixedKeys?:AppearanceKey[];showTitle?:boolean;typography?:ReactNode;targets?:AppearanceContext[];
}){
 const resolved=resolveAppearance(value),radioId=useId();
 const contexts=targets??[{chart,breakdowns,measured,calculated,legacyMeasure,trend,appearance:value}];
 const changeSelection=(key:AppearanceKey,selection:string)=>{
  if(selection==='__mixed__')return;
  const next={...value,[key]:key==='fontSize'||key==='height'?Number(selection):selection};
  if(key==='fontFamily'&&!bulk)next.titleFont='inherit';
  onChange(next);
 };
 const undo=(key:AppearanceKey)=>{const next={...value};delete next[key];onChange(next)};
 const valueOnly=contexts.length>0&&contexts.every(context=>context.measured||context.legacyMeasure);
 const valueWord=contexts.length>0&&contexts.every(context=>context.calculated)?'Value':'Count';
 const chartValuesChanged=value?.metric!==undefined||value?.labels!==undefined;
 const choiceContexts=valueOnly?contexts:contexts.filter(context=>!context.measured&&!context.legacyMeasure);
 const choices=choiceContexts.map(chartValueChoice);
 const customCombinations=choiceContexts.filter((_,index)=>choices[index]==='custom').map(({appearance})=>{
  const {metric,labels}=resolveAppearance(appearance);
  return `${metric==='percent'?'percent':'count'}:${labels}`;
 });
 const mixedChoices=choices.some(choice=>choice!==choices[0])||new Set(customCombinations).size>1;
 const selectedChoice=mixedChoices?'__mixed__':choices[0]??'count';
 const chartValueOptions:[string,string][]=valueOnly?[['value','Show value'],['value-hidden','Hide value']]:[
  ['count',valueWord==='Count'?'Count (#)':'Value'],['percent','Percentage (%)'],['both',`${valueWord} & percentage`],
  ['count-hidden',`${valueWord} without labels`],['percent-hidden','Percentage without labels'],
 ];
 const chartValues=<div className="kobo-appearance-control">
  {bulk&&<KoboBulkSettingHeading label="Chart values" changed={chartValuesChanged} mixed={selectedChoice==='__mixed__'}
   onUndo={()=>{const next={...value};delete next.metric;delete next.labels;onChange(next)}}/>}
  <KoboSettingsSelect label="Chart values" value={selectedChoice}
   options={selectedChoice==='__mixed__'?[['__mixed__','Mixed values'],...chartValueOptions]
    :selectedChoice==='custom'?[['custom','Custom saved setting'],...chartValueOptions]:chartValueOptions}
   onChange={choice=>{if(choice in chartValueSettings)onChange({...value,...chartValueSettings[choice as ChartValueChoice]})}}/>
  {selectedChoice==='custom'&&<small>Your saved combination stays active until you choose another option.</small>}
 </div>;
 const title=showTitle&&<div className="kobo-appearance-control">
  {bulk&&<KoboBulkSettingHeading label="Chart title" changed={value?.title!==undefined} mixed={value?.title===undefined&&mixedKeys.includes('title')} onUndo={()=>undo('title')}/>}
  <label><span className="kobo-chart-title-label">Chart title <small>Optional</small></span>
   <input type="text" className="kobo-chart-title-input" dir="auto" aria-label="Chart title (optional)" maxLength={200}
    value={value?.title??(bulk?sharedValues?.title:resolved.title)??''}
    placeholder={bulk&&value?.title===undefined&&mixedKeys.includes('title')?'Mixed titles':'Enter a chart title'}
    onChange={event=>onChange({...value,title:event.target.value})}/>
  </label>
 </div>;

 return <>
  {groups.map(group=>{
   const fields=group.keys.map(key=>{
    if(typography&&(key==='fontFamily'||key==='fontSize'))return null;
    const control=controls.find(item=>item.key===key)!;
    const changed=value?.[key]!==undefined;
    const relevant=contexts.filter(context=>appearanceSettingApplies(key,context));
    const applicable=relevant.length>0;
    if(!applicable&&!(bulk&&changed))return null;
    const mixed=bulk&&!changed&&mixedKeys.includes(key);
    const selection=mixed?'__mixed__':String(changed?resolved[key]:bulk?sharedValues?.[key]??appearanceDefaults[key]:resolved[key]);
    const options:[string,string][]=key==='legend'&&relevant.length>0&&relevant.every(context=>context.calculated)
      ?[['auto','Show'],['hidden','Hide']]
      :key==='categoryLabels'&&relevant.length>0&&relevant.every(context=>context.chart==='bar')
       ?control.options.filter(([id])=>id!=='rotate'):control.options;
    const displayed=!mixed&&key==='grid'?gridlineChoice(selection as KoboAppearance['grid'],chart)
     :!mixed&&!options.some(([id])=>id===selection)?options[0][0]:selection;
    return <div className="kobo-appearance-control" key={key}>
     {bulk&&<KoboBulkSettingHeading label={control.label} changed={changed} mixed={mixed} onUndo={()=>undo(key)}/>}
     {!applicable?<small>This change does not apply to the current charts.</small>:options.length===2?
      <fieldset className="kobo-appearance-radios">
       <legend>{control.label}</legend>
       {mixed&&<small className="kobo-appearance-mixed">Mixed values - choose an option to apply</small>}
       <div>{options.map(([id,label])=><label key={id} className={displayed===id?'is-selected':''}>
        <input type="radio" name={`${radioId}-${key}`} value={id} checked={displayed===id} onChange={()=>changeSelection(key,id)}/><span>{label}</span>
       </label>)}</div>
      </fieldset>:
      <AppSelect label={control.label} preserveOrder value={displayed} options={mixed?[['__mixed__','Mixed values'],...options]:options}
       onChange={option=>changeSelection(key,option)}/>}
     {applicable&&key==='labelPosition'&&selection==='inside'&&<small>{!bulk&&breakdowns&&resolved.bars==='stack'
      ?'Values that cannot fit in a stacked segment are available on hover.':'Values that cannot fit inside an unstacked bar appear just outside it.'}</small>}
     {applicable&&key==='labelPosition'&&selection==='outside'&&(bulk||breakdowns&&resolved.bars==='stack')&&<small>Stacked bars use automatic placement.</small>}
    </div>;
   }).filter(Boolean);
   const typeContent=group.title==='Typography'&&(typography||title);
   const valuesContent=group.title==='Values & labels'&&chartValues;
   return (fields.length>0||typeContent||valuesContent)&&<section key={group.title} aria-label={group.title} className="kobo-setting-group">
    <h3>{group.title}</h3>{valuesContent}{typeContent}{fields}
   </section>;
  })}
  <button type="button" className="soft" onClick={()=>onChange({})}><RotateCcw aria-hidden="true"/>{bulk?'Undo appearance changes':'Reset appearance'}</button>
 </>;
}
