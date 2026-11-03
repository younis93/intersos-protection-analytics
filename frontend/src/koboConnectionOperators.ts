import type {KoboQuestion,KoboConnectionRule} from './koboTypes';
export function connectionOperators(kind:KoboQuestion['kind']|undefined,language:'en'|'ar'):[KoboConnectionRule['operator'],string][]{
 const ar=language==='ar',t=(en:string,arabic:string)=>ar?arabic:en;
 const options:[KoboConnectionRule['operator'],string][]=kind==='multiple'?[['selected',t('Includes answer','يتضمن الإجابة')],['not-selected',t('Does not include answer','لا يتضمن الإجابة')]]:[['eq',kind==='date'?t('On','في تاريخ'):t('Equals','يساوي')],['neq',kind==='date'?t('Not on','ليس في تاريخ'):t('Does not equal','لا يساوي')]];
 if(kind==='number'||kind==='date')options.push(['gt',kind==='date'?t('After','بعد'):t('Greater than','أكبر من')],['gte',kind==='date'?t('On or after','في التاريخ أو بعده'):t('Greater than or equal to','أكبر من أو يساوي')],['lt',kind==='date'?t('Before','قبل'):t('Less than','أقل من')],['lte',kind==='date'?t('On or before','في التاريخ أو قبله'):t('Less than or equal to','أقل من أو يساوي')],['between',t('Between','بين')],['not-between',t('Not between','ليس بين')]);
 if(kind==='text')options.push(['contains',t('Contains','يحتوي على')],['not-contains',t('Does not contain','لا يحتوي على')],['starts-with',t('Starts with','يبدأ بـ')],['ends-with',t('Ends with','ينتهي بـ')]);
 options.push(['blank',t('Is blank','فارغ')],['not-blank',t('Is not blank','غير فارغ')]);return options;
}
export function validRuleDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&Number(value.slice(0,4))>=1&&new Date(value).toISOString().slice(0,10)===value}
