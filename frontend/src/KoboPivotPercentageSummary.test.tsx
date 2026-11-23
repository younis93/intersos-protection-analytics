import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboPivotPercentageSummary from './KoboPivotPercentageSummary';
import type {KoboResult} from './koboTypes';

const result={id:'q',name:'q',label:'Question',kind:'category',group:'',repeat:'',denominator:20,missing:0,total:344,statistics:{},percentageBasis:'Eligible responses',colors:{},chart:'bar',rows:[],breakdowns:[],percentageMode:'answer-filter'} as KoboResult;
const selections=[{question:'Needs support?',answers:['Yes']}];

it('describes the selected answers and both hidden axes in the same summary',()=>{
 const html=renderToStaticMarkup(<KoboPivotPercentageSummary language="en" rows={{count:2}} columns={{count:1}} result={{
  ...result,answerFilterSummary:{count:20,denominator:344,percent:20/344*100,selections},
  percentageSummary:{numerator:20,denominator:344,rowScope:'display-only',columnScope:'excluded'},
 }}/>);
 expect(html.match(/6%/g)).toHaveLength(1);
 expect(html).toContain('20 of 344 eligible responses matched the selected answers.');
 expect(html).toContain('Needs support?');
 expect(html).not.toContain('2 rows hidden');
 expect(html).toContain('Hiding rows changes the pivot display.');
 expect(html).not.toContain('1 column hidden');
 expect(html).toContain('The percentage uses visible columns only.');
});

it('distinguishes zero matches from an unavailable percentage base',()=>{
 const render=(denominator:number,percent:number|null)=>renderToStaticMarkup(<KoboPivotPercentageSummary language="en" rows={{count:0}} columns={{count:0}} result={{
  ...result,answerFilterSummary:{count:0,denominator,percent,selections},
 }}/>);
 expect(render(10,0)).toContain('0%');
 expect(render(0,null)).toContain('Unavailable');
 expect(render(0,null)).not.toContain('0%');
});

it('names the linked respondent base and explains hidden answers in Arabic',()=>{
 const html=renderToStaticMarkup(<KoboPivotPercentageSummary language="ar" rows={{count:1}} columns={{count:0}} result={{
  ...result,percentageMode:'legacy-respondents',pivotTotal:{percent:20},
  percentageSummary:{numerator:2,denominator:10,rowScope:'linked-excluded'},
  respondentBasis:{kind:'parent',label:'السؤال المرتبط',denominator:10} as NonNullable<KoboResult['respondentBasis']>,
 }}/>);
 expect(html).toContain('dir="rtl"');
 expect(html).toContain('السؤال المرتبط');
 expect(html).toContain('تُستبعد الاستجابات التي اقتصرت على إجابات مخفية من قاعدة النسبة.');
});

it('labels the visible total beneath the question only when hidden data is excluded from the base',()=>{
 const render=(columnScope:'included'|null)=>renderToStaticMarkup(<KoboPivotPercentageSummary language="en" rows={{count:1}} columns={{count:columnScope?1:0}} result={{
  ...result,label:'What is your nationality?',percentageMode:'grand-total',pivotTotal:{percent:100},
  percentageSummary:{numerator:211,denominator:211,rowScope:'excluded',columnScope},
 }}/>);
 const visible=render(null);
 expect(visible).toContain('What is your nationality?');
 expect(visible).toContain('211 of 211 visible answer selections');
 expect(visible).toContain('How hidden rows affect percentages');
 expect(render('included')).not.toContain('visible answer selections');
});


it('shows the hidden share of all answer selections separately from the pivot percentage',()=>{
 const html=renderToStaticMarkup(<KoboPivotPercentageSummary language="en" rows={{count:1}} columns={{count:0}} result={{
  ...result,percentageMode:'grand-total',pivotTotal:{percent:100},
  percentageSummary:{numerator:143,denominator:143,rowScope:'excluded'},
  hiddenAnswerSelections:{hidden:201,total:344},
 }}/>);
 expect(html).toContain('143 visible answer selections');
 expect(html).toContain('201 of 344 answer selections hidden');
 expect(html).toContain('58.4%');
 expect(html).not.toContain('1 row hidden');
});
