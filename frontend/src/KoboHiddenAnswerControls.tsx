import './koboHiddenAnswerControls.css';

export function KoboHiddenAnswerControls({mode,onChange,language='en',keepOriginalDisabled=false}:{keepOriginalDisabled?:boolean;language?:'en'|'ar';mode:'adjust'|'keep-original';onChange:(mode:'adjust'|'keep-original')=>void}){
 return <div className="kobo-answer-percentage-buttons" role="group" aria-label={language==='ar'?'نسب الإجابات المخفية':'Hidden answer percentages'} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
  <button type="button" aria-label={language==='ar'?'ضبط النسب المئوية':'Adjust percentages'} aria-pressed={mode==='adjust'} title="Adjust percentages" onClick={()=>onChange('adjust')}>{language==='ar'?'ضبط %':'Adjust %'}</button>
  <button type="button" aria-label={language==='ar'?'الاحتفاظ بالنسب الأصلية':'Keep original percentages'} aria-pressed={mode==='keep-original'} title="Keep original percentages" disabled={keepOriginalDisabled} onClick={()=>onChange('keep-original')}>{language==='ar'?'إبقاء النسبة الأصلية':'Keep original %'}</button>
 </div>;
}
