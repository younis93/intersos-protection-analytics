import {formatPercent,percentageDecimals} from './koboPercentages';
import type {KoboResult,KoboSettings} from './koboTypes';

export default function KoboAnswerShare({result,language}:{result:KoboResult;language:KoboSettings['language']}){
 const arabic=language==='ar',number=new Intl.NumberFormat(language);
 const summary=result.answerFilterSummary;
 if(summary){
  const {count,denominator,percent,selections}=summary;
  const n=number.format(count),d=number.format(denominator),multiple=selections.length>1;
  const text=arabic?'نسبة مطابقة الإجابات المحددة':'Matching selected answers';
  return <section className="kobo-answer-share" aria-label={text} dir={arabic?'rtl':'ltr'}>
   <strong>{formatPercent(percent,percentageDecimals(result),language)}</strong>
   <div>
    <strong>{text}</strong>
    <div>{denominator?(arabic?`${n} من أصل ${d} استجابة مؤهلة`:`${n} of ${d} eligible responses ${multiple?'matched all selected conditions':'matched the selected answers'}`):
     arabic?'لا توجد استجابات مؤهلة.':'No eligible responses.'}</div>
    <ul>{selections.map((selection,index)=><li key={index}><bdi>{selection.question}</bdi>{' · '}
     {selection.exclude&&(arabic?'باستثناء ':'excluding ')}<bdi>{selection.answers.join(arabic?'، ':', ')}</bdi></li>)}</ul>
    <small>{arabic?'يُحسب الأساس بعد عوامل تصفية الصفحة والسؤال وقبل تطبيق الإجابات المحددة.':
     'The base includes page and Question filters, before the selected answers are applied.'}</small>
   </div>
  </section>;
 }
 const share=result.answerShare;
 if(!share)return null;
 return <section className="kobo-answer-share" aria-label={arabic?'نسبة الإجابة المختارة':'Selected answer percentage'} dir={arabic?'rtl':'ltr'}>
  <strong>{formatPercent(share.percent,percentageDecimals(result),language)}</strong>
  <div>
   <div><bdi>{share.questionLabel}</bdi> · <bdi>{share.answerLabel}</bdi></div>
   <small>{share.denominator?(arabic?`${number.format(share.count)} من ${number.format(share.denominator)} مستجيباً ضمن مجموعة الاستجابات الحالية`:`${number.format(share.count)} of ${number.format(share.denominator)} respondents in the current filtered group selected this answer`):
    arabic?'لا توجد استجابات مجابة ضمن عوامل التصفية الحالية.':'No answered responses under the current filters.'}</small>
  </div>
 </section>;
}
