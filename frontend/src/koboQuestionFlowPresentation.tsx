import {isQuestion,type FlowItem} from './koboQuestionFlowModel';

export type FlowText=(en:string,ar:string)=>string;
export function flowKindLabel(item:FlowItem,t:FlowText){
 return !isQuestion(item)?t(item.repeat?'Repeat group':'Group',item.repeat?'مجموعة متكررة':'مجموعة'):item.type==='calculate'?t('Calculation','حساب'):{category:t('Single choice','اختيار واحد'),multiple:t('Multiple choice','اختيار متعدد'),number:t('Number','رقم'),date:t('Date','تاريخ'),text:t('Text','نص')}[item.kind];
}
export function QuestionPreview({item,t}:{item:FlowItem;t:FlowText}){
 const language=t('en','ar') as 'en'|'ar';
 return <><strong dir="auto">{item.label}</strong><span>{flowKindLabel(item,t)}</span>{isQuestion(item)&&<p dir="auto">{item.choices.length?item.choices.slice(0,4).map(c=>c.labels[language]||c.labels.default||c.labels.en||c.name).join(' · ')+(item.choices.length>4?' …':''):t('Answer type: ','نوع الإجابة: ')+flowKindLabel(item,t)}</p>}<p dir="auto">{item.connections.conditions.map(c=>c.readable||c.expression).join(t(' AND ',' و '))||t('Always visible','ظاهر دائماً')}</p></>;
}
