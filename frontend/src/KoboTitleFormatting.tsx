import {AlignLeft,AlignCenter,AlignRight,Minus,Plus,RotateCcw} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {useId} from 'react';
import {ChartDimensionSlider} from './KoboAppearanceControls';
import {answerSizeRange,appearanceDefaults,koboChartFonts,maxTitleSpacing,resolveAppearance,titleSpacingPoints,type KoboAppearance} from './koboAppearance';

const titleSizes=[12,14,16,18,20,24,28,32,36,40,48];
const styles=[
 {key:'titleBold',symbol:'B',label:'Bold title',ar:'عنوان عريض'},
 {key:'titleItalic',symbol:'I',label:'Italic title',ar:'عنوان مائل'},
 {key:'titleUnderline',symbol:'U',label:'Underline title',ar:'تسطير العنوان'},
] as const;
const alignments=[
 {key:'left',Icon:AlignLeft,label:'Align title left',ar:'محاذاة العنوان إلى اليسار'},
 {key:'center',Icon:AlignCenter,label:'Center title',ar:'توسيط العنوان'},
 {key:'right',Icon:AlignRight,label:'Align title right',ar:'محاذاة العنوان إلى اليمين'},
] as const;

export default function KoboTitleFormatting({value,onChange,language='en'}:{value?:KoboAppearance;onChange:(value:KoboAppearance)=>void;language?:string}){
 const appearance=resolveAppearance(value);
 const answerSizeId=useId();
 const text=(en:string,ar:string)=>language==='ar'?ar:en;
 const spacing=titleSpacingPoints(appearance.titleSpacing);
 const spacingLabel=new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(spacing);
 const spacingUnit=text('pt','نقطة');
 const patch=(next:Partial<KoboAppearance>)=>onChange({...value,...next});
 const resetLabel=text('Reset title style','إعادة تعيين تنسيق العنوان');
 const reset=()=>{
  const {titleBold,titleItalic,titleUnderline,titleAlign,titleFont,titleSize,titleSpacing,titleColor}=appearanceDefaults;
  patch({titleBold,titleItalic,titleUnderline,titleAlign,titleFont,titleSize,titleSpacing,titleColor});
 };

 return <div className="kobo-title-formatting">
  {appearance.title.trim()&&<div className="kobo-title-style-fields" role="group" aria-label={text('Title formatting','تنسيق العنوان')}>
   <header className="kobo-title-format-header">
    <h4>{text('Title formatting','تنسيق العنوان')}</h4>
    <button type="button" className="soft kobo-title-reset" title={resetLabel} aria-label={resetLabel} onClick={reset}>
     <RotateCcw size={15} aria-hidden="true"/>
    </button>
   </header>
   <AppSelect label={text('Title size','حجم العنوان')} value={String(appearance.titleSize)} preserveOrder
    options={[['0',text('Auto','تلقائي')],...titleSizes.map(size=>[String(size),`${size} px`] as [string,string])]}
    onChange={titleSize=>patch({titleSize:Number(titleSize)})}/>
   <div className="kobo-title-toolbar">
    <div className="kobo-title-segments" role="group" aria-label={text('Title style','نمط العنوان')}>
     {styles.map(({key,symbol,label,ar})=><button type="button" className="soft" key={key} title={text(label,ar)} aria-label={text(label,ar)}
      aria-pressed={appearance[key]} onClick={()=>patch({[key]:!appearance[key]})}><span aria-hidden="true" data-style={key}>{symbol}</span></button>)}
    </div>
    <div className="kobo-title-segments" dir="ltr" role="group" aria-label={text('Title alignment','محاذاة العنوان')}>
     {alignments.map(({key,Icon,label,ar})=><button type="button" className="soft" key={key} title={text(label,ar)} aria-label={text(label,ar)}
      aria-pressed={appearance.titleAlign===key} onClick={()=>patch({titleAlign:key})}><Icon size={16} aria-hidden="true"/></button>)}
    </div>
   </div>
   <div className="kobo-title-detail-grid">
    <label className="kobo-title-color">
     <span>{text('Color','اللون')}</span>
     <input type="color" aria-label={text('Title color','لون العنوان')} value={appearance.titleColor||'#172b3a'}
      onChange={event=>patch({titleColor:event.target.value})}/>
    </label>
    <div className="kobo-title-spacing" role="group" aria-label={text('Title spacing','المسافة أسفل العنوان')}>
     <span>{text('Spacing','المسافة')}</span>
     <div className="kobo-title-spacing-stepper" dir="ltr">
      <button type="button" className="soft" aria-label={text('Decrease title spacing','تقليل المسافة أسفل العنوان')}
       disabled={spacing===0} onClick={()=>patch({titleSpacing:Math.max(0,spacing-1)})}><Minus size={15} aria-hidden="true"/></button>
      <output dir="auto">{spacingLabel} <span>{spacingUnit}</span></output>
      <button type="button" className="soft" aria-label={text('Increase title spacing','زيادة المسافة أسفل العنوان')}
       disabled={spacing===maxTitleSpacing} onClick={()=>patch({titleSpacing:Math.min(maxTitleSpacing,spacing+1)})}><Plus size={15} aria-hidden="true"/></button>
     </div>
    </div>
   </div>
  </div>}
  <AppSelect label={text('Chart font','خط الرسم البياني')} value={appearance.fontFamily} searchable preserveOrder
   options={[...koboChartFonts].sort().map(font=>[font,font] as [string,string])}
   onChange={fontFamily=>patch({fontFamily:fontFamily as KoboAppearance['fontFamily'],titleFont:'inherit'})}/>
  <ChartDimensionSlider dimension="Answer size" label={text('Manual answer size','حجم الإجابات اليدوي')} id={answerSizeId}
   value={appearance.fontSize||answerSizeRange.initial} min={answerSizeRange.min} max={answerSizeRange.max} mixed={false}
   onChange={fontSize=>patch({fontSize})}/>
 </div>;
}
