import {useId,type CSSProperties,type ReactNode} from 'react';
import './koboAppearanceControls.css';
import KoboBulkSettingHeading from './KoboBulkSettingHeading';
import {RotateCcw} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import KoboSettingsSelect from './KoboSettingsSelect';
import {supportsBarLabelPosition} from './koboDataLabels';
import {answerSizeRange,appearanceDefaults,barWidthRange,chartHeights,chartWidthPresets,chartWidths,koboAnswerSizeOptions,koboChartFonts,resolveAppearance,type KoboAppearance} from './koboAppearance';
const controls:{key:keyof KoboAppearance;label:string;options:[string,string][]}[]=[
 {key:'labelPosition',label:'Value label position',options:[['outside','Outside'],['inside','Inside']]},
 {key:'zeroPercentLabels',label:'0% labels',options:[['show','Show'],['hide','Hide']]},
 {key:'legend',label:'Legend',options:[['auto','Automatic'],['top','Top'],['bottom','Bottom'],['left','Left side'],['right','Right side'],['hidden','Hidden']]},
 {key:'legendAlign',label:'Legend alignment',options:[['left','Left'],['center','Center'],['right','Right']]},
 {key:'legendVerticalAlign',label:'Side legend alignment',options:[['top','Top'],['middle','Middle'],['bottom','Bottom']]},
 {key:'fontFamily',label:'Chart font',options:[...koboChartFonts].sort().map(font=>[font,font])},
 {key:'height',label:'Chart height',options:[['0','Automatic'],...['320','420','560','720'].map(n=>[n,`${n} px`] as [string,string]),['custom','Custom']]},
 {key:'chartWidthMode',label:'Chart width',options:[['auto','Automatic'],...Object.entries(chartWidthPresets).map(([mode,{label,width}]):[string,string]=>[mode,`${label} (${width.toLocaleString('en-US')} px)`]),['custom','Custom']]},
 {key:'valueAxis',label:'Value axis scale',options:[['show','Show'],['hide','Hide']]},
 {key:'horizontalAxisLine',label:'Horizontal axis line',options:[['show','Show'],['hide','Hide']]},
 {key:'verticalAxisLine',label:'Vertical axis line',options:[['show','Show'],['hide','Hide']]},
 {key:'categoryLabels',label:'Label layout',options:[['wrap','Wrap'],['truncate','Single line'],['rotate','Rotate']]},
 {key:'categoryLabelSize',label:'Category label size',options:koboAnswerSizeOptions('Use chart size')},
 {key:'categoryLabelLines',label:'Maximum lines',options:[['0','Automatic'],...([1,2,3,4,5].map(lines=>[String(lines),String(lines)] as [string,string]))]},
 {key:'grid',label:'Gridlines',options:[['show','Show'],['hide','Hide']]},
 {key:'bars',label:'Breakdown bars',options:[['group','Grouped'],['stack','Stacked']]},
 {key:'barWidth',label:'Bar width',options:[['narrow','Narrow'],['medium','Medium'],['standard','Standard'],['custom','Custom']]},
 {key:'answerSpacing',label:'Answer spacing',options:[['compact','Compact'],['standard','Standard'],['spacious','Spacious']]},
];
export type AppearanceContext={
 chart:string;
 breakdowns:boolean;
 appearance?:KoboAppearance;
 measured?:boolean;
 calculated?:boolean;
 legacyMeasure?:boolean;
 trend?:boolean;
 automaticLegend?:boolean;
};

type AppearanceKey=keyof KoboAppearance;
const groups:{title:string;keys:AppearanceKey[]}[]=[
 {title:'Typography',keys:['fontFamily','fontSize']},
 {title:'Values & labels',keys:['labelPosition','zeroPercentLabels']},
 {title:'Category labels',keys:['categoryLabels','categoryLabelSize','categoryLabelLines']},
 {title:'Chart layout',keys:['chartWidthMode','height','valueAxis','horizontalAxisLine','verticalAxisLine','grid','legend','legendAlign','legendVerticalAlign','bars','barWidth','answerSpacing']},
];

export function gridlineChoice(grid:KoboAppearance['grid'],chart:string){
 return grid==='show'||grid==='hide'?grid:chart==='heatmap'?'hide':'show';
}

export function appearanceSettingApplies(key:AppearanceKey,context:AppearanceContext){
 const {chart,breakdowns,measured,calculated,legacyMeasure,trend}=context;
 const {labels,metric,legend}=resolveAppearance(context.appearance);
 const slices=chart==='pie'||chart==='donut';
 switch(key){
  case 'metric':return !measured&&!legacyMeasure;
  case 'labelPosition':return labels!=='hidden'&&supportsBarLabelPosition(chart);
  case 'zeroPercentLabels':
   return labels!=='hidden'&&!measured&&!legacyMeasure&&(calculated
    ?metric==='percent'||labels==='both'
    :labels==='percent'||labels==='both'||labels==='auto'&&metric==='percent');
  case 'valueAxis':return !slices&&chart!=='heatmap'&&(!trend||!!calculated);
  case 'horizontalAxisLine':
  case 'verticalAxisLine':return !slices&&chart!=='heatmap';
  case 'categoryLabels':
  case 'categoryLabelSize':return !slices&&!trend;
  case 'categoryLabelLines':return !slices&&!trend&&(context.appearance?.categoryLabels??'wrap')==='wrap';
  case 'grid':return !slices;
  case 'legend':return chart!=='heatmap';
  case 'legendAlign':return chart!=='heatmap'&&(legend==='top'||legend==='bottom'||legend==='auto'&&(context.automaticLegend??(breakdowns||slices||!!trend)));
  case 'legendVerticalAlign':return chart!=='heatmap'&&['left','right'].includes(legend);
  case 'barWidth':
  case 'customBarWidth':return chart==='bar'||chart==='column';
  case 'answerSpacing':return chart==='bar';
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

export function ChartDimensionSlider({dimension,label,id,value,min,max,mixed,onChange}:{
 dimension:'Width'|'Height'|'Answer size'|'Bar width';label?:string;id:string;value:number;min:number;max:number;mixed:boolean;onChange:(value:number)=>void;
}){
 const progress=(value-min)/(max-min)*100;
 const percent=dimension==='Bar width';
 const display=(amount:number)=>percent?`${amount}%`:`${amount} px`;
 return <div className="kobo-custom-chart-width">
  <div className="kobo-chart-width-heading">
   <label htmlFor={id}>{label??`${dimension} in ${percent?'percent':'pixels'}`}</label>
   <span aria-hidden="true">{mixed?'Mixed values':display(value)}</span>
  </div>
  <input id={id} type="range" min={min} max={max} step={1} value={value}
   aria-valuetext={mixed?'Mixed values':`${value} ${percent?'percent':'pixels'}`}
   style={{'--chart-width-progress':`${mixed?0:progress}%`} as CSSProperties}
   onChange={event=>onChange(event.currentTarget.valueAsNumber)}/>
  <div className="kobo-chart-width-limits" aria-hidden="true"><span>{display(min)}</span><span>{display(max)}</span></div>
 </div>;
}

export default function KoboAppearanceControls({
 value,onChange,chart,breakdowns,measured=false,calculated=false,legacyMeasure=false,trend=false,automaticLegend,
 bulk=false,sharedValues,mixedKeys=[],showTitle=true,typography,targets,
}:AppearanceContext&{
 value?:KoboAppearance;onChange:(value:KoboAppearance)=>void;bulk?:boolean;sharedValues?:KoboAppearance;
 mixedKeys?:AppearanceKey[];showTitle?:boolean;typography?:ReactNode;targets?:AppearanceContext[];
}){
 const resolved=resolveAppearance(value),radioId=useId();
 const customWidth=value?.chartWidth??sharedValues?.chartWidth??appearanceDefaults.chartWidth;
 const mixedWidth=bulk&&value?.chartWidth===undefined&&mixedKeys.includes('chartWidth');
 const customHeight=value?.customHeight??sharedValues?.customHeight??0;
 const customBarWidth=value?.customBarWidth??sharedValues?.customBarWidth??barWidthRange.initial;
 const mixedBarWidth=bulk&&value?.customBarWidth===undefined&&mixedKeys.includes('customBarWidth');
 const contexts=targets??[{chart,breakdowns,measured,calculated,legacyMeasure,trend,automaticLegend,appearance:value}];
 const mixedHeight=bulk&&value?.customHeight===undefined&&mixedKeys.includes('customHeight');
 const allCustomHeights=contexts.length>0&&contexts.every(context=>!!context.appearance?.customHeight);
 const changeSelection=(key:AppearanceKey,selection:string)=>{
  if(selection==='__mixed__')return;
  if(key==='height'){
   if(selection==='custom')onChange({...value,customHeight:customHeight||resolved.height||chartHeights.initial});
   else onChange({...value,height:Number(selection) as KoboAppearance['height'],customHeight:0});
   return;
  }
  const numeric=key==='categoryLabelSize'||key==='categoryLabelLines';
  const next={...value,[key]:numeric?Number(selection):selection};
  if(key==='valueAxis'&&!bulk){
   next.horizontalAxisLine=resolved.horizontalAxisLine;
   next.verticalAxisLine=resolved.verticalAxisLine;
  }
  if(key==='fontFamily'&&!bulk)next.titleFont='inherit';
  onChange(next);
 };
 const undo=(key:AppearanceKey)=>{
  const next={...value};
  delete next[key];
  if(key==='chartWidthMode')delete next.chartWidth;
  if(key==='height')delete next.customHeight;
  if(key==='barWidth')delete next.customBarWidth;
  onChange(next);
 };
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
    const changed=value?.[key]!==undefined||key==='height'&&value?.customHeight!==undefined;
    const relevant=contexts.filter(context=>appearanceSettingApplies(key,context));
    const applicable=relevant.length>0;
    if(!applicable&&!(bulk&&changed))return null;
    const mixed=bulk&&!changed&&(key==='height'?(!allCustomHeights&&(mixedKeys.includes('height')||mixedHeight)):mixedKeys.includes(key));
    const selection=mixed?'__mixed__':key==='height'&&(customHeight||allCustomHeights)?'custom':String(changed?resolved[key]:bulk?sharedValues?.[key]??appearanceDefaults[key]:resolved[key]);
    if(key==='fontSize')return <div className="kobo-appearance-control" key={key}>
     {bulk&&<KoboBulkSettingHeading label="Answer size" changed={changed} mixed={mixed} onUndo={()=>undo(key)}/>}
     <ChartDimensionSlider dimension="Answer size" id={`${radioId}-answer-size`} value={Number(selection)||answerSizeRange.initial}
      min={answerSizeRange.min} max={answerSizeRange.max} mixed={mixed} onChange={fontSize=>onChange({...value,fontSize})}/>
    </div>;
    const control=controls.find(item=>item.key===key)!;
    const options=key==='categoryLabels'&&relevant.length>0&&relevant.every(context=>context.chart==='bar')
       ?control.options.filter(([id])=>id!=='rotate'):control.options;
    const displayed=!mixed&&key==='grid'?gridlineChoice(selection as KoboAppearance['grid'],chart)
     :!mixed&&!options.some(([id])=>id===selection)?options[0][0]:selection;
    return <div className="kobo-appearance-control" key={key}>
     {bulk&&<KoboBulkSettingHeading label={control.label} changed={changed||key==='chartWidthMode'&&value?.chartWidth!==undefined||key==='barWidth'&&value?.customBarWidth!==undefined} mixed={mixed} onUndo={()=>undo(key)}/>}
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
     {key==='chartWidthMode'&&displayed==='custom'&&<ChartDimensionSlider dimension="Width" id={`${radioId}-width`} value={customWidth}
      min={chartWidths.min} max={chartWidths.max} mixed={mixedWidth} onChange={chartWidth=>onChange({...value,chartWidth})}/>}
     {key==='height'&&displayed==='custom'&&<ChartDimensionSlider dimension="Height" id={`${radioId}-height`} value={customHeight||chartHeights.initial}
      min={chartHeights.min} max={chartHeights.max} mixed={mixedHeight} onChange={customHeight=>onChange({...value,customHeight})}/>}
     {key==='barWidth'&&displayed==='custom'&&<ChartDimensionSlider dimension="Bar width" id={`${radioId}-bar-width`} value={customBarWidth}
      min={barWidthRange.min} max={barWidthRange.max} mixed={mixedBarWidth} onChange={customBarWidth=>onChange({...value,customBarWidth})}/>}
     {applicable&&key==='labelPosition'&&selection==='inside'&&<small>{!bulk&&breakdowns&&resolved.bars==='stack'
      ?'Values that cannot fit in a stacked segment are available on hover.':'Values that cannot fit inside an unstacked bar appear just outside it.'}</small>}
     {applicable&&key==='labelPosition'&&selection==='outside'&&(bulk||breakdowns&&resolved.bars==='stack')&&<small>Stacked bars use automatic placement.</small>}
     {applicable&&key==='categoryLabels'&&selection==='truncate'&&<small>Hover over the chart to read the full label.</small>}
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
