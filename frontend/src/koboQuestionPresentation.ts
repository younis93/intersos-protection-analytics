import type {KoboQuestion,KoboResult} from './koboTypes';
export function koboQuestionType(question:KoboQuestion|undefined,result:KoboResult,language:string){
 const kind=question?.kind||result.kind;
 const labels=language==='ar'?{category:'اختيار واحد',multiple:'اختيار متعدد',number:'رقم',date:'تاريخ',text:'نص'}:{category:'Single choice',multiple:'Multiple choice',number:'Number',date:'Date',text:'Text'};
 return {label:labels[kind],tooltip:question?.type?`Original XLSForm type: ${question.type}`:`Analysis type: ${kind}`};
}
