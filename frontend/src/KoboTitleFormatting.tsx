import {AlignLeft,AlignCenter,AlignRight,RotateCcw} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {resolveAppearance,type KoboAppearance} from './koboAppearance';
export default function KoboTitleFormatting({value,onChange,language='en'}:{value?:KoboAppearance;onChange:(value:KoboAppearance)=>void;language?:string}){
 const a=resolveAppearance(value),ar=language==='ar';
 const patch=(next:Partial<KoboAppearance>)=>onChange({...value,...next});
 return <div className="kobo-title-formatting" role="group" aria-label={ar?'تنسيق العنوان':'Title formatting'}>
 <div className="kobo-title-toolbar"><div className="kobo-title-style-buttons">{(['titleBold','titleItalic','titleUnderline'] as const).map((key,i)=><button type="button" className="soft" key={key} aria-label={ar?['عريض','مائل','تسطير'][i]:['Bold title','Italic title','Underline title'][i]} aria-pressed={a[key]} onClick={()=>patch({[key]:!a[key]})}><span style={{fontWeight:i===0?700:400,fontStyle:i===1?'italic':'normal',textDecoration:i===2?'underline':'none'}}>{['B','I','U'][i]}</span></button>)}</div>
 <div className="kobo-title-align-buttons" role="group" aria-label={ar?'محاذاة العنوان':'Title alignment'}>{([{id:'left',Icon:AlignLeft,label:ar?'يسار':'Align title left'},{id:'center',Icon:AlignCenter,label:ar?'وسط':'Center title'},{id:'right',Icon:AlignRight,label:ar?'يمين':'Align title right'}] as const).map(({id,Icon,label})=><button type="button" className="soft" key={id} aria-label={label} title={label} aria-pressed={a.titleAlign===id} onClick={()=>patch({titleAlign:id})}><Icon size={17}/></button>)}</div></div>
 <div className="kobo-title-font-grid">
 <AppSelect label={ar?'خط العنوان':'Title font'} value={a.titleFont} options={['inherit','Arial','Calibri','Georgia','Times New Roman','Tahoma','Verdana'].map(font=>[font,font==='inherit'?(ar?'تلقائي':'Automatic'):font])} onChange={titleFont=>patch({titleFont:titleFont as KoboAppearance['titleFont']})}/>
 <AppSelect label={ar?'حجم العنوان':'Title size'} value={String(a.titleSize)} options={[["0",ar?'تلقائي':'Automatic'],...[12,14,16,18,20,24,28,32,36,40,48].map(n=>[String(n),`${n} px`] as [string,string])]} onChange={titleSize=>patch({titleSize:Number(titleSize)})}/>
 </div><div className="kobo-title-format-footer"><label className="kobo-title-color">{ar?'لون العنوان':'Title color'}<input type="color" aria-label={ar?'لون العنوان':'Title color'} value={a.titleColor||'#172b3a'} onChange={e=>patch({titleColor:e.target.value})}/></label>
 <button type="button" className="soft kobo-title-reset" title={ar?'إعادة تعيين التنسيق':'Reset title formatting'} onClick={()=>patch({titleBold:false,titleItalic:false,titleUnderline:false,titleAlign:'center',titleFont:'inherit',titleSize:0,titleColor:''})}><RotateCcw size={14}/>{ar?'إعادة تعيين':'Reset style'}</button></div>
 </div>;
}
