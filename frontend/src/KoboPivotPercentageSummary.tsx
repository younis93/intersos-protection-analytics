import {useId,type ReactNode} from 'react';
import {koboHiddenScopeLabel} from './KoboHiddenAnswerControls';
import {formatPercent,percentageDecimals} from './koboPercentages';
import {pivotBottomPercent} from './koboPivotValues';
import type {KoboResult} from './koboTypes';

const basisLabels={
 'grand-total':['Grand total','الإجمالي الكلي'],
 'column-total':['Column totals','إجماليات الأعمدة'],
 'row-total':['Row totals','إجماليات الصفوف'],
 'breakdown-group':['Breakdown group totals','إجماليات مجموعات التقسيم'],
 'legacy-respondents':['Respondents','المستجيبون'],
 'visible-selections':['Answer selections','اختيارات الإجابات'],
 'answer-filter':['Eligible responses','الاستجابات المؤهلة'],
};

type VisibilityAxis={count:number;control?:ReactNode};
export default function KoboPivotPercentageSummary({result,language,rows,columns,basisControl}:{
 result:KoboResult;language:'en'|'ar';rows:VisibilityAxis;columns:VisibilityAxis;basisControl?:ReactNode;
}){
 const id=useId(),ar=language==='ar';
 const t=(en:string,arabic:string)=>ar?arabic:en;
 const title=t('Percentage summary','ملخص النسب المئوية');
 const summary=result.percentageSummary,filter=result.answerFilterSummary;
 const hiddenSelections=result.hiddenAnswerSelections;
 const percent=filter?filter.percent:pivotBottomPercent(result);
 const count=new Intl.NumberFormat(language);
 const hiddenShare=new Intl.NumberFormat(language,{style:'percent',maximumFractionDigits:1});
 const value=new Intl.NumberFormat(language,{maximumFractionDigits:result.measure?.decimals??0});
 const mode=result.percentageMode??'legacy-respondents';
 const basis=basisLabels[mode][ar?1:0];
 const linked=filter?null:result.respondentBasis;
 const rowEffect=summary?.rowScope;
 const columnEffect=summary?.columnScope;
 const visibleSelections=(rowEffect==='excluded'||columnEffect==='excluded')
  &&rowEffect!=='included'&&columnEffect!=='included';
 const rowDescription=rowEffect&&{
  included:t('Hidden rows contribute to the percentage base.','تدخل الصفوف المخفية في قاعدة النسبة.'),
  excluded:t('Only visible rows count toward the percentage.','تُحتسب الصفوف الظاهرة فقط في النسبة المئوية.'),
  'cohort-excluded':t('Responses with hidden answers are excluded from the percentage base.','تُستبعد الاستجابات ذات الإجابات المخفية من قاعدة النسبة.'),
  'linked-excluded':t('Responses with only hidden answers are excluded from the percentage base.','تُستبعد الاستجابات التي اقتصرت على إجابات مخفية من قاعدة النسبة.'),
  'answer-filter-excluded':t('The percentage base excludes responses with only hidden answers.','تستبعد قاعدة النسبة الاستجابات التي اقتصرت على إجابات مخفية.'),
  'display-only':t('Hiding rows changes the pivot display. The percentage uses the eligible responses and selected conditions.','يغيّر إخفاء الصفوف عرض الجدول. وتعتمد النسبة على الاستجابات المؤهلة والشروط المحددة.'),
 }[rowEffect];
 const columnDescription=columnEffect&&{
  included:t('Hidden columns contribute to the percentage base.','تدخل الأعمدة المخفية في قاعدة النسبة.'),
  excluded:t('The percentage uses visible columns only.','تستخدم النسبة الأعمدة الظاهرة فقط.'),
  'outside-results':t('The hidden columns are outside the current results.','الأعمدة المخفية خارج النتائج الحالية.'),
 }[columnEffect];
 let calculation:ReactNode;
 if(filter){
  if(!filter.denominator)calculation=t('No eligible responses under the current filters.','لا توجد استجابات مؤهلة ضمن الفلاتر الحالية.');
  else if(ar)calculation=`طابق ${count.format(filter.count)} من أصل ${count.format(filter.denominator)} استجابة مؤهلة الشروط المحددة.`;
  else calculation=`${count.format(filter.count)} of ${count.format(filter.denominator)} eligible responses matched ${filter.selections.length>1?'all selected conditions':'the selected answers'}.`;
 }else if(linked?.issue){
  calculation=t('The percentage base is unavailable. Review the linked question settings.','قاعدة النسبة غير متاحة. راجع إعدادات السؤال المرتبط.');
 }else if(percent===null){
  calculation=t('There is no valid percentage base for the current results.','لا توجد قاعدة صالحة لحساب النسبة للنتائج الحالية.');
 }else if(summary?.numerator!=null&&summary.denominator!=null){
  const numerator=value.format(summary.numerator),denominator=value.format(summary.denominator);
  calculation=result.measure
   ?t(`${numerator} of ${denominator} in total measured value.`,`${numerator} من أصل ${denominator} من إجمالي القيمة المقاسة.`)
   :mode==='legacy-respondents'
    ?t(`${numerator} of ${denominator} respondents counted.`,`احتُسب ${numerator} من أصل ${denominator} من المستجيبين.`)
    :visibleSelections
     ?hiddenSelections&&summary.numerator===hiddenSelections.total-hiddenSelections.hidden&&summary.numerator===summary.denominator
      ?t(`${numerator} visible answer selections`,`${numerator} من اختيارات الإجابات الظاهرة`)
      :t(`${numerator} of ${denominator} visible answer selections`,`${numerator} من أصل ${denominator} من اختيارات الإجابات الظاهرة`)
     :t(`${numerator} of ${denominator} answer selections counted.`,`احتُسب ${numerator} من أصل ${denominator} من اختيارات الإجابات.`);
 }
 return <section className="kobo-pivot-percentage-summary kobo-connected-base-panel" aria-labelledby={id} dir={ar?'rtl':'ltr'}>
  <div className="kobo-pivot-percentage-header">
   <div className="kobo-pivot-percentage-detail">
    <span id={id} className="kobo-pivot-percentage-label">{title}</span>
    <h4 dir="auto">{result.label}</h4>
    <p className="kobo-pivot-percentage-basis">{basis}{mode==='breakdown-group'&&` · ${t('Level','المستوى')} ${count.format(result.percentageGroupLevel??1)}`}
     {linked?.kind==='parent'&&<> · <bdi>{linked.label}</bdi></>}
    </p>
    {!!filter?.selections.length&&<div className="kobo-pivot-percentage-conditions">
     <strong>{t('Selected conditions','الشروط المحددة')}</strong>
     <ul>{filter.selections.map((selection,index)=><li key={index}><bdi>{selection.question}</bdi>{' · '}
      {selection.exclude&&t('excluding ','باستثناء ')}<bdi>{selection.answers.join(ar?'، ':', ')}</bdi></li>)}</ul>
    </div>}
   </div>
   <div className="kobo-pivot-percentage-metric" role="status">
    <strong>{percent===null?t('Unavailable','غير متاح'):formatPercent(percent,percentageDecimals(result),language)}</strong>
    {calculation&&<p>{calculation}</p>}
    {!!hiddenSelections?.total&&<p className="kobo-pivot-hidden-selections">
     {t(`${count.format(hiddenSelections.hidden)} of ${count.format(hiddenSelections.total)} answer selections hidden`,
      `${count.format(hiddenSelections.hidden)} من أصل ${count.format(hiddenSelections.total)} من اختيارات الإجابات مخفية`)}
     {' '}<bdi>({hiddenShare.format(hiddenSelections.hidden/hiddenSelections.total)})</bdi>
    </p>}
   </div>
  </div>
  {basisControl&&<div className="kobo-connected-base-controls kobo-pivot-percentage-controls">{basisControl}</div>}
  {(rows.count>0||columns.count>0)&&<div className="kobo-connected-base-controls kobo-pivot-percentage-visibility">
   {rows.count>0&&<div className="kobo-pivot-percentage-axis">
    <h5>{koboHiddenScopeLabel(language,'rows')}</h5>
    {rowDescription&&<p>{rowDescription}</p>}
    {rows.control}
   </div>}
   {columns.count>0&&<div className="kobo-pivot-percentage-axis">
    <h5>{koboHiddenScopeLabel(language,'columns')}</h5>
    {columnDescription&&<p>{columnDescription}</p>}
    {columns.control}
   </div>}
  </div>}
 </section>;
}
